import { BrowserWindow, session } from 'electron'

interface TrackedWindow {
  win: BrowserWindow
  url: string
  title: string
}

const windows = new Map<number, TrackedWindow>()

export function createExternalBrowserWindow(url: string): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      session: session.fromPartition('persist:browser')
    }
  })

  const id = win.id
  windows.set(id, { win, url, title: '' })

  const wc = win.webContents

  wc.setWindowOpenHandler(({ url: popupUrl }) => {
    createExternalBrowserWindow(popupUrl)
    return { action: 'deny' }
  })

  wc.on('page-title-updated', (_ev, title) => {
    const tracked = windows.get(id)
    if (tracked) tracked.title = title
  })

  wc.on('did-navigate', (_ev, navUrl) => {
    const tracked = windows.get(id)
    if (tracked) tracked.url = navUrl
  })

  wc.on('did-navigate-in-page', (_ev, navUrl) => {
    const tracked = windows.get(id)
    if (tracked) tracked.url = navUrl
  })

  win.on('closed', () => {
    windows.delete(id)
  })

  win.loadURL(url)
}

export function listExternalWindows(): { id: number; url: string; title: string }[] {
  return Array.from(windows.entries()).map(([id, { url, title }]) => ({ id, url, title }))
}

export function dockExternalWindow(windowId: number): { url: string; title: string } | null {
  const tracked = windows.get(windowId)
  if (!tracked) return null
  const { url, title } = tracked
  tracked.win.close()
  return { url, title }
}

export function closeAllExternalWindows(): void {
  for (const { win } of windows.values()) {
    win.close()
  }
  windows.clear()
}
