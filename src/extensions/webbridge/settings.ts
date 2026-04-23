/**
 * Persisted user preference for the web-bridge installer toggle.
 *
 * Stored at userData/webbridge-settings.json. Default: disabled. User flips
 * the toggle in Settings → installer runs. App restart re-runs install while
 * the toggle is on (so symlink + docs stay fresh across app updates).
 *
 * IPC:
 *   - webbridge:getSettings         → { installed: boolean }
 *   - webbridge:setInstalled(on)    → install() or uninstall() + persist
 */

import { app, ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { install, uninstall, isInstalled } from './installer'

interface WebBridgeSettings {
  installed: boolean
}

const DEFAULTS: WebBridgeSettings = { installed: false }

let settings: WebBridgeSettings = { ...DEFAULTS }
let settingsPath = ''

function load(): void {
  settingsPath = join(app.getPath('userData'), 'webbridge-settings.json')
  if (!existsSync(settingsPath)) return
  try {
    settings = { ...DEFAULTS, ...JSON.parse(readFileSync(settingsPath, 'utf-8')) }
  } catch {
    /* use defaults */
  }
}

function save(): void {
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

export function getSettings(): WebBridgeSettings {
  return { ...settings }
}

export function setupWebBridgeSettings(): void {
  load()

  // On every app start: if the toggle is on, re-run install so the symlink
  // and agent docs are current (app updates, moved user home, etc.)
  if (settings.installed) {
    const result = install()
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('[webbridge/settings] install on boot failed:', result.errors)
    }
  }

  ipcMain.handle('webbridge:getSettings', () => getSettings())

  ipcMain.handle('webbridge:setInstalled', (_e, on: boolean) => {
    if (on) {
      const result = install()
      settings.installed = result.ok
      save()
      return { ok: result.ok, errors: result.errors, cliPath: result.cliPath, injected: result.injected }
    } else {
      const result = uninstall()
      settings.installed = false
      save()
      return { ok: result.ok, errors: result.errors, removed: result.removed, stripped: result.stripped }
    }
  })

  ipcMain.handle('webbridge:isInstalled', () => isInstalled())
}
