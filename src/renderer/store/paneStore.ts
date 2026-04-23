import { create } from 'zustand'
import {
  GridLayout, Direction, createGrid, addColumn, addRowBelow, removePane,
  allPaneIds, adjacentPaneId, navigateDirection, mergeGrids, mergeGridAsRows,
  NavDirection
} from '../model/gridLayout'
import { getVisualWorkspaceOrder } from '../model/workspaceGrouping'
import { stripAndTruncate } from '../model/titleFormatter'
import { createTerminal, destroyTerminal, serializeTerminal } from '../model/terminalManager'
import { destroyBrowserView } from '../model/browserManager'
import type { PaneInfo, TerminalPaneInfo, BrowserPaneInfo, SerializedPane, PinnedWorkspaceEntry, AgentState, BridgeState, DictationState } from '../../shared/types'

let nextPaneId = 1
let nextWorkspaceId = 1

/**
 * Side-channel for dormant terminal scrollback data.
 * Kept outside zustand so large strings don't participate in
 * store snapshots, Map cloning, or React re-renders.
 */
const dormantScrollback = new Map<string, string>()

/**
 * Workspace visit history stack.
 * Tracks previously active workspace IDs so closing/sleeping a workspace
 * returns to the most recently visited one instead of the first in the list.
 * Kept outside zustand — no UI needs to react to history changes.
 */
const workspaceHistory: string[] = []

/** Push current active workspace onto history before switching away from it. */
function pushWorkspaceHistory(currentId: string): void {
  // Remove any existing occurrence to avoid duplicates, then push to top
  const idx = workspaceHistory.indexOf(currentId)
  if (idx !== -1) workspaceHistory.splice(idx, 1)
  workspaceHistory.push(currentId)
}

/** Find the most recently visited workspace that's still alive and not dormant. */
function popWorkspaceHistory(remaining: Workspace[]): string | undefined {
  const alive = new Set(remaining.filter((w) => !w.dormant).map((w) => w.id))
  for (let i = workspaceHistory.length - 1; i >= 0; i--) {
    if (alive.has(workspaceHistory[i])) {
      return workspaceHistory[i]
    }
  }
  return undefined
}

/** Remove a workspace ID from history entirely (called when workspace is destroyed). */
function purgeFromHistory(id: string): void {
  const idx = workspaceHistory.indexOf(id)
  if (idx !== -1) workspaceHistory.splice(idx, 1)
}

function genPaneId(): string {
  return `pane-${nextPaneId++}`
}

function genWorkspaceId(): string {
  return `ws-${nextWorkspaceId++}`
}

export type { PaneInfo, TerminalPaneInfo, BrowserPaneInfo }

export interface Workspace {
  id: string
  name: string
  grid: GridLayout
  activePaneId: string
  color?: string
  pinned?: boolean
  dormant?: boolean
}

interface BrowserPaneOptions {
  paneId?: string
  title?: string
  isLoading?: boolean
  openerWorkspaceId?: string
}

interface PaneStore {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  panes: Map<string, PaneInfo>

  // Sidebar UI
  sidebarWidth: number
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void

  // Workspace actions
  addWorkspace: (cwd?: string) => void
  removeWorkspace: (id: string) => void
  switchWorkspace: (id: string) => void
  mergeWorkspaces: (targetId: string, sourceId: string, direction: Direction) => void
  separateWorkspace: (workspaceId: string) => void
  setWorkspaceColor: (id: string, color: string | undefined) => void
  setWorkspaceName: (id: string, name: string) => void
  aiRenameWorkspace: (workspaceId: string) => void
  moveWorkspace: (fromIndex: number, toIndex: number) => void

  // Pane actions
  closePaneInWorkspace: (workspaceId: string, paneId: string) => void
  splitActive: (direction: Direction) => void
  closePane: (id: string) => void
  setActivePaneInWorkspace: (paneId: string) => void
  focusNext: () => void
  focusPrev: () => void
  navigateDir: (dir: NavDirection) => void
  setPaneTitle: (id: string, title: string) => void
  setPaneCwd: (id: string, cwd: string) => void
  setPaneCommand: (id: string, command: string | null) => void
  setPaneUserMessage: (id: string, message: string) => void
  setGrid: (grid: GridLayout) => void

  // Summarize
  summarizeUrl: (browserPaneId: string, url: string) => void

  // Browser pane actions
  addBrowserWorkspace: (url: string, options?: BrowserPaneOptions) => void
  splitActiveBrowser: (direction: Direction, url: string) => void
  setBrowserPaneUrl: (id: string, url: string) => void
  setBrowserPaneNavState: (id: string, canGoBack: boolean, canGoForward: boolean) => void
  setBrowserPaneLoading: (id: string, isLoading: boolean) => void
  setBrowserPaneFavicon: (id: string, faviconUrl: string) => void
  goBackBrowserPane: (paneId: string) => void

