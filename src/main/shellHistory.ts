import { readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'

export interface ShellCommandEntry {
  command: string
  visitCount: number
  lastVisit: number
}

function shellHistoryScore(entry: ShellCommandEntry, now: number): number {
  const ageHours = (now - entry.lastVisit) / (1000 * 60 * 60)
  let recencyWeight: number
  if (ageHours < 1) recencyWeight = 4
  else if (ageHours < 24) recencyWeight = 2
  else if (ageHours < 7 * 24) recencyWeight = 1
  else recencyWeight = 0.5
  return Math.sqrt(entry.visitCount) * recencyWeight
}

function normalizeCommand(command: string): string {
  return command.trim()
}

function addEntry(
  entries: Map<string, ShellCommandEntry>,
  command: string,
  lastVisit: number
): void {
  const normalized = normalizeCommand(command)
  if (!normalized) return
  const existing = entries.get(normalized)
  if (existing) {
    existing.visitCount++
    existing.lastVisit = Math.max(existing.lastVisit, lastVisit)
  } else {
    entries.set(normalized, { command: normalized, visitCount: 1, lastVisit })
  }
}

export function parseZshHistory(raw: string, fallbackTimestamp: number): ShellCommandEntry[] {
  const entries = new Map<string, ShellCommandEntry>()
  const lines = raw.split(/\r?\n/)

  lines.forEach((line, index) => {
    const fallback = fallbackTimestamp - Math.max(0, lines.length - index - 1) * 1000
    const extended = line.match(/^: (\d+):\d+;(.*)$/)
    if (extended) {
      addEntry(entries, extended[2], Number(extended[1]) * 1000)
    } else {
      addEntry(entries, line, fallback)
    }
  })

  return [...entries.values()]
}

export function parsePlainShellHistory(raw: string, fallbackTimestamp: number): ShellCommandEntry[] {
  const entries = new Map<string, ShellCommandEntry>()
  const lines = raw.split(/\r?\n/)

  lines.forEach((line, index) => {
    const fallback = fallbackTimestamp - Math.max(0, lines.length - index - 1) * 1000
    addEntry(entries, line, fallback)
  })

  return [...entries.values()]
}

function defaultHistoryFiles(): string[] {
  const home = homedir()
  const files = [
    process.env.HISTFILE,
    join(home, '.zsh_history'),
    join(home, '.bash_history')
  ].filter((p): p is string => !!p)

  return [...new Set(files)]
}

export function rankShellHistoryEntries(
  entries: ShellCommandEntry[],
  limit = 2_000,
  now = Date.now()
): ShellCommandEntry[] {
  return [...entries]
    .sort((a, b) => shellHistoryScore(b, now) - shellHistoryScore(a, now))
    .slice(0, limit)
}

export function readShellHistory(limit = 2_000): ShellCommandEntry[] {
  const entries = new Map<string, ShellCommandEntry>()

  for (const filePath of defaultHistoryFiles()) {
    try {
      const stat = statSync(filePath)
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = basename(filePath).includes('zsh')
        ? parseZshHistory(raw, stat.mtimeMs)
        : parsePlainShellHistory(raw, stat.mtimeMs)

      for (const entry of parsed) {
        addEntry(entries, entry.command, entry.lastVisit)
      }
    } catch {
      // Missing or unreadable shell history is fine — ArcNext has its own
      // command history too.
    }
  }

  return rankShellHistoryEntries([...entries.values()], limit)
}
