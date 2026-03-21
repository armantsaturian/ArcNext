import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

let dialogWindow: BrowserWindow | null = null

export function showQuitDialog(parent: BrowserWindow): Promise<boolean> {
  if (dialogWindow && !dialogWindow.isDestroyed()) {
    dialogWindow.focus()
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    const bounds = parent.getBounds()
    const width = 400
    const height = 260

    dialogWindow = new BrowserWindow({
      width,
      height,
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y + (bounds.height - height) / 2),
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      frame: false,
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      parent,
      modal: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/quitDialogPreload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    let resolved = false
    function done(shouldQuit: boolean): void {
      if (resolved) return
      resolved = true
      ipcMain.removeListener('quit-dialog:quit', onQuit)
      ipcMain.removeListener('quit-dialog:cancel', onCancel)
      if (dialogWindow && !dialogWindow.isDestroyed()) {
        dialogWindow.close()
      }
      dialogWindow = null
      resolve(shouldQuit)
    }

    function onQuit(): void { done(true) }
    function onCancel(): void { done(false) }

    ipcMain.once('quit-dialog:quit', onQuit)
    ipcMain.once('quit-dialog:cancel', onCancel)

    dialogWindow.on('closed', () => done(false))

    dialogWindow.once('ready-to-show', () => {
      dialogWindow?.show()
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      dialogWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/quit-dialog.html`)
    } else {
      dialogWindow.loadFile(join(__dirname, '../renderer/quit-dialog.html'))
    }
  })
}