  // Pinned workspaces
  pinWorkspace: (id: string) => void
  unpinWorkspace: (id: string) => void
  sleepWorkspace: (id: string) => void
  wakeWorkspace: (id: string) => void
  loadPinnedWorkspaces: (entries: PinnedWorkspaceEntry[]) => void
  serializePinnedWorkspaces: () => PinnedWorkspaceEntry[]
  persistPinned: () => void

  // Focus state
  focusState: 'terminal' | 'browser' | 'ui'
  setFocusState: (state: 'terminal' | 'browser' | 'ui') => void

  // Picker (Cmd+T / +New Workspace)
  pickerOpen: boolean
  openPicker: () => void
  closePicker: () => void
  togglePicker: () => void

  // Overlay state (hides native browser views so DOM modals are visible)
  activeOverlays: Set<string>
  setOverlay: (id: string, active: boolean) => void

  // Sidebar grouping
  sidebarGrouped: boolean
  setSidebarGrouped: (grouped: boolean) => void

  // Agent detection
  agentStates: Map<string, AgentState>
  setAgentState: (paneId: string, state: AgentState | null) => void

  // Web bridge (CDP driving)
  bridgeStates: Map<string, BridgeState>
  setBridgeHolds: (paneId: string, holds: boolean) => void
  pulseBridgeActing: (paneId: string) => void

  // Audio state
  audioStates: Map<string, { playing: boolean; muted: boolean }>
  setAudioState: (paneId: string, playing: boolean, muted: boolean) => void

  // Picture-in-Picture
  pipPaneId: string | null
  pipEnabled: boolean
  setPipEnabled: (enabled: boolean) => void
  clearPip: () => void
  dismissPip: () => void

  // Dictation state
  dictationStates: Map<string, DictationState>
  setDictationState: (paneId: string, state: DictationState | null) => void
}

function makeTerminalPane(cwd?: string): TerminalPaneInfo {
  const id = genPaneId()
  createTerminal(id, cwd)
  return { type: 'terminal', id, title: 'shell', cwd: cwd || '' }
}

function makeBrowserPane(url: string, options: BrowserPaneOptions = {}): BrowserPaneInfo {
  const id = options.paneId ?? genPaneId()
  return {
    type: 'browser',
    id,
    title: options.title || url,
    url,
    canGoBack: false,
    canGoForward: false,
    isLoading: options.isLoading ?? true,
    openerWorkspaceId: options.openerWorkspaceId
  }
}

function destroyPaneResource(pane: PaneInfo): void {
  if (pane.type === 'terminal') {
    destroyTerminal(pane.id)
  } else if (pane.type === 'browser') {
    destroyBrowserView(pane.id)
  }
}

