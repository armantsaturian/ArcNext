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
}

export type PaneInfo = TerminalPaneInfo | BrowserPaneInfo

export interface DirEntry {
  path: string
  visitCount: number
  lastVisit: number
  score: number
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
}
