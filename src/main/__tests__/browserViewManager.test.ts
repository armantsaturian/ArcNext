import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>()
  const createdViews: Array<{
    setBounds: ReturnType<typeof vi.fn>
    webContents: {
      loadURL: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      goBack: ReturnType<typeof vi.fn>
      goForward: ReturnType<typeof vi.fn>
      reload: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      findInPage: ReturnType<typeof vi.fn>
      stopFindInPage: ReturnType<typeof vi.fn>
      isAudioMuted: ReturnType<typeof vi.fn>
      setAudioMuted: ReturnType<typeof vi.fn>
      getURL: ReturnType<typeof vi.fn>
      getTitle: ReturnType<typeof vi.fn>
      canGoBack: ReturnType<typeof vi.fn>
      canGoForward: ReturnType<typeof vi.fn>
      executeJavaScript: ReturnType<typeof vi.fn>
    }
  }> = []
  const cleanupByView = new WeakMap<object, ReturnType<typeof vi.fn>>()
  const callbacksByView = new WeakMap<object, Record<string, (...args: unknown[]) => void>>()
  let nextViewId = 1

  const makeView = () => {
    const view = {
      id: nextViewId++,
      setBounds: vi.fn(),
      webContents: {
        loadURL: vi.fn(),
        close: vi.fn(),
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        stop: vi.fn(),
        findInPage: vi.fn(),
        stopFindInPage: vi.fn(),
        isAudioMuted: vi.fn(() => false),
        setAudioMuted: vi.fn(),
        getURL: vi.fn(() => ''),
        getTitle: vi.fn(() => ''),
        canGoBack: vi.fn(() => false),
        canGoForward: vi.fn(() => false),
        executeJavaScript: vi.fn(() => Promise.resolve(''))
      }
    }
    createdViews.push(view)
    return view
  }

  const reset = () => {
    ipcHandlers.clear()
    createdViews.length = 0
    nextViewId = 1
  }

  return {
    ipcHandlers,
    createdViews,
    cleanupByView,
    callbacksByView,
    makeView,
    reset
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
      mockState.ipcHandlers.set(channel, handler)
    })
  }
}))

vi.mock('../browserViewUtils', () => ({
  createBrowserView: vi.fn(() => mockState.makeView()),
  normalizeBrowserUrl: vi.fn((url: string) => /^https?:\/\//i.test(url) ? url : `https://${url}`),
  wireBrowserViewEvents: vi.fn((view: object, callbacks: Record<string, (...args: unknown[]) => void>) => {
    mockState.callbacksByView.set(view, callbacks)
    const cleanup = vi.fn()
    mockState.cleanupByView.set(view, cleanup)
    return cleanup
  })
}))

vi.mock('../externalBrowserWindows', () => ({
  createExternalBrowserWindow: vi.fn()
}))

function createMainWindow() {
  const children: object[] = []

  return {
    isDestroyed: vi.fn(() => false),
    contentView: {
      children,
      addChildView: vi.fn((view: object) => {
        children.push(view)
      }),
      removeChildView: vi.fn((view: object) => {
        const index = children.indexOf(view)
        if (index !== -1) children.splice(index, 1)
      })
    },
    webContents: {
      send: vi.fn()
    }
  }
}

function emitIpc(channel: string, ...args: unknown[]): void {
  const handler = mockState.ipcHandlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler for ${channel}`)
  handler({}, ...args)
}

describe('browserViewManager', () => {
  let browserViewManager: typeof import('../browserViewManager')
  let mainWindow: ReturnType<typeof createMainWindow>

  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(async () => {
    vi.useRealTimers()
    vi.resetModules()
    vi.clearAllMocks()
    mockState.reset()
    browserViewManager = await import('../browserViewManager')
    mainWindow = createMainWindow()
    browserViewManager.setupBrowserViewManager(mainWindow as never)
  })

  it('creates browser views lazily on show', () => {
    emitIpc('browser:create', 'pane-1', 'example.com')
    emitIpc('browser:setBounds', 'pane-1', { x: 12.3, y: 45.8, width: 800.4, height: 600.6 })

    expect(mockState.createdViews).toHaveLength(0)

    emitIpc('browser:show', 'pane-1')

    expect(mockState.createdViews).toHaveLength(1)
    const view = mockState.createdViews[0]
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://example.com')
    expect(view.setBounds).toHaveBeenCalledWith({ x: 12, y: 46, width: 800, height: 601 })
    expect(mainWindow.contentView.addChildView).toHaveBeenCalledWith(view)
  })

  it('sleeps the oldest hidden browser view once the hidden-view budget is exceeded', () => {
    emitIpc('browser:create', 'pane-1', 'https://one.example')
    emitIpc('browser:show', 'pane-1')
    const firstView = mockState.createdViews[0]
    mockState.callbacksByView.get(firstView)?.onUrl?.('https://one.example/after-nav')
    emitIpc('browser:hide', 'pane-1')

    emitIpc('browser:create', 'pane-2', 'https://two.example')
    emitIpc('browser:show', 'pane-2')
    const secondView = mockState.createdViews[1]
    emitIpc('browser:hide', 'pane-2')

    expect(mockState.cleanupByView.get(firstView)).toHaveBeenCalledTimes(1)
    expect(firstView.webContents.close).toHaveBeenCalledTimes(1)
    expect(secondView.webContents.close).not.toHaveBeenCalled()
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('browser:navStateChanged', 'pane-1', false, false)
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('browser:audioStateChanged', 'pane-1', false, false)

    emitIpc('browser:show', 'pane-1')

    expect(mockState.createdViews).toHaveLength(3)
    const recreatedView = mockState.createdViews[2]
    expect(recreatedView.webContents.loadURL).toHaveBeenCalledWith('https://one.example/after-nav')
    expect(mainWindow.contentView.addChildView).toHaveBeenCalledWith(recreatedView)
  })

  it('ages out the single warm hidden browser view after a timeout', () => {
    vi.useFakeTimers()

    emitIpc('browser:create', 'pane-1', 'https://one.example')
    emitIpc('browser:show', 'pane-1')
    const view = mockState.createdViews[0]

    emitIpc('browser:hide', 'pane-1')

    expect(view.webContents.close).not.toHaveBeenCalled()

    vi.advanceTimersByTime(15_000)

    expect(mockState.cleanupByView.get(view)).toHaveBeenCalledTimes(1)
    expect(view.webContents.close).toHaveBeenCalledTimes(1)
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('browser:loadingChanged', 'pane-1', false)
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('browser:navStateChanged', 'pane-1', false, false)
  })
})
