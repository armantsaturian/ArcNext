import { app, WebContentsView, session, Menu, MenuItem, clipboard, systemPreferences, desktopCapturer } from 'electron'

export const BROWSER_PARTITION = 'persist:browser'
const configuredBrowserSessions = new WeakSet<Electron.Session>()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a User-Agent string that matches a real Chrome browser.
 * Strips Electron and app name tokens that trip Google's bot detection.
 */
export function getChromeUserAgent(): string {
  const defaultUA = app.userAgentFallback
  return defaultUA
    .replace(/\s*Electron\/[\w.-]+/, '')
    .replace(new RegExp(`\\s*${escapeRegExp(app.getName())}/[\\w.-]+`), '')
}

/**
 * Some challenge flows ignore Session.setUserAgent() for subframe requests and
 * fall back to app.userAgentFallback instead, which leaks the Electron token.
 * Override the global fallback as well so every browser-pane request presents
 * the same Chrome-like fingerprint.
 */
export function applyBrowserUserAgentOverride(): string {
  const chromeUserAgent = getChromeUserAgent()
  app.userAgentFallback = chromeUserAgent
  return chromeUserAgent
}

export function configureBrowserSession(browserSession: Electron.Session): string {
  const chromeUserAgent = applyBrowserUserAgentOverride()
  browserSession.setUserAgent(chromeUserAgent)
  if (configuredBrowserSessions.has(browserSession)) {
    return chromeUserAgent
  }

  browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders }
    for (const headerName of Object.keys(requestHeaders)) {
      if (headerName.toLowerCase() === 'user-agent' && headerName !== 'User-Agent') {
        delete requestHeaders[headerName]
      }
    }
    requestHeaders['User-Agent'] = chromeUserAgent
    callback({ requestHeaders })
  })

  const ALLOWED_PERMISSIONS = new Set(['media', 'notifications', 'clipboard-read', 'fullscreen', 'pointerLock'])

  // Let web pages (Google Meet, Zoom, etc.) request camera/mic/notifications.
  // On macOS, proactively trigger the TCC prompt for media — Chromium doesn't
  // always ask when getUserMedia() runs inside a WebContentsView.
  browserSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (!ALLOWED_PERMISSIONS.has(permission)) return callback(false)
    if (permission !== 'media' || process.platform !== 'darwin') return callback(true)

    const mediaTypes = (details as Electron.MediaAccessPermissionRequest).mediaTypes ?? []
    const needs: Array<'microphone' | 'camera'> = []
    if (mediaTypes.includes('audio')) needs.push('microphone')
    if (mediaTypes.includes('video')) needs.push('camera')
    // If Chromium didn't tell us what it wants, ask for both so the page works.
    if (needs.length === 0) needs.push('microphone', 'camera')

    Promise.all(needs.map((m) => systemPreferences.askForMediaAccess(m)))
      .then((results) => callback(results.every(Boolean)))
      .catch(() => callback(false))
  })
  browserSession.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMISSIONS.has(permission)
  })

  // Screen sharing via navigator.mediaDevices.getDisplayMedia (Meet, Zoom, etc.).
  // macOS 15+ uses the native system picker (handler is not invoked); elsewhere
  // we grant the first available source so the page doesn't silently fail.
  browserSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then(([source]) => callback(source ? {
          video: source,
          audio: request.audioRequested ? 'loopback' : undefined
        } : {}))
        .catch(() => callback({}))
    },
    { useSystemPicker: process.platform === 'darwin' }
  )

  configuredBrowserSessions.add(browserSession)
  return chromeUserAgent
}

let _browserSession: Electron.Session | null = null

export function getBrowserSession(): Electron.Session {
  if (!_browserSession) {
    _browserSession = session.fromPartition(BROWSER_PARTITION)
    configureBrowserSession(_browserSession)
  }
  return _browserSession
}

interface BrowserWebContentsCallbacks {
  onTitle?: (title: string) => void
  onUrl?: (url: string) => void
  onLoading?: (loading: boolean) => void
  onNavState?: (canGoBack: boolean, canGoForward: boolean) => void
  onLoadFailed?: (errorCode: number, errorDescription: string) => void
  onFocus?: () => void
  onFavicon?: (faviconUrl: string) => void
  onOpenInNewWorkspace?: (url: string) => void
  onSummarize?: (url: string) => void
  onFoundInPage?: (activeMatch: number, totalMatches: number) => void
  onAudioStateChanged?: (playing: boolean, muted: boolean) => void
  onHtmlFullScreen?: (entered: boolean) => void
  onBeforeInput?: (input: Electron.Input) => boolean
}

export function createBrowserView(): WebContentsView {
  return new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      session: getBrowserSession()
    }
  })
}

export function normalizeBrowserUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('file://') || url.startsWith('arcnext-block://')) {
    return url
  }

  if (url.includes('.') && !url.includes(' ')) {
    return `https://${url}`
  }

  return `https://www.google.com/search?q=${encodeURIComponent(url)}`
}

