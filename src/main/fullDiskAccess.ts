import { BrowserWindow, ipcMain, shell, app } from 'electron'
import { join } from 'path'
import { accessSync, constants } from 'fs'
import { homedir } from 'os'

const TEST_PATHS = [
  join(homedir(), 'Library', 'Safari', 'CloudTabs.db'),
  join(homedir(), 'Library', 'Safari', 'Bookmarks.plist'),
  join(homedir(), 'Library', 'Safari')
]

export function hasFullDiskAccess(): boolean {
  for (const p of TEST_PATHS) {
    try {
      accessSync(p, constants.R_OK)
      return true
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      return false
    }
  }
  // None of the test paths exist — can't determine, assume granted
  return true
}

export function showFDADialog(): void {
  const win = new BrowserWindow({
    width: 440,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/fdaDialogPreload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  function onOpenSettings(): void {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
  }

  function onCheckAccess(): void {
    if (hasFullDiskAccess()) {
      win.webContents.send('fda-dialog:granted')
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 1500)
    } else {
      win.webContents.send('fda-dialog:not-granted')
    }
  }

  ipcMain.on('fda-dialog:openSettings', onOpenSettings)
  ipcMain.on('fda-dialog:checkAccess', onCheckAccess)

  win.on('closed', () => {
    ipcMain.removeListener('fda-dialog:openSettings', onOpenSettings)
    ipcMain.removeListener('fda-dialog:checkAccess', onCheckAccess)
  })

  win.once('ready-to-show', () => {
    win.center()
    win.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/fda-dialog.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/fda-dialog.html'))
  }
}
