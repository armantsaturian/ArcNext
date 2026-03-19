import { create } from 'zustand'
import {
  SplitNode, leaf, split, splitNode, removeNode, allPaneIds, adjacentPaneId, Direction,
  navigateDirection, NavDirection
} from '../model/splitTree'
import { createTerminal, destroyTerminal } from '../model/terminalManager'
import { destroyBrowserView, undockBrowserView } from '../model/browserManager'
import type { PaneInfo, TerminalPaneInfo, BrowserPaneInfo } from '../../shared/types'

let nextPaneId = 1
let nextWorkspaceId = 1

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
  tree: SplitNode
  activePaneId: string
  color?: string
}

interface BrowserPaneOptions {
  paneId?: string
  title?: string
  isLoading?: boolean
}

interface PaneStore {
  workspaces: Workspace[]
  activeWorkspaceId: string
  panes: Map<string, PaneInfo>

  // Sidebar UI
  sidebarWidth: number
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void

  // Workspace actions
  addWorkspace: () => void
  removeWorkspace: (id: string) => void
  switchWorkspace: (id: string) => void
  mergeWorkspaces: (targetId: string, sourceId: string, direction: Direction) => void
  separateWorkspace: (workspaceId: string) => void
  setWorkspaceColor: (id: string, color: string | undefined) => void
  setWorkspaceName: (id: string, name: string) => void

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
  setTree: (tree: SplitNode) => void

  // Browser pane actions
  addBrowserWorkspace: (url: string, options?: BrowserPaneOptions) => void
  splitActiveBrowser: (direction: Direction, url: string) => void
  setBrowserPaneUrl: (id: string, url: string) => void
  setBrowserPaneNavState: (id: string, canGoBack: boolean, canGoForward: boolean) => void
  setBrowserPaneLoading: (id: string, isLoading: boolean) => void

  // Dock/undock
  undockBrowserPane: (paneId: string) => void
  removeUndockedBrowserPane: (paneId: string) => void

  // Focus state
  focusState: 'terminal' | 'browser' | 'ui'
  setFocusState: (state: 'terminal' | 'browser' | 'ui') => void

  // Overlay state (hides native browser views so DOM modals are visible)
  activeOverlays: Set<string>
  setOverlay: (id: string, active: boolean) => void
}

function makeTerminalPane(): TerminalPaneInfo {
  const id = genPaneId()
  createTerminal(id)
  return { type: 'terminal', id, title: 'shell', cwd: '' }
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
    isLoading: options.isLoading ?? true
  }
}

function destroyPane(pane: PaneInfo): void {
  if (pane.type === 'terminal') {
    destroyTerminal(pane.id)
  } else if (pane.type === 'browser') {
    destroyBrowserView(pane.id)
  }
}

