import { readFileSync, writeFileSync } from 'fs'

interface FrecencyEntry {
  visitCount: number
  lastVisit: number
}

function frecencyScore(entry: FrecencyEntry, now: number): number {
  const ageHours = (now - entry.lastVisit) / (1000 * 60 * 60)
  let recencyWeight: number
  if (ageHours < 1) recencyWeight = 4
  else if (ageHours < 24) recencyWeight = 2
  else if (ageHours < 7 * 24) recencyWeight = 1
  else recencyWeight = 0.5
  return Math.sqrt(entry.visitCount) * recencyWeight
}

export class FrecencyStore<T extends FrecencyEntry> {
  private entries: Map<string, T> = new Map()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly filePath: string
  private readonly maxEntries: number
  private readonly keyFn: (entry: T) => string

  constructor(opts: { filePath: string; maxEntries: number; keyFn: (entry: T) => string }) {
    this.filePath = opts.filePath
    this.maxEntries = opts.maxEntries
    this.keyFn = opts.keyFn
  }

  load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw)
      if (data.version === 1 && Array.isArray(data.entries)) {
        this.entries = new Map(data.entries.map((e: T) => [this.keyFn(e), e]))
      }
    } catch {
      // file doesn't exist or is corrupt — start fresh
    }
  }

  get(key: string): T | undefined {
    return this.entries.get(key)
  }

  set(key: string, entry: T): void {
    this.entries.set(key, entry)
    this.prune()
    this.debouncedFlush()
  }

  query(): Array<T & { score: number }> {
    const now = Date.now()
    return [...this.entries.values()]
      .map((e) => ({ ...e, score: frecencyScore(e, now) }))
      .sort((a, b) => b.score - a.score)
  }

  flushSync(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flush()
  }

  private prune(): void {
    if (this.entries.size <= this.maxEntries) return
    const now = Date.now()
    const sorted = [...this.entries.values()]
      .map((e) => ({ ...e, score: frecencyScore(e, now) }))
      .sort((a, b) => a.score - b.score)
    const toRemove = sorted.slice(0, sorted.length - this.maxEntries)
    for (const e of toRemove) this.entries.delete(this.keyFn(e))
  }

  private flush(): void {
    const data = { version: 1, entries: [...this.entries.values()] }
    try {
      writeFileSync(this.filePath, JSON.stringify(data), 'utf-8')
    } catch {
      // don't crash on write failure
    }
  }

  private debouncedFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => this.flush(), 5000)
  }
}
