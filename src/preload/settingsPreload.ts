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
    onChanged: (cb: () => void) => {
      const handler = (_event: IpcRendererEvent) => cb()
      ipcRenderer.on('xnext:changed', handler)
      return () => { ipcRenderer.removeListener('xnext:changed', handler) }
    }
  }
})
