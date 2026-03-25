import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('fdaDialog', {
  openSettings: () => ipcRenderer.send('fda-dialog:openSettings'),
  checkAccess: () => ipcRenderer.send('fda-dialog:checkAccess'),
  onGranted: (cb: () => void) => ipcRenderer.on('fda-dialog:granted', () => cb()),
  onNotGranted: (cb: () => void) => ipcRenderer.on('fda-dialog:not-granted', () => cb())
})
