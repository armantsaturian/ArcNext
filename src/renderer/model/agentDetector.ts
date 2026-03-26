import type { AgentType, AgentState } from '../../shared/types'

type AgentStateCallback = (paneId: string, state: AgentState | null) => void

const KNOWN_AGENTS: Record<string, AgentType> = {
  claude: 'claude',
  codex: 'codex'
}

// Claude Code title prefixes for state detection
const CLAUDE_IDLE_PREFIX = '\u2733' // ✳
function isBrailleChar(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 0x2800 && code <= 0x28FF
}

interface PaneState {
  agent: AgentType | null
  title: string
  lastOutputTime: number
}

const panes = new Map<string, PaneState>()
let callback: AgentStateCallback | null = null

const IDLE_THRESHOLD_MS = 2000

function getPane(paneId: string): PaneState {
  let state = panes.get(paneId)
  if (!state) {
    state = { agent: null, title: '', lastOutputTime: 0 }
    panes.set(paneId, state)
  }
  return state
}

function resolveState(pane: PaneState): AgentState | null {
  if (!pane.agent) return null

  if (pane.agent === 'claude') {
    // Claude Code: title prefix is authoritative for state
    const firstChar = pane.title.charAt(0)
    if (isBrailleChar(firstChar)) return { agent: 'claude', status: 'thinking' }
    if (firstChar === CLAUDE_IDLE_PREFIX) return { agent: 'claude', status: 'idle' }
    // During startup before title is set, fall back to output activity
    const active = pane.lastOutputTime > 0 && (Date.now() - pane.lastOutputTime) < IDLE_THRESHOLD_MS
    return { agent: 'claude', status: active ? 'thinking' : 'idle' }
  }

  // Codex: output activity is the only state signal
  const active = pane.lastOutputTime > 0 && (Date.now() - pane.lastOutputTime) < IDLE_THRESHOLD_MS
  return { agent: 'codex', status: active ? 'thinking' : 'idle' }
}

function emit(paneId: string): void {
  const pane = panes.get(paneId)
  callback?.(paneId, pane ? resolveState(pane) : null)
}

/** Shell hook: a command started running (from preexec via OSC 7771) */
export function onCommandStart(paneId: string, command: string): void {
  const pane = getPane(paneId)
  const agent = KNOWN_AGENTS[command.toLowerCase()] ?? null
  pane.agent = agent
  pane.lastOutputTime = agent ? Date.now() : 0
  emit(paneId)
}

/** Shell hook: command finished, back to prompt (from precmd via OSC 7771) */
export function onCommandEnd(paneId: string): void {
  const pane = getPane(paneId)
  if (pane.agent) {
    pane.agent = null
    pane.lastOutputTime = 0
    emit(paneId)
  }
}

/** Terminal title changed — used for Claude state detection */
export function onTitleChange(paneId: string, title: string): void {
  const pane = getPane(paneId)
  pane.title = title
  if (pane.agent === 'claude') emit(paneId)
}

/** PTY output received — used for Codex state detection */
export function onPtyData(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane?.agent) return
  const wasIdle = pane.lastOutputTime === 0 || (Date.now() - pane.lastOutputTime) >= IDLE_THRESHOLD_MS
  pane.lastOutputTime = Date.now()
  if (wasIdle) emit(paneId)
}

/** Periodic check for idle transitions (Codex output silence) */
export function startIdleChecker(): () => void {
  const interval = setInterval(() => {
    for (const [paneId, pane] of panes) {
      if (!pane.agent || pane.agent === 'claude') continue // Claude uses title, not timeout
      if (pane.lastOutputTime > 0 && (Date.now() - pane.lastOutputTime) >= IDLE_THRESHOLD_MS) {
        emit(paneId)
      }
    }
  }, 500)
  return () => clearInterval(interval)
}

/** Clean up when a pane is destroyed */
export function removePaneTracking(paneId: string): void {
  panes.delete(paneId)
  callback?.(paneId, null)
}

/** Register state change callback */
export function setAgentStateCallback(cb: AgentStateCallback): void {
  callback = cb
}
