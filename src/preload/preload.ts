import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import type { BrowserDockedPayload, BrowserUndockedPayload } from '../shared/types'

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
  dirDiscovery: {
    query: () => ipcRenderer.invoke('dirDiscovery:query')
  },
  webHistory: {
    visit: (url: string, title?: string, faviconUrl?: string) =>
      ipcRenderer.invoke('webHistory:visit', url, title, faviconUrl),
    query: () => ipcRenderer.invoke('webHistory:query')
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
  pinnedWorkspaces: {
    load: () => ipcRenderer.invoke('pinnedWorkspaces:load'),
    save: (data: unknown) => ipcRenderer.invoke('pinnedWorkspaces:save', data),
    saveSync: (data: unknown) => ipcRenderer.sendSync('pinnedWorkspaces:saveSync', data)
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
    onFaviconChanged: (cb: (paneId: string, faviconUrl: string) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, faviconUrl: string) => cb(paneId, faviconUrl)
      ipcRenderer.on('browser:faviconChanged', handler)
      return () => { ipcRenderer.removeListener('browser:faviconChanged', handler) }
    },
    listExternalWindows: () =>
      ipcRenderer.invoke('browser:listExternalWindows'),
    dockWindow: (windowId: number) =>
      ipcRenderer.invoke('browser:dockWindow', windowId),
    undockPane: (paneId: string) =>
      ipcRenderer.invoke('browser:undock', paneId),
    onDocked: (cb: (payload: BrowserDockedPayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: BrowserDockedPayload) => cb(payload)
      ipcRenderer.on('browser:docked', handler)
      return () => { ipcRenderer.removeListener('browser:docked', handler) }
    },
    onUndocked: (cb: (payload: BrowserUndockedPayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: BrowserUndockedPayload) => cb(payload)
      ipcRenderer.on('browser:undocked', handler)
      return () => { ipcRenderer.removeListener('browser:undocked', handler) }
    },
    findInPage: (paneId: string, text: string, forward?: boolean) =>
      ipcRenderer.send('browser:findInPage', paneId, text, forward),
    stopFindInPage: (paneId: string) =>
      ipcRenderer.send('browser:stopFindInPage', paneId),
    onFoundInPage: (cb: (paneId: string, activeMatch: number, totalMatches: number) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, activeMatch: number, totalMatches: number) => cb(paneId, activeMatch, totalMatches)
      ipcRenderer.on('browser:foundInPage', handler)
      return () => { ipcRenderer.removeListener('browser:foundInPage', handler) }
    },
    onAppShortcut: (cb: (key: string, meta: boolean, ctrl: boolean, shift: boolean, alt: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, key: string, meta: boolean, ctrl: boolean, shift: boolean, alt: boolean) => cb(key, meta, ctrl, shift, alt)
      ipcRenderer.on('browser:appShortcut', handler)
      return () => { ipcRenderer.removeListener('browser:appShortcut', handler) }
    },
    onAudioStateChanged: (cb: (paneId: string, playing: boolean, muted: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, paneId: string, playing: boolean, muted: boolean) => cb(paneId, playing, muted)
      ipcRenderer.on('browser:audioStateChanged', handler)
      return () => { ipcRenderer.removeListener('browser:audioStateChanged', handler) }
    },
    toggleMute: (paneId: string) =>
      ipcRenderer.send('browser:toggleMute', paneId),
    focusRenderer: () => ipcRenderer.send('browser:focusRenderer')
  }
}

contextBridge.exposeInMainWorld('arcnext', {
  ...api,
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
})
