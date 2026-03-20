import { app, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { PinnedWorkspaceEntry } from '../shared/types'

const FILE_PATH = join(app.getPath('userData'), 'pinned-workspaces.json')

let workspaces: PinnedWorkspaceEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function loadFromDisk(): PinnedWorkspaceEntry[] {
  try {
    const raw = readFileSync(FILE_PATH, 'utf-8')
    const data = JSON.parse(raw)
    if (data.version === 1 && Array.isArray(data.workspaces)) {
      workspaces = data.workspaces
      return workspaces
    }
  } catch {
    // file doesn't exist or is corrupt — start fresh
  }
  return []
}

function flushToDisk(): void {
  const data = { version: 1, workspaces }
  try {
    writeFileSync(FILE_PATH, JSON.stringify(data), 'utf-8')
  } catch {
    // don't crash on write failure
  }
}

function debouncedFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => flushToDisk(), 5000)
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
    flushToDisk()
    event.returnValue = true
  })
}

export function flushPinnedWorkspacesSync(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushToDisk()
}
