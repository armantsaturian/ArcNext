import { BrowserWindow, WebContentsView, ipcMain } from 'electron'
import { createBrowserView, normalizeBrowserUrl, wireBrowserViewEvents } from './browserViewUtils'

interface ManagedBrowserView {
  view: WebContentsView
  paneId: string
  bounds: { x: number; y: number; width: number; height: number }
  cleanup: (() => void) | null
  mediaPlaying: boolean
}

const views = new Map<string, ManagedBrowserView>()
let win: BrowserWindow | null = null

function wireViewEvents(view: WebContentsView, paneId: string): () => void {
  if (!win) return () => {}

  const mainWin = win
  const send = (channel: string, ...args: unknown[]): void => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, ...args)
  }

  return wireBrowserViewEvents(view, {
    onTitle: (title) => send('browser:titleChanged', paneId, title),
    onUrl: (url) => send('browser:urlChanged', paneId, url),
    onLoading: (loading) => send('browser:loadingChanged', paneId, loading),
    onNavState: (canGoBack, canGoForward) => send('browser:navStateChanged', paneId, canGoBack, canGoForward),
    onLoadFailed: (errorCode, errorDescription) => send('browser:loadFailed', paneId, errorCode, errorDescription),
    onFocus: () => send('browser:focused', paneId),
    onFavicon: (faviconUrl) => send('browser:faviconChanged', paneId, faviconUrl),
    onOpenInNewWorkspace: (url) => send('browser:openInNewWorkspace', url),
    onSummarize: (url) => send('browser:summarize', paneId, url),
    onFoundInPage: (activeMatch, totalMatches) => send('browser:foundInPage', paneId, activeMatch, totalMatches),
    onAudioStateChanged: (playing, muted) => {
      const managed = views.get(paneId)
      if (managed) managed.mediaPlaying = playing
      send('browser:audioStateChanged', paneId, playing, muted)
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
        // Cmd+Shift (no alt): d, g
        (input.shift && !input.alt && (key === 'd' || key === 'g')) ||
        // Cmd+Alt: arrow keys
        (input.alt && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key))

      if (shouldForward) {
        send('browser:appShortcut', input.key, !!input.meta, !!input.control, !!input.shift, !!input.alt)
        return true
      }

      return false
    }
  })
}

export function setupBrowserViewManager(mainWindow: BrowserWindow): void {
  win = mainWindow

  ipcMain.on('browser:create', (_e, paneId: string, url: string) => {
    if (!win || win.isDestroyed() || views.has(paneId)) return

    const view = createBrowserView()
    const cleanup = wireViewEvents(view, paneId)
    views.set(paneId, { view, paneId, bounds: { x: 0, y: 0, width: 0, height: 0 }, cleanup, mediaPlaying: false })

    view.webContents.loadURL(url)
  })

  ipcMain.on('browser:destroy', (_e, paneId: string) => {
    destroyView(paneId)
  })

  ipcMain.on('browser:setBounds', (_e, paneId: string, bounds: { x: number; y: number; width: number; height: number }) => {
    const managed = views.get(paneId)
    if (!managed) return
    managed.bounds = bounds
    managed.view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    })
  })

  ipcMain.on('browser:show', (_e, paneId: string) => {
    const managed = views.get(paneId)
    if (!managed || !win || win.isDestroyed()) return
    const children = win.contentView.children
    if (!children.includes(managed.view)) {
      win.contentView.addChildView(managed.view)
    }
    managed.view.setBounds({
      x: Math.round(managed.bounds.x),
      y: Math.round(managed.bounds.y),
      width: Math.round(managed.bounds.width),
      height: Math.round(managed.bounds.height)
    })
  })

  ipcMain.on('browser:hide', (_e, paneId: string) => {
    const managed = views.get(paneId)
    if (!managed || !win || win.isDestroyed()) return
    try { win.contentView.removeChildView(managed.view) } catch { /* not attached */ }
  })

  ipcMain.on('browser:navigate', (_e, paneId: string, url: string) => {
    const managed = views.get(paneId)
    if (!managed) return
    managed.view.webContents.loadURL(normalizeBrowserUrl(url))
  })

  ipcMain.on('browser:goBack', (_e, paneId: string) => {
    views.get(paneId)?.view.webContents.goBack()
  })

  ipcMain.on('browser:goForward', (_e, paneId: string) => {
    views.get(paneId)?.view.webContents.goForward()
  })

  ipcMain.on('browser:reload', (_e, paneId: string) => {
    views.get(paneId)?.view.webContents.reload()
  })

  ipcMain.on('browser:stop', (_e, paneId: string) => {
    views.get(paneId)?.view.webContents.stop()
  })

  ipcMain.on('browser:findInPage', (_e, paneId: string, text: string, forward?: boolean) => {
    const managed = views.get(paneId)
    if (!managed || !text) return
    managed.view.webContents.findInPage(text, { forward: forward ?? true, findNext: true })
  })

  ipcMain.on('browser:stopFindInPage', (_e, paneId: string) => {
    views.get(paneId)?.view.webContents.stopFindInPage('clearSelection')
  })

  ipcMain.on('browser:toggleMute', (_e, paneId: string) => {
    const managed = views.get(paneId)
    if (!managed || !win || win.isDestroyed()) return
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
  managed.cleanup?.()
  if (win && !win.isDestroyed()) {
    try { win.contentView.removeChildView(managed.view) } catch { /* not attached */ }
  }
  try { managed.view.webContents.close() } catch { /* already closed */ }
  views.delete(paneId)
}

export function destroyAllBrowserViews(): void {
  for (const paneId of views.keys()) {
    destroyView(paneId)
  }
}
