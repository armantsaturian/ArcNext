import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('quitDialog', {
  quit: () => ipcRenderer.send('quit-dialog:quit'),
  cancel: () => ipcRenderer.send('quit-dialog:cancel')
})
