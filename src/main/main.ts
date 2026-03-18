import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { setupPTY, killAllPTY } from './pty'
import { setupDirHistory, flushDirHistorySync } from './dirHistory'
import { setupBrowserViewManager, destroyAllBrowserViews } from './browserViewManager'
import { createExternalBrowserWindow, listExternalWindows, dockExternalWindow, closeAllExternalWindows } from './externalBrowserWindows'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#121212',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false // required for node-pty IPC
    }
  })

  setupPTY(mainWindow)
  setupDirHistory()
  setupBrowserViewManager(mainWindow)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    createExternalBrowserWindow(url)
    return { action: 'deny' }
  })

  ipcMain.handle('browser:listExternalWindows', () => listExternalWindows())
  ipcMain.handle('browser:dockWindow', (_e, windowId: number) => dockExternalWindow(windowId))

  ipcMain.on('sidebar:traffic-lights', (_e, visible: boolean) => {
    mainWindow?.setWindowButtonVisibility(visible)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  autoUpdater.checkForUpdatesAndNotify()
})

autoUpdater.on('update-downloaded', (info) => {
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `v${info.version} has been downloaded. Restart to apply it.`,
      buttons: ['Restart', 'Later']
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
})

app.on('before-quit', () => {
  killAllPTY()
  destroyAllBrowserViews()
  closeAllExternalWindows()
  flushDirHistorySync()
})

app.on('window-all-closed', () => {
  app.quit()
})
