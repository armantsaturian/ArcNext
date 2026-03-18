import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock terminalManager and browserManager before importing the store
vi.mock('../model/terminalManager', () => ({
  createTerminal: vi.fn(),
  destroyTerminal: vi.fn()
}))
vi.mock('../model/browserManager', () => ({
  destroyBrowserView: vi.fn()
}))

import { createTerminal, destroyTerminal } from '../model/terminalManager'
import { destroyBrowserView } from '../model/browserManager'
import { usePaneStore } from '../store/paneStore'
import type { PaneInfo, TerminalPaneInfo, BrowserPaneInfo } from '../../shared/types'
import { allPaneIds } from '../model/splitTree'

function resetStore() {
  // Reset zustand store to initial state
  usePaneStore.setState({
    workspaces: [],
    activeWorkspaceId: '',
    panes: new Map()
  })
  vi.clearAllMocks()
  // Create a fresh workspace via addWorkspace
  usePaneStore.getState().addWorkspace()
}

describe('PaneInfo discriminated union', () => {
  it('TerminalPaneInfo has type terminal', () => {
    const pane: TerminalPaneInfo = { type: 'terminal', id: 'p-1', title: 'shell', cwd: '/home' }
    expect(pane.type).toBe('terminal')
    expect(pane.cwd).toBe('/home')
  })

  it('BrowserPaneInfo has type browser', () => {
    const pane: BrowserPaneInfo = {
      type: 'browser', id: 'p-2', title: 'Google',
      url: 'https://google.com', canGoBack: false, canGoForward: false, isLoading: false
    }
    expect(pane.type).toBe('browser')
    expect(pane.url).toBe('https://google.com')
  })

  it('PaneInfo union narrows correctly', () => {
    const pane: PaneInfo = { type: 'terminal', id: 'p-1', title: 'shell', cwd: '' }
    if (pane.type === 'terminal') {
      // TypeScript should allow cwd access here
      expect(pane.cwd).toBe('')
    }
    if (pane.type === 'browser') {
      // This block shouldn't run but verifies narrowing compiles
      expect(pane.url).toBeDefined()
    }
  })
})

describe('paneStore — terminal pane basics', () => {
  beforeEach(resetStore)

  it('initial workspace has a terminal pane', () => {
    const { workspaces, panes } = usePaneStore.getState()
    expect(workspaces).toHaveLength(1)
    const ws = workspaces[0]
    const paneId = ws.activePaneId
    const pane = panes.get(paneId)
    expect(pane).toBeDefined()
    expect(pane!.type).toBe('terminal')
    expect((pane as TerminalPaneInfo).cwd).toBeDefined()
  })

  it('createTerminal is called when making a terminal pane', () => {
    const callCount = (createTerminal as ReturnType<typeof vi.fn>).mock.calls.length
    usePaneStore.getState().addWorkspace()
    expect(createTerminal).toHaveBeenCalledTimes(callCount + 1)
  })

  it('splitActive creates a new terminal pane', () => {
    const { panes: before } = usePaneStore.getState()
    usePaneStore.getState().splitActive('horizontal')
    const { panes: after, workspaces } = usePaneStore.getState()
    expect(after.size).toBe(before.size + 1)
    const ws = workspaces.find(w => w.id === usePaneStore.getState().activeWorkspaceId)!
    const ids = allPaneIds(ws.tree)
    expect(ids).toHaveLength(2)
    for (const id of ids) {
      expect(after.get(id)!.type).toBe('terminal')
    }
  })

  it('closePane on terminal calls destroyTerminal', () => {
    // Split to have 2 panes so closing one doesn't remove the workspace
    usePaneStore.getState().splitActive('horizontal')
    const { workspaces } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === usePaneStore.getState().activeWorkspaceId)!
    const ids = allPaneIds(ws.tree)
    const targetId = ids[0]

    vi.clearAllMocks()
    usePaneStore.getState().closePane(targetId)

    expect(destroyTerminal).toHaveBeenCalledWith(targetId)
    expect(usePaneStore.getState().panes.has(targetId)).toBe(false)
  })

  it('removeWorkspace destroys all terminal panes', () => {
    usePaneStore.getState().splitActive('horizontal')
    // Add a second workspace so we can remove the first
    usePaneStore.getState().addWorkspace()

    const { workspaces } = usePaneStore.getState()
    const firstWs = workspaces[0]
    const paneIds = allPaneIds(firstWs.tree)

    vi.clearAllMocks()
    usePaneStore.getState().removeWorkspace(firstWs.id)

    for (const pid of paneIds) {
      expect(destroyTerminal).toHaveBeenCalledWith(pid)
      expect(usePaneStore.getState().panes.has(pid)).toBe(false)
    }
  })
})

