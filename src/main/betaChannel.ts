/**
 * Opt-in pre-release channel.
 *
 * When true, electron-updater reads `beta-mac.yml` from the GitHub release
 * and upgrades the user to pre-release builds as well as stable ones.
 * When false (default), only stable releases are visible.
 *
 * Stored at userData/beta-channel.json. This file existing (or the env var)
 * is effectively the "is this a beta tester" flag. Leaving a release as
 * `prerelease: true` on GitHub means only opted-in users see it.
 */

import { app, ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'

interface BetaSettings {
  allowPrerelease: boolean
}

const DEFAULTS: BetaSettings = { allowPrerelease: false }
let settings: BetaSettings = { ...DEFAULTS }
let settingsPath = ''

function load(): void {
  settingsPath = join(app.getPath('userData'), 'beta-channel.json')
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

export function getBetaSettings(): BetaSettings {
  return { ...settings }
}

export function setupBetaChannel(): void {
  load()

  // Env var override: useful for testing without touching the on-disk file.
  const envOverride = process.env.ARCNEXT_BETA === '1'
  const allow = settings.allowPrerelease || envOverride

  autoUpdater.allowPrerelease = allow
  // Also don't auto-download — we keep the existing prompt-to-install flow
  // intact so a beta update doesn't surprise a user mid-session.
  autoUpdater.autoDownload = true

  ipcMain.handle('betaChannel:getSettings', () => getBetaSettings())

  ipcMain.handle('betaChannel:setAllowPrerelease', (_e, on: boolean) => {
    settings.allowPrerelease = on
    save()
    autoUpdater.allowPrerelease = on || envOverride
    return { ok: true, allowPrerelease: autoUpdater.allowPrerelease }
  })
}
