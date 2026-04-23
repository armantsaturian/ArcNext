import { useEffect } from 'react'
import GridView from './components/GridView'
import Sidebar from './components/Sidebar'
import UnifiedPicker from './components/UnifiedPicker'
import { usePaneStore, flushPersistPinned, Workspace } from './store/paneStore'
import { setTitleChangeCallback, setCwdChangeCallback, setCommandChangeCallback, setPtyDataCallback, setUserInputCallback, writeToTerminalPTY } from './model/terminalManager'
import {
  setAgentStateCallback, onCommandStart, onCommandEnd,
  onTitleChange as agentOnTitleChange, onPtyData as agentOnPtyData, startIdleChecker
} from './model/agentDetector'
import { findController } from './model/findController'
import { NavDirection, allPaneIds } from './model/gridLayout'
import type { BrowserPaneInfo } from './store/paneStore'

const ARROW_TO_DIR: Record<string, NavDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

// ── Keyboard shortcut helpers (module-level, read fresh state via params) ──

function handleTerminalShortcuts(e: KeyboardEvent, ws: Workspace, meta: boolean, alt: boolean): boolean {
  if (alt && !meta && e.key === 'ArrowLeft') {
    e.preventDefault(); e.stopImmediatePropagation()
    writeToTerminalPTY(ws.activePaneId, '\x1bb') // ESC+b backward word
    return true
  }
  if (alt && !meta && e.key === 'ArrowRight') {
    e.preventDefault(); e.stopImmediatePropagation()
    writeToTerminalPTY(ws.activePaneId, '\x1bf') // ESC+f forward word
    return true
  }
  if (alt && !meta && e.key === 'Backspace') {
    e.preventDefault(); e.stopImmediatePropagation()
    writeToTerminalPTY(ws.activePaneId, '\x17') // Ctrl+W — delete previous word
    return true
  }
  if (meta && !alt && e.key === 'Backspace') {
    e.preventDefault(); e.stopImmediatePropagation()
    writeToTerminalPTY(ws.activePaneId, '\x15') // Ctrl+U — delete to beginning of line
    return true
  }
  if (meta && !alt && e.key === 'ArrowLeft') {
    e.preventDefault(); e.stopImmediatePropagation()
    writeToTerminalPTY(ws.activePaneId, '\x01') // Ctrl+A — jump to line start
    return true
  }
  if (meta && !alt && e.key === 'ArrowRight') {
    e.preventDefault(); e.stopImmediatePropagation()
    writeToTerminalPTY(ws.activePaneId, '\x05') // Ctrl+E — jump to line end
    return true
  }
  return false
}

function handleBrowserShortcuts(e: KeyboardEvent, ws: Workspace, meta: boolean, alt: boolean, key: string): boolean {
  if (meta && !e.shiftKey && !alt && key === 'l') {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('browser-focus-url', { detail: { paneId: ws.activePaneId } }))
    return true
  }
  if (meta && !e.shiftKey && !alt && key === 'r') {
    e.preventDefault()
    window.arcnext.browser.reload(ws.activePaneId)
    return true
  }
  if (meta && !e.shiftKey && !alt && e.key === '[') {
    e.preventDefault()
    usePaneStore.getState().goBackBrowserPane(ws.activePaneId)
    return true
  }
  if (meta && !e.shiftKey && !alt && e.key === ']') {
    e.preventDefault()
    window.arcnext.browser.goForward(ws.activePaneId)
    return true
  }
  return false
}

function resolveOpenerWorkspaceId(sourcePaneId?: string): string | undefined {
  const state = usePaneStore.getState()
  if (sourcePaneId) {
    const opener = state.workspaces.find((w) => allPaneIds(w.grid).includes(sourcePaneId))
    if (opener) return opener.id
  }
  return state.activeWorkspaceId ?? undefined
}

