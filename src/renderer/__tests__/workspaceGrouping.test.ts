import { describe, expect, it } from 'vitest'

import { createGrid } from '../model/gridLayout'
import { getVisualWorkspaceOrder, groupUnpinnedWorkspaces } from '../model/workspaceGrouping'
import { browserGroupForUrl, browserGroupKeyForUrl } from '../model/browserGrouping'
import type { PaneInfo } from '../../shared/types'

function terminalPane(id: string, cwd: string): PaneInfo {
  return { type: 'terminal', id, title: 'shell', cwd }
}

function browserPane(id: string, title = 'Example', url = `https://${id}.example.com`): PaneInfo {
  return {
    type: 'browser',
    id,
    title,
    url,
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
      ['pane-web', browserPane('pane-web', 'GitHub', 'https://github.com/armantsaturian/arcnext')],
      ['pane-other', terminalPane('pane-other', '')],
      ['pane-ai', terminalPane('pane-ai', '/Users/me/dev/ai-workspace')]
    ])

    const groups = groupUnpinnedWorkspaces(workspaces, panes)

    expect(groups.map((group) => group.label)).toEqual(['ai-workspace', 'GitHub', 'Other'])
    expect(groups.flatMap((group) => group.workspaces.map((ws) => ws.id))).toEqual(['ws-ai', 'ws-web', 'ws-other'])
  })

  it('keeps pinned workspaces first, then uses alphabetical group order for the rest', () => {
    const workspaces = [
      { id: 'ws-web', grid: createGrid('pane-web') },
      { id: 'ws-pinned', grid: createGrid('pane-pinned'), pinned: true },
      { id: 'ws-ai', grid: createGrid('pane-ai') }
    ]

    const panes = new Map<string, PaneInfo>([
      ['pane-web', browserPane('pane-web', 'GitHub', 'https://github.com/armantsaturian/arcnext')],
      ['pane-pinned', terminalPane('pane-pinned', '/Users/me/dev/zebra')],
      ['pane-ai', terminalPane('pane-ai', '/Users/me/dev/ai-workspace')]
    ])

    const ordered = getVisualWorkspaceOrder(workspaces, panes)

    expect(ordered.map((ws) => ws.id)).toEqual(['ws-pinned', 'ws-ai', 'ws-web'])
  })

  it('separates browser groups by app instead of putting all web pages under WEB', () => {
    const workspaces = [
      { id: 'ws-gmail', grid: createGrid('pane-gmail') },
      { id: 'ws-docs', grid: createGrid('pane-docs') },
      { id: 'ws-sheets', grid: createGrid('pane-sheets') }
    ]

    const panes = new Map<string, PaneInfo>([
      ['pane-gmail', browserPane('pane-gmail', 'Gmail', 'https://mail.google.com/mail/u/0/#inbox')],
      ['pane-docs', browserPane('pane-docs', 'Doc', 'https://docs.google.com/document/d/abc/edit')],
      ['pane-sheets', browserPane('pane-sheets', 'Sheet', 'https://docs.google.com/spreadsheets/d/abc/edit')]
    ])

    const groups = groupUnpinnedWorkspaces(workspaces, panes)

    expect(groups.map((group) => group.label)).toEqual(['Gmail', 'Google Docs', 'Google Sheets'])
  })

  it('uses the workspace browser group key so browser groups do not jump after navigation', () => {
    const workspaces = [
      {
        id: 'ws-browser',
        grid: createGrid('pane-browser'),
        browserGroupKey: browserGroupKeyForUrl('https://mail.google.com/mail/u/0/#inbox')
      }
    ]

    const panes = new Map<string, PaneInfo>([
      ['pane-browser', browserPane('pane-browser', 'Doc', 'https://docs.google.com/document/d/abc/edit')]
    ])

    const groups = groupUnpinnedWorkspaces(workspaces, panes)

    expect(groups.map((group) => group.label)).toEqual(['Gmail'])
  })

  it('groups unknown browser pages by clean domain', () => {
    expect(browserGroupForUrl('https://www.openai.com/research').label).toBe('openai.com')
  })

  it('falls back to WEB for browser URLs without a host', () => {
    expect(browserGroupForUrl('about:blank').label).toBe('WEB')
  })
})