function makeWorkspace(name?: string, cwd?: string): { workspace: Workspace; pane: PaneInfo } {
  const pane = makeTerminalPane(cwd)
  const id = genWorkspaceId()
  return {
    workspace: {
      id,
      name: name || `Workspace ${id.split('-')[1]}`,
      grid: createGrid(pane.id),
      activePaneId: pane.id
    },
    pane
  }
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null

function isPaneInPinnedWorkspace(paneId: string, workspaces: Workspace[]): boolean {
  return workspaces.some((w) => w.pinned && allPaneIds(w.grid).includes(paneId))
}

function findWorkspaceByPaneId(workspaces: Workspace[], paneId: string): Workspace | undefined {
  return workspaces.find((w) => allPaneIds(w.grid).includes(paneId))
}

function getReturnWorkspace(
  workspaces: Workspace[],
  currentWorkspaceId: string,
  openerWorkspaceId?: string
): Workspace | undefined {
  if (openerWorkspaceId) {
    const opener = workspaces.find((w) => w.id === openerWorkspaceId)
    if (opener) return opener
  }

  const otherWorkspaces = workspaces.filter((w) => w.id !== currentWorkspaceId)
  const fromHistory = popWorkspaceHistory(otherWorkspaces)
  if (fromHistory) return otherWorkspaces.find((w) => w.id === fromHistory)
  return otherWorkspaces.find((w) => !w.dormant)
}

/** Shared logic for closing a pane in any workspace */
function closePaneInWs(
  get: () => PaneStore,
  set: (partial: Partial<PaneStore>) => void,
  workspaceId: string,
  paneId: string
): void {
  const { workspaces, panes, pipPaneId } = get()
  const ws = workspaces.find((w) => w.id === workspaceId)
  if (!ws) return

  // Clean up PiP if the closed pane is in PiP
  if (pipPaneId === paneId) {
    set({ pipPaneId: null })
  }

  const ids = allPaneIds(ws.grid)
  if (ids.length <= 1) {
    get().removeWorkspace(workspaceId)
    return
  }

  const newGrid = removePane(ws.grid, paneId)
  if (!newGrid) return

  const pane = panes.get(paneId)
  if (pane) destroyPaneResource(pane)

  const newPanes = new Map(panes)
  newPanes.delete(paneId)

  const newActivePaneId = paneId === ws.activePaneId
    ? adjacentPaneId(ws.grid, paneId, -1)
    : ws.activePaneId

  set({
    workspaces: workspaces.map((w) => w.id === workspaceId ? { ...ws, grid: newGrid, activePaneId: newActivePaneId } : w),
    panes: newPanes
  })
  if (ws.pinned) get().persistPinned()
}

const initial = makeWorkspace()

export const usePaneStore = create<PaneStore>((set, get) => ({
  workspaces: [initial.workspace],
  activeWorkspaceId: initial.workspace.id,
  panes: new Map([[initial.pane.id, initial.pane]]),

  sidebarWidth: 220,
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(150, Math.min(400, width)) }),

  addWorkspace: (cwd?: string) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    const { workspace, pane } = makeWorkspace(undefined, cwd)
    const newPanes = new Map(panes)
    newPanes.set(pane.id, pane)
    if (activeWorkspaceId) pushWorkspaceHistory(activeWorkspaceId)
    set({
      workspaces: [...workspaces, workspace],
      activeWorkspaceId: workspace.id,
      panes: newPanes
    })
  },

  removeWorkspace: (id) => {
    const { workspaces, activeWorkspaceId, panes, pipPaneId } = get()
    const ws = workspaces.find((w) => w.id === id)
    if (!ws) return

    const paneIds = allPaneIds(ws.grid)

    // Clean up PiP if the destroyed workspace owns the PiP pane
    if (pipPaneId && paneIds.includes(pipPaneId)) {
      set({ pipPaneId: null })
    }

    const newPanes = new Map(panes)
    for (const pid of paneIds) {
      const pane = panes.get(pid)
      if (pane) destroyPaneResource(pane)
      newPanes.delete(pid)
      dormantScrollback.delete(pid)
    }

    const remaining = workspaces.filter((w) => w.id !== id)
    purgeFromHistory(id)

    let newActive: string | null = activeWorkspaceId
    if (id === activeWorkspaceId) {
      const fromHistory = popWorkspaceHistory(remaining)
      if (fromHistory) {
        newActive = fromHistory
      } else {
        const liveWs = remaining.find((w) => !w.dormant)
        newActive = liveWs?.id ?? null
      }
    }

    set({ workspaces: remaining, activeWorkspaceId: newActive, panes: newPanes })
    if (ws.pinned) get().persistPinned()
  },

  switchWorkspace: (id) => {
    const { activeWorkspaceId, pipEnabled, pipPaneId, workspaces, panes, audioStates } = get()
    if (id === activeWorkspaceId) return

    // Exit PiP if switching to the workspace that owns the PiP pane
    if (pipPaneId) {
      const targetWs = workspaces.find((w) => w.id === id)
      if (targetWs && allPaneIds(targetWs.grid).includes(pipPaneId)) {
        window.arcnext.browser.exitPip(pipPaneId)
        set({ pipPaneId: null })
      }
    }

    // Enter PiP for the most recent playing browser pane in the workspace we're leaving
    if (pipEnabled && activeWorkspaceId) {
      const currentWs = workspaces.find((w) => w.id === activeWorkspaceId)
      if (currentWs) {
        const playingBrowserPaneId = allPaneIds(currentWs.grid).find((pid) => {
          const pane = panes.get(pid)
          const audio = audioStates.get(pid)
          return pane?.type === 'browser' && audio?.playing
        })
        if (playingBrowserPaneId) {
          // Exit any existing PiP from a different pane before entering new one (multi-hop)
          const currentPip = get().pipPaneId
          if (currentPip && currentPip !== playingBrowserPaneId) {
            window.arcnext.browser.exitPip(currentPip)
          }
          window.arcnext.browser.enterPip(playingBrowserPaneId)
          set({ pipPaneId: playingBrowserPaneId })
        }
      }
    }

    if (activeWorkspaceId) pushWorkspaceHistory(activeWorkspaceId)
    set({ activeWorkspaceId: id })
  },

  mergeWorkspaces: (targetId, sourceId, direction) => {
    if (targetId === sourceId) return
    const { workspaces } = get()
    const targetWs = workspaces.find((w) => w.id === targetId)
    const sourceWs = workspaces.find((w) => w.id === sourceId)
    if (!targetWs || !sourceWs) return

    let mergedGrid: GridLayout
    if (direction === 'horizontal') {
      // Source columns appended to right
      mergedGrid = mergeGrids(targetWs.grid, sourceWs.grid)
    } else {
      // Source panes added as rows in the last column of target
      const lastColIdx = targetWs.grid.columns.length - 1
      mergedGrid = mergeGridAsRows(targetWs.grid, sourceWs.grid, lastColIdx)
    }

    const updatedTarget: Workspace = {
      ...targetWs,
      grid: mergedGrid
    }

    purgeFromHistory(sourceId)
    const { activeWorkspaceId } = get()
    if (targetId !== activeWorkspaceId && activeWorkspaceId) pushWorkspaceHistory(activeWorkspaceId)
    set({
      workspaces: workspaces
        .map((w) => (w.id === targetId ? updatedTarget : w))
        .filter((w) => w.id !== sourceId),
      activeWorkspaceId: targetId
    })
    if (targetWs.pinned || sourceWs.pinned) get().persistPinned()
  },

  setWorkspaceColor: (id, color) => {
    const { workspaces } = get()
    set({
      workspaces: workspaces.map((w) => w.id === id ? { ...w, color } : w)
    })
    if (workspaces.find((w) => w.id === id)?.pinned) get().persistPinned()
  },

  setWorkspaceName: (id, name) => {
    const { workspaces } = get()
    set({
      workspaces: workspaces.map((w) => w.id === id ? { ...w, name } : w)
    })
    if (workspaces.find((w) => w.id === id)?.pinned) get().persistPinned()
  },

  aiRenameWorkspace: async (workspaceId) => {
    const { workspaces, panes } = get()
    const ws = workspaces.find((w) => w.id === workspaceId)
    if (!ws) return

    const paneIds = allPaneIds(ws.grid)
    const paneInfos = paneIds.map((id) => panes.get(id)).filter(Boolean) as PaneInfo[]

    const agentCommands = new Set(['claude', 'codex', 'opencode'])
    const parts: string[] = []
    for (const pane of paneInfos) {
      if (pane.type === 'terminal') {
        const tp = pane as TerminalPaneInfo
        if (tp.userMessage) parts.push(`User task: ${tp.userMessage}`)
        if (tp.command && !agentCommands.has(tp.command)) parts.push(`Running: ${tp.command}`)
        if (tp.cwd) parts.push(`Project: ${tp.cwd.split('/').pop()}`)
      } else if (pane.type === 'browser') {
        const bp = pane as BrowserPaneInfo
        if (bp.title) parts.push(`Page: ${bp.title}`)
        if (bp.url) parts.push(`URL: ${bp.url}`)
      }
    }

    if (parts.length === 0) return

    const context = parts.join('\n')

    try {
      const result = await window.arcnext.aiRename.generate(context)
      if (result.name) {
        get().setWorkspaceName(workspaceId, result.name)
        return
      }
    } catch {
      // fall through to fallback
    }

    const primary = paneInfos.find((p) => p.type === 'terminal' && (p as TerminalPaneInfo).userMessage)
    if (primary && primary.type === 'terminal') {
      const fallback = stripAndTruncate((primary as TerminalPaneInfo).userMessage!)
      if (fallback) get().setWorkspaceName(workspaceId, fallback)
    }
  },

  moveWorkspace: (fromIndex, toIndex) => {
    const { workspaces } = get()
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
        fromIndex >= workspaces.length || toIndex >= workspaces.length) return
    const next = [...workspaces]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    set({ workspaces: next })
    if (next.some((w) => w.pinned)) get().persistPinned()
  },

  separateWorkspace: (workspaceId) => {
    const { workspaces } = get()
    const ws = workspaces.find((w) => w.id === workspaceId)
    if (!ws) return
    const paneIds = allPaneIds(ws.grid)
    if (paneIds.length <= 1) return

    // Each pane becomes its own workspace (first reuses original ID)
    const separated: Workspace[] = paneIds.map((paneId, i) => {
      const id = i === 0 ? ws.id : genWorkspaceId()
      return {
        ...ws,
        id,
        name: i === 0 ? ws.name : `Workspace ${id.split('-')[1]}`,
        grid: createGrid(paneId),
        activePaneId: paneId
      }
    })

    // Activate the workspace that contains the previously active pane
    const activeWs = separated.find((w) => allPaneIds(w.grid).includes(ws.activePaneId)) ?? separated[0]

    const wsIndex = workspaces.findIndex((w) => w.id === workspaceId)
    const newWorkspaces = [...workspaces]
    newWorkspaces.splice(wsIndex, 1, ...separated)

    set({
      workspaces: newWorkspaces,
      activeWorkspaceId: activeWs.id
    })
    if (ws.pinned) get().persistPinned()
  },

  closePaneInWorkspace: (workspaceId, paneId) => {
    closePaneInWs(get, set, workspaceId, paneId)
  },

  splitActive: (direction) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return

    const newPane = makeTerminalPane()
    const newPanes = new Map(panes)
    newPanes.set(newPane.id, newPane)

    const newGrid = direction === 'horizontal'
      ? addColumn(ws.grid, newPane.id)
      : addRowBelow(ws.grid, ws.activePaneId, newPane.id)

    set({
      workspaces: workspaces.map((w) => w.id === activeWorkspaceId ? { ...ws, grid: newGrid, activePaneId: newPane.id } : w),
      panes: newPanes
    })
    if (ws.pinned) get().persistPinned()
  },

  summarizeUrl: (browserPaneId, url) => {
    const { workspaces, panes } = get()
    const ws = workspaces.find((w) => allPaneIds(w.grid).includes(browserPaneId))
    if (!ws) return

    const newPane = makeTerminalPane()
    const newPanes = new Map(panes)
    newPanes.set(newPane.id, newPane)

    // 70% browser, 30% terminal
    const newGrid = addRowBelow(ws.grid, browserPaneId, newPane.id, 0.7)

    set({
      workspaces: workspaces.map((w) => w.id === ws.id ? { ...ws, grid: newGrid, activePaneId: newPane.id } : w),
      panes: newPanes
    })
    if (ws.pinned) get().persistPinned()

    // Write the summarize command once the shell is ready
    const escaped = url.replace(/'/g, "'\\''")
    const cmd = `summarize --length medium --format md --model openai/gpt-5.4-mini --prompt 'Summarize as a bullet list of concise, tweet-sized facts (2-3 sentences each). No headers, no paragraphs, no intro — just bullet points.' '${escaped}'\r`
    setTimeout(() => {
      window.arcnext.pty.write(newPane.id, cmd)
    }, 150)
  },

  closePane: (id) => {
    const { activeWorkspaceId } = get()
    if (!activeWorkspaceId) return
    closePaneInWs(get, set, activeWorkspaceId, id)
  },

  setActivePaneInWorkspace: (paneId) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    const pane = panes.get(paneId)
    const focusState = pane?.type === 'browser' ? 'browser' : 'terminal'
    set({
      workspaces: workspaces.map((w) =>
        w.id === activeWorkspaceId ? { ...w, activePaneId: paneId } : w
      ),
      focusState
    })
  },

  focusNext: () => {
    const { workspaces, activeWorkspaceId } = get()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return
    const next = adjacentPaneId(ws.grid, ws.activePaneId, 1)
    get().setActivePaneInWorkspace(next)
  },

  focusPrev: () => {
    const { workspaces, activeWorkspaceId } = get()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return
    const prev = adjacentPaneId(ws.grid, ws.activePaneId, -1)
    get().setActivePaneInWorkspace(prev)
  },

  navigateDir: (dir) => {
    const { workspaces, activeWorkspaceId, sidebarGrouped, panes } = get()
    if (!activeWorkspaceId) return
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return

    const target = navigateDirection(ws.grid, ws.activePaneId, dir)
    if (target) {
      get().setActivePaneInWorkspace(target)
      return
    }

    // At the boundary — cross to adjacent workspace (skip dormant).
    // In grouped mode for up/down, use the sidebar's visual order.
    const ordered = (sidebarGrouped && (dir === 'up' || dir === 'down'))
      ? getVisualWorkspaceOrder(workspaces, panes)
      : workspaces
    const idx = ordered.findIndex((w) => w.id === activeWorkspaceId)

    if (dir === 'left' || dir === 'up') {
      for (let i = idx - 1; i >= 0; i--) {
        if (!ordered[i].dormant) {
          get().switchWorkspace(ordered[i].id)
          break
        }
      }
    } else {
      for (let i = idx + 1; i < ordered.length; i++) {
        if (!ordered[i].dormant) {
          get().switchWorkspace(ordered[i].id)
          break
        }
      }
    }
  },

  setPaneTitle: (id, title) => {
    const { panes } = get()
    const pane = panes.get(id)
    if (!pane) return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, title })
    set({ panes: newPanes })
  },

  setPaneCwd: (id, cwd) => {
    const { panes, workspaces } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'terminal') return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, cwd })
    set({ panes: newPanes })
    if (isPaneInPinnedWorkspace(id, workspaces)) get().persistPinned()
  },

  setPaneCommand: (id, command) => {
    const { panes } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'terminal') return
    const newPanes = new Map(panes)
    if (command) {
      newPanes.set(id, { ...pane, command, userMessage: undefined })
    } else {
      newPanes.set(id, { ...pane, command: undefined, userMessage: undefined })
    }
    set({ panes: newPanes })
  },

  setPaneUserMessage: (id, message) => {
    const { panes } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'terminal') return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, userMessage: message })
    set({ panes: newPanes })
  },

  setGrid: (grid) => {
    const { workspaces, activeWorkspaceId } = get()
    set({
      workspaces: workspaces.map((w) =>
        w.id === activeWorkspaceId ? { ...w, grid } : w
      )
    })
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (ws?.pinned) get().persistPinned()
  },

  addBrowserWorkspace: (url, options = {}) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    const pane = makeBrowserPane(url, options)
    const id = genWorkspaceId()
    const workspace: Workspace = {
      id,
      name: `Workspace ${id.split('-')[1]}`,
      grid: createGrid(pane.id),
      activePaneId: pane.id
    }
    const newPanes = new Map(panes)
    newPanes.set(pane.id, pane)
    if (activeWorkspaceId) pushWorkspaceHistory(activeWorkspaceId)
    set({
      workspaces: [...workspaces, workspace],
      activeWorkspaceId: workspace.id,
      panes: newPanes
    })
  },

  splitActiveBrowser: (direction, url) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return

    const newPane = makeBrowserPane(url)
    const newPanes = new Map(panes)
    newPanes.set(newPane.id, newPane)

    const newGrid = direction === 'horizontal'
      ? addColumn(ws.grid, newPane.id)
      : addRowBelow(ws.grid, ws.activePaneId, newPane.id)

    set({
      workspaces: workspaces.map((w) => w.id === activeWorkspaceId ? { ...ws, grid: newGrid, activePaneId: newPane.id } : w),
      panes: newPanes
    })
    if (ws.pinned) get().persistPinned()
  },

  setBrowserPaneUrl: (id, url) => {
    const { panes, workspaces } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'browser') return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, url })
    set({ panes: newPanes })
    if (isPaneInPinnedWorkspace(id, workspaces)) get().persistPinned()
  },

  setBrowserPaneNavState: (id, canGoBack, canGoForward) => {
    const { panes } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'browser') return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, canGoBack, canGoForward })
    set({ panes: newPanes })
  },

  setBrowserPaneLoading: (id, isLoading) => {
    const { panes } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'browser') return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, isLoading })
    set({ panes: newPanes })
  },

  setBrowserPaneFavicon: (id, faviconUrl) => {
    const { panes, workspaces } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'browser') return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, faviconUrl })
    set({ panes: newPanes })
    if (isPaneInPinnedWorkspace(id, workspaces)) get().persistPinned()
  },

  goBackBrowserPane: (paneId) => {
    const { panes, workspaces } = get()
    const pane = panes.get(paneId)
    if (!pane || pane.type !== 'browser') return

    if (pane.canGoBack) {
      window.arcnext.browser.goBack(paneId)
      return
    }

    if (!pane.openerWorkspaceId) return

    const currentWs = findWorkspaceByPaneId(workspaces, paneId)
    if (!currentWs) return

    const targetWs = getReturnWorkspace(workspaces, currentWs.id, pane.openerWorkspaceId)
    const shouldCloseWorkspace = allPaneIds(currentWs.grid).length === 1

    if (shouldCloseWorkspace) {
      get().removeWorkspace(currentWs.id)
    } else {
      closePaneInWs(get, set, currentWs.id, paneId)
    }

    if (!targetWs) return

    const nextTarget = get().workspaces.find((w) => w.id === targetWs.id)
    if (!nextTarget) return
    if (nextTarget.dormant) get().wakeWorkspace(nextTarget.id)
    if (get().activeWorkspaceId !== nextTarget.id) {
      get().switchWorkspace(nextTarget.id)
    }
  },

  pinWorkspace: (id) => {
    const { workspaces } = get()
    const ws = workspaces.find((w) => w.id === id)
    if (!ws || ws.pinned) return
    const updated = { ...ws, pinned: true }
    const without = workspaces.filter((w) => w.id !== id)
    const pinnedCount = without.filter((w) => w.pinned).length
    const next = [...without]
    next.splice(pinnedCount, 0, updated)
    set({ workspaces: next })
    get().persistPinned()
  },

  unpinWorkspace: (id) => {
    const { workspaces } = get()
    const ws = workspaces.find((w) => w.id === id)
    if (!ws || !ws.pinned) return

    if (ws.dormant) {
      const paneIds = allPaneIds(ws.grid)
      const { panes } = get()
      for (const pid of paneIds) {
        const pane = panes.get(pid)
        if (!pane) continue
        if (pane.type === 'terminal') {
          createTerminal(pid, (pane as TerminalPaneInfo).cwd || undefined)
        }
      }
    }

    const updated = { ...ws, pinned: false, dormant: false }
    const without = workspaces.filter((w) => w.id !== id)
    const pinnedCount = without.filter((w) => w.pinned).length
    const next = [...without]
    next.splice(pinnedCount, 0, updated)
    set({ workspaces: next })
    get().persistPinned()
  },

  sleepWorkspace: (id) => {
    const { workspaces, panes, activeWorkspaceId, pipPaneId } = get()
    const ws = workspaces.find((w) => w.id === id)
    if (!ws || !ws.pinned || ws.dormant) return

    // Clean up PiP if the sleeping workspace owns the PiP pane
    const paneIds = allPaneIds(ws.grid)
    if (pipPaneId && paneIds.includes(pipPaneId)) {
      set({ pipPaneId: null })
    }

    // Capture scrollback into side-channel before destroying
    for (const pid of paneIds) {
      const pane = panes.get(pid)
      if (!pane) continue
      if (pane.type === 'terminal') {
        const content = serializeTerminal(pid)
        if (content) dormantScrollback.set(pid, content)
      }
      destroyPaneResource(pane)
    }

    const updated = { ...ws, dormant: true }

    let newActive: string | null = activeWorkspaceId
    if (activeWorkspaceId === id) {
      const remaining = workspaces.filter((w) => w.id !== id)
      const fromHistory = popWorkspaceHistory(remaining)
      if (fromHistory) {
        newActive = fromHistory
      } else {
        const liveWs = workspaces.find((w) => w.id !== id && !w.dormant)
        newActive = liveWs?.id ?? null
      }
    }

    set({
      workspaces: workspaces.map((w) => w.id === id ? updated : w),
      activeWorkspaceId: newActive
    })
    get().persistPinned()
  },

  wakeWorkspace: (id) => {
    const { workspaces, panes } = get()
    const ws = workspaces.find((w) => w.id === id)
    if (!ws || !ws.dormant) return

    const paneIds = allPaneIds(ws.grid)
    for (const pid of paneIds) {
      const pane = panes.get(pid)
      if (!pane) continue
      if (pane.type === 'terminal') {
        const tp = pane as TerminalPaneInfo
        const savedScrollback = dormantScrollback.get(pid)
        createTerminal(pid, tp.cwd || undefined, savedScrollback)
        dormantScrollback.delete(pid)
      }
    }

    set({
      workspaces: workspaces.map((w) => w.id === id ? { ...w, dormant: false } : w)
    })
  },

  loadPinnedWorkspaces: (entries) => {
    if (!entries.length) return
    const { workspaces, panes } = get()
    const newPanes = new Map(panes)
    const pinnedWorkspaces: Workspace[] = []

    for (const entry of entries) {
      const idMap = new Map<string, string>()
      for (const sp of entry.panes) {
        const newId = genPaneId()
        idMap.set(sp.id, newId)
      }

      // Remap IDs in grid
      function remapGrid(grid: GridLayout): GridLayout {
        return {
          columns: grid.columns.map((col) => ({
            ...col,
            rows: col.rows.map((row) => ({
              ...row,
              paneId: idMap.get(row.paneId) || row.paneId
            }))
          }))
        }
      }

      const grid = remapGrid(entry.grid as GridLayout)
      const activePaneId = idMap.get(entry.activePaneId) || allPaneIds(grid)[0]

      for (const sp of entry.panes) {
        const newId = idMap.get(sp.id)!
        if (sp.type === 'terminal') {
          newPanes.set(newId, { type: 'terminal', id: newId, title: sp.title || 'shell', cwd: sp.cwd || '' })
          if (sp.scrollback) dormantScrollback.set(newId, sp.scrollback)
        } else {
          newPanes.set(newId, {
            type: 'browser', id: newId, title: sp.title || '', url: sp.url || '',
            canGoBack: false, canGoForward: false, isLoading: false, faviconUrl: sp.faviconUrl
          })
        }
      }

      const wsId = genWorkspaceId()
      pinnedWorkspaces.push({
        id: wsId,
        name: entry.name,
        color: entry.color,
        grid,
        activePaneId,
        pinned: true,
        dormant: true
      })
    }

    set({
      workspaces: [...pinnedWorkspaces, ...workspaces],
      panes: newPanes
    })
  },

  serializePinnedWorkspaces: () => {
    const { workspaces, panes } = get()
    return workspaces.filter((w) => w.pinned).map((ws) => {
      const paneIds = allPaneIds(ws.grid)
      const serializedPanes: SerializedPane[] = paneIds.map((pid) => {
        const pane = panes.get(pid)
        if (!pane) return { type: 'terminal' as const, id: pid, title: 'shell' }
        if (pane.type === 'terminal') {
          const tp = pane as TerminalPaneInfo
          // Live terminal: capture from xterm. Dormant: use side-channel.
          const scrollback = ws.dormant ? dormantScrollback.get(pid) : (serializeTerminal(pid) ?? undefined)
          return { type: 'terminal' as const, id: pane.id, title: pane.title, cwd: tp.cwd, scrollback }
        }
        const bp = pane as BrowserPaneInfo
        return { type: 'browser' as const, id: pane.id, title: pane.title, url: bp.url, faviconUrl: bp.faviconUrl }
      })
      return {
        name: ws.name,
        color: ws.color,
        grid: ws.grid,
        activePaneId: ws.activePaneId,
        panes: serializedPanes
      }
    })
  },

  persistPinned: () => {
    if (typeof window === 'undefined' || !window.arcnext?.pinnedWorkspaces) return
    if (_persistTimer) clearTimeout(_persistTimer)
    _persistTimer = setTimeout(() => {
      const data = usePaneStore.getState().serializePinnedWorkspaces()
      window.arcnext.pinnedWorkspaces.save(data)
    }, 2000)
  },

  pickerOpen: false,
  openPicker: () => {
    window.arcnext.browser.focusRenderer()
    set({ pickerOpen: true })
    get().setOverlay('picker', true)
  },
  closePicker: () => {
    set({ pickerOpen: false })
    get().setOverlay('picker', false)
  },
  togglePicker: () => {
    const { pickerOpen } = get()
    if (pickerOpen) {
      get().closePicker()
    } else {
      get().openPicker()
    }
  },

  focusState: 'terminal',
  setFocusState: (state) => set({ focusState: state }),

  activeOverlays: new Set<string>(),
  setOverlay: (id, active) => set((s) => {
    if (active === s.activeOverlays.has(id)) return s
    const next = new Set(s.activeOverlays)
    active ? next.add(id) : next.delete(id)
    return { activeOverlays: next }
  }),

  sidebarGrouped: (() => {
    try { return localStorage.getItem('arcnext:sidebarGrouped') === '1' } catch { return false }
  })(),
  setSidebarGrouped: (grouped) => {
    set({ sidebarGrouped: grouped })
    try { localStorage.setItem('arcnext:sidebarGrouped', grouped ? '1' : '0') } catch {}
  },

  agentStates: new Map<string, AgentState>(),
  setAgentState: (paneId, state) => {
    const { agentStates } = get()
    const newStates = new Map(agentStates)
    if (state) {
      const existing = agentStates.get(paneId)
      if (existing && existing.agent === state.agent && existing.status === state.status) return
      newStates.set(paneId, state)
    } else {
      if (!agentStates.has(paneId)) return
      newStates.delete(paneId)
    }
    set({ agentStates: newStates })
  },

  bridgeStates: new Map<string, BridgeState>(),
  setBridgeHolds: (paneId, holds) => {
    const { bridgeStates } = get()
    const existing = bridgeStates.get(paneId)
    if (!holds && !existing) return
    const next = new Map(bridgeStates)
    if (!holds && !existing?.acting) {
      next.delete(paneId)
    } else {
      next.set(paneId, { holds, acting: existing?.acting ?? false })
    }
    set({ bridgeStates: next })
  },
  pulseBridgeActing: (paneId) => {
    const { bridgeStates } = get()
    const existing = bridgeStates.get(paneId)
    const next = new Map(bridgeStates)
    next.set(paneId, { holds: existing?.holds ?? false, acting: true })
    set({ bridgeStates: next })
    setTimeout(() => {
      const { bridgeStates: current } = get()
      const s = current.get(paneId)
      if (!s) return
      const after = new Map(current)
      if (s.holds) after.set(paneId, { holds: true, acting: false })
      else after.delete(paneId)
      set({ bridgeStates: after })
    }, 1500)
  },

  dictationStates: new Map<string, DictationState>(),
  setDictationState: (paneId, state) => {
    const { dictationStates } = get()
    const newStates = new Map(dictationStates)
    if (state) {
      newStates.set(paneId, state)
    } else {
      if (!dictationStates.has(paneId)) return
      newStates.delete(paneId)
    }
    set({ dictationStates: newStates })
  },

  audioStates: new Map<string, { playing: boolean; muted: boolean }>(),
  setAudioState: (paneId, playing, muted) => {
    const { audioStates } = get()
    const newStates = new Map(audioStates)
    if (playing || muted) {
      const existing = audioStates.get(paneId)
      if (existing && existing.playing === playing && existing.muted === muted) return
      newStates.set(paneId, { playing, muted })
    } else {
      if (!audioStates.has(paneId)) return
      newStates.delete(paneId)
    }
    set({ audioStates: newStates })
  },

  pipPaneId: null,
  pipEnabled: (() => {
    try { return localStorage.getItem('arcnext:pipEnabled') !== '0' } catch { return true }
  })(),
  setPipEnabled: (enabled) => {
    set({ pipEnabled: enabled })
    try { localStorage.setItem('arcnext:pipEnabled', enabled ? '1' : '0') } catch {}
  },
  clearPip: () => {
    const { pipPaneId } = get()
    if (!pipPaneId) return
    window.arcnext.browser.exitPip(pipPaneId)
    set({ pipPaneId: null })
  },
  dismissPip: () => {
    const { pipPaneId } = get()
    if (!pipPaneId) return
    window.arcnext.browser.dismissPip(pipPaneId)
    set({ pipPaneId: null })
  }
}))

