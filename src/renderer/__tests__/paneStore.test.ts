import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock terminalManager and browserManager before importing the store
vi.mock('../model/terminalManager', () => ({
  createTerminal: vi.fn(),
  destroyTerminal: vi.fn(),
  blurTerminal: vi.fn(),
  serializeTerminal: vi.fn(() => null)
}))
vi.mock('../model/browserManager', () => ({
  destroyBrowserView: vi.fn()
}))

import { createTerminal, destroyTerminal } from '../model/terminalManager'
import { destroyBrowserView } from '../model/browserManager'
import { usePaneStore } from '../store/paneStore'
import type { PaneInfo, TerminalPaneInfo, BrowserPaneInfo } from '../../shared/types'
import { allPaneIds } from '../model/gridLayout'

function resetStore() {
  // Reset zustand store to initial state
  usePaneStore.setState({
    workspaces: [],
    activeWorkspaceId: '',
    panes: new Map(),
    focusState: 'terminal'
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
    const pane: PaneInfo = Math.random() > 0.5
      ? { type: 'terminal', id: 'p-1', title: 'shell', cwd: '' }
      : {
          type: 'browser',
          id: 'p-2',
          title: 'Google',
          url: 'https://google.com',
          canGoBack: false,
          canGoForward: false,
          isLoading: false
        }
    if (pane.type === 'terminal') {
      expect(pane.cwd).toBe('')
    }
    if (pane.type === 'browser') {
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

  it('splitActive creates a new terminal pane (horizontal = new column)', () => {
    const { panes: before } = usePaneStore.getState()
    usePaneStore.getState().splitActive('horizontal')
    const { panes: after, workspaces } = usePaneStore.getState()
    expect(after.size).toBe(before.size + 1)
    const ws = workspaces.find(w => w.id === usePaneStore.getState().activeWorkspaceId)!
    const ids = allPaneIds(ws.grid)
    expect(ids).toHaveLength(2)
    expect(ws.grid.columns).toHaveLength(2)
    for (const id of ids) {
      expect(after.get(id)!.type).toBe('terminal')
    }
  })

  it('splitActive vertical adds a row in the same column', () => {
    usePaneStore.getState().splitActive('vertical')
    const { workspaces } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === usePaneStore.getState().activeWorkspaceId)!
    expect(ws.grid.columns).toHaveLength(1)
    expect(ws.grid.columns[0].rows).toHaveLength(2)
  })

  it('closePane on terminal calls destroyTerminal', () => {
    usePaneStore.getState().splitActive('horizontal')
    const { workspaces } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === usePaneStore.getState().activeWorkspaceId)!
    const ids = allPaneIds(ws.grid)
    const targetId = ids[0]

    vi.clearAllMocks()
    usePaneStore.getState().closePane(targetId)

    expect(destroyTerminal).toHaveBeenCalledWith(targetId)
    expect(usePaneStore.getState().panes.has(targetId)).toBe(false)
  })

  it('removeWorkspace destroys all terminal panes', () => {
    usePaneStore.getState().splitActive('horizontal')
    usePaneStore.getState().addWorkspace()

    const { workspaces } = usePaneStore.getState()
    const firstWs = workspaces[0]
    const paneIds = allPaneIds(firstWs.grid)

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
    const ids = allPaneIds(ws.grid)

    expect(ids).toHaveLength(2)
    const browserPane = panes.get(ws.activePaneId)!
    expect(browserPane.type).toBe('browser')
    expect((browserPane as BrowserPaneInfo).url).toBe('https://github.com')

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

  it('addBrowserWorkspace accepts a main-provided pane id and title', () => {
    usePaneStore.getState().addBrowserWorkspace('https://example.com', {
      paneId: 'pane-docked',
      title: 'Example Domain',
      isLoading: false
    })

    const ws = usePaneStore.getState().workspaces[usePaneStore.getState().workspaces.length - 1]
    const pane = usePaneStore.getState().panes.get('pane-docked') as BrowserPaneInfo

    expect(ws.activePaneId).toBe('pane-docked')
    expect(pane.title).toBe('Example Domain')
    expect(pane.isLoading).toBe(false)
  })
})

describe('paneStore — type-aware cleanup', () => {
  beforeEach(resetStore)

  it('closePane on browser pane calls destroyBrowserView, not destroyTerminal', () => {
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')
    const { workspaces, activeWorkspaceId } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === activeWorkspaceId)!
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
    usePaneStore.getState().addWorkspace()

    const { workspaces } = usePaneStore.getState()
    const mixedWs = workspaces[0]
    const ids = allPaneIds(mixedWs.grid)
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
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    const { workspaces } = usePaneStore.getState()
    expect(workspaces).toHaveLength(2)

    const terminalWsId = workspaces[0].id
    const browserWsId = workspaces[1].id

    usePaneStore.getState().mergeWorkspaces(terminalWsId, browserWsId, 'horizontal')
    const merged = usePaneStore.getState().workspaces
    expect(merged).toHaveLength(1)

    const ids = allPaneIds(merged[0].grid)
    expect(ids).toHaveLength(2)

    const { panes } = usePaneStore.getState()
    const types = ids.map(id => panes.get(id)!.type)
    expect(types).toContain('terminal')
    expect(types).toContain('browser')
  })

  it('separateWorkspace splits all columns into separate workspaces', () => {
    // Create a 3-column workspace
    usePaneStore.getState().splitActive('horizontal')
    usePaneStore.getState().splitActive('horizontal')

    const { workspaces } = usePaneStore.getState()
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0].grid.columns.length).toBe(3)

    usePaneStore.getState().separateWorkspace(workspaces[0].id)
    const separated = usePaneStore.getState().workspaces
    expect(separated).toHaveLength(3)

    // Each should have 1 column
    expect(separated[0].grid.columns).toHaveLength(1)
    expect(separated[1].grid.columns).toHaveLength(1)
    expect(separated[2].grid.columns).toHaveLength(1)
  })

  it('separateWorkspace activates the workspace containing the active pane', () => {
    usePaneStore.getState().splitActive('horizontal')
    usePaneStore.getState().splitActive('horizontal')

    const { workspaces } = usePaneStore.getState()
    const activePaneId = workspaces[0].activePaneId

    usePaneStore.getState().separateWorkspace(workspaces[0].id)
    const { activeWorkspaceId } = usePaneStore.getState()
    const activeWs = usePaneStore.getState().workspaces.find(w => w.id === activeWorkspaceId)!
    expect(allPaneIds(activeWs.grid)).toContain(activePaneId)
  })

  it('separateWorkspace inherits color and pinned state', () => {
    usePaneStore.getState().splitActive('horizontal')

    const ws = usePaneStore.getState().workspaces[0]
    usePaneStore.getState().setWorkspaceColor(ws.id, '#ff0000')

    usePaneStore.getState().separateWorkspace(ws.id)
    const separated = usePaneStore.getState().workspaces
    expect(separated).toHaveLength(2)
    expect(separated[1].color).toBe('#ff0000')
  })
})

