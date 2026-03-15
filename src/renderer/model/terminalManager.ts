import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

type TitleCallback = (paneId: string, title: string) => void
let onTitleChange: TitleCallback | null = null

export function setTitleChangeCallback(cb: TitleCallback): void {
  onTitleChange = cb
}

interface ManagedTerminal {
  term: Terminal
  fit: FitAddon
  removeDataListener: () => void
  removeExitListener: () => void
}

const terminals = new Map<string, ManagedTerminal>()

export function createTerminal(paneId: string): Terminal {
  if (terminals.has(paneId)) return terminals.get(paneId)!.term

  const term = new Terminal({
    fontSize: 14,
    fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
    theme: {
      background: '#1a1a2e',
      foreground: '#e0e0e0',
      cursor: '#e0e0e0',
      selectionBackground: '#3a3a5e',
      black: '#1a1a2e',
      red: '#ff6b6b',
      green: '#51cf66',
      yellow: '#ffd43b',
      blue: '#74c0fc',
      magenta: '#cc5de8',
      cyan: '#66d9e8',
      white: '#e0e0e0'
    },
    cursorBlink: true,
    allowProposedApi: true
  })

  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon())

  // PTY connection
  window.arcnext.pty.create(paneId)

  term.onData((data) => {
    window.arcnext.pty.write(paneId, data)
  })

  const removeDataListener = window.arcnext.pty.onData((id, data) => {
    if (id === paneId) term.write(data)
  })

  const removeExitListener = window.arcnext.pty.onExit((id, code) => {
    if (id === paneId) term.write(`\r\n[process exited with code ${code}]`)
  })

  term.onResize(({ cols, rows }) => {
    window.arcnext.pty.resize(paneId, cols, rows)
  })

  term.onTitleChange((title) => {
    onTitleChange?.(paneId, title)
  })

  terminals.set(paneId, { term, fit, removeDataListener, removeExitListener })
  return term
}

/** Attach a terminal to a DOM element. Call this when the component mounts. */
export function attachTerminal(paneId: string, container: HTMLElement): void {
  const managed = terminals.get(paneId)
  if (!managed) return

  const { term, fit } = managed

  // Clear any stale terminal DOM from this container before attaching
  while (container.firstChild) {
    container.removeChild(container.firstChild)
  }

  // Only call open() once — if already opened, just re-parent the DOM element
  if (term.element) {
    container.appendChild(term.element)
  } else {
    term.open(container)
    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // WebGL not available, canvas fallback
    }
  }

  fit.fit()
}

/** Refit the terminal to its container size */
export function fitTerminal(paneId: string): void {
  terminals.get(paneId)?.fit.fit()
}

/** Focus the terminal */
export function focusTerminal(paneId: string): void {
  terminals.get(paneId)?.term.focus()
}

/** Write data directly to the PTY (for sending escape sequences) */
export function writeToTerminalPTY(paneId: string, data: string): void {
  window.arcnext.pty.write(paneId, data)
}

/** Destroy the terminal and kill its PTY. Only call on explicit user close. */
export function destroyTerminal(paneId: string): void {
  const managed = terminals.get(paneId)
  if (!managed) return
  managed.removeDataListener()
  managed.removeExitListener()
  window.arcnext.pty.kill(paneId)
  managed.term.dispose()
  terminals.delete(paneId)
}