function buildContextMenu(
  wc: Electron.WebContents,
  params: Electron.ContextMenuParams,
  callbacks: BrowserWebContentsCallbacks
): Menu {
  const menu = new Menu()
  const { editFlags, selectionText, isEditable, linkURL, mediaType, srcURL } = params

  if (linkURL) {
    menu.append(new MenuItem({
      label: 'Open Link in New Workspace',
      click: () => callbacks.onOpenInNewWorkspace?.(linkURL)
    }))
    menu.append(new MenuItem({
      label: 'Summarize Link',
      click: () => callbacks.onSummarize?.(linkURL)
    }))
    menu.append(new MenuItem({
      label: 'Copy Link Address',
      click: () => clipboard.writeText(linkURL)
    }))
    menu.append(new MenuItem({ type: 'separator' }))
  }

  if (mediaType === 'image' && srcURL) {
    menu.append(new MenuItem({
      label: 'Save Image As\u2026',
      click: () => wc.downloadURL(srcURL)
    }))
    menu.append(new MenuItem({
      label: 'Copy Image',
      click: () => wc.copyImageAt(params.x, params.y)
    }))
    menu.append(new MenuItem({
      label: 'Copy Image Address',
      click: () => clipboard.writeText(srcURL)
    }))
    menu.append(new MenuItem({ type: 'separator' }))
  }

  if (isEditable) {
    menu.append(new MenuItem({
      label: 'Undo', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false,
      enabled: editFlags.canUndo, click: () => wc.undo()
    }))
    menu.append(new MenuItem({
      label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', registerAccelerator: false,
      enabled: editFlags.canRedo, click: () => wc.redo()
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
      label: 'Cut', accelerator: 'CmdOrCtrl+X', registerAccelerator: false,
      enabled: editFlags.canCut, click: () => wc.cut()
    }))
    menu.append(new MenuItem({
      label: 'Copy', accelerator: 'CmdOrCtrl+C', registerAccelerator: false,
      enabled: editFlags.canCopy, click: () => wc.copy()
    }))
    menu.append(new MenuItem({
      label: 'Paste', accelerator: 'CmdOrCtrl+V', registerAccelerator: false,
      enabled: editFlags.canPaste, click: () => wc.paste()
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
      label: 'Select All', accelerator: 'CmdOrCtrl+A', registerAccelerator: false,
      enabled: editFlags.canSelectAll, click: () => wc.selectAll()
    }))
  } else if (selectionText) {
    menu.append(new MenuItem({
      label: 'Copy', accelerator: 'CmdOrCtrl+C', registerAccelerator: false,
      enabled: editFlags.canCopy, click: () => wc.copy()
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
      label: 'Select All', accelerator: 'CmdOrCtrl+A', registerAccelerator: false,
      click: () => wc.selectAll()
    }))
  }

  // Selected text that looks like a URL — offer to summarize it
  if (selectionText && !linkURL) {
    const trimmed = selectionText.trim()
    if (/^https?:\/\/\S+$/i.test(trimmed) || (/\.\S+/.test(trimmed) && !trimmed.includes(' '))) {
      const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({
        label: 'Summarize',
        click: () => callbacks.onSummarize?.(url)
      }))
    }
  }

  // Search Google for selected text
  if (selectionText) {
    const trimmed = selectionText.trim()
    if (trimmed) {
      const label = trimmed.length > 30 ? trimmed.substring(0, 30) + '\u2026' : trimmed
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({
        label: `Search Google for \u201c${label}\u201d`,
        click: () => callbacks.onOpenInNewWorkspace?.(searchUrl)
      }))
    }
  }

  if (!isEditable && !selectionText && !linkURL && mediaType === 'none') {
    menu.append(new MenuItem({
      label: 'Back', enabled: wc.canGoBack(),
      click: () => wc.goBack()
    }))
    menu.append(new MenuItem({
      label: 'Forward', enabled: wc.canGoForward(),
      click: () => wc.goForward()
    }))
    menu.append(new MenuItem({
      label: 'Reload', accelerator: 'CmdOrCtrl+R', registerAccelerator: false,
      click: () => wc.reload()
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
      label: 'Summarize Page',
      click: () => callbacks.onSummarize?.(wc.getURL())
    }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
      label: 'Select All', accelerator: 'CmdOrCtrl+A', registerAccelerator: false,
      click: () => wc.selectAll()
    }))
  }

  return menu
}

