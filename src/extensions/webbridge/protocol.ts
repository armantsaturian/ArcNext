/**
 * Wire protocol between the arcnext-bridge CLI and the ArcNext main process.
 *
 * Transport: Unix domain socket, newline-delimited JSON-RPC 2.0.
 * Auth: first message must be a `hello` request carrying the token that
 *       ArcNext injected into the PTY env as ARCNEXT_BRIDGE_TOKEN.
 *       Any other first message → connection closed.
 */

export const PROTOCOL_VERSION = 1

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0'
  id: number
  result: unknown
}

export interface JsonRpcError {
  jsonrpc: '2.0'
  id: number | null
  error: { code: number; message: string; data?: unknown }
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // App-specific (>= -32000)
  AuthRequired: -32000,
  AuthFailed: -32001,
  UnknownPane: -32010,
  LockConflict: -32011,
  NotAcquired: -32012,
  UserYielded: -32013,
  DebuggerConflict: -32020,
  CDPError: -32021,
  Timeout: -32030,
  RefNotFound: -32040
} as const

export interface PaneSummary {
  paneId: string
  url: string
  title: string
  workspaceId: string | null
}

export interface AxNode {
  ref: string              // stable within a snapshot, e.g. "e23"
  role: string
  name?: string
  value?: string
  description?: string
  children?: AxNode[]
}

export interface Snapshot {
  paneId: string
  url: string
  title: string
  tree: AxNode
  capturedAt: number
}

export interface ScreenshotResult {
  paneId: string
  mime: 'image/png' | 'image/jpeg'
  base64: string
  width: number
  height: number
}

export interface OpenResult {
  paneId: string
  url: string
}

export interface WaitResult {
  matched: boolean
  ref?: string
}

// Tool parameter types
export interface HelloParams { token: string; clientName?: string; clientVersion?: string }
export interface HelloResult { protocolVersion: number; sessionId: string }

export interface OpenParams { url: string; background?: boolean }
export interface NavigateParams { paneId: string; url: string }
export interface ReloadParams { paneId: string; ignoreCache?: boolean }
export interface NavParams { paneId: string }
export interface SnapshotParams { paneId: string }
export interface ScreenshotParams { paneId: string; format?: 'png' | 'jpeg'; fullPage?: boolean }
export interface ClickParams { paneId: string; ref?: string; selector?: string; button?: 'left' | 'middle' | 'right' }
export interface TypeParams { paneId: string; ref?: string; selector?: string; text: string; clearFirst?: boolean; cadenceMs?: number }
export interface PressParams { paneId: string; key: string; modifiers?: Array<'alt' | 'control' | 'meta' | 'shift'> }
export interface ScrollParams { paneId: string; dx?: number; dy?: number; x?: number; y?: number }
export interface WaitParams { paneId: string; selector?: string; ref?: string; role?: string; name?: string; timeoutMs?: number }
export interface AcquireParams { paneId?: string }
export interface ReleaseParams { paneId: string }
export interface StopParams { paneId: string }
export interface EvaluateParams { paneId: string; expression: string; awaitPromise?: boolean }
export interface EvaluateResult {
  value: unknown         // JSON-serializable result (may be null if undefined/non-serializable)
  type: string           // JS typeof — "string", "number", "object", etc.
  thrown: boolean        // true if the expression threw
  description?: string   // for thrown or non-serializable values: a textual description
}

/** Canonical method names. Kept in one place so CLI and server stay in sync. */
export const Method = {
  Hello: 'hello',
  Panes: 'panes',
  Open: 'open',
  Navigate: 'navigate',
  Reload: 'reload',
  Back: 'back',
  Forward: 'forward',
  Snapshot: 'snapshot',
  Screenshot: 'screenshot',
  Click: 'click',
  Type: 'type',
  Press: 'press',
  Scroll: 'scroll',
  Wait: 'wait',
  Acquire: 'acquire',
  Release: 'release',
  Stop: 'stop',
  Evaluate: 'evaluate'
} as const
