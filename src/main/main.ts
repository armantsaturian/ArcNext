import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { setupPTY, killAllPTY } from './pty'
import { showQuitDialog } from './quitDialog'
import { setupDirHistory, flushDirHistorySync } from './dirHistory'
import { setupDirDiscovery } from './dirDiscovery'
import { setupWebHistory, flushWebHistorySync } from './webHistory'
import { setupPinnedWorkspaces, flushPinnedWorkspacesSync } from './pinnedWorkspaces'
import { hasFullDiskAccess, showFDADialog } from './fullDiskAccess'
import { setupBrowserViewManager, destroyAllBrowserViews } from './browserViewManager'
import { setupDictation, stopAllDictation } from './whisper/dictation'
import { setupAiRename } from './aiRename'
import { registerTrashblockScheme, setupTrashblock, flushTrashblockSync } from '../extensions/trashblock/main'
import { setupXNext, flushXNextSync, onXNextChanged } from '../extensions/xnext/main'
import { openSettingsWindow } from './settingsWindow'

// Prevent sites from detecting Electron as an automated browser
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

registerTrashblockScheme()

let mainWindow: BrowserWindow | null = null
let forceQuit = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    transparent: true,
    vibrancy: 'under-window',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false // required for node-pty IPC
    }
  })

  // Only allow media (microphone) permission requests from the renderer
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media')
  })

  mainWindow.on('close', (e) => {
    if (forceQuit) return

    e.preventDefault()
    showQuitDialog(mainWindow!).then((shouldQuit) => {
      if (shouldQuit) {
        forceQuit = true
        app.quit()
      }
    })
  })

  setupPTY(mainWindow)
  setupDirHistory()
  setupDirDiscovery()
  setupWebHistory()
  setupPinnedWorkspaces()
  setupBrowserViewManager(mainWindow)
  setupDictation(mainWindow)
  setupAiRename()
  setupXNext()

  onXNextChanged(() => {
    mainWindow!.webContents.send('xnext:changed')
  })

  const browserSession = session.fromPartition('persist:browser')
  setupTrashblock(browserSession, (url: string) => {
    mainWindow!.webContents.send('browser:openInNewWorkspace', url)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browser:openInNewWorkspace', url)
    }
    return { action: 'deny' }
  })

  ipcMain.on('sidebar:traffic-lights', (_e, visible: boolean) => {
    mainWindow?.setWindowButtonVisibility(visible)
  })

  ipcMain.on('app:hide', () => {
    mainWindow?.hide()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildApplicationMenu(): Menu {
  const editMenu = {
    label: 'Edit',
    submenu: [
      { role: 'undo' as const },
      { role: 'redo' as const },
      { type: 'separator' as const },
      { role: 'cut' as const },
      { role: 'copy' as const },
      { role: 'paste' as const },
      { role: 'selectAll' as const }
    ]
  }

  const viewMenu = {
    label: 'View',
    submenu: [
      { role: 'toggleDevTools' as const },
      { type: 'separator' as const },
      { role: 'togglefullscreen' as const }
    ]
  }

  const windowMenu = {
    label: 'Window',
    submenu: [
      { role: 'minimize' as const },
      ...(process.platform === 'darwin'
        ? [{ role: 'zoom' as const }, { type: 'separator' as const }, { role: 'front' as const }]
        : [{ role: 'close' as const }])
    ]
  }

  const template = process.platform === 'darwin'
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            {
              label: 'Settings\u2026',
              accelerator: 'CmdOrCtrl+,',
              click: () => openSettingsWindow()
            },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const }
          ]
        },
        editMenu,
        viewMenu,
        windowMenu
      ]
    : [editMenu, viewMenu, windowMenu]

  return Menu.buildFromTemplate(template)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildApplicationMenu())

  if (process.platform === 'darwin' && !hasFullDiskAccess()) {
    showFDADialog()
    return
  }

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
      if (response === 0) {
        forceQuit = true
        autoUpdater.quitAndInstall()
      }
    })
})

app.on('before-quit', () => {
  if (!forceQuit) return
  killAllPTY()
  stopAllDictation()
  destroyAllBrowserViews()
  flushDirHistorySync()
  flushWebHistorySync()
  flushPinnedWorkspacesSync()
  flushTrashblockSync()
  flushXNextSync()
})

app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