export function wireBrowserViewEvents(
  view: WebContentsView,
  callbacks: BrowserWebContentsCallbacks
): () => void {
  const wc = view.webContents

  const sendNavState = (): void => {
    callbacks.onNavState?.(wc.canGoBack(), wc.canGoForward())
  }

  const onTitleUpdated = (_event: Electron.Event, title: string): void => {
    callbacks.onTitle?.(title)
  }

  const onDidNavigate = (_event: Electron.Event, url: string): void => {
    callbacks.onUrl?.(url)
    sendNavState()
    wc.setVisualZoomLevelLimits(1, 5)
  }

  const onDidNavigateInPage = (_event: Electron.Event, url: string): void => {
    callbacks.onUrl?.(url)
    sendNavState()
  }

  const onDidStartLoading = (): void => {
    callbacks.onLoading?.(true)
  }

  const onDidStopLoading = (): void => {
    callbacks.onLoading?.(false)
    sendNavState()
  }

  const onDidFailLoad = (
    _event: Electron.Event,
    errorCode: number,
    errorDescription: string,
    _validatedURL: string,
    isMainFrame: boolean
  ): void => {
    if (errorCode === -3) return
    // Gmail and other complex apps can intentionally hit blocked subframe loads
    // (e.g. CSP / frame-ancestor failures) after the main page has loaded.
    // Those should not replace the whole browser pane with a fatal error state.
    if (!isMainFrame) return
    callbacks.onLoadFailed?.(errorCode, errorDescription)
  }

  const onFocus = (): void => {
    callbacks.onFocus?.()
  }

  const onFaviconUpdated = (_event: Electron.Event, favicons: string[]): void => {
    if (favicons.length > 0) callbacks.onFavicon?.(favicons[0])
  }

  const onFoundInPage = (_event: Electron.Event, result: Electron.Result): void => {
    callbacks.onFoundInPage?.(result.activeMatchOrdinal, result.matches)
  }

  const onBeforeInput = (event: Electron.Event, input: Electron.Input): void => {
    const handled = callbacks.onBeforeInput?.(input) ?? false
    if (handled) {
      event.preventDefault()
    }
  }

  const enablePinchZoom = (): void => {
    wc.setVisualZoomLevelLimits(1, 5)
  }

  let mediaPlayingCount = 0

  const onMediaStarted = (): void => {
    mediaPlayingCount++
    callbacks.onAudioStateChanged?.(true, wc.isAudioMuted())
  }

  const onMediaPaused = (): void => {
    mediaPlayingCount = Math.max(0, mediaPlayingCount - 1)
    callbacks.onAudioStateChanged?.(mediaPlayingCount > 0, wc.isAudioMuted())
  }

  const onEnterHtmlFullScreen = (): void => {
    callbacks.onHtmlFullScreen?.(true)
  }

  const onLeaveHtmlFullScreen = (): void => {
    callbacks.onHtmlFullScreen?.(false)
  }

  wc.on('media-started-playing', onMediaStarted)
  wc.on('media-paused', onMediaPaused)
  wc.on('enter-html-full-screen', onEnterHtmlFullScreen)
  wc.on('leave-html-full-screen', onLeaveHtmlFullScreen)

  wc.on('page-title-updated', onTitleUpdated)
  wc.on('did-navigate', onDidNavigate)
  wc.on('did-navigate-in-page', onDidNavigateInPage)
  wc.on('did-start-loading', onDidStartLoading)
  wc.on('did-stop-loading', onDidStopLoading)
  wc.on('did-finish-load', enablePinchZoom)
  wc.on('did-fail-load', onDidFailLoad)
  wc.on('focus', onFocus)
  wc.on('page-favicon-updated', onFaviconUpdated)
  wc.on('before-input-event', onBeforeInput)
  wc.on('found-in-page', onFoundInPage)

  const onContextMenu = (
    _event: Electron.Event,
    params: Electron.ContextMenuParams
  ): void => {
    const menu = buildContextMenu(wc, params, callbacks)
    if (menu.items.length === 0) return
    menu.popup()
  }

  wc.on('context-menu', onContextMenu)

  wc.setWindowOpenHandler(({ url }) => {
    callbacks.onOpenInNewWorkspace?.(url)
    return { action: 'deny' }
  })

  return () => {
    wc.removeListener('media-started-playing', onMediaStarted)
    wc.removeListener('media-paused', onMediaPaused)
    wc.removeListener('enter-html-full-screen', onEnterHtmlFullScreen)
    wc.removeListener('leave-html-full-screen', onLeaveHtmlFullScreen)
    wc.removeListener('page-title-updated', onTitleUpdated)
    wc.removeListener('did-navigate', onDidNavigate)
    wc.removeListener('did-navigate-in-page', onDidNavigateInPage)
    wc.removeListener('did-start-loading', onDidStartLoading)
    wc.removeListener('did-stop-loading', onDidStopLoading)
    wc.removeListener('did-fail-load', onDidFailLoad)
    wc.removeListener('focus', onFocus)
    wc.removeListener('page-favicon-updated', onFaviconUpdated)
    wc.removeListener('before-input-event', onBeforeInput)
    wc.removeListener('found-in-page', onFoundInPage)
    wc.removeListener('context-menu', onContextMenu)
    wc.removeListener('did-finish-load', enablePinchZoom)
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  }
}
