import { app, ipcMain } from 'electron'
import { join } from 'path'
import { FrecencyStore } from './frecencyStore'
import { normalizeUrl, isValidUrl } from '../shared/urlUtils'

interface StoredWebEntry {
  url: string
  title: string
  faviconUrl: string
  visitCount: number
  lastVisit: number
}

const store = new FrecencyStore<StoredWebEntry>({
  filePath: join(app.getPath('userData'), 'web-history.json'),
  maxEntries: 500,
  keyFn: (e) => e.url
})

function recordVisit(url: string, title?: string, faviconUrl?: string): void {
  if (!isValidUrl(url)) return
  const key = normalizeUrl(url)
  const existing = store.get(key)
  if (existing) {
    existing.visitCount++
    existing.lastVisit = Date.now()
    if (title) existing.title = title
    if (faviconUrl) existing.faviconUrl = faviconUrl
    store.set(key, existing)
  } else {
    store.set(key, {
      url: key,
      title: title || '',
      faviconUrl: faviconUrl || '',
      visitCount: 1,
      lastVisit: Date.now()
    })
  }
}

export function setupWebHistory(): void {
  store.load()

  ipcMain.handle('webHistory:visit', (_event, url: string, title?: string, faviconUrl?: string) => {
    recordVisit(url, title, faviconUrl)
  })

  ipcMain.handle('webHistory:query', () => {
    return store.query()
  })
}

export function flushWebHistorySync(): void {
  store.flushSync()
}
