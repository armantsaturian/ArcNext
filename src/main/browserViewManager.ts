import { BrowserWindow, WebContentsView, ipcMain, session } from 'electron'

interface ManagedBrowserView {
  view: WebContentsView
  paneId: string
  bounds: { x: number; y: number; width: number; height: number }
}

const views = new Map<string, ManagedBrowserView>()
let win: BrowserWindow | null = null

export function setupBrowserViewManager(mainWindow: BrowserWindow): void {
  win = mainWindow

  ipcMain.on('browser:create', (_e, paneId: string, url: string) => {
    if (!win || win.isDestroyed() || views.has(paneId)) return

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        session: session.fromPartition('persist:browser')
      }
    })

    views.set(paneId, { view, paneId, bounds: { x: 0, y: 0, width: 0, height: 0 } })

    const wc = view.webContents

    wc.on('page-title-updated', (_ev, title) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('browser:titleChanged', paneId, title)
      }
    })

    const sendNavUpdate = (navUrl: string): void => {
      if (!win || win.isDestroyed()) return
      win.webContents.send('browser:urlChanged', paneId, navUrl)
      win.webContents.send('browser:navStateChanged', paneId, wc.canGoBack(), wc.canGoForward())
    }

    wc.on('did-navigate', (_ev, navUrl) => sendNavUpdate(navUrl))
    wc.on('did-navigate-in-page', (_ev, navUrl) => sendNavUpdate(navUrl))

    wc.on('did-start-loading', () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('browser:loadingChanged', paneId, true)
      }
    })

    wc.on('did-stop-loading', () => {
      if (!win || win.isDestroyed()) return
      win.webContents.send('browser:loadingChanged', paneId, false)
      win.webContents.send('browser:navStateChanged', paneId, wc.canGoBack(), wc.canGoForward())
    })

    wc.on('did-fail-load', (_ev, errorCode, errorDescription) => {
      if (errorCode === -3) return // Aborted, ignore
      if (win && !win.isDestroyed()) {
        win.webContents.send('browser:loadFailed', paneId, errorCode, errorDescription)
      }
    })

    // Handle popups: navigate in same view for now (until #8)
    wc.setWindowOpenHandler(({ url: popupUrl }) => {
      wc.loadURL(popupUrl)
      return { action: 'deny' }
    })

    // Notify renderer when web content gains focus (for pane activation)
    wc.on('focus', () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('browser:focused', paneId)
      }
    })

    wc.loadURL(url)
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
    let normalized = url
    if (!/^https?:\/\//i.test(url) && !url.startsWith('file://')) {
      if (url.includes('.') && !url.includes(' ')) {
        normalized = `https://${url}`
      } else {
        normalized = `https://www.google.com/search?q=${encodeURIComponent(url)}`
      }
    }
    managed.view.webContents.loadURL(normalized)
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
}

function destroyView(paneId: string): void {
  const managed = views.get(paneId)
  if (!managed) return
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
