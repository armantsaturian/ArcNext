import { app, ipcMain } from 'electron'
import { join } from 'path'
import { FrecencyStore } from './frecencyStore'

interface StoredDirEntry {
  path: string
  visitCount: number
  lastVisit: number
}

const store = new FrecencyStore<StoredDirEntry>({
  filePath: join(app.getPath('userData'), 'dir-history.json'),
  maxEntries: 500,
  keyFn: (e) => e.path
})

function recordVisit(path: string): void {
  const existing = store.get(path)
  if (existing) {
    existing.visitCount++
    existing.lastVisit = Date.now()
    store.set(path, existing)
  } else {
    store.set(path, { path, visitCount: 1, lastVisit: Date.now() })
  }
}

export function setupDirHistory(): void {
  store.load()

  ipcMain.handle('dirHistory:visit', (_event, path: string) => {
    recordVisit(path)
  })

  ipcMain.handle('dirHistory:query', () => {
    return store.query()
  })
}

export function flushDirHistorySync(): void {
  store.flushSync()
}