function makeWorkspace(name?: string): { workspace: Workspace; pane: PaneInfo } {
  const pane = makeTerminalPane()
  const id = genWorkspaceId()
  return {
    workspace: {
      id,
      name: name || `Workspace ${id.split('-')[1]}`,
      tree: leaf(pane.id),
      activePaneId: pane.id
    },
    pane
  }
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

  addWorkspace: () => {
    const { workspaces, panes } = get()
    const { workspace, pane } = makeWorkspace()
    const newPanes = new Map(panes)
    newPanes.set(pane.id, pane)
    set({
      workspaces: [...workspaces, workspace],
      activeWorkspaceId: workspace.id,
      panes: newPanes
    })
  },

  removeWorkspace: (id) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    if (workspaces.length <= 1) return

    const ws = workspaces.find((w) => w.id === id)
    if (!ws) return

    // Destroy all panes in this workspace (type-aware cleanup)
    const paneIds = allPaneIds(ws.tree)
    const newPanes = new Map(panes)
    for (const pid of paneIds) {
      const pane = panes.get(pid)
      if (pane) destroyPane(pane)
      newPanes.delete(pid)
    }

    const remaining = workspaces.filter((w) => w.id !== id)
    const newActive = id === activeWorkspaceId
      ? remaining[Math.max(0, workspaces.findIndex((w) => w.id === id) - 1)].id
      : activeWorkspaceId

    set({ workspaces: remaining, activeWorkspaceId: newActive, panes: newPanes })
  },

  switchWorkspace: (id) => set({ activeWorkspaceId: id }),

  mergeWorkspaces: (targetId, sourceId, direction) => {
    if (targetId === sourceId) return
    const { workspaces } = get()
    const targetWs = workspaces.find((w) => w.id === targetId)
    const sourceWs = workspaces.find((w) => w.id === sourceId)
    if (!targetWs || !sourceWs) return

    const mergedTree = split(direction, targetWs.tree, sourceWs.tree, 0.5)
    const updatedTarget: Workspace = {
      ...targetWs,
      tree: mergedTree
    }

    set({
      workspaces: workspaces
        .map((w) => (w.id === targetId ? updatedTarget : w))
        .filter((w) => w.id !== sourceId),
      activeWorkspaceId: targetId
    })
  },

  setWorkspaceColor: (id, color) => {
    const { workspaces } = get()
    set({
      workspaces: workspaces.map((w) => w.id === id ? { ...w, color } : w)
    })
  },

  setWorkspaceName: (id, name) => {
    const { workspaces } = get()
    set({
      workspaces: workspaces.map((w) => w.id === id ? { ...w, name } : w)
    })
  },

  separateWorkspace: (workspaceId) => {
    const { workspaces } = get()
    const ws = workspaces.find((w) => w.id === workspaceId)
    if (!ws || ws.tree.type !== 'split') return

    const firstTree = ws.tree.first
    const secondTree = ws.tree.second

    const firstPaneIds = allPaneIds(firstTree)
    const updatedSource: Workspace = {
      ...ws,
      tree: firstTree,
      activePaneId: firstPaneIds[0]
    }

    const newWsId = genWorkspaceId()
    const secondPaneIds = allPaneIds(secondTree)
    const newWorkspace: Workspace = {
      id: newWsId,
      name: `Workspace ${newWsId.split('-')[1]}`,
      tree: secondTree,
      activePaneId: secondPaneIds[0]
    }

    const wsIndex = workspaces.findIndex((w) => w.id === workspaceId)
    const newWorkspaces = [...workspaces]
    newWorkspaces[wsIndex] = updatedSource
    newWorkspaces.splice(wsIndex + 1, 0, newWorkspace)

    set({
      workspaces: newWorkspaces,
      activeWorkspaceId: workspaceId
    })
  },

  closePaneInWorkspace: (workspaceId, paneId) => {
    const { workspaces, panes } = get()
    const ws = workspaces.find((w) => w.id === workspaceId)
    if (!ws) return

    const ids = allPaneIds(ws.tree)
    if (ids.length <= 1) {
      get().removeWorkspace(workspaceId)
      return
    }

    const newTree = removeNode(ws.tree, paneId)
    if (!newTree) return

    const pane = panes.get(paneId)
    if (pane) destroyPane(pane)

    const newPanes = new Map(panes)
    newPanes.delete(paneId)

    const newActivePaneId = paneId === ws.activePaneId
      ? adjacentPaneId(ws.tree, paneId, -1)
      : ws.activePaneId

    const updatedWs: Workspace = {
      ...ws,
      tree: newTree,
      activePaneId: newActivePaneId
    }

    set({
      workspaces: workspaces.map((w) => w.id === workspaceId ? updatedWs : w),
      panes: newPanes
    })
  },

  splitActive: (direction) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return

    const newPane = makeTerminalPane()
    const newPanes = new Map(panes)
    newPanes.set(newPane.id, newPane)

    const updatedWs: Workspace = {
      ...ws,
      tree: splitNode(ws.tree, ws.activePaneId, direction, newPane.id),
      activePaneId: newPane.id
    }

    set({
      workspaces: workspaces.map((w) => w.id === activeWorkspaceId ? updatedWs : w),
      panes: newPanes
    })
  },

  closePane: (id) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return

    const ids = allPaneIds(ws.tree)
    if (ids.length <= 1) {
      get().removeWorkspace(activeWorkspaceId)
      return
    }

    const newTree = removeNode(ws.tree, id)
    if (!newTree) return

    const pane = panes.get(id)
    if (pane) destroyPane(pane)

    const newPanes = new Map(panes)
    newPanes.delete(id)

    const newActivePaneId = id === ws.activePaneId
      ? adjacentPaneId(ws.tree, id, -1)
      : ws.activePaneId

    const updatedWs: Workspace = {
      ...ws,
      tree: newTree,
      activePaneId: newActivePaneId
    }

    set({
      workspaces: workspaces.map((w) => w.id === activeWorkspaceId ? updatedWs : w),
      panes: newPanes
    })
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
    const next = adjacentPaneId(ws.tree, ws.activePaneId, 1)
    get().setActivePaneInWorkspace(next)
  },

  focusPrev: () => {
    const { workspaces, activeWorkspaceId } = get()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return
    const prev = adjacentPaneId(ws.tree, ws.activePaneId, -1)
    get().setActivePaneInWorkspace(prev)
  },

  navigateDir: (dir) => {
    const { workspaces, activeWorkspaceId } = get()
    const wsIdx = workspaces.findIndex((w) => w.id === activeWorkspaceId)
    const ws = workspaces[wsIdx]
    if (!ws) return

    // Try navigating within the current workspace's split tree
    const target = navigateDirection(ws.tree, ws.activePaneId, dir)
    if (target) {
      get().setActivePaneInWorkspace(target)
      return
    }

    // At the boundary — cross to adjacent workspace on left/right
    if (dir === 'left' || dir === 'up') {
      const prevIdx = wsIdx - 1
      if (prevIdx >= 0) {
        const prevWs = workspaces[prevIdx]
        set({ activeWorkspaceId: prevWs.id })
      }
    } else {
      const nextIdx = wsIdx + 1
      if (nextIdx < workspaces.length) {
        const nextWs = workspaces[nextIdx]
        set({ activeWorkspaceId: nextWs.id })
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
    const { panes } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'terminal') return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, cwd })
    set({ panes: newPanes })
  },

  setTree: (tree) => {
    const { workspaces, activeWorkspaceId } = get()
    set({
      workspaces: workspaces.map((w) =>
        w.id === activeWorkspaceId ? { ...w, tree } : w
      )
    })
  },

  addBrowserWorkspace: (url, options = {}) => {
    const { workspaces, panes } = get()
    const pane = makeBrowserPane(url, options)
    const id = genWorkspaceId()
    const workspace: Workspace = {
      id,
      name: `Workspace ${id.split('-')[1]}`,
      tree: leaf(pane.id),
      activePaneId: pane.id
    }
    const newPanes = new Map(panes)
    newPanes.set(pane.id, pane)
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

    const updatedWs: Workspace = {
      ...ws,
      tree: splitNode(ws.tree, ws.activePaneId, direction, newPane.id),
      activePaneId: newPane.id
    }

    set({
      workspaces: workspaces.map((w) => w.id === activeWorkspaceId ? updatedWs : w),
      panes: newPanes
    })
  },

  setBrowserPaneUrl: (id, url) => {
    const { panes } = get()
    const pane = panes.get(id)
    if (!pane || pane.type !== 'browser') return
    const newPanes = new Map(panes)
    newPanes.set(id, { ...pane, url })
    set({ panes: newPanes })
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

  undockBrowserPane: (paneId) => {
    void undockBrowserView(paneId).catch(() => {})
  },

  removeUndockedBrowserPane: (paneId) => {
    const { workspaces, activeWorkspaceId, panes } = get()

    const wsIndex = workspaces.findIndex((w) => allPaneIds(w.tree).includes(paneId))
    if (wsIndex === -1) return

    const ws = workspaces[wsIndex]
    const ids = allPaneIds(ws.tree)
    const newPanes = new Map(panes)
    newPanes.delete(paneId)

    if (ids.length <= 1) {
      if (workspaces.length <= 1) {
        const replacement = makeWorkspace()
        newPanes.set(replacement.pane.id, replacement.pane)
        set({
          workspaces: [replacement.workspace],
          activeWorkspaceId: replacement.workspace.id,
          panes: newPanes
        })
        return
      }

      const remaining = workspaces.filter((w) => w.id !== ws.id)
      const newActive = ws.id === activeWorkspaceId
        ? remaining[Math.max(0, wsIndex - 1)].id
        : activeWorkspaceId

      set({ workspaces: remaining, activeWorkspaceId: newActive, panes: newPanes })
      return
    }

    const newTree = removeNode(ws.tree, paneId)
    if (!newTree) return

    const newActivePaneId = paneId === ws.activePaneId
      ? adjacentPaneId(ws.tree, paneId, -1)
      : ws.activePaneId

    const updatedWs: Workspace = {
      ...ws,
      tree: newTree,
      activePaneId: newActivePaneId
    }

    set({
      workspaces: workspaces.map((w) => w.id === ws.id ? updatedWs : w),
      panes: newPanes
    })
  },

  focusState: 'terminal',
  setFocusState: (state) => set({ focusState: state }),

  activeOverlays: new Set<string>(),
  setOverlay: (id, active) => set((s) => {
    if (active === s.activeOverlays.has(id)) return s
    const next = new Set(s.activeOverlays)
    active ? next.add(id) : next.delete(id)
    return { activeOverlays: next }
  })
}))

// Auto-sync focusState when the active pane changes through any action
let _prevWsId = ''
let _prevPaneId = ''
usePaneStore.subscribe((state) => {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
  const wsId = state.activeWorkspaceId
  const paneId = ws?.activePaneId ?? ''
  if (wsId === _prevWsId && paneId === _prevPaneId) return
  _prevWsId = wsId
  _prevPaneId = paneId
  const pane = ws ? state.panes.get(paneId) : null
  const expected: 'terminal' | 'browser' = pane?.type === 'browser' ? 'browser' : 'terminal'
  if (state.focusState !== expected) {
    usePaneStore.setState({ focusState: expected })
  }
})

/** Helper: get the active workspace from the store */
export function useActiveWorkspace(): Workspace | undefined {
  return usePaneStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId))
}