describe('paneStore — moveWorkspace', () => {
  beforeEach(resetStore)

  it('moves workspace from index 0 to index 2 in a 3-workspace list', () => {
    usePaneStore.getState().addWorkspace()
    usePaneStore.getState().addWorkspace()
    const ids = usePaneStore.getState().workspaces.map(w => w.id)
    expect(ids).toHaveLength(3)

    usePaneStore.getState().moveWorkspace(0, 2)
    const after = usePaneStore.getState().workspaces.map(w => w.id)
    expect(after).toEqual([ids[1], ids[2], ids[0]])
  })

  it('no-op when fromIndex === toIndex', () => {
    usePaneStore.getState().addWorkspace()
    const before = usePaneStore.getState().workspaces.map(w => w.id)
    usePaneStore.getState().moveWorkspace(0, 0)
    const after = usePaneStore.getState().workspaces.map(w => w.id)
    expect(after).toEqual(before)
  })

  it('no-op when indices out of bounds', () => {
    usePaneStore.getState().addWorkspace()
    const before = usePaneStore.getState().workspaces.map(w => w.id)
    usePaneStore.getState().moveWorkspace(-1, 0)
    usePaneStore.getState().moveWorkspace(0, 5)
    const after = usePaneStore.getState().workspaces.map(w => w.id)
    expect(after).toEqual(before)
  })

  it('preserves activeWorkspaceId', () => {
    usePaneStore.getState().addWorkspace()
    usePaneStore.getState().addWorkspace()
    const activeId = usePaneStore.getState().activeWorkspaceId
    usePaneStore.getState().moveWorkspace(0, 2)
    expect(usePaneStore.getState().activeWorkspaceId).toBe(activeId)
  })
})

