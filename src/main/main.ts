import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { setupPTY, killAllPTY } from './pty'
import { setupDirHistory, flushDirHistorySync } from './dirHistory'
import { setupWebHistory, flushWebHistorySync } from './webHistory'
import { setupPinnedWorkspaces, flushPinnedWorkspacesSync } from './pinnedWorkspaces'
import { setupBrowserViewManager, destroyAllBrowserViews, adoptView, releaseView } from './browserViewManager'
import {
  createExternalBrowserWindow,
  createExternalBrowserWindowFromView,
  getExternalShellState,
  listExternalWindows,
  dockExternalWindow,
  closeAllExternalWindows,
  requestDockForShellWebContents,
  setDockRequestHandler
} from './externalBrowserWindows'
import type { BrowserDockedPayload } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let forceQuit = false

function emitDocked(payload: BrowserDockedPayload): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('browser:docked', payload)
}

function dockExternalWindowIntoWorkspace(windowId: number): BrowserDockedPayload | null {
  const result = dockExternalWindow(windowId)
  if (!result) return null

  const { view, url, title } = result
  const paneId = randomUUID()
  adoptView(paneId, view)

  const payload: BrowserDockedPayload = { paneId, url, title }
  emitDocked(payload)
  return payload
}

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

  mainWindow.on('close', (e) => {
    if (forceQuit) return

    e.preventDefault()
    dialog
      .showMessageBox(mainWindow!, {
        type: 'question',
        buttons: ['Quit', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: 'Are you sure you want to quit?',
        detail: 'All terminal sessions will be closed.'
      })
      .then(({ response }) => {
        if (response === 0) {
          forceQuit = true
          app.quit()
        }
      })
  })

  setupPTY(mainWindow)
  setupDirHistory()
  setupWebHistory()
  setupPinnedWorkspaces()
  setupBrowserViewManager(mainWindow)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    createExternalBrowserWindow(url)
    return { action: 'deny' }
  })

  ipcMain.handle('browser:listExternalWindows', () => listExternalWindows())

  ipcMain.handle('browser:dockWindow', (_e, windowId: number) => {
    return dockExternalWindowIntoWorkspace(windowId)
  })

  ipcMain.handle('browser:undock', (_e, paneId: string) => {
    const view = releaseView(paneId)
    if (!view) return false
    createExternalBrowserWindowFromView(view)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browser:undocked', { paneId })
    }
    return true
  })

  ipcMain.handle('externalBrowser:getState', (event) => {
    return getExternalShellState(event.sender)
  })

  ipcMain.on('externalBrowser:dockCurrentWindow', (event) => {
    requestDockForShellWebContents(event.sender)
  })

  // Handle native dock requests from external window menu/shortcut.
  setDockRequestHandler((windowId: number) => {
    dockExternalWindowIntoWorkspace(windowId)
  })

  ipcMain.on('sidebar:traffic-lights', (_e, visible: boolean) => {
    mainWindow?.setWindowButtonVisibility(visible)
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
      { role: 'resetZoom' as const },
      { role: 'zoomIn' as const },
      { role: 'zoomOut' as const },
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
  destroyAllBrowserViews()
  closeAllExternalWindows()
  flushDirHistorySync()
  flushWebHistorySync()
  flushPinnedWorkspacesSync()
})

app.on('window-all-closed', () => {
  app.quit()
})