/** Flush any pending debounced persistPinned call immediately via sync IPC (for beforeunload). */
export function flushPersistPinned(): void {
  if (_persistTimer) {
    clearTimeout(_persistTimer)
    _persistTimer = null
  }
  if (typeof window !== 'undefined' && window.arcnext?.pinnedWorkspaces?.saveSync) {
    const data = usePaneStore.getState().serializePinnedWorkspaces()
    window.arcnext.pinnedWorkspaces.saveSync(data)
  }
}

// Auto-sync focusState when the active pane changes through any action
let _prevWsId = ''
let _prevPaneId = ''
usePaneStore.subscribe((state) => {
  const ws = state.activeWorkspaceId ? state.workspaces.find((w) => w.id === state.activeWorkspaceId) : undefined
  const wsId = state.activeWorkspaceId ?? ''
  const paneId = ws?.activePaneId ?? ''
  if (wsId === _prevWsId && paneId === _prevPaneId) return
  _prevWsId = wsId
  _prevPaneId = paneId
  if (!ws) return
  const pane = state.panes.get(paneId)
  const expected: 'terminal' | 'browser' = pane?.type === 'browser' ? 'browser' : 'terminal'
  if (state.focusState !== expected) {
    usePaneStore.setState({ focusState: expected })
  }
})