describe('paneStore — focusState tracking', () => {
  beforeEach(resetStore)

  it('initial focusState is terminal', () => {
    expect(usePaneStore.getState().focusState).toBe('terminal')
  })

  it('setActivePaneInWorkspace to a browser pane sets focusState to browser', () => {
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')
    const { workspaces, activeWorkspaceId } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === activeWorkspaceId)!
    const browserPaneId = ws.activePaneId

    const ids = allPaneIds(ws.grid)
    const terminalPaneId = ids.find(id => id !== browserPaneId)!
    usePaneStore.getState().setActivePaneInWorkspace(terminalPaneId)
    expect(usePaneStore.getState().focusState).toBe('terminal')

    usePaneStore.getState().setActivePaneInWorkspace(browserPaneId)
    expect(usePaneStore.getState().focusState).toBe('browser')
  })

  it('setActivePaneInWorkspace to a terminal pane sets focusState to terminal', () => {
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')
    const { workspaces, activeWorkspaceId } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === activeWorkspaceId)!
    const browserPaneId = ws.activePaneId
    expect(usePaneStore.getState().focusState).toBe('browser')

    const ids = allPaneIds(ws.grid)
    const terminalPaneId = ids.find(id => id !== browserPaneId)!
    usePaneStore.getState().setActivePaneInWorkspace(terminalPaneId)
    expect(usePaneStore.getState().focusState).toBe('terminal')
  })

  it('switchWorkspace to a browser workspace updates focusState via subscriber', () => {
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    expect(usePaneStore.getState().focusState).toBe('browser')

    const terminalWsId = usePaneStore.getState().workspaces[0].id
    usePaneStore.getState().switchWorkspace(terminalWsId)
    expect(usePaneStore.getState().focusState).toBe('terminal')

    const browserWsId = usePaneStore.getState().workspaces[1].id
    usePaneStore.getState().switchWorkspace(browserWsId)
    expect(usePaneStore.getState().focusState).toBe('browser')
  })

  it('setFocusState(ui) sets UI focus', () => {
    usePaneStore.getState().setFocusState('ui')
    expect(usePaneStore.getState().focusState).toBe('ui')
  })

  it('setActivePaneInWorkspace while in ui mode exits to correct pane type', () => {
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')
    const { workspaces, activeWorkspaceId } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === activeWorkspaceId)!
    const browserPaneId = ws.activePaneId

    usePaneStore.getState().setFocusState('ui')
    expect(usePaneStore.getState().focusState).toBe('ui')

    usePaneStore.getState().setActivePaneInWorkspace(browserPaneId)
    expect(usePaneStore.getState().focusState).toBe('browser')
  })

  it('addBrowserWorkspace sets focusState to browser via subscriber', () => {
    expect(usePaneStore.getState().focusState).toBe('terminal')
    usePaneStore.getState().addBrowserWorkspace('https://example.com')
    expect(usePaneStore.getState().focusState).toBe('browser')
  })

  it('closePane on active browser pane updates focusState to match new active pane', () => {
    usePaneStore.getState().splitActiveBrowser('horizontal', 'https://example.com')
    const { workspaces, activeWorkspaceId } = usePaneStore.getState()
    const ws = workspaces.find(w => w.id === activeWorkspaceId)!
    const browserPaneId = ws.activePaneId
    expect(usePaneStore.getState().focusState).toBe('browser')

    usePaneStore.getState().closePane(browserPaneId)
    expect(usePaneStore.getState().focusState).toBe('terminal')
  })
})
