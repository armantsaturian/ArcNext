import { useEffect, useState } from 'react'
import SplitView from './components/SplitView'
import Sidebar from './components/Sidebar'
import DirPicker from './components/DirPicker'
import InlineAutocomplete from './components/InlineAutocomplete'
import { usePaneStore, useActiveWorkspace } from './store/paneStore'
import { useAutocompleteStore } from './store/autocompleteStore'
import { setTitleChangeCallback, setCwdChangeCallback, writeToTerminalPTY } from './model/terminalManager'
import { NavDirection } from './model/splitTree'

const ARROW_TO_DIR: Record<string, NavDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

function useActivePaneType(): 'terminal' | 'browser' | null {
  return usePaneStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
    if (!ws) return null
    const pane = s.panes.get(ws.activePaneId)
    return pane?.type ?? null
  })
}

export default function App() {
  const ws = useActiveWorkspace()
  const activePaneType = useActivePaneType()
  const activeWorkspaceId = usePaneStore((s) => s.activeWorkspaceId)
  const splitActive = usePaneStore((s) => s.splitActive)
  const closePane = usePaneStore((s) => s.closePane)
  const addWorkspace = usePaneStore((s) => s.addWorkspace)
  const setPaneTitle = usePaneStore((s) => s.setPaneTitle)
  const setPaneCwd = usePaneStore((s) => s.setPaneCwd)
  const switchWorkspace = usePaneStore((s) => s.switchWorkspace)
  const navigateDir = usePaneStore((s) => s.navigateDir)
  const toggleSidebar = usePaneStore((s) => s.toggleSidebar)
  const workspaces = usePaneStore((s) => s.workspaces)
  const [dirPickerOpen, setDirPickerOpen] = useState(false)

  // Prevent Electron's default file-drop navigation so per-component drop handlers work
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [])

  // Wire terminal title changes into the store
  useEffect(() => {
    setTitleChangeCallback((paneId, title) => setPaneTitle(paneId, title))
  }, [setPaneTitle])

  // Wire cwd changes into the store and dir history
  useEffect(() => {
    setCwdChangeCallback((paneId, cwd) => {
      setPaneCwd(paneId, cwd)
      window.arcnext.dirHistory.visit(cwd)
    })
  }, [setPaneCwd])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey
      const alt = e.altKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      // Opt+Cmd+Arrow — navigate panes / cross workspace at boundary
      if (meta && alt && e.key in ARROW_TO_DIR) {
        e.preventDefault()
        e.stopImmediatePropagation()
        useAutocompleteStore.getState().deactivate()
        navigateDir(ARROW_TO_DIR[e.key])
        return
      }

      // Terminal-only shortcuts — only fire when active pane is a terminal
      if (activePaneType === 'terminal') {
        // Option+Left/Right — word jump
        if (alt && !meta && e.key === 'ArrowLeft') {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (ws) writeToTerminalPTY(ws.activePaneId, '\x1bb') // ESC+b backward word
          return
        }
        if (alt && !meta && e.key === 'ArrowRight') {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (ws) writeToTerminalPTY(ws.activePaneId, '\x1bf') // ESC+f forward word
          return
        }

        // Option+Backspace — delete previous word
        if (alt && !meta && e.key === 'Backspace') {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (ws) writeToTerminalPTY(ws.activePaneId, '\x17') // Ctrl+W
          return
        }

        // Cmd+Backspace — delete to beginning of line
        if (meta && !alt && e.key === 'Backspace') {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (ws) writeToTerminalPTY(ws.activePaneId, '\x15') // Ctrl+U
          return
        }

        // Cmd+Left/Right — jump to line start/end
        if (meta && !alt && e.key === 'ArrowLeft') {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (ws) writeToTerminalPTY(ws.activePaneId, '\x01') // Ctrl+A
          return
        }
        if (meta && !alt && e.key === 'ArrowRight') {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (ws) writeToTerminalPTY(ws.activePaneId, '\x05') // Ctrl+E
          return
        }
      }

      // Cmd+G — open directory picker
      if (meta && !e.shiftKey && !alt && key === 'g') {
        e.preventDefault()
        setDirPickerOpen(true)
        return
      }
      // Cmd+B — toggle sidebar
      if (meta && !e.shiftKey && !alt && key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      // Cmd+D — split right
      if (meta && !e.shiftKey && !alt && key === 'd') {
        e.preventDefault()
        splitActive('horizontal')
        return
      }
      // Cmd+Shift+D — split down
      if (meta && e.shiftKey && !alt && key === 'd') {
        e.preventDefault()
        splitActive('vertical')
        return
      }
      // Cmd+W — close pane
      if (meta && !e.shiftKey && !alt && key === 'w') {
        e.preventDefault()
        if (ws) closePane(ws.activePaneId)
        return
      }
      // Cmd+T — new workspace
      if (meta && !alt && key === 't') {
        e.preventDefault()
        addWorkspace()
        return
      }
      // Cmd+1-9 — switch workspace by index
      if (meta && !alt && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < workspaces.length) switchWorkspace(workspaces[idx].id)
        return
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [splitActive, closePane, addWorkspace, switchWorkspace, navigateDir, toggleSidebar, ws, workspaces, dirPickerOpen, activePaneType])

  return (
    <div id="app">
      <Sidebar />
      <div id="workspace">
        {workspaces.map((w) => (
          <div key={w.id} className={`ws-layer ${w.id === activeWorkspaceId ? 'active' : ''}`}>
            <SplitView node={w.tree} />
          </div>
        ))}
      </div>
      <InlineAutocomplete />
      {dirPickerOpen && <DirPicker onClose={() => setDirPickerOpen(false)} />}
    </div>
  )
}
