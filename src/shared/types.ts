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
}