function handleGlobalShortcuts(e: KeyboardEvent, meta: boolean, alt: boolean, key: string): boolean {
  const state = usePaneStore.getState()
  const ws = state.activeWorkspaceId
    ? state.workspaces.find((w) => w.id === state.activeWorkspaceId)
    : undefined

  // Cmd+F — open find bar
  if (meta && !e.shiftKey && !alt && key === 'f') {
    e.preventDefault(); findController.open(); return true
  }
  // Cmd+G / Cmd+Shift+G — find next/prev
  if (meta && !alt && key === 'g' && findController.isOpen()) {
    e.preventDefault(); e.shiftKey ? findController.prev() : findController.next(); return true
  }
  // Cmd+B — toggle sidebar
  if (meta && !e.shiftKey && !alt && key === 'b') {
    e.preventDefault(); state.toggleSidebar(); return true
  }
  // Cmd+D — split right
  if (meta && !e.shiftKey && !alt && key === 'd') {
    e.preventDefault(); state.splitActive('horizontal'); return true
  }
  // Cmd+Shift+D — split down
  if (meta && e.shiftKey && !alt && key === 'd') {
    e.preventDefault(); state.splitActive('vertical'); return true
  }
  // Cmd+W — close pane (sleep if pinned), hide window if no active workspace
  if (meta && !e.shiftKey && !alt && key === 'w') {
    e.preventDefault()
    if (ws) {
      ws.pinned ? state.sleepWorkspace(ws.id) : state.closePane(ws.activePaneId)
    } else {
      window.arcnext.app.hide()
    }
    return true
  }
  // Cmd+T — toggle picker (new tab)
  if (meta && !alt && key === 't') {
    e.preventDefault(); state.togglePicker(); return true
  }
  // Cmd+1-9 — switch workspace by index
  if (meta && !alt && e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    const idx = parseInt(e.key) - 1
    if (idx < state.workspaces.length) {
      const target = state.workspaces[idx]
      if (target.dormant) state.wakeWorkspace(target.id)
      state.switchWorkspace(target.id)
    }
    return true
  }
  return false
}

