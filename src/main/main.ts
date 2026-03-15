import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { setupPTY, killAllPTY } from './pty'
import { setupDirHistory, flushDirHistorySync } from './dirHistory'

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

  ipcMain.on('sidebar:traffic-lights', (_e, visible: boolean) => {
    mainWindow?.setWindowButtonVisibility(visible)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('before-quit', () => {
  killAllPTY()
  flushDirHistorySync()
})

app.on('window-all-closed', () => {
  app.quit()
})
