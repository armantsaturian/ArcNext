import { contextBridge, ipcRenderer } from 'electron'

const api = {
  pty: {
    create: (paneId: string, cwd?: string) =>
      ipcRenderer.send('pty:create', paneId, cwd),
    write: (paneId: string, data: string) =>
      ipcRenderer.send('pty:write', paneId, data),
    resize: (paneId: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', paneId, cols, rows),
    kill: (paneId: string) =>
      ipcRenderer.send('pty:kill', paneId),
    onData: (callback: (paneId: string, data: string) => void) =>
      ipcRenderer.on('pty:data', (_event, paneId, data) => callback(paneId, data)),
    onExit: (callback: (paneId: string, code: number) => void) =>
      ipcRenderer.on('pty:exit', (_event, paneId, code) => callback(paneId, code)),
    onTitle: (callback: (paneId: string, title: string) => void) =>
      ipcRenderer.on('pty:title', (_event, paneId, title) => callback(paneId, title))
  }
}

contextBridge.exposeInMainWorld('arcnext', api)