export default function App() {
  const activeWorkspaceId = usePaneStore((s) => s.activeWorkspaceId)
  const workspaces = usePaneStore((s) => s.workspaces)
  const pickerOpen = usePaneStore((s) => s.pickerOpen)
  const closePicker = usePaneStore((s) => s.closePicker)

  // ── One-time setup: global listeners, pinned workspace load ──
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)

    const onBeforeUnload = () => flushPersistPinned()
    window.addEventListener('beforeunload', onBeforeUnload)

    window.arcnext.pinnedWorkspaces.load().then((entries) => {
      if (entries?.length) usePaneStore.getState().loadPinnedWorkspaces(entries)
    })

    const unsubAppShortcut = window.arcnext.browser.onAppShortcut((key, meta, ctrl, shift, alt) => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key, metaKey: meta, ctrlKey: ctrl, shiftKey: shift, altKey: alt,
        bubbles: true, cancelable: true
      }))
    })

    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
      window.removeEventListener('beforeunload', onBeforeUnload)
      unsubAppShortcut()
    }
  }, [])

  // ── IPC callback wiring: terminal, agent, browser events ──
  useEffect(() => {
    setTitleChangeCallback((paneId, title) => {
      usePaneStore.getState().setPaneTitle(paneId, title)
      agentOnTitleChange(paneId, title)
    })

    setCwdChangeCallback((paneId, cwd) => {
      usePaneStore.getState().setPaneCwd(paneId, cwd)
      window.arcnext.dirHistory.visit(cwd)
    })

    setAgentStateCallback((paneId, state) => usePaneStore.getState().setAgentState(paneId, state))
    setCommandChangeCallback((paneId, command) => {
      if (command) {
        onCommandStart(paneId, command)
        usePaneStore.getState().setPaneCommand(paneId, command)
      } else {
        onCommandEnd(paneId)
        usePaneStore.getState().setPaneCommand(paneId, null)
      }
    })
    setUserInputCallback((paneId, message) => {
      const s = usePaneStore.getState()
      if (s.agentStates.get(paneId)) s.setPaneUserMessage(paneId, message)
    })
    setPtyDataCallback((paneId) => agentOnPtyData(paneId))
    const stopIdleChecker = startIdleChecker()

    const getPaneUrl = (paneId: string): string | undefined => {
      const pane = usePaneStore.getState().panes.get(paneId)
      return pane?.type === 'browser' ? (pane as BrowserPaneInfo).url : undefined
    }
    const browserUnsubs = [
      window.arcnext.browser.onTitleChanged((paneId, title) => {
        usePaneStore.getState().setPaneTitle(paneId, title)
        const url = getPaneUrl(paneId)
        if (url) window.arcnext.webHistory.visit(url, title)
      }),
      window.arcnext.browser.onUrlChanged((paneId, url) => {
        usePaneStore.getState().setBrowserPaneUrl(paneId, url)
        window.arcnext.webHistory.visit(url)
      }),
      window.arcnext.browser.onLoadingChanged((paneId, loading) => {
        usePaneStore.getState().setBrowserPaneLoading(paneId, loading)
      }),
      window.arcnext.browser.onNavStateChanged((paneId, canGoBack, canGoForward) => {
        usePaneStore.getState().setBrowserPaneNavState(paneId, canGoBack, canGoForward)
      }),
      window.arcnext.browser.onFocused((paneId) => {
        usePaneStore.getState().setActivePaneInWorkspace(paneId)
      }),
      window.arcnext.browser.onFaviconChanged((paneId, faviconUrl) => {
        usePaneStore.getState().setBrowserPaneFavicon(paneId, faviconUrl)
        const url = getPaneUrl(paneId)
        if (url) window.arcnext.webHistory.visit(url, undefined, faviconUrl)
      }),
      window.arcnext.browser.onAudioStateChanged((paneId, playing, muted) => {
        usePaneStore.getState().setAudioState(paneId, playing, muted)
      }),
      window.arcnext.browser.onPipExited((paneId) => {
        if (usePaneStore.getState().pipPaneId === paneId) {
          usePaneStore.setState({ pipPaneId: null })
        }
      }),
      window.arcnext.browser.onOpenInNewWorkspace((url, sourcePaneId) => {
        usePaneStore.getState().addBrowserWorkspace(url, {
          openerWorkspaceId: resolveOpenerWorkspaceId(sourcePaneId)
        })
      }),
      window.arcnext.browser.onSummarize((paneId, url) => {
        usePaneStore.getState().summarizeUrl(paneId, url)
      }),
      // Web bridge: track per-pane agent ownership and per-action pulses.
      // Single source of truth in the store — BrowserPane + Sidebar read it.
      window.arcnext.bridge.onAcquired((paneId) => {
        usePaneStore.getState().setBridgeHolds(paneId, true)
      }),
      window.arcnext.bridge.onReleased((paneId) => {
        usePaneStore.getState().setBridgeHolds(paneId, false)
      }),
      window.arcnext.bridge.onYielded((paneId) => {
        usePaneStore.getState().setBridgeHolds(paneId, false)
      }),
      window.arcnext.bridge.onAgentActed((paneId) => {
        usePaneStore.getState().pulseBridgeActing(paneId)
      }),
      // Dictation: write transcribed text straight to PTY
      window.arcnext.dictation.onText((paneId, text) => {
        window.arcnext.pty.write(paneId, text)
      })
    ]

    return () => {
      stopIdleChecker()
      browserUnsubs.forEach((unsub) => unsub())
    }
  }, [])

  // ── Keyboard shortcuts & focus tracking ──
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if ((e.target as HTMLElement).dataset.suppressShortcuts !== undefined) {
        usePaneStore.getState().setFocusState('ui')
      }
    }
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null
      if (related?.dataset?.suppressShortcuts !== undefined) return
      const state = usePaneStore.getState()
      const ws = state.activeWorkspaceId
        ? state.workspaces.find((w) => w.id === state.activeWorkspaceId)
        : undefined
      if (!ws) return
      const pane = state.panes.get(ws.activePaneId)
      if (pane?.type) state.setFocusState(pane.type)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey
      const alt = e.altKey
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const state = usePaneStore.getState()

      // Escape — close find bar if open
      if (key === 'Escape' && !meta && !alt && !e.shiftKey) {
        if (findController.isOpen()) { e.preventDefault(); findController.close(); return }
      }

      // Picker is a modal — suppress all shortcuts except Cmd+T to close
      if (state.pickerOpen) {
        if (meta && !e.shiftKey && !alt && key === 't') {
          e.preventDefault(); state.closePicker()
        }
        return
      }

      // Opt+Cmd+Arrow — navigate panes / cross workspace boundary
      if (meta && alt && e.key in ARROW_TO_DIR) {
        e.preventDefault(); e.stopImmediatePropagation()
        state.navigateDir(ARROW_TO_DIR[e.key])
        return
      }

      const ws = state.activeWorkspaceId
        ? state.workspaces.find((w) => w.id === state.activeWorkspaceId)
        : undefined

      // Context-specific shortcuts
      if (ws && state.focusState === 'terminal' && handleTerminalShortcuts(e, ws, meta, alt)) return
      if (ws && state.focusState === 'browser' && handleBrowserShortcuts(e, ws, meta, alt, key)) return
      handleGlobalShortcuts(e, meta, alt, key)
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  const hasActiveWorkspace = workspaces.some((w) => !w.dormant)

  return (
    <div id="app" className={!hasActiveWorkspace ? 'ws-empty' : ''}>
      <Sidebar />
      <div id="workspace">
        {workspaces.filter((w) => !w.dormant).map((w) => (
          <div key={w.id} className={`ws-layer ${w.id === activeWorkspaceId ? 'active' : ''}`}>
            <GridView grid={w.grid} workspaceId={w.id} />
          </div>
        ))}
      </div>
      {pickerOpen && <UnifiedPicker onClose={closePicker} />}
    </div>
  )
}
