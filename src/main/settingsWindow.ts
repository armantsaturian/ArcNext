import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { onTrashblockChanged } from '../extensions/trashblock/main'
import { onXNextChanged } from '../extensions/xnext/main'
import { onSettingsChanged as onWebBridgeSettingsChanged } from '../extensions/webbridge/settings'

let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 560,
    minWidth: 420,
    minHeight: 400,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Settings',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/settingsPreload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  const unsubTrashblock = onTrashblockChanged(() => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('trashblock:changed')
    }
  })

  const unsubXNext = onXNextChanged(() => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('xnext:changed')
    }
  })

  const unsubWebBridge = onWebBridgeSettingsChanged(() => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('webbridge:changed')
    }
  })

  settingsWindow.on('closed', () => {
    unsubTrashblock()
    unsubXNext()
    unsubWebBridge()
    settingsWindow = null
  })

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html`)
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'))
  }
}
