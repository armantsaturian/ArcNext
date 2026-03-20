import { WebContentsView, session } from 'electron'

export const BROWSER_PARTITION = 'persist:browser'

interface BrowserWebContentsCallbacks {
  onTitle?: (title: string) => void
  onUrl?: (url: string) => void
  onLoading?: (loading: boolean) => void
  onNavState?: (canGoBack: boolean, canGoForward: boolean) => void
  onLoadFailed?: (errorCode: number, errorDescription: string) => void
  onFocus?: () => void
  onFavicon?: (faviconUrl: string) => void
  onOpenExternal?: (url: string) => void
  onBeforeInput?: (input: Electron.Input) => boolean
}

export function createBrowserView(): WebContentsView {
  return new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      session: session.fromPartition(BROWSER_PARTITION)
    }
  })
}

export function normalizeBrowserUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('file://')) {
    return url
  }

  if (url.includes('.') && !url.includes(' ')) {
    return `https://${url}`
  }

  return `https://www.google.com/search?q=${encodeURIComponent(url)}`
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

  const onDidFailLoad = (_event: Electron.Event, errorCode: number, errorDescription: string): void => {
    if (errorCode === -3) return
    callbacks.onLoadFailed?.(errorCode, errorDescription)
  }

  const onFocus = (): void => {
    callbacks.onFocus?.()
  }

  const onFaviconUpdated = (_event: Electron.Event, favicons: string[]): void => {
    if (favicons.length > 0) callbacks.onFavicon?.(favicons[0])
  }

  const onBeforeInput = (event: Electron.Event, input: Electron.Input): void => {
    const handled = callbacks.onBeforeInput?.(input) ?? false
    if (handled) {
      event.preventDefault()
    }
  }

  wc.on('page-title-updated', onTitleUpdated)
  wc.on('did-navigate', onDidNavigate)
  wc.on('did-navigate-in-page', onDidNavigateInPage)
  wc.on('did-start-loading', onDidStartLoading)
  wc.on('did-stop-loading', onDidStopLoading)
  wc.on('did-fail-load', onDidFailLoad)
  wc.on('focus', onFocus)
  wc.on('page-favicon-updated', onFaviconUpdated)
  wc.on('before-input-event', onBeforeInput)

  wc.setWindowOpenHandler(({ url }) => {
    callbacks.onOpenExternal?.(url)
    return { action: 'deny' }
  })

  return () => {
    wc.removeListener('page-title-updated', onTitleUpdated)
    wc.removeListener('did-navigate', onDidNavigate)
    wc.removeListener('did-navigate-in-page', onDidNavigateInPage)
    wc.removeListener('did-start-loading', onDidStartLoading)
    wc.removeListener('did-stop-loading', onDidStopLoading)
    wc.removeListener('did-fail-load', onDidFailLoad)
    wc.removeListener('focus', onFocus)
    wc.removeListener('page-favicon-updated', onFaviconUpdated)
    wc.removeListener('before-input-event', onBeforeInput)
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  }
}
