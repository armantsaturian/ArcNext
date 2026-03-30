import { BrowserWindow, WebContentsView, ipcMain } from 'electron'
import { createExternalBrowserWindow } from './externalBrowserWindows'
import { createBrowserView, normalizeBrowserUrl, wireBrowserViewEvents } from './browserViewUtils'

interface ManagedBrowserView {
  paneId: string
  currentUrl: string
  bounds: { x: number; y: number; width: number; height: number }
  view: WebContentsView | null
  cleanup: (() => void) | null
  mediaPlaying: boolean
  attached: boolean
  lastHiddenAt: number | null
  sleepTimer: ReturnType<typeof setTimeout> | null
}

const MAX_HIDDEN_LIVE_VIEWS = 1
const HIDDEN_VIEW_SLEEP_MS = 15_000

const views = new Map<string, ManagedBrowserView>()
let win: BrowserWindow | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

function wireViewEvents(view: WebContentsView, paneId: string): () => void {
  return wireBrowserViewEvents(view, {
    onTitle: (title) => sendToRenderer('browser:titleChanged', paneId, title),
    onUrl: (url) => {
      const managed = views.get(paneId)
      if (managed) managed.currentUrl = url
      sendToRenderer('browser:urlChanged', paneId, url)
    },
    onLoading: (loading) => sendToRenderer('browser:loadingChanged', paneId, loading),
    onNavState: (canGoBack, canGoForward) => sendToRenderer('browser:navStateChanged', paneId, canGoBack, canGoForward),
    onLoadFailed: (errorCode, errorDescription) => sendToRenderer('browser:loadFailed', paneId, errorCode, errorDescription),
    onFocus: () => sendToRenderer('browser:focused', paneId),
    onFavicon: (faviconUrl) => sendToRenderer('browser:faviconChanged', paneId, faviconUrl),
    onOpenExternal: (url) => createExternalBrowserWindow(url),
    onFoundInPage: (activeMatch, totalMatches) => sendToRenderer('browser:foundInPage', paneId, activeMatch, totalMatches),
    onAudioStateChanged: (playing, muted) => {
      const managed = views.get(paneId)
      if (managed) managed.mediaPlaying = playing
      sendToRenderer('browser:audioStateChanged', paneId, playing, muted)
    },
    onBeforeInput: (input) => {
      const meta = input.meta || input.control
      if (!meta || input.type !== 'keyDown') return false
      const key = input.key.toLowerCase()

      // Cmd+R / Cmd+Shift+R — handle directly in main process
      if (!input.shift && !input.alt && key === 'r') {
        view.webContents.reload()
        return true
      }
      if (input.shift && !input.alt && key === 'r') {
        view.webContents.reloadIgnoringCache()
        return true
      }

      // Forward app shortcuts to the renderer via IPC
      const shouldForward =
        // Cmd (no shift, no alt): w, g, b, d, l, [, ]
        (!input.shift && !input.alt && ['w', 'g', 'b', 'd', 'l', 'f', '[', ']'].includes(key)) ||
        // Cmd (no alt): t, 1-9
        (!input.alt && (key === 't' || (key >= '1' && key <= '9'))) ||
        // Cmd+Shift (no alt): d, Enter
        (input.shift && !input.alt && (key === 'd' || key === 'g' || input.key === 'Enter')) ||
        // Cmd+Alt: arrow keys
        (input.alt && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key))

      if (shouldForward) {
        sendToRenderer('browser:appShortcut', input.key, !!input.meta, !!input.control, !!input.shift, !!input.alt)
        return true
      }

      return false
    }
  })
}

function createManagedView(managed: ManagedBrowserView): WebContentsView {
  const view = createBrowserView()
  managed.view = view
  managed.cleanup = wireViewEvents(view, managed.paneId)
  managed.mediaPlaying = false
  return view
}

function ensureManagedView(managed: ManagedBrowserView): { view: WebContentsView; created: boolean } {
  if (managed.view) {
    return { view: managed.view, created: false }
  }

  return { view: createManagedView(managed), created: true }
}

