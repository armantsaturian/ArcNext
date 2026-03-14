import { useEffect } from 'react'
import SplitView from './components/SplitView'
import Sidebar from './components/Sidebar'
import { usePaneStore, useActiveWorkspace } from './store/paneStore'
import { setTitleChangeCallback } from './model/terminalManager'

export default function App() {
  const ws = useActiveWorkspace()
  const splitActive = usePaneStore((s) => s.splitActive)
  const closePane = usePaneStore((s) => s.closePane)
  const focusNext = usePaneStore((s) => s.focusNext)
  const focusPrev = usePaneStore((s) => s.focusPrev)
  const addWorkspace = usePaneStore((s) => s.addWorkspace)
  const setPaneTitle = usePaneStore((s) => s.setPaneTitle)
  const switchWorkspace = usePaneStore((s) => s.switchWorkspace)
  const workspaces = usePaneStore((s) => s.workspaces)

  // Wire terminal title changes into the store
  useEffect(() => {
    setTitleChangeCallback((paneId, title) => setPaneTitle(paneId, title))
  }, [setPaneTitle])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey

      // Cmd+D — split right
      if (meta && !e.shiftKey && e.key === 'd') {
        e.preventDefault()
        splitActive('horizontal')
        return
      }
      // Cmd+Shift+D — split down
      if (meta && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        splitActive('vertical')
        return
      }
      // Cmd+W — close pane
      if (meta && !e.shiftKey && e.key === 'w') {
        e.preventDefault()
        if (ws) closePane(ws.activePaneId)
        return
      }
      // Cmd+] — next pane
      if (meta && e.key === ']') {
        e.preventDefault()
        focusNext()
        return
      }
      // Cmd+[ — previous pane
      if (meta && e.key === '[') {
        e.preventDefault()
        focusPrev()
        return
      }
      // Cmd+T — new workspace
      if (meta && e.key === 't') {
        e.preventDefault()
        addWorkspace()
        return
      }
      // Cmd+1-9 — switch workspace by index
      if (meta && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < workspaces.length) switchWorkspace(workspaces[idx].id)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [splitActive, closePane, focusNext, focusPrev, addWorkspace, switchWorkspace, ws, workspaces])

  return (
    <div id="app">
      <Sidebar />
      <div id="workspace">
        {ws && <SplitView node={ws.tree} />}
      </div>
    </div>
  )
}
