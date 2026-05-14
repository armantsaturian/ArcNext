import { app, ipcMain } from 'electron'
import { join } from 'path'
import { FrecencyStore } from './frecencyStore'
import { readShellHistory, type ShellCommandEntry } from './shellHistory'
import type { CommandEntry } from '../shared/types'

interface StoredCommandEntry {
  command: string
  visitCount: number
  lastVisit: number
}

const store = new FrecencyStore<StoredCommandEntry>({
  filePath: join(app.getPath('userData'), 'command-history.json'),
  maxEntries: 200,
  keyFn: (e) => e.command
})

function normalizeCommand(command: string): string {
  return command.trim()
}

function recordVisit(command: string): void {
  const normalized = normalizeCommand(command)
  if (!normalized) return

  const existing = store.get(normalized)
  if (existing) {
    existing.visitCount++
    existing.lastVisit = Date.now()
    store.set(normalized, existing)
  } else {
    store.set(normalized, { command: normalized, visitCount: 1, lastVisit: Date.now() })
  }
}

function commandScore(entry: { visitCount: number; lastVisit: number }, now = Date.now()): number {
  const ageHours = (now - entry.lastVisit) / (1000 * 60 * 60)
  let recencyWeight: number
  if (ageHours < 1) recencyWeight = 4
  else if (ageHours < 24) recencyWeight = 2
  else if (ageHours < 7 * 24) recencyWeight = 1
  else recencyWeight = 0.5
  return Math.sqrt(entry.visitCount) * recencyWeight
}

function mergeCommandEntries(
  appEntries: CommandEntry[],
  shellEntries: ShellCommandEntry[]
): CommandEntry[] {
  const now = Date.now()
  const merged = new Map<string, CommandEntry>()

  for (const entry of shellEntries) {
    merged.set(entry.command, {
      ...entry,
      // Slightly discount imported shell history so commands launched from the
      // picker can quickly float above generic terminal history.
      score: commandScore(entry, now) * 0.8
    })
  }

  for (const entry of appEntries) {
    const existing = merged.get(entry.command)
    if (existing) {
      merged.set(entry.command, {
        command: entry.command,
        visitCount: entry.visitCount + existing.visitCount,
        lastVisit: Math.max(entry.lastVisit, existing.lastVisit),
        score: entry.score + existing.score
      })
    } else {
      merged.set(entry.command, entry)
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score)
}

export function setupCommandHistory(): void {
  store.load()

  ipcMain.handle('commandHistory:visit', (_event, command: string) => {
    recordVisit(command)
  })

  ipcMain.handle('commandHistory:query', () => {
    return mergeCommandEntries(store.query(), readShellHistory())
  })
}

export function flushCommandHistorySync(): void {
  store.flushSync()
}