describe('paneStore — browser pane actions', () => {
  beforeEach(resetStore)

  it('addBrowserWorkspace creates a workspace with a browser pane', () => {
    const { workspaces: before } = usePaneStore.getState()
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    const { workspaces, panes, activeWorkspaceId } = usePaneStore.getState()

    expect(workspaces).toHaveLength(before.length + 1)
    const newWs = workspaces[workspaces.length - 1]
    expect(activeWorkspaceId).toBe(newWs.id)

    const pane = panes.get(newWs.activePaneId)!
    expect(pane.type).toBe('browser')
    expect((pane as BrowserPaneInfo).url).toBe('https://example.com')
    expect((pane as BrowserPaneInfo).isLoading).toBe(true)
    expect((pane as BrowserPaneInfo).canGoBack).toBe(false)
    expect((pane as BrowserPaneInfo).canGoForward).toBe(false)
  })

  it('addBrowserWorkspace does NOT call createTerminal', () => {
    vi.clearAllMocks()
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    expect(createTerminal).not.toHaveBeenCalled()
  })

  it('splitActiveBrowser adds a browser pane to the current workspace', () => {
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://github.com')
    const { workspaces, panes, activeWorkspaceId } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === activeWorkspaceId)!
    const ids = allPaneIds(ws.tree)

    expect(ids).toHaveLength(2)
    // Active pane should be the new browser pane
    const browserPane = panes.get(ws.activePaneId)!
    expect(browserPane.type).toBe('browser')
    expect((browserPane as BrowserPaneInfo).url).toBe('https://github.com')

    // The other pane should be the original terminal
    const otherPaneId = ids.find(id => id !== ws.activePaneId)!
    expect(panes.get(otherPaneId)!.type).toBe('terminal')
  })

  it('setBrowserPaneUrl updates url on browser panes only', () => {
    usePaneStore.getState().addBrowserWorkspace('https://old.com')
    const { workspaces } = usePaneStore.getState()
    const browserWs = workspaces[workspaces.length - 1]
    const paneId = browserWs.activePaneId

    usePaneStore.getState().setBrowserPaneUrl(paneId, 'https://new.com')
    const pane = usePaneStore.getState().panes.get(paneId) as BrowserPaneInfo
    expect(pane.url).toBe('https://new.com')
  })

  it('setBrowserPaneUrl is a no-op on terminal panes', () => {
    const { workspaces } = usePaneStore.getState()
    const terminalPaneId = workspaces[0].activePaneId
    const before = usePaneStore.getState().panes.get(terminalPaneId)!

    usePaneStore.getState().setBrowserPaneUrl(terminalPaneId, 'https://hack.com')
    const after = usePaneStore.getState().panes.get(terminalPaneId)!
    expect(after).toEqual(before)
  })

  it('setBrowserPaneNavState updates navigation state', () => {
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    const ws = usePaneStore.getState().workspaces[usePaneStore.getState().workspaces.length - 1]
    const paneId = ws.activePaneId

    usePaneStore.getState().setBrowserPaneNavState(paneId, true, true)
    const pane = usePaneStore.getState().panes.get(paneId) as BrowserPaneInfo
    expect(pane.canGoBack).toBe(true)
    expect(pane.canGoForward).toBe(true)
  })

  it('setBrowserPaneLoading updates loading state', () => {
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    const ws = usePaneStore.getState().workspaces[usePaneStore.getState().workspaces.length - 1]
    const paneId = ws.activePaneId

    usePaneStore.getState().setBrowserPaneLoading(paneId, false)
    const pane = usePaneStore.getState().panes.get(paneId) as BrowserPaneInfo
    expect(pane.isLoading).toBe(false)
  })
})

describe('paneStore — type-aware cleanup', () => {
  beforeEach(resetStore)

  it('closePane on browser pane calls destroyBrowserView, not destroyTerminal', () => {
    // Create a mixed workspace: terminal + browser
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')
    const { workspaces, activeWorkspaceId } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === activeWorkspaceId)!
    // Active pane is the browser pane
    const browserPaneId = ws.activePaneId

    vi.clearAllMocks()
    usePaneStore.getState().closePane(browserPaneId)

    expect(destroyTerminal).not.toHaveBeenCalled()
    expect(destroyBrowserView).toHaveBeenCalledWith(browserPaneId)
    expect(usePaneStore.getState().panes.has(browserPaneId)).toBe(false)
  })

  it('closePaneInWorkspace on browser pane calls destroyBrowserView, not destroyTerminal', () => {
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')
    const { workspaces, activeWorkspaceId } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === activeWorkspaceId)!
    const browserPaneId = ws.activePaneId

    vi.clearAllMocks()
    usePaneStore.getState().closePaneInWorkspace(ws.id, browserPaneId)

    expect(destroyTerminal).not.toHaveBeenCalled()
    expect(destroyBrowserView).toHaveBeenCalledWith(browserPaneId)
    expect(usePaneStore.getState().panes.has(browserPaneId)).toBe(false)
  })

  it('removeWorkspace with mixed panes calls correct destroy for each type', () => {
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')
    // Need another workspace so we can remove this one
    usePaneStore.getState().addWorkspace()

    const { workspaces } = usePaneStore.getState()
    const mixedWs = workspaces[0]
    const ids = allPaneIds(mixedWs.tree)
    const { panes } = usePaneStore.getState()

    const terminalIds = ids.filter(id => panes.get(id)?.type === 'terminal')
    const browserIds = ids.filter(id => panes.get(id)?.type === 'browser')
    expect(terminalIds.length).toBeGreaterThan(0)
    expect(browserIds.length).toBeGreaterThan(0)

    vi.clearAllMocks()
    usePaneStore.getState().removeWorkspace(mixedWs.id)

    for (const tid of terminalIds) {
      expect(destroyTerminal).toHaveBeenCalledWith(tid)
    }
    expect(destroyTerminal).toHaveBeenCalledTimes(terminalIds.length)

    for (const bid of browserIds) {
      expect(destroyBrowserView).toHaveBeenCalledWith(bid)
    }
    expect(destroyBrowserView).toHaveBeenCalledTimes(browserIds.length)
  })
})

