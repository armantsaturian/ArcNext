import { WebContentsView, session, Menu, MenuItem, clipboard } from 'electron'

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

function buildContextMenu(
  wc: Electron.WebContents,
  params: Electron.ContextMenuParams,
  callbacks: BrowserWebContentsCallbacks
): Menu {
  const menu = new Menu()
  const { editFlags, selectionText, isEditable, linkURL, mediaType, srcURL } = params

  if (linkURL) {
    menu.append(new MenuItem({
      label: 'Open Link in New Window',
      click: () => callbacks.onOpenExternal?.(linkURL)
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
    wc.removeListener('context-menu', onContextMenu)
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  }
}
