import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const PANE_ID = 'initial'

export default function App() {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return

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

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(termRef.current)

    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // WebGL not available, falls back to canvas
    }

    fitAddon.fit()
    xtermRef.current = term

    // Connect to PTY
    window.arcnext.pty.create(PANE_ID)

    term.onData((data) => {
      window.arcnext.pty.write(PANE_ID, data)
    })

    window.arcnext.pty.onData((paneId, data) => {
      if (paneId === PANE_ID) term.write(data)
    })

    term.onResize(({ cols, rows }) => {
      window.arcnext.pty.resize(PANE_ID, cols, rows)
    })

    const onResize = () => fitAddon.fit()
    window.addEventListener('resize', onResize)

    term.focus()

    return () => {
      window.removeEventListener('resize', onResize)
      window.arcnext.pty.kill(PANE_ID)
      term.dispose()
    }
  }, [])

  return (
    <div id="app">
      <div id="terminal-container" ref={termRef} />
    </div>
  )
}
