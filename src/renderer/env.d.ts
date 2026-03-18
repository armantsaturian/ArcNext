interface ArcNextAPI {
  sidebar: {
    setTrafficLightsVisible(visible: boolean): void
  }
  dirHistory: {
    visit(path: string): Promise<void>
    query(): Promise<Array<{
      path: string
      visitCount: number
      lastVisit: number
      score: number
    }>>
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
  }
  getPathForFile(file: File): string
}

declare global {
  interface Window {
    arcnext: ArcNextAPI
  }
}
