import type {
  DirEntry,
  PinnedWorkspaceEntry,
  WebEntry
} from '../shared/types'

interface ArcNextAPI {
  sidebar: {
    setTrafficLightsVisible(visible: boolean): void
  }
  dirHistory: {
    visit(path: string): Promise<void>
    query(): Promise<DirEntry[]>
  }
  dirDiscovery: {
    query(): Promise<DirEntry[]>
  }
  webHistory: {
    visit(url: string, title?: string, faviconUrl?: string): Promise<void>
    query(): Promise<Array<WebEntry>>
  }
  pinnedWorkspaces: {
    load(): Promise<PinnedWorkspaceEntry[]>
    save(data: PinnedWorkspaceEntry[]): Promise<void>
    saveSync(data: PinnedWorkspaceEntry[]): void
  }
  pty: {
    create(paneId: string, cwd?: string): void
    write(paneId: string, data: string): void
    resize(paneId: string, cols: number, rows: number): void
    kill(paneId: string): void
    onData(callback: (paneId: string, data: string) => void): () => void
    onExit(callback: (paneId: string, code: number) => void): () => void
    onTitle(callback: (paneId: string, title: string) => void): () => void
  }
  browser: {
    create(paneId: string, url: string): void
    destroy(paneId: string): void
    setBounds(paneId: string, bounds: { x: number; y: number; width: number; height: number }): void
    show(paneId: string): void
    hide(paneId: string): void
    navigate(paneId: string, url: string): void
    goBack(paneId: string): void
    goForward(paneId: string): void
    reload(paneId: string): void
    stop(paneId: string): void
    onTitleChanged(cb: (paneId: string, title: string) => void): () => void
    onUrlChanged(cb: (paneId: string, url: string) => void): () => void
    onLoadingChanged(cb: (paneId: string, loading: boolean) => void): () => void
    onNavStateChanged(cb: (paneId: string, canGoBack: boolean, canGoForward: boolean) => void): () => void
    onLoadFailed(cb: (paneId: string, errorCode: number, errorDesc: string) => void): () => void
    onFocused(cb: (paneId: string) => void): () => void
    onFaviconChanged(cb: (paneId: string, faviconUrl: string) => void): () => void
    onOpenInNewWorkspace(cb: (url: string) => void): () => void
    onSummarize(cb: (paneId: string, url: string) => void): () => void
    findInPage(paneId: string, text: string, forward?: boolean): void
    stopFindInPage(paneId: string): void
    onFoundInPage(cb: (paneId: string, activeMatch: number, totalMatches: number) => void): () => void
    onAppShortcut(cb: (key: string, meta: boolean, ctrl: boolean, shift: boolean, alt: boolean) => void): () => void
    onAudioStateChanged(cb: (paneId: string, playing: boolean, muted: boolean) => void): () => void
    toggleMute(paneId: string): void
    focusRenderer(): void
  }
  getPathForFile(file: File): string
}

declare global {
  interface Window {
    arcnext: ArcNextAPI
  }
}
