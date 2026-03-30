import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>()
  const createdViews: Array<{
    setBounds: ReturnType<typeof vi.fn>
    webContents: {
      on: ReturnType<typeof vi.fn>
      removeListener: ReturnType<typeof vi.fn>
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
  const webContentsListenersByView = new WeakMap<object, Map<string, Array<(...args: unknown[]) => void>>>()
  const openExternal = vi.fn()
  const createBrowserPopupWindow = vi.fn(() => ({ id: 'popup-web-contents' }))
  let nextViewId = 1

  const makeView = () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const view = {
      id: nextViewId++,
      setBounds: vi.fn(),
      webContents: {
        on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
          const current = listeners.get(event) ?? []
          current.push(listener)
          listeners.set(event, current)
        }),
        removeListener: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
          const current = listeners.get(event) ?? []
          listeners.set(event, current.filter((entry) => entry !== listener))
        }),
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
    webContentsListenersByView.set(view, listeners)
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
    webContentsListenersByView,
    openExternal,
    createBrowserPopupWindow,
    makeView,
    reset
  }
})

vi.mock('electron', () => ({
  shell: {
    openExternal: mockState.openExternal
  },
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

vi.mock('../browserPopups', () => ({
  createBrowserPopupWindow: mockState.createBrowserPopupWindow
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

function emitWebContentsEvent(view: object, event: string, ...args: unknown[]): void {
  const listeners = mockState.webContentsListenersByView.get(view)?.get(event) ?? []
  for (const listener of listeners) listener(...args)
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
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://example.com', undefined)
    expect(view.setBounds).toHaveBeenCalledWith({ x: 12, y: 46, width: 800, height: 601 })
    expect(mainWindow.contentView.addChildView).toHaveBeenCalledWith(view)
  })

  it('patches supported search result pages after they finish loading', () => {
    emitIpc('browser:create', 'pane-1', 'https://www.google.com/search?q=hello')
    emitIpc('browser:show', 'pane-1')
    const view = mockState.createdViews[0]

    emitWebContentsEvent(view, 'did-finish-load')

    expect(view.webContents.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('#search a[href] h3'))
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
    expect(recreatedView.webContents.loadURL).toHaveBeenCalledWith('https://one.example/after-nav', undefined)
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

  it('recreated hidden views from navigate still age out after the timeout', () => {
    vi.useFakeTimers()

    emitIpc('browser:create', 'pane-1', 'https://one.example')
    emitIpc('browser:show', 'pane-1')
    const firstView = mockState.createdViews[0]

    emitIpc('browser:hide', 'pane-1')
    vi.advanceTimersByTime(15_000)

    expect(firstView.webContents.close).toHaveBeenCalledTimes(1)

    emitIpc('browser:navigate', 'pane-1', 'https://two.example')

    expect(mockState.createdViews).toHaveLength(2)
    const recreatedView = mockState.createdViews[1]
    expect(recreatedView.webContents.loadURL).toHaveBeenCalledWith('https://two.example')
    expect(recreatedView.webContents.close).not.toHaveBeenCalled()

    vi.advanceTimersByTime(15_000)

    expect(mockState.cleanupByView.get(recreatedView)).toHaveBeenCalledTimes(1)
    expect(recreatedView.webContents.close).toHaveBeenCalledTimes(1)
  })

  it('routes background-tab opens into background workspaces after the source pane', () => {
    emitIpc('browser:create', 'pane-1', 'https://source.example')
    emitIpc('browser:show', 'pane-1')
    const sourceView = mockState.createdViews[0]

    const response = mockState.callbacksByView.get(sourceView)?.onWindowOpen?.({
      url: 'https://dest.example',
      frameName: '_blank',
      features: '',
      disposition: 'background-tab',
      referrer: { url: 'https://source.example', policy: 'strict-origin-when-cross-origin' }
    })

    expect(response).toEqual({ action: 'deny' })
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'browser:openWorkspace',
      expect.objectContaining({
        sourcePaneId: 'pane-1',
        url: 'https://dest.example',
        background: true
      })
    )
    expect(mockState.createdViews).toHaveLength(2)
    expect(mockState.createdViews[1].webContents.loadURL).toHaveBeenCalledWith('https://dest.example', {
      httpReferrer: { url: 'https://source.example', policy: 'strict-origin-when-cross-origin' },
      postData: undefined,
      extraHeaders: undefined
    })
  })

  it('preserves referrer and post data for new workspaces created from target=_blank forms', () => {
    emitIpc('browser:create', 'pane-1', 'https://source.example')
    emitIpc('browser:show', 'pane-1')
    const sourceView = mockState.createdViews[0]

    mockState.callbacksByView.get(sourceView)?.onWindowOpen?.({
      url: 'https://dest.example/submit',
      frameName: '_blank',
      features: '',
      disposition: 'foreground-tab',
      referrer: { url: 'https://source.example/form', policy: 'strict-origin-when-cross-origin' },
      postBody: {
        contentType: 'application/x-www-form-urlencoded',
        data: [{ bytes: Buffer.from('code=123') }]
      }
    })

    const payloadCall = (mainWindow.webContents.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([channel]) => channel === 'browser:openWorkspace'
    )
    const payload = payloadCall?.[1] as { paneId: string } | undefined

    expect(payload?.paneId).toBeTruthy()

    emitIpc('browser:create', payload!.paneId, 'https://ignored.example')
    emitIpc('browser:show', payload!.paneId)

    const openedView = mockState.createdViews[1]
    expect(openedView.webContents.loadURL).toHaveBeenCalledWith('https://dest.example/submit', {
      httpReferrer: { url: 'https://source.example/form', policy: 'strict-origin-when-cross-origin' },
      postData: [{ bytes: Buffer.from('code=123') }],
      extraHeaders: 'content-type: application/x-www-form-urlencoded\n'
    })
  })

  it('allows popup windows for new-window requests', () => {
    emitIpc('browser:create', 'pane-1', 'https://source.example')
    emitIpc('browser:show', 'pane-1')
    const sourceView = mockState.createdViews[0]

    const response = mockState.callbacksByView.get(sourceView)?.onWindowOpen?.({
      url: 'https://bank.example/auth',
      frameName: 'oauthPopup',
      features: 'width=500,height=700',
      disposition: 'new-window',
      referrer: { url: 'https://source.example', policy: 'strict-origin-when-cross-origin' }
    }) as Electron.WindowOpenHandlerResponse

    expect(response.action).toBe('allow')
    expect(response.createWindow).toBeTypeOf('function')
    expect(response.createWindow?.({ width: 500, height: 700 } as Electron.BrowserWindowConstructorOptions))
      .toEqual({ id: 'popup-web-contents' })
    expect(mockState.createBrowserPopupWindow).toHaveBeenCalledWith({ width: 500, height: 700 })
  })

  it('opens external protocols via the OS instead of navigating inside ArcNext', () => {
    emitIpc('browser:create', 'pane-1', 'https://source.example')
    emitIpc('browser:show', 'pane-1')
    const sourceView = mockState.createdViews[0]

    const prevented = vi.fn()
    const handled = mockState.callbacksByView.get(sourceView)?.onWillNavigate?.('mailto:test@example.com')

    if (handled) prevented()

    expect(handled).toBe(true)
    expect(prevented).toHaveBeenCalledTimes(1)
    expect(mockState.openExternal).toHaveBeenCalledWith('mailto:test@example.com')
  })
})
