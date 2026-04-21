import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { XNextData } from './types'

const DEFAULTS: XNextData = { enabled: true }

let data: XNextData = { ...DEFAULTS }
let storePath = ''
const changeListeners = new Set<() => void>()

function load(): void {
  storePath = join(app.getPath('userData'), 'xnext.json')
  if (!existsSync(storePath)) return
  try {
    data = { ...DEFAULTS, ...JSON.parse(readFileSync(storePath, 'utf-8')) }
  } catch { /* use defaults */ }
}

function save(): void {
  writeFileSync(storePath, JSON.stringify(data, null, 2))
}

function notifyChanged(): void {
  for (const fn of changeListeners) fn()
}

export function setupXNext(): void {
  load()

  ipcMain.handle('xnext:getState', () => ({ enabled: data.enabled }))

  ipcMain.handle('xnext:setEnabled', (_e, enabled: boolean) => {
    data.enabled = enabled
    save()
    notifyChanged()
  })
}

export function onXNextChanged(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => { changeListeners.delete(listener) }
}

export function flushXNextSync(): void {
  if (!storePath) return
  save()
}
