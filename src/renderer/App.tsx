import { useEffect, useState } from 'react'
import SplitView from './components/SplitView'
import Sidebar from './components/Sidebar'
import DirPicker from './components/DirPicker'
import { usePaneStore, useActiveWorkspace } from './store/paneStore'
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
  const focusState = usePaneStore((s) => s.focusState)
  const setFocusState = usePaneStore((s) => s.setFocusState)
  const activeWorkspaceId = usePaneStore((s) => s.activeWorkspaceId)
  const splitActive = usePaneStore((s) => s.splitActive)
  const closePane = usePaneStore((s) => s.closePane)
  const addWorkspace = usePaneStore((s) => s.addWorkspace)
  const setPaneTitle = usePaneStore((s) => s.setPaneTitle)
  const setPaneCwd = usePaneStore((s) => s.setPaneCwd)
  const addBrowserWorkspace = usePaneStore((s) => s.addBrowserWorkspace)
  const setBrowserPaneUrl = usePaneStore((s) => s.setBrowserPaneUrl)
  const setBrowserPaneNavState = usePaneStore((s) => s.setBrowserPaneNavState)
  const setBrowserPaneLoading = usePaneStore((s) => s.setBrowserPaneLoading)
  const setBrowserPaneFavicon = usePaneStore((s) => s.setBrowserPaneFavicon)
  const setActivePaneInWorkspace = usePaneStore((s) => s.setActivePaneInWorkspace)
  const switchWorkspace = usePaneStore((s) => s.switchWorkspace)
  const navigateDir = usePaneStore((s) => s.navigateDir)
  const toggleSidebar = usePaneStore((s) => s.toggleSidebar)
  const undockBrowserPane = usePaneStore((s) => s.undockBrowserPane)
  const removeUndockedBrowserPane = usePaneStore((s) => s.removeUndockedBrowserPane)
  const workspaces = usePaneStore((s) => s.workspaces)
  const setOverlay = usePaneStore((s) => s.setOverlay)
  const [dirPickerOpen, setDirPickerOpen] = useState(false)

  const openDirPicker = () => { setDirPickerOpen(true); setOverlay('dirPicker', true) }
  const closeDirPicker = () => { setDirPickerOpen(false); setOverlay('dirPicker', false) }

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

  // Wire browser view events from main process into the store
  useEffect(() => {
    const unsubs = [
      window.arcnext.browser.onTitleChanged((paneId, title) => {
        setPaneTitle(paneId, title)
      }),
      window.arcnext.browser.onUrlChanged((paneId, url) => {
        setBrowserPaneUrl(paneId, url)
      }),
      window.arcnext.browser.onLoadingChanged((paneId, loading) => {
        setBrowserPaneLoading(paneId, loading)
      }),
      window.arcnext.browser.onNavStateChanged((paneId, canGoBack, canGoForward) => {
        setBrowserPaneNavState(paneId, canGoBack, canGoForward)
      }),
      window.arcnext.browser.onFocused((paneId) => {
        setActivePaneInWorkspace(paneId)
      }),
      window.arcnext.browser.onFaviconChanged((paneId, faviconUrl) => {
        setBrowserPaneFavicon(paneId, faviconUrl)
      }),
      window.arcnext.browser.onDocked(({ paneId, url, title }) => {
        addBrowserWorkspace(url, { paneId, title, isLoading: false })
      }),
      window.arcnext.browser.onUndocked(({ paneId }) => {
        removeUndockedBrowserPane(paneId)
      })
    ]
    return () => unsubs.forEach((unsub) => unsub())
  }, [
    setPaneTitle,
    addBrowserWorkspace,
    setBrowserPaneUrl,
    setBrowserPaneLoading,
    setBrowserPaneNavState,
    setActivePaneInWorkspace,
    setBrowserPaneFavicon,
    removeUndockedBrowserPane
  ])

  // Track UI focus (inputs/textareas) to suppress shortcuts while editing
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if ((e.target as HTMLElement).dataset.suppressShortcuts !== undefined) {
        setFocusState('ui')
      }
    }
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null
      if (related?.dataset?.suppressShortcuts !== undefined) return
      if (activePaneType) setFocusState(activePaneType)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [setFocusState, activePaneType])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey
      const alt = e.altKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      // DirPicker is a modal — suppress all shortcuts except Cmd+G to close
      if (dirPickerOpen) {
        if (meta && !e.shiftKey && !alt && key === 'g') {
          e.preventDefault()
          closeDirPicker()
          return
        }
        return
      }

      // Cmd+Shift+Enter — undock active browser pane
      if (meta && e.shiftKey && !alt && e.key === 'Enter' && activePaneType === 'browser' && focusState !== 'ui') {
        e.preventDefault()
        if (ws) undockBrowserPane(ws.activePaneId)
        return
      }

      // Opt+Cmd+Arrow — navigate panes / cross workspace at boundary
      if (meta && alt && e.key in ARROW_TO_DIR) {
        e.preventDefault()
        e.stopImmediatePropagation()
        navigateDir(ARROW_TO_DIR[e.key])
        return
      }

      // Terminal-only shortcuts — only fire when terminal has focus
      if (focusState === 'terminal') {
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

      // Browser-only shortcuts — only fire when browser has focus
      if (focusState === 'browser') {
        // Cmd+L — focus URL bar
        if (meta && !e.shiftKey && !alt && key === 'l') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('browser-focus-url', {
            detail: { paneId: ws?.activePaneId }
          }))
          return
        }
        // Cmd+R — reload
        if (meta && !e.shiftKey && !alt && key === 'r') {
          e.preventDefault()
          if (ws) window.arcnext.browser.reload(ws.activePaneId)
          return
        }
        // Cmd+[ — back
        if (meta && !e.shiftKey && !alt && e.key === '[') {
          e.preventDefault()
          if (ws) window.arcnext.browser.goBack(ws.activePaneId)
          return
        }
        // Cmd+] — forward
        if (meta && !e.shiftKey && !alt && e.key === ']') {
          e.preventDefault()
          if (ws) window.arcnext.browser.goForward(ws.activePaneId)
          return
        }
      }

      // Cmd+G — open directory picker
      if (meta && !e.shiftKey && !alt && key === 'g') {
        e.preventDefault()
        openDirPicker()
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
  }, [splitActive, closePane, addWorkspace, switchWorkspace, navigateDir, toggleSidebar, undockBrowserPane, ws, workspaces, dirPickerOpen, activePaneType, focusState, setFocusState])

  return (
    <div id="app">
      <Sidebar />
      <div id="workspace">
        {workspaces.map((w) => (
          <div key={w.id} className={`ws-layer ${w.id === activeWorkspaceId ? 'active' : ''}`}>
            <SplitView node={w.tree} workspaceId={w.id} />
          </div>
        ))}
      </div>
      {dirPickerOpen && <DirPicker onClose={closeDirPicker} />}
    </div>
  )
}
