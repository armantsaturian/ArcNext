/**
 * Persisted user preferences for the web bridge.
 *
 * Stored at userData/webbridge-settings.json. Two toggles, both default OFF:
 *   - enabled: master switch. OFF = no socket server, bridge entirely inert.
 *              Existing panes keep working, agents simply can't reach them.
 *   - installed: writes the arcnext-bridge CLI + agent docs into the user's
 *                ~/.local/bin and ~/.{claude,codex,config/opencode}/...
 *                This is what makes the CLI discoverable from any shell and
 *                what teaches agents about it.
 *
 * `installed` only makes sense when `enabled` is true; the UI enforces that.
 *
 * IPC surface:
 *   webbridge:getSettings        → { enabled, installed }
 *   webbridge:setEnabled(on)     → flips enabled, persists, emits changed
 *   webbridge:setInstalled(on)   → install() or uninstall() + persist
 *   webbridge:isInstalled        → probes disk, not the toggle
 */

import { app, ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { install, uninstall, isInstalled } from './installer'

interface WebBridgeSettings {
  enabled: boolean
  installed: boolean
}

const DEFAULTS: WebBridgeSettings = { enabled: false, installed: false }

let settings: WebBridgeSettings = { ...DEFAULTS }
let settingsPath = ''

type ChangeListener = (next: WebBridgeSettings) => void
const listeners = new Set<ChangeListener>()

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
  for (const fn of listeners) {
    try { fn(getSettings()) } catch { /* ignore */ }
  }
}

export function getSettings(): WebBridgeSettings {
  return { ...settings }
}

export function onSettingsChanged(fn: ChangeListener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function setupWebBridgeSettings(): void {
  load()

  // On every app start: if `installed` is on, re-run install so the symlink
  // and agent docs are current (app updates, moved user home, etc.)
  // This runs regardless of `enabled` — `installed` is independent disk state
  // the user asked for; `enabled` only gates the running server.
  if (settings.installed) {
    const result = install()
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('[webbridge/settings] install on boot failed:', result.errors)
    }
  }

  ipcMain.handle('webbridge:getSettings', () => getSettings())

  ipcMain.handle('webbridge:setEnabled', (_e, on: boolean) => {
    settings.enabled = on
    save()
    return { ok: true }
  })

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
