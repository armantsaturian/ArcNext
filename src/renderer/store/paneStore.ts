import { create } from 'zustand'
import {
  SplitNode, leaf, split, splitNode, removeNode, allPaneIds, adjacentPaneId, Direction,
  navigateDirection, NavDirection
} from '../model/splitTree'
import { createTerminal, destroyTerminal } from '../model/terminalManager'

let nextPaneId = 1
let nextWorkspaceId = 1

function genPaneId(): string {
  return `pane-${nextPaneId++}`
}

function genWorkspaceId(): string {
  return `ws-${nextWorkspaceId++}`
}

export interface PaneInfo {
  id: string
  title: string
  cwd: string
}

export interface Workspace {
  id: string
  name: string
  tree: SplitNode
  activePaneId: string
}

interface PaneStore {
  workspaces: Workspace[]
  activeWorkspaceId: string
  panes: Map<string, PaneInfo>

  // Workspace actions
  addWorkspace: () => void
  removeWorkspace: (id: string) => void
  switchWorkspace: (id: string) => void
  mergeWorkspaces: (targetId: string, sourceId: string, direction: Direction) => void
  separateWorkspace: (workspaceId: string) => void

  // Pane actions (on active workspace)
  splitActive: (direction: Direction) => void
  closePane: (id: string) => void
  setActivePaneInWorkspace: (paneId: string) => void
  focusNext: () => void
  focusPrev: () => void
  navigateDir: (dir: NavDirection) => void
  setPaneTitle: (id: string, title: string) => void
  setTree: (tree: SplitNode) => void
}

function makePane(): PaneInfo {
  const id = genPaneId()
  createTerminal(id)
  return { id, title: 'shell', cwd: '' }
}

function makeWorkspace(name?: string): { workspace: Workspace; pane: PaneInfo } {
  const pane = makePane()
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

    // Destroy all panes in this workspace
    const paneIds = allPaneIds(ws.tree)
    const newPanes = new Map(panes)
    for (const pid of paneIds) {
      destroyTerminal(pid)
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

  splitActive: (direction) => {
    const { workspaces, activeWorkspaceId, panes } = get()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    if (!ws) return

    const newPane = makePane()
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

    destroyTerminal(id)

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
    const { workspaces, activeWorkspaceId } = get()
    set({
      workspaces: workspaces.map((w) =>
        w.id === activeWorkspaceId ? { ...w, activePaneId: paneId } : w
      )
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

  setTree: (tree) => {
    const { workspaces, activeWorkspaceId } = get()
    set({
      workspaces: workspaces.map((w) =>
        w.id === activeWorkspaceId ? { ...w, tree } : w
      )
    })
  }
}))

/** Helper: get the active workspace from the store */
export function useActiveWorkspace(): Workspace | undefined {
  return usePaneStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId))
}
