import { app, BrowserWindow, ipcMain } from 'electron'
import { extname } from 'path'
import { pathToFileURL } from 'url'
import { isIncomingBrowserUrl } from './incomingBrowserUrls'

const pendingIncomingBrowserUrls: string[] = []
let rendererReadyForIncomingBrowserUrls = false
const DEFAULT_BROWSER_SCHEMES = ['http', 'https'] as const

interface DefaultBrowserStatus {
  available: boolean
  isDefault: boolean
}

function canSendToRenderer(window: BrowserWindow | null): window is BrowserWindow {
  return (
    rendererReadyForIncomingBrowserUrls &&
    !!window &&
    !window.isDestroyed() &&
    !window.webContents.isDestroyed()
  )
}

function focusWindow(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function openIncomingBrowserUrl(url: string, window: BrowserWindow | null): void {
  if (!isIncomingBrowserUrl(url)) return

  focusWindow(window)

  if (canSendToRenderer(window)) {
    window.webContents.send('browser:openInNewWorkspace', url)
    return
  }

  pendingIncomingBrowserUrls.push(url)
}

function isSupportedDocumentPath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return ext === '.html' || ext === '.htm' || ext === '.xhtml'
}

function markRendererReadyForIncomingBrowserUrls(): string[] {
  rendererReadyForIncomingBrowserUrls = true
  return pendingIncomingBrowserUrls.splice(0)
}

export function resetIncomingBrowserUrlRendererReadiness(): void {
  rendererReadyForIncomingBrowserUrls = false
}

function getDefaultBrowserStatus(): DefaultBrowserStatus {
  const available = process.platform === 'darwin' && app.isPackaged
  return {
    available,
    isDefault: available && DEFAULT_BROWSER_SCHEMES.every((scheme) => app.isDefaultProtocolClient(scheme))
  }
}

function setAsDefaultBrowser(): { ok: boolean } & DefaultBrowserStatus {
  const status = getDefaultBrowserStatus()
  if (!status.available) {
    return { ok: false, ...status }
  }

  const ok = DEFAULT_BROWSER_SCHEMES
    .map((scheme) => app.setAsDefaultProtocolClient(scheme))
    .every(Boolean)
  return {
    ok,
    ...getDefaultBrowserStatus()
  }
}

export function setupDefaultBrowser(getMainWindow: () => BrowserWindow | null): void {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    openIncomingBrowserUrl(url, getMainWindow())
  })

  app.on('open-file', (event, filePath) => {
    if (!isSupportedDocumentPath(filePath)) return
    event.preventDefault()
    openIncomingBrowserUrl(pathToFileURL(filePath).toString(), getMainWindow())
  })

  ipcMain.handle('app:consumePendingOpenUrls', () => markRendererReadyForIncomingBrowserUrls())
  ipcMain.handle('defaultBrowser:getStatus', () => getDefaultBrowserStatus())
  ipcMain.handle('defaultBrowser:setAsDefault', () => setAsDefaultBrowser())
}