function detachManagedView(managed: ManagedBrowserView): void {
  if (!managed.view || !managed.attached || !win || win.isDestroyed()) {
    managed.attached = false
    return
  }

  try { win.contentView.removeChildView(managed.view) } catch { /* not attached */ }
  managed.attached = false
}

function clearSleepTimer(managed: ManagedBrowserView): void {
  if (!managed.sleepTimer) return
  clearTimeout(managed.sleepTimer)
  managed.sleepTimer = null
}

function closeManagedView(managed: ManagedBrowserView): void {
  if (!managed.view) return
  clearSleepTimer(managed)
  managed.cleanup?.()
  managed.cleanup = null
  detachManagedView(managed)
  try { managed.view.webContents.close() } catch { /* already closed */ }
  managed.view = null
  managed.mediaPlaying = false
}

function sleepView(paneId: string): void {
  const managed = views.get(paneId)
  if (!managed) return

  closeManagedView(managed)
  managed.lastHiddenAt = null

  // Recreating a slept browser pane restores URL/title/favicon, but not its
  // transient navigation stack or in-page audio state.
  sendToRenderer('browser:loadingChanged', paneId, false)
  sendToRenderer('browser:navStateChanged', paneId, false, false)
  sendToRenderer('browser:audioStateChanged', paneId, false, false)
}

function scheduleSleep(managed: ManagedBrowserView): void {
  clearSleepTimer(managed)
  managed.sleepTimer = setTimeout(() => {
    const current = views.get(managed.paneId)
    if (!current || current.attached) return
    sleepView(current.paneId)
  }, HIDDEN_VIEW_SLEEP_MS)
}

function trimHiddenViews(): void {
  const hiddenLiveViews = [...views.values()]
    .filter((managed) => managed.view && !managed.attached)
    .sort((a, b) => (a.lastHiddenAt ?? 0) - (b.lastHiddenAt ?? 0))

  while (hiddenLiveViews.length > MAX_HIDDEN_LIVE_VIEWS) {
    const oldest = hiddenLiveViews.shift()
    if (!oldest) break
    sleepView(oldest.paneId)
  }
}

