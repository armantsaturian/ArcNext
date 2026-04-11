import { GridLayout, allPaneIds } from './gridLayout'
import type { PaneInfo, TerminalPaneInfo } from '../../shared/types'

/** Minimal workspace shape needed by grouping logic. */
export interface GroupableWorkspace {
  id: string
  grid: GridLayout
  pinned?: boolean
  dormant?: boolean
}

export interface WorkspaceGroup<T extends GroupableWorkspace = GroupableWorkspace> {
  key: string
  label: string
  workspaces: T[]
}

export function cwdBasename(cwd: string): string | undefined {
  return cwd.split('/').filter(Boolean).pop()
}

export function computeGroupKey(paneInfos: PaneInfo[]): string {
  const hasTerminal = paneInfos.some((p) => p.type === 'terminal')
  const hasBrowser = paneInfos.some((p) => p.type === 'browser')

  if (hasBrowser && !hasTerminal) return 'browsers'

  const termPane = paneInfos.find((p) => p.type === 'terminal') as TerminalPaneInfo | undefined
  if (termPane?.cwd) {
    const basename = cwdBasename(termPane.cwd)
    if (basename) return `cwd:${basename}`
  }

  return 'other'
}

export function groupLabel(key: string): string {
  if (key === 'browsers') return 'WEB'
  if (key === 'other') return 'Other'
  if (key.startsWith('cwd:')) return key.slice(4)
  return key
}

export function groupUnpinnedWorkspaces<T extends GroupableWorkspace>(
  workspaces: T[],
  panes: Map<string, PaneInfo>
): WorkspaceGroup<T>[] {
  const groups = new Map<string, T[]>()

  for (const ws of workspaces) {
    const paneIds = allPaneIds(ws.grid)
    const paneInfos = paneIds.map((id) => panes.get(id)).filter(Boolean) as PaneInfo[]
    const key = computeGroupKey(paneInfos)

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(ws)
  }

  return [...groups.keys()].sort((a, b) => {
    const labelA = groupLabel(a)
    const labelB = groupLabel(b)
    const byLabel = labelA.localeCompare(labelB, undefined, { sensitivity: 'base' })
    return byLabel || a.localeCompare(b, undefined, { sensitivity: 'base' })
  }).map((key) => ({
    key,
    label: groupLabel(key),
    workspaces: groups.get(key)!
  }))
}

/** Returns workspaces in sidebar visual order: pinned first, then grouped unpinned flattened. */
export function getVisualWorkspaceOrder<T extends GroupableWorkspace>(
  workspaces: T[],
  panes: Map<string, PaneInfo>
): T[] {
  const pinned = workspaces.filter((w) => w.pinned)
  const unpinned = workspaces.filter((w) => !w.pinned)
  const groups = groupUnpinnedWorkspaces(unpinned, panes)
  const flatGrouped = groups.flatMap((g) => g.workspaces)
  return [...pinned, ...flatGrouped]
}
