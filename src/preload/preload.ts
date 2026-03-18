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
  },
  browser: {
    create: (paneId: string, url: string) =>
      ipcRenderer.send('browser:create', paneId, url),
    destroy: (paneId: string) =>
      ipcRenderer.send('browser:destroy', paneId),
    setBounds: (paneId: string, bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.send('browser:setBounds', paneId, bounds),
    show: (paneId: string) =>
      ipcRenderer.send('browser:show', paneId),
    hide: (paneId: string) =>
      ipcRenderer.send('browser:hide', paneId),
    navigate: (paneId: string, url: string) =>
      ipcRenderer.send('browser:navigate', paneId, url),
    goBack: (paneId: string) =>
      ipcRenderer.send('browser:goBack', paneId),
    goForward: (paneId: string) =>
      ipcRenderer.send('browser:goForward', paneId),
    reload: (paneId: string) =>
      ipcRenderer.send('browser:reload', paneId),
    stop: (paneId: string) =>
      ipcRenderer.send('browser:stop', paneId),
    onTitleChanged: (cb: (paneId: string, title: string) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, title: string) => cb(paneId, title)
      ipcRenderer.on('browser:titleChanged', handler)
      return () => { ipcRenderer.removeListener('browser:titleChanged', handler) }
    },
    onUrlChanged: (cb: (paneId: string, url: string) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, url: string) => cb(paneId, url)
      ipcRenderer.on('browser:urlChanged', handler)
      return () => { ipcRenderer.removeListener('browser:urlChanged', handler) }
    },
    onLoadingChanged: (cb: (paneId: string, loading: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, loading: boolean) => cb(paneId, loading)
      ipcRenderer.on('browser:loadingChanged', handler)
      return () => { ipcRenderer.removeListener('browser:loadingChanged', handler) }
    },
    onNavStateChanged: (cb: (paneId: string, canGoBack: boolean, canGoForward: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, canGoBack: boolean, canGoForward: boolean) => cb(paneId, canGoBack, canGoForward)
      ipcRenderer.on('browser:navStateChanged', handler)
      return () => { ipcRenderer.removeListener('browser:navStateChanged', handler) }
    },
    onLoadFailed: (cb: (paneId: string, errorCode: number, errorDesc: string) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, errorCode: number, errorDesc: string) => cb(paneId, errorCode, errorDesc)
      ipcRenderer.on('browser:loadFailed', handler)
      return () => { ipcRenderer.removeListener('browser:loadFailed', handler) }
    },
    onFocused: (cb: (paneId: string) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string) => cb(paneId)
      ipcRenderer.on('browser:focused', handler)
      return () => { ipcRenderer.removeListener('browser:focused', handler) }
    },
    listExternalWindows: () =>
      ipcRenderer.invoke('browser:listExternalWindows'),
    dockWindow: (windowId: number) =>
      ipcRenderer.invoke('browser:dockWindow', windowId)
  }
}

contextBridge.exposeInMainWorld('arcnext', {
  ...api,
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
})