describe('paneStore — setPaneTitle preserves type discriminator', () => {
  beforeEach(resetStore)

  it('setPaneTitle on terminal preserves type: terminal', () => {
    const { workspaces } = usePaneStore.getState()
    const paneId = workspaces[0].activePaneId

    usePaneStore.getState().setPaneTitle(paneId, 'new-title')
    const pane = usePaneStore.getState().panes.get(paneId)!
    expect(pane.type).toBe('terminal')
    expect(pane.title).toBe('new-title')
  })

  it('setPaneTitle on browser preserves type: browser and all fields', () => {
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    const ws = usePaneStore.getState().workspaces[usePaneStore.getState().workspaces.length - 1]
    const paneId = ws.activePaneId

    // Set some nav state first
    usePaneStore.getState().setBrowserPaneNavState(paneId, true, false)

    usePaneStore.getState().setPaneTitle(paneId, 'Example Site')
    const pane = usePaneStore.getState().panes.get(paneId) as BrowserPaneInfo
    expect(pane.type).toBe('browser')
    expect(pane.title).toBe('Example Site')
    expect(pane.url).toBe('https://example.com')
    expect(pane.canGoBack).toBe(true)
    expect(pane.canGoForward).toBe(false)
  })
})

describe('paneStore — setPaneCwd only affects terminals', () => {
  beforeEach(resetStore)

  it('setPaneCwd on terminal updates cwd', () => {
    const { workspaces } = usePaneStore.getState()
    const paneId = workspaces[0].activePaneId

    usePaneStore.getState().setPaneCwd(paneId, '/Users/test')
    const pane = usePaneStore.getState().panes.get(paneId) as TerminalPaneInfo
    expect(pane.cwd).toBe('/Users/test')
  })

  it('setPaneCwd on browser pane is a no-op', () => {
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    const ws = usePaneStore.getState().workspaces[usePaneStore.getState().workspaces.length - 1]
    const paneId = ws.activePaneId
    const before = usePaneStore.getState().panes.get(paneId)!

    usePaneStore.getState().setPaneCwd(paneId, '/should/not/set')
    const after = usePaneStore.getState().panes.get(paneId)!
    expect(after).toEqual(before)
  })
})

describe('paneStore — mixed workspace operations', () => {
  beforeEach(resetStore)

  it('mergeWorkspaces works with terminal + browser workspaces', () => {
    // Workspace 0 is terminal, add a browser workspace
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    const { workspaces } = usePaneStore.getState()
    expect(workspaces).toHaveLength(2)

    const terminalWsId = workspaces[0].id
    const browserWsId = workspaces[1].id

    usePaneStore.getState().mergeWorkspaces(terminalWsId, browserWsId, 'horizontal')
    const merged = usePaneStore.getState().workspaces
    expect(merged).toHaveLength(1)

    const ids = allPaneIds(merged[0].tree)
    expect(ids).toHaveLength(2)

    const { panes } = usePaneStore.getState()
    const types = ids.map(id => panes.get(id)!.type)
    expect(types).toContain('terminal')
    expect(types).toContain('browser')
  })

  it('separateWorkspace preserves pane types', () => {
    // Create a mixed workspace
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')

    const { workspaces } = usePaneStore.getState()
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0].tree.type).toBe('split')

    usePaneStore.getState().separateWorkspace(workspaces[0].id)
    const separated = usePaneStore.getState().workspaces
    expect(separated).toHaveLength(2)

    const { panes } = usePaneStore.getState()
    const ws0Pane = panes.get(separated[0].activePaneId)!
    const ws1Pane = panes.get(separated[1].activePaneId)!

    // One should be terminal, one should be browser (order depends on tree structure)
    const types = [ws0Pane.type, ws1Pane.type].sort()
    expect(types).toEqual(['browser', 'terminal'])
  })
})
