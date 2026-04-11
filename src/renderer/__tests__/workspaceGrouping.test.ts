import { describe, expect, it } from 'vitest'

import { createGrid } from '../model/gridLayout'
import { getVisualWorkspaceOrder, groupUnpinnedWorkspaces } from '../model/workspaceGrouping'
import type { PaneInfo } from '../../shared/types'

function terminalPane(id: string, cwd: string): PaneInfo {
  return { type: 'terminal', id, title: 'shell', cwd }
}

function browserPane(id: string, title = 'Example'): PaneInfo {
  return {
    type: 'browser',
    id,
    title,
    url: `https://${id}.example.com`,
    canGoBack: false,
    canGoForward: false,
    isLoading: false
  }
}

describe('workspaceGrouping', () => {
  it('sorts unpinned groups alphabetically by group label', () => {
    const workspaces = [
      { id: 'ws-web', grid: createGrid('pane-web') },
      { id: 'ws-other', grid: createGrid('pane-other') },
      { id: 'ws-ai', grid: createGrid('pane-ai') }
    ]

    const panes = new Map<string, PaneInfo>([
      ['pane-web', browserPane('pane-web')],
      ['pane-other', terminalPane('pane-other', '')],
      ['pane-ai', terminalPane('pane-ai', '/Users/me/dev/ai-workspace')]
    ])

    const groups = groupUnpinnedWorkspaces(workspaces, panes)

    expect(groups.map((group) => group.label)).toEqual(['ai-workspace', 'Other', 'WEB'])
    expect(groups.flatMap((group) => group.workspaces.map((ws) => ws.id))).toEqual(['ws-ai', 'ws-other', 'ws-web'])
  })

  it('keeps pinned workspaces first, then uses alphabetical group order for the rest', () => {
    const workspaces = [
      { id: 'ws-web', grid: createGrid('pane-web') },
      { id: 'ws-pinned', grid: createGrid('pane-pinned'), pinned: true },
      { id: 'ws-ai', grid: createGrid('pane-ai') }
    ]

    const panes = new Map<string, PaneInfo>([
      ['pane-web', browserPane('pane-web')],
      ['pane-pinned', terminalPane('pane-pinned', '/Users/me/dev/zebra')],
      ['pane-ai', terminalPane('pane-ai', '/Users/me/dev/ai-workspace')]
    ])

    const ordered = getVisualWorkspaceOrder(workspaces, panes)

    expect(ordered.map((ws) => ws.id)).toEqual(['ws-pinned', 'ws-ai', 'ws-web'])
  })
})
