export interface TerminalPaneInfo {
  type: 'terminal'
  id: string
  title: string
  cwd: string
}

export interface BrowserPaneInfo {
  type: 'browser'
  id: string
  title: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  faviconUrl?: string
}

export type PaneInfo = TerminalPaneInfo | BrowserPaneInfo

export interface DirEntry {
  path: string
  visitCount: number
  lastVisit: number
  score: number
}

export interface WebEntry {
  url: string
  title: string
  faviconUrl: string
  visitCount: number
  lastVisit: number
  score: number
}

export interface ExternalBrowserWindowInfo {
  id: number
  url: string
  title: string
}

export interface BrowserDockedPayload {
  paneId: string
  url: string
  title: string
}

export interface BrowserUndockedPayload {
  paneId: string
}

export interface ExternalBrowserShellState {
  url: string
  title: string
}

export interface IPCChannels {
  'pty:create': (paneId: string, cwd?: string) => void
  'pty:write': (paneId: string, data: string) => void
  'pty:resize': (paneId: string, cols: number, rows: number) => void
  'pty:kill': (paneId: string) => void
  'pty:data': (paneId: string, data: string) => void
  'pty:exit': (paneId: string, code: number) => void
  'pty:title': (paneId: string, title: string) => void
  'dirHistory:visit': (path: string) => void
  'dirHistory:query': () => Promise<DirEntry[]>
  'webHistory:visit': (url: string, title?: string, faviconUrl?: string) => void
  'webHistory:query': () => Promise<WebEntry[]>
  // Browser view lifecycle
  'browser:create': (paneId: string, url: string) => void
  'browser:destroy': (paneId: string) => void
  'browser:setBounds': (paneId: string, bounds: { x: number; y: number; width: number; height: number }) => void
  'browser:show': (paneId: string) => void
  'browser:hide': (paneId: string) => void
  'browser:navigate': (paneId: string, url: string) => void
  'browser:goBack': (paneId: string) => void
  'browser:goForward': (paneId: string) => void
  'browser:reload': (paneId: string) => void
  'browser:stop': (paneId: string) => void
  // Browser view events (main → renderer)
  'browser:titleChanged': (paneId: string, title: string) => void
  'browser:urlChanged': (paneId: string, url: string) => void
  'browser:loadingChanged': (paneId: string, loading: boolean) => void
  'browser:navStateChanged': (paneId: string, canGoBack: boolean, canGoForward: boolean) => void
  'browser:loadFailed': (paneId: string, errorCode: number, errorDesc: string) => void
  'browser:focused': (paneId: string) => void
  'browser:faviconChanged': (paneId: string, faviconUrl: string) => void
  // External browser windows
  'browser:listExternalWindows': () => Promise<ExternalBrowserWindowInfo[]>
  'browser:dockWindow': (windowId: number) => Promise<BrowserDockedPayload | null>
  // Dock/undock
  'browser:undock': (paneId: string) => Promise<boolean>
  'browser:docked': (payload: BrowserDockedPayload) => void
  'browser:undocked': (payload: BrowserUndockedPayload) => void
  // External shell window
  'externalBrowser:getState': () => Promise<ExternalBrowserShellState | null>
  'externalBrowser:dockCurrentWindow': () => void
  'externalBrowser:stateChanged': (state: ExternalBrowserShellState) => void
}
