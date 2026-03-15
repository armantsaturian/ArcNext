import { app, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

interface DirEntry {
  path: string
  visitCount: number
  lastVisit: number
}

const HISTORY_PATH = join(app.getPath('userData'), 'dir-history.json')
const MAX_ENTRIES = 500

let entries: Map<string, DirEntry> = new Map()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function frecencyScore(entry: DirEntry, now: number): number {
  const ageHours = (now - entry.lastVisit) / (1000 * 60 * 60)
  let recencyWeight: number
  if (ageHours < 1) recencyWeight = 4
  else if (ageHours < 24) recencyWeight = 2
  else if (ageHours < 7 * 24) recencyWeight = 1
  else recencyWeight = 0.5
  return Math.sqrt(entry.visitCount) * recencyWeight
}

function recordVisit(path: string): void {
  const existing = entries.get(path)
  if (existing) {
    existing.visitCount++
    existing.lastVisit = Date.now()
  } else {
    entries.set(path, { path, visitCount: 1, lastVisit: Date.now() })
  }
  pruneIfNeeded()
  debouncedFlush()
}

function queryEntries(): Array<DirEntry & { score: number }> {
  const now = Date.now()
  return [...entries.values()]
    .map((e) => ({ ...e, score: frecencyScore(e, now) }))
    .sort((a, b) => b.score - a.score)
}

function pruneIfNeeded(): void {
  if (entries.size <= MAX_ENTRIES) return
  const now = Date.now()
  const sorted = [...entries.values()]
    .map((e) => ({ ...e, score: frecencyScore(e, now) }))
    .sort((a, b) => a.score - b.score)
  const toRemove = sorted.slice(0, sorted.length - MAX_ENTRIES)
  for (const e of toRemove) entries.delete(e.path)
}

function loadFromDisk(): void {
  try {
    const raw = readFileSync(HISTORY_PATH, 'utf-8')
    const data = JSON.parse(raw)
    if (data.version === 1 && Array.isArray(data.entries)) {
      entries = new Map(data.entries.map((e: DirEntry) => [e.path, e]))
    }
  } catch {
    // file doesn't exist or is corrupt — start fresh
  }
}

function flushToDisk(): void {
  const data = { version: 1, entries: [...entries.values()] }
  try {
    writeFileSync(HISTORY_PATH, JSON.stringify(data), 'utf-8')
  } catch {
    // don't crash on write failure
  }
}

function debouncedFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => flushToDisk(), 5000)
}

export function setupDirHistory(): void {
  loadFromDisk()

  ipcMain.handle('dirHistory:visit', (_event, path: string) => {
    recordVisit(path)
  })

  ipcMain.handle('dirHistory:query', () => {
    return queryEntries()
  })
}

export function flushDirHistorySync(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushToDisk()
}
