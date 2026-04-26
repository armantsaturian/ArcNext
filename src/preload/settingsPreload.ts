import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('settings', {
  trashblock: {
    getState: () => ipcRenderer.invoke('trashblock:getState'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('trashblock:setEnabled', enabled),
    addSite: (domain: string) => ipcRenderer.invoke('trashblock:addSite', domain),
    removeSite: (domain: string) => ipcRenderer.invoke('trashblock:removeSite', domain),
    savePhrase: (phrase: string) => ipcRenderer.invoke('trashblock:savePhrase', phrase),
    saveDays: (days: number[]) => ipcRenderer.invoke('trashblock:saveDays', days),
    onChanged: (cb: () => void) => {
      const handler = (_event: IpcRendererEvent) => cb()
      ipcRenderer.on('trashblock:changed', handler)
      return () => { ipcRenderer.removeListener('trashblock:changed', handler) }
    }
  },
  xnext: {
    getState: () => ipcRenderer.invoke('xnext:getState'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('xnext:setEnabled', enabled),
    checkAvailable: () => ipcRenderer.invoke('xnext:checkAvailable'),
    onChanged: (cb: () => void) => {
      const handler = (_event: IpcRendererEvent) => cb()
      ipcRenderer.on('xnext:changed', handler)
      return () => { ipcRenderer.removeListener('xnext:changed', handler) }
    }
  },
  webbridge: {
    getSettings: () => ipcRenderer.invoke('webbridge:getSettings'),
    setEnabled: (on: boolean) => ipcRenderer.invoke('webbridge:setEnabled', on),
    setInstalled: (on: boolean) => ipcRenderer.invoke('webbridge:setInstalled', on),
    isInstalled: () => ipcRenderer.invoke('webbridge:isInstalled'),
    onChanged: (cb: () => void) => {
      const handler = (_event: IpcRendererEvent) => cb()
      ipcRenderer.on('webbridge:changed', handler)
      return () => { ipcRenderer.removeListener('webbridge:changed', handler) }
    }
  },
  betaChannel: {
    getSettings: () => ipcRenderer.invoke('betaChannel:getSettings'),
    setAllowPrerelease: (on: boolean) => ipcRenderer.invoke('betaChannel:setAllowPrerelease', on)
  }
})
