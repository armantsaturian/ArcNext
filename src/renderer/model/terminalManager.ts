import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { openExternalLink } from './openExternalLink'
import '@xterm/xterm/css/xterm.css'

type TitleCallback = (paneId: string, title: string) => void
type CwdCallback = (paneId: string, cwd: string) => void
let onTitleChange: TitleCallback | null = null
let onCwdChange: CwdCallback | null = null

export function setTitleChangeCallback(cb: TitleCallback): void {
  onTitleChange = cb
}

export function setCwdChangeCallback(cb: CwdCallback): void {
  onCwdChange = cb
}

interface ManagedTerminal {
  term: Terminal
  fit: FitAddon
  webgl: WebglAddon | null
  removeDataListener: () => void
  removeExitListener: () => void
}

const terminals = new Map<string, ManagedTerminal>()

const parkingDiv = document.createElement('div')
parkingDiv.id = 'terminal-parking'
parkingDiv.style.cssText = 'visibility:hidden;position:absolute;width:0;height:0;overflow:hidden'
document.body.appendChild(parkingDiv)

export function createTerminal(paneId: string, cwd?: string): Terminal {
  if (terminals.has(paneId)) return terminals.get(paneId)!.term

  const term = new Terminal({
    fontSize: 14,
    fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
    theme: {
      background: '#161616',
      foreground: '#e0e0e0',
      cursor: '#e0e0e0',
      selectionBackground: '#74c0fcB0',
      selectionForeground: '#ffffff',
      black: '#161616',
      red: '#ff6b6b',
      green: '#51cf66',
      yellow: '#ffd43b',
      blue: '#74c0fc',
      magenta: '#cc5de8',
      cyan: '#66d9e8',
      white: '#e0e0e0'
    },
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: 10_000
  })

  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((_event, uri) => openExternalLink(uri)))

  // Open terminal into a parked host div immediately so DOM element always exists
  const host = document.createElement('div')
  host.style.cssText = 'width:100%;height:100%'
  parkingDiv.appendChild(host)
  term.open(host)

  // Load WebGL once — it survives re-parenting because we never detach from the document
  let webgl: WebglAddon | null = null
  try {
    const addon = new WebglAddon()
    term.loadAddon(addon)
    webgl = addon
  } catch {
    // WebGL not available, canvas fallback
  }

  // PTY connection
  window.arcnext.pty.create(paneId, cwd)

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

  term.parser.registerOscHandler(7, (data) => {
    try {
      const url = new URL(data)
      const cwd = decodeURIComponent(url.pathname)
      if (cwd) onCwdChange?.(paneId, cwd)
    } catch {
      // malformed OSC 7, ignore
    }
    return true
  })

  terminals.set(paneId, { term, fit, webgl, removeDataListener, removeExitListener })
  return term
}

function safeFit(managed: ManagedTerminal): void {
  const host = managed.term.element?.parentElement
  if (!host || host.clientWidth < 20 || host.clientHeight < 20) return
  managed.fit.fit()
}

/** Attach a terminal to a DOM element. Call this when the component mounts. */
export function attachTerminal(paneId: string, container: HTMLElement): void {
  const managed = terminals.get(paneId)
  if (!managed) return

  const host = managed.term.element?.parentElement
  if (!host) return

  // Already in the target container — just refit
  if (host.parentElement === container) {
    safeFit(managed)
    return
  }

  // Clear any stale DOM from this container before attaching
  while (container.firstChild) {
    container.removeChild(container.firstChild)
  }

  // Move host div from parking (or previous container) into new container
  container.appendChild(host)
  safeFit(managed)
}

/** Detach terminal back to parking div. Call this when the component unmounts. */
export function detachTerminal(paneId: string): void {
  const managed = terminals.get(paneId)
  if (!managed) return
  const host = managed.term.element?.parentElement
  if (host && host.parentElement !== parkingDiv) {
    parkingDiv.appendChild(host)
  }
}

/** Refit the terminal to its container size */
export function fitTerminal(paneId: string): void {
  const managed = terminals.get(paneId)
  if (managed) safeFit(managed)
}

/** Focus the terminal */
export function focusTerminal(paneId: string): void {
  terminals.get(paneId)?.term.focus()
}

/** Blur the terminal */
export function blurTerminal(paneId: string): void {
  terminals.get(paneId)?.term.blur()
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
  // Clean up host div from parking to prevent DOM leaks
  const host = managed.term.element?.parentElement
  if (host) host.remove()
  // Dispose addons before terminal
  if (managed.webgl) managed.webgl.dispose()
  window.arcnext.pty.kill(paneId)
  managed.term.dispose()
  terminals.delete(paneId)
}
