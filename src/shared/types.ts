export interface TerminalPaneInfo {
  type: 'terminal'
  id: string
  title: string
  cwd: string
  command?: string
  userMessage?: string
}

export type BrowserReferrerPolicy =
  | 'default'
  | 'unsafe-url'
  | 'no-referrer-when-downgrade'
  | 'no-referrer'
  | 'origin'
  | 'strict-origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'

export interface BrowserReferrer {
  url: string
  policy: BrowserReferrerPolicy
}

export interface BrowserNavigationOptions {
  httpReferrer?: BrowserReferrer
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
  openerWorkspaceId?: string
  initialNavigationOptions?: BrowserNavigationOptions
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

export type DownloadState = 'progressing' | 'completed' | 'interrupted'

export interface DownloadEntry {
  id: string
  filename: string
  path: string
  url: string
  mimeType: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  startedAt: number
  completedAt?: number
  thumbnailDataUrl?: string
}

export interface CommandEntry {
  command: string
  visitCount: number
  lastVisit: number
  score: number
}

export interface SerializedPane {
  type: 'terminal' | 'browser'
  id: string
  title: string
  cwd?: string
  url?: string
  faviconUrl?: string
  scrollback?: string
}

export interface PinnedWorkspaceEntry {
  name: string
  color?: string
  grid: unknown
  activePaneId: string
  panes: SerializedPane[]
}


export type DictationStatus = 'downloading' | 'recording' | 'transcribing' | 'error' | 'denied'

export interface DictationState {
  status: DictationStatus
  error?: string
}

export type AgentType = 'claude' | 'codex' | 'opencode'
export type AgentStatus = 'thinking' | 'idle'

export interface AgentState {
  agent: AgentType
  status: AgentStatus
}

/**
 * Web-bridge state for a browser pane. Tracks whether an agent currently
 * holds the debugger lock and whether the agent is mid-action (used for
 * sky-blue glow in the sidebar + pane border). `kind` drives the motion of
 * the glow — same color, different visual rhythm per action family.
 */
export type BridgeActKind = 'read' | 'click' | 'type' | 'nav'

export interface BridgeState {
  holds: boolean
  acting: boolean
  kind?: BridgeActKind
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
  'dirDiscovery:query': () => Promise<DirEntry[]>
  'commandHistory:query': () => Promise<CommandEntry[]>
  'webHistory:visit': (url: string, title?: string, faviconUrl?: string) => void
  'webHistory:query': () => Promise<WebEntry[]>
  'downloads:list': () => Promise<DownloadEntry[]>
  'downloads:openFolder': () => Promise<{ ok: boolean; error?: string }>
  'downloads:openFile': (id: string) => Promise<{ ok: boolean; error?: string }>
  'downloads:showInFinder': (id: string) => Promise<{ ok: boolean; error?: string }>
  'downloads:copyPath': (id: string) => Promise<{ ok: boolean; error?: string }>
  'downloads:remove': (id: string) => Promise<{ ok: boolean; error?: string }>
  'downloads:changed': (entries: DownloadEntry[]) => void
  // Browser view lifecycle
  'browser:create': (paneId: string, url: string, options?: BrowserNavigationOptions) => void
  'browser:destroy': (paneId: string) => void
  'browser:setBounds': (paneId: string, bounds: { x: number; y: number; width: number; height: number }) => void
  'browser:show': (paneId: string) => void
  'browser:hide': (paneId: string) => void
  'browser:focus': (paneId: string) => void
  'browser:openInNewWorkspaceRequest': (url: string, sourcePaneId?: string, activate?: boolean, options?: BrowserNavigationOptions) => void
  'browser:navigate': (paneId: string, url: string, options?: BrowserNavigationOptions) => void
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
  // Open URL in a new browser workspace (main → renderer)
  'browser:openInNewWorkspace': (url: string, sourcePaneId?: string, activate?: boolean, options?: BrowserNavigationOptions) => void
  'browser:findInPage': (paneId: string, text: string, forward?: boolean) => void
  'browser:stopFindInPage': (paneId: string) => void
  'browser:foundInPage': (paneId: string, activeMatch: number, totalMatches: number) => void
  'browser:appShortcut': (key: string, meta: boolean, ctrl: boolean, shift: boolean, alt: boolean) => void
  'browser:audioStateChanged': (paneId: string, playing: boolean, muted: boolean) => void
  'browser:toggleMute': (paneId: string) => void
  'browser:focusRenderer': () => Promise<void>
  // Summarize a URL in a terminal split below the browser pane
  'browser:summarize': (paneId: string, url: string) => void
}
