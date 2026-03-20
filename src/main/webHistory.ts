import { app, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

interface WebEntry {
  url: string
  title: string
  faviconUrl: string
  visitCount: number
  lastVisit: number
}

const HISTORY_PATH = join(app.getPath('userData'), 'web-history.json')
const MAX_ENTRIES = 500

let entries: Map<string, WebEntry> = new Map()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hostname = u.hostname.toLowerCase()
    let normalized = u.toString()
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
    return normalized
  } catch {
    return url
  }
}

function isValidUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function frecencyScore(entry: WebEntry, now: number): number {
  const ageHours = (now - entry.lastVisit) / (1000 * 60 * 60)
  let recencyWeight: number
  if (ageHours < 1) recencyWeight = 4
  else if (ageHours < 24) recencyWeight = 2
  else if (ageHours < 7 * 24) recencyWeight = 1
  else recencyWeight = 0.5
  return Math.sqrt(entry.visitCount) * recencyWeight
}

function recordVisit(url: string, title?: string, faviconUrl?: string): void {
  if (!isValidUrl(url)) return
  const key = normalizeUrl(url)
  const existing = entries.get(key)
  if (existing) {
    existing.visitCount++
    existing.lastVisit = Date.now()
    if (title) existing.title = title
    if (faviconUrl) existing.faviconUrl = faviconUrl
  } else {
    entries.set(key, {
      url: key,
      title: title || '',
      faviconUrl: faviconUrl || '',
      visitCount: 1,
      lastVisit: Date.now()
    })
  }
  pruneIfNeeded()
  debouncedFlush()
}

function queryEntries(): Array<WebEntry & { score: number }> {
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
  for (const e of toRemove) entries.delete(e.url)
}

function loadFromDisk(): void {
  try {
    const raw = readFileSync(HISTORY_PATH, 'utf-8')
    const data = JSON.parse(raw)
    if (data.version === 1 && Array.isArray(data.entries)) {
      entries = new Map(data.entries.map((e: WebEntry) => [e.url, e]))
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

export function setupWebHistory(): void {
  loadFromDisk()

  ipcMain.handle('webHistory:visit', (_event, url: string, title?: string, faviconUrl?: string) => {
    recordVisit(url, title, faviconUrl)
  })

  ipcMain.handle('webHistory:query', () => {
    return queryEntries()
  })
}

export function flushWebHistorySync(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushToDisk()
}
