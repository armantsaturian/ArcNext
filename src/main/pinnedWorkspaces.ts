import { app, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, writeFile, existsSync } from 'fs'
import { gzipSync, gunzipSync, gzip } from 'zlib'
import type { PinnedWorkspaceEntry } from '../shared/types'

const FILE_PATH = join(app.getPath('userData'), 'pinned-workspaces.json.gz')
const LEGACY_PATH = join(app.getPath('userData'), 'pinned-workspaces.json')

let workspaces: PinnedWorkspaceEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function loadFromDisk(): PinnedWorkspaceEntry[] {
  try {
    // Try compressed file first
    if (existsSync(FILE_PATH)) {
      const compressed = readFileSync(FILE_PATH)
      const raw = gunzipSync(compressed).toString('utf-8')
      const data = JSON.parse(raw)
      if (data.version === 1 && Array.isArray(data.workspaces)) {
        workspaces = data.workspaces
        return workspaces
      }
    }
    // Fall back to legacy uncompressed file
    if (existsSync(LEGACY_PATH)) {
      const raw = readFileSync(LEGACY_PATH, 'utf-8')
      const data = JSON.parse(raw)
      if (data.version === 1 && Array.isArray(data.workspaces)) {
        workspaces = data.workspaces
        return workspaces
      }
    }
  } catch {
    // file doesn't exist or is corrupt — start fresh
  }
  return []
}

/** Sync flush — used for beforeunload and app quit where we can't await. */
function flushToDiskSync(): void {
  const json = JSON.stringify({ version: 1, workspaces })
  try {
    const compressed = gzipSync(json, { level: 1 })
    writeFileSync(FILE_PATH, compressed)
  } catch {
    // don't crash on write failure
  }
}

/** Async flush — used for debounced saves to avoid blocking main process. */
function flushToDiskAsync(): void {
  const json = JSON.stringify({ version: 1, workspaces })
  gzip(json, { level: 1 }, (err, compressed) => {
    if (err) return
    writeFile(FILE_PATH, compressed, () => {})
  })
}

function debouncedFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => flushToDiskAsync(), 5000)
}

export function setupPinnedWorkspaces(): void {
  loadFromDisk()

  ipcMain.handle('pinnedWorkspaces:load', () => {
    return workspaces
  })

  ipcMain.handle('pinnedWorkspaces:save', (_event, data: PinnedWorkspaceEntry[]) => {
    workspaces = data
    debouncedFlush()
  })

  // Synchronous save for beforeunload — guarantees data is written before window closes
  ipcMain.on('pinnedWorkspaces:saveSync', (event, data: PinnedWorkspaceEntry[]) => {
    workspaces = data
    if (flushTimer) clearTimeout(flushTimer)
    flushToDiskSync()
    event.returnValue = true
  })
}

export function flushPinnedWorkspacesSync(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushToDiskSync()
}
