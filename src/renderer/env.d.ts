interface ArcNextAPI {
  pty: {
    create(paneId: string, cwd?: string): void
    write(paneId: string, data: string): void
    resize(paneId: string, cols: number, rows: number): void
    kill(paneId: string): void
    onData(callback: (paneId: string, data: string) => void): () => void
    onExit(callback: (paneId: string, code: number) => void): () => void
    onTitle(callback: (paneId: string, title: string) => void): () => void
  }
  getPathForFile(file: File): string
}

declare global {
  interface Window {
    arcnext: ArcNextAPI
  }
}
