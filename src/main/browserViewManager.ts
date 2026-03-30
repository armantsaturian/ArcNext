import { randomUUID } from 'crypto'
import { BrowserWindow, WebContentsView, ipcMain, shell } from 'electron'
import type { BrowserOpenWorkspacePayload } from '../shared/types'
import { createBrowserPopupWindow } from './browserPopups'
import { createBrowserView, normalizeBrowserUrl, wireBrowserViewEvents } from './browserViewUtils'
import { injectSearchResultWorkspaceLinks } from './searchResultWorkspaces'

interface ManagedBrowserView {
  paneId: string
  currentUrl: string
  initialLoadOptions: Electron.LoadURLOptions | null
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
const pendingOpenRequests = new Map<string, { url: string; loadOptions: Electron.LoadURLOptions | null }>()
let win: BrowserWindow | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

function emitCurrentViewState(
  paneId: string,
  managed: Pick<ManagedBrowserView, 'mediaPlaying'>,
  wc: Electron.WebContents
): void {
  if (!win || win.isDestroyed()) return

  win.webContents.send('browser:titleChanged', paneId, wc.getTitle())
  win.webContents.send('browser:urlChanged', paneId, wc.getURL())
  win.webContents.send('browser:loadingChanged', paneId, wc.isLoading())
  win.webContents.send('browser:navStateChanged', paneId, wc.canGoBack(), wc.canGoForward())
  win.webContents.send('browser:audioStateChanged', paneId, managed.mediaPlaying, wc.isAudioMuted())

  wc.executeJavaScript("document.querySelector('link[rel*=\"icon\"]')?.href || ''")
    .then((favicon: string) => {
      if (favicon && win && !win.isDestroyed()) {
        win.webContents.send('browser:faviconChanged', paneId, favicon)
      }
    })
    .catch(() => {})
}

export function shouldOpenUrlExternally(url: string): boolean {
  try {
    const protocol = new URL(url).protocol.toLowerCase()
    return !['http:', 'https:', 'file:', 'about:', 'data:', 'blob:'].includes(protocol)
  } catch {
    return false
  }
}

function popupFeatureKeys(features: string): string[] {
  return features
    .split(',')
    .map((feature) => feature.split('=')[0]?.trim().toLowerCase())
    .filter((feature): feature is string => Boolean(feature))
}

function hasPopupFeatures(features: string): boolean {
  const keys = popupFeatureKeys(features)
  if (keys.length === 0) return false
  return keys.some((key) => !['noopener', 'noreferrer', 'attributionsrc'].includes(key))
}

function shouldOpenAsPopup(details: Electron.HandlerDetails): boolean {
  const frameName = details.frameName.trim()
  return details.disposition === 'new-window' ||
    hasPopupFeatures(details.features) ||
    (frameName.length > 0 && frameName !== '_blank')
}

function buildPostBodyHeaders(postBody: Electron.PostBody | undefined): string | undefined {
  if (!postBody) return undefined
  const boundary = postBody.boundary ? `; boundary=${postBody.boundary}` : ''
  return `content-type: ${postBody.contentType}${boundary}\n`
}

function buildLoadOptions(details: Electron.HandlerDetails): Electron.LoadURLOptions | null {
  const extraHeaders = buildPostBodyHeaders(details.postBody)
  const hasLoadOptions = Boolean(details.postBody || details.referrer.url || extraHeaders)
  if (!hasLoadOptions) return null

  return {
    httpReferrer: details.referrer.url ? details.referrer : undefined,
    postData: details.postBody?.data,
    extraHeaders
  }
}

export function openBrowserWorkspace(
  url: string,
  options: {
    background?: boolean
    sourcePaneId?: string
    loadOptions?: Electron.LoadURLOptions | null
  } = {}
): string {
  const paneId = randomUUID()
  const loadOptions = options.loadOptions ?? null
  const background = options.background ?? false

  if (background) {
    const managed: ManagedBrowserView = {
      paneId,
      currentUrl: url,
      initialLoadOptions: null,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      view: null,
      cleanup: null,
      mediaPlaying: false,
      attached: false,
      lastHiddenAt: null,
      sleepTimer: null
    }
    views.set(paneId, managed)
    const { view } = ensureManagedView(managed)
    view.webContents.loadURL(url, loadOptions ?? undefined)
    markViewHidden(managed)
  } else {
    pendingOpenRequests.set(paneId, {
      url,
      loadOptions
    })
  }

  const payload: BrowserOpenWorkspacePayload = {
    paneId,
    url,
    background,
    ...(options.sourcePaneId ? { sourcePaneId: options.sourcePaneId } : {})
  }
  sendToRenderer('browser:openWorkspace', payload)
  return paneId
}

export function handleBrowserWindowOpen(
  sourcePaneId: string | undefined,
  details: Electron.HandlerDetails
): Electron.WindowOpenHandlerResponse {
  if (shouldOpenUrlExternally(details.url)) {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  }

  if (shouldOpenAsPopup(details)) {
    return {
      action: 'allow',
      createWindow: (options) => createBrowserPopupWindow(options)
    }
  }

  openBrowserWorkspace(details.url, {
    sourcePaneId,
    background: details.disposition === 'background-tab',
    loadOptions: buildLoadOptions(details)
  })
  return { action: 'deny' }
}

function wireViewEvents(view: WebContentsView, paneId: string): () => void {
  const cleanupBrowserEvents = wireBrowserViewEvents(view, {
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
    onOpenLinkInNewWorkspace: (url) => {
      if (shouldOpenUrlExternally(url)) {
        void shell.openExternal(url)
        return
      }
      openBrowserWorkspace(url, { sourcePaneId: paneId })
    },
    onWindowOpen: (details) => handleBrowserWindowOpen(paneId, details),
    onWillNavigate: (url) => {
      if (!shouldOpenUrlExternally(url)) return false
      void shell.openExternal(url)
      return true
    },
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

  const onDidFinishLoad = (): void => {
    const managed = views.get(paneId)
    if (!managed) return
    injectSearchResultWorkspaceLinks(view.webContents, managed.currentUrl)
  }

  view.webContents.on('did-finish-load', onDidFinishLoad)

  return () => {
    view.webContents.removeListener('did-finish-load', onDidFinishLoad)
    cleanupBrowserEvents()
  }
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

function markViewHidden(managed: ManagedBrowserView): void {
  managed.lastHiddenAt = managed.view ? Date.now() : null
  if (managed.view) scheduleSleep(managed)
  trimHiddenViews()
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
    const pending = pendingOpenRequests.get(paneId)
    const initialUrl = pending?.url ?? normalizeBrowserUrl(url)
    const existing = views.get(paneId)
    if (existing) {
      if (existing.view) {
        emitCurrentViewState(paneId, existing, existing.view.webContents)
      } else {
        existing.currentUrl = initialUrl
        existing.initialLoadOptions = pending?.loadOptions ?? existing.initialLoadOptions
      }
      pendingOpenRequests.delete(paneId)
      return
    }

    views.set(paneId, {
      paneId,
      currentUrl: initialUrl,
      initialLoadOptions: pending?.loadOptions ?? null,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      view: null,
      cleanup: null,
      mediaPlaying: false,
      attached: false,
      lastHiddenAt: null,
      sleepTimer: null
    })
    pendingOpenRequests.delete(paneId)
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
      const loadOptions = managed.initialLoadOptions ?? undefined
      view.webContents.loadURL(managed.currentUrl, loadOptions)
      managed.initialLoadOptions = null
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
    markViewHidden(managed)
  })

  ipcMain.on('browser:navigate', (_e, paneId: string, url: string) => {
    const managed = views.get(paneId)
    if (!managed) return
    managed.currentUrl = normalizeBrowserUrl(url)
    managed.initialLoadOptions = null
    const { view } = ensureManagedView(managed)
    view.webContents.loadURL(managed.currentUrl)
    if (!managed.attached) markViewHidden(managed)
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
  pendingOpenRequests.delete(paneId)
  const managed = views.get(paneId)
  if (!managed) return
  closeManagedView(managed)
  views.delete(paneId)
}

export function destroyAllBrowserViews(): void {
  pendingOpenRequests.clear()
  for (const paneId of views.keys()) {
    destroyView(paneId)
  }
}