export function setupBrowserViewManager(mainWindow: BrowserWindow): void {
  win = mainWindow

  ipcMain.on('browser:create', (_e, paneId: string, url: string) => {
    const initialUrl = normalizeBrowserUrl(url)
    const existing = views.get(paneId)
    if (existing) {
      if (!existing.view) existing.currentUrl = initialUrl
      return
    }

    views.set(paneId, {
      paneId,
      currentUrl: initialUrl,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      view: null,
      cleanup: null,
      mediaPlaying: false,
      attached: false,
      lastHiddenAt: null,
      sleepTimer: null
    })
  })

  ipcMain.on('browser:destroy', (_e, paneId: string) => {
    destroyView(paneId)
  })

  ipcMain.on('browser:setBounds', (_e, paneId: string, bounds: { x: number; y: number; width: number; height: number }) => {
    const managed = views.get(paneId)
    if (!managed) return
    managed.bounds = bounds
    managed.view?.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    })
  })

  ipcMain.on('browser:show', (_e, paneId: string) => {
    const managed = views.get(paneId)
    if (!managed || !win || win.isDestroyed()) return

    const { view, created } = ensureManagedView(managed)
    if (created && managed.currentUrl) {
      view.webContents.loadURL(managed.currentUrl)
    }

    const children = win.contentView.children
    if (!children.includes(view)) {
      win.contentView.addChildView(view)
    }
    managed.attached = true
    managed.lastHiddenAt = null
    clearSleepTimer(managed)

    view.setBounds({
      x: Math.round(managed.bounds.x),
      y: Math.round(managed.bounds.y),
      width: Math.round(managed.bounds.width),
      height: Math.round(managed.bounds.height)
    })
  })

  ipcMain.on('browser:hide', (_e, paneId: string) => {
    const managed = views.get(paneId)
    if (!managed) return
    detachManagedView(managed)
    managed.lastHiddenAt = managed.view ? Date.now() : null
    if (managed.view) scheduleSleep(managed)
    trimHiddenViews()
  })

  ipcMain.on('browser:navigate', (_e, paneId: string, url: string) => {
    const managed = views.get(paneId)
    if (!managed) return
    managed.currentUrl = normalizeBrowserUrl(url)
    const { view } = ensureManagedView(managed)
    view.webContents.loadURL(managed.currentUrl)
  })

  ipcMain.on('browser:goBack', (_e, paneId: string) => {
    views.get(paneId)?.view?.webContents.goBack()
  })

  ipcMain.on('browser:goForward', (_e, paneId: string) => {
    views.get(paneId)?.view?.webContents.goForward()
  })

  ipcMain.on('browser:reload', (_e, paneId: string) => {
    views.get(paneId)?.view?.webContents.reload()
  })

  ipcMain.on('browser:stop', (_e, paneId: string) => {
    views.get(paneId)?.view?.webContents.stop()
  })

  ipcMain.on('browser:findInPage', (_e, paneId: string, text: string, forward?: boolean) => {
    const managed = views.get(paneId)
    if (!managed?.view || !text) return
    managed.view.webContents.findInPage(text, { forward: forward ?? true, findNext: true })
  })

  ipcMain.on('browser:stopFindInPage', (_e, paneId: string) => {
    views.get(paneId)?.view?.webContents.stopFindInPage('clearSelection')
  })

  ipcMain.on('browser:toggleMute', (_e, paneId: string) => {
    const managed = views.get(paneId)
    if (!managed?.view || !win || win.isDestroyed()) return
    const wc = managed.view.webContents
    const newMuted = !wc.isAudioMuted()
    wc.setAudioMuted(newMuted)
    const playing = managed.mediaPlaying
    win.webContents.send('browser:audioStateChanged', paneId, playing, newMuted)
  })

  ipcMain.on('browser:focusRenderer', () => {
    if (win && !win.isDestroyed()) win.webContents.focus()
  })
}

function destroyView(paneId: string): void {
  const managed = views.get(paneId)
  if (!managed) return
  closeManagedView(managed)
  views.delete(paneId)
}

export function adoptView(paneId: string, view: WebContentsView): void {
  const cleanup = wireViewEvents(view, paneId)
  views.set(paneId, {
    paneId,
    currentUrl: view.webContents.getURL(),
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    view,
    cleanup,
    mediaPlaying: false,
    attached: false,
    lastHiddenAt: null,
    sleepTimer: null
  })

  // Send initial state to renderer so it picks up current URL/title/nav
  if (win && !win.isDestroyed()) {
    const wc = view.webContents
    const url = wc.getURL()
    const title = wc.getTitle()
    win.webContents.send('browser:titleChanged', paneId, title)
    win.webContents.send('browser:urlChanged', paneId, url)
    win.webContents.send('browser:loadingChanged', paneId, wc.isLoading())
    win.webContents.send('browser:navStateChanged', paneId, wc.canGoBack(), wc.canGoForward())

    // Extract favicon for already-loaded pages (page-favicon-updated won't re-fire)
    wc.executeJavaScript("document.querySelector('link[rel*=\"icon\"]')?.href || ''")
      .then((favicon: string) => {
        if (favicon && win && !win.isDestroyed()) {
          win.webContents.send('browser:faviconChanged', paneId, favicon)
        }
      })
      .catch(() => {})
  }
}

export function releaseView(paneId: string): WebContentsView | null {
  const managed = views.get(paneId)
  if (!managed?.view) return null

  managed.cleanup?.()
  managed.cleanup = null
  clearSleepTimer(managed)

  detachManagedView(managed)

  views.delete(paneId)
  return managed.view
}

export function destroyAllBrowserViews(): void {
  for (const paneId of views.keys()) {
    destroyView(paneId)
  }
}
