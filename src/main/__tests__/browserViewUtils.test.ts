import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const originalUserAgentFallback =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.188 Electron/41.2.1 ArcNext/0.10.0 Safari/537.36'
  const setUserAgent = vi.fn()
  const onBeforeSendHeaders = vi.fn()
  const setPermissionRequestHandler = vi.fn()
  const setPermissionCheckHandler = vi.fn()
  const setDisplayMediaRequestHandler = vi.fn()
  const mockApp = {
    userAgentFallback: originalUserAgentFallback,
    getName: () => 'ArcNext'
  }
  const mockSession = {
    setUserAgent,
    setPermissionRequestHandler,
    setPermissionCheckHandler,
    setDisplayMediaRequestHandler,
    webRequest: {
      onBeforeSendHeaders
    }
  }

  return {
    originalUserAgentFallback,
    setUserAgent,
    onBeforeSendHeaders,
    setPermissionRequestHandler,
    setPermissionCheckHandler,
    setDisplayMediaRequestHandler,
    mockApp,
    mockSession
  }
})

vi.mock('electron', () => {
  class Menu {
    items: unknown[] = []

    append(item: unknown): void {
      this.items.push(item)
    }

    popup(): void {}
  }

  class MenuItem {
    constructor(options: Record<string, unknown>) {
      Object.assign(this, options)
    }
  }

  return {
    app: electronMocks.mockApp,
    session: {
      fromPartition: vi.fn(() => electronMocks.mockSession)
    },
    Menu,
    MenuItem,
    clipboard: {
      writeText: vi.fn()
    },
    systemPreferences: {
      askForMediaAccess: vi.fn(() => Promise.resolve(true))
    },
    desktopCapturer: {
      getSources: vi.fn(() => Promise.resolve([]))
    }
  }
})

import {
  applyBrowserUserAgentOverride,
  configureBrowserSession,
  getChromeUserAgent,
  wireBrowserViewEvents
} from '../browserViewUtils'

type Listener = (...args: unknown[]) => void

function createMockSessionHarness() {
  const setUserAgent = vi.fn()
  const onBeforeSendHeaders = vi.fn()
  const setPermissionRequestHandler = vi.fn()
  const setPermissionCheckHandler = vi.fn()
  const setDisplayMediaRequestHandler = vi.fn()

  return {
    setUserAgent,
    onBeforeSendHeaders,
    setPermissionRequestHandler,
    setPermissionCheckHandler,
    setDisplayMediaRequestHandler,
    mockSession: {
      setUserAgent,
      setPermissionRequestHandler,
      setPermissionCheckHandler,
      setDisplayMediaRequestHandler,
      webRequest: {
        onBeforeSendHeaders
      }
    }
  }
}

function createMockView() {
  const listeners = new Map<string, Listener[]>()

  const webContents = {
    on: vi.fn((event: string, listener: Listener) => {
      const current = listeners.get(event) ?? []
      current.push(listener)
      listeners.set(event, current)
      return webContents
    }),
    removeListener: vi.fn((event: string, listener: Listener) => {
      const current = listeners.get(event) ?? []
      listeners.set(event, current.filter((entry) => entry !== listener))
      return webContents
    }),
    setWindowOpenHandler: vi.fn(),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    isAudioMuted: vi.fn(() => false),
    setVisualZoomLevelLimits: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    downloadURL: vi.fn(),
    copyImageAt: vi.fn()
  }

  return {
    view: { webContents } as unknown as Electron.WebContentsView,
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args)
      }
    }
  }
}

describe('browser user agent overrides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    electronMocks.mockApp.userAgentFallback = electronMocks.originalUserAgentFallback
  })

  it('strips Electron and ArcNext tokens from the browser user agent', () => {
    expect(getChromeUserAgent()).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7680.188 Safari/537.36'
    )
  })

  it('overrides the app fallback user agent', () => {
    const chromeUA = applyBrowserUserAgentOverride()

    expect(electronMocks.mockApp.userAgentFallback).toBe(chromeUA)
    expect(chromeUA).not.toContain('Electron/')
    expect(chromeUA).not.toContain('ArcNext/')
  })

  it('forces the stripped user agent on every browser-session request', () => {
    const sessionHarness = createMockSessionHarness()
    const chromeUA = configureBrowserSession(sessionHarness.mockSession as unknown as Electron.Session)

    expect(sessionHarness.setUserAgent).toHaveBeenCalledWith(chromeUA)
    expect(sessionHarness.onBeforeSendHeaders).toHaveBeenCalledTimes(1)

    const handler = sessionHarness.onBeforeSendHeaders.mock.calls[0][0] as (
      details: { requestHeaders: Record<string, string> },
      callback: (result: { requestHeaders: Record<string, string> }) => void
    ) => void
    const callback = vi.fn()

    handler(
      {
        requestHeaders: {
          Accept: '*/*',
          'user-agent': 'Electron badness'
        }
      },
      callback
    )

    expect(callback).toHaveBeenCalledWith({
      requestHeaders: {
        Accept: '*/*',
        'User-Agent': chromeUA
      }
    })
  })

  it('does not register duplicate request interceptors for the same browser session', () => {
    const sessionHarness = createMockSessionHarness()

    configureBrowserSession(sessionHarness.mockSession as unknown as Electron.Session)
    configureBrowserSession(sessionHarness.mockSession as unknown as Electron.Session)

    expect(sessionHarness.onBeforeSendHeaders).toHaveBeenCalledTimes(1)
    expect(sessionHarness.setUserAgent).toHaveBeenCalledTimes(2)
  })
})

describe('wireBrowserViewEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    electronMocks.mockApp.userAgentFallback = electronMocks.originalUserAgentFallback
  })

  it('ignores blocked subframe load failures', () => {
    const { view, emit } = createMockView()
    const onLoadFailed = vi.fn()

    wireBrowserViewEvents(view, { onLoadFailed })

    emit(
      'did-fail-load',
      {},
      -27,
      'ERR_BLOCKED_BY_RESPONSE',
      'https://accounts.google.com/RotateCookiesPage',
      false,
      6,
      17
    )

    expect(onLoadFailed).not.toHaveBeenCalled()
  })

  it('reports main-frame load failures', () => {
    const { view, emit } = createMockView()
    const onLoadFailed = vi.fn()

    wireBrowserViewEvents(view, { onLoadFailed })

    emit(
      'did-fail-load',
      {},
      -105,
      'ERR_NAME_NOT_RESOLVED',
      'https://example.invalid',
      true,
      1,
      1
    )

    expect(onLoadFailed).toHaveBeenCalledWith(-105, 'ERR_NAME_NOT_RESOLVED')
  })

  it('still ignores cancelled main-frame loads', () => {
    const { view, emit } = createMockView()
    const onLoadFailed = vi.fn()

    wireBrowserViewEvents(view, { onLoadFailed })

    emit(
      'did-fail-load',
      {},
      -3,
      'ERR_ABORTED',
      'https://mail.google.com',
      true,
      1,
      1
    )

    expect(onLoadFailed).not.toHaveBeenCalled()
  })
})
