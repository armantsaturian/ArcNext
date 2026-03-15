import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'

type Callback = (...args: unknown[]) => void

const api = {
  sidebar: {
    setTrafficLightsVisible: (visible: boolean) =>
      ipcRenderer.send('sidebar:traffic-lights', visible)
  },
  dirHistory: {
    visit: (path: string) => ipcRenderer.invoke('dirHistory:visit', path),
    query: () => ipcRenderer.invoke('dirHistory:query')
  },
  pty: {
    create: (paneId: string, cwd?: string) =>
      ipcRenderer.send('pty:create', paneId, cwd),
    write: (paneId: string, data: string) =>
      ipcRenderer.send('pty:write', paneId, data),
    resize: (paneId: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', paneId, cols, rows),
    kill: (paneId: string) =>
      ipcRenderer.send('pty:kill', paneId),
    onData: (callback: (paneId: string, data: string) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, data: string) => callback(paneId, data)
      ipcRenderer.on('pty:data', handler)
      return () => { ipcRenderer.removeListener('pty:data', handler) }
    },
    onExit: (callback: (paneId: string, code: number) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, code: number) => callback(paneId, code)
      ipcRenderer.on('pty:exit', handler)
      return () => { ipcRenderer.removeListener('pty:exit', handler) }
    },
    onTitle: (callback: (paneId: string, title: string) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, title: string) => callback(paneId, title)
      ipcRenderer.on('pty:title', handler)
      return () => { ipcRenderer.removeListener('pty:title', handler) }
    }
  }
}

contextBridge.exposeInMainWorld('arcnext', {
  ...api,
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
})
