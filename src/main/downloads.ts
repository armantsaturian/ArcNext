import { app, BrowserWindow, clipboard, ipcMain, nativeImage, shell } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import type { Dirent } from 'fs'
import { basename, extname, join, relative, resolve, sep } from 'path'
import { randomUUID } from 'crypto'
import { execFileSync } from 'child_process'
import { getBrowserSession } from './browserViewUtils'
import type { DownloadEntry } from '../shared/types'

const MAX_DOWNLOADS = 4
const THUMBNAIL_SIZE = 80
const FILE_ID_PREFIX = 'file:'
const TEMP_DOWNLOAD_SUFFIXES = ['.crdownload', '.download', '.part', '.tmp']

let win: BrowserWindow | null = null
let sessionWired = false
let handlersRegistered = false

const activeDownloads = new Map<string, DownloadEntry>()
const reservedSavePaths = new Set<string>()
const hiddenPaths = new Set<string>()
const thumbnailCache = new Map<string, { mtimeMs: number; dataUrl?: string }>()
const dateAddedCache = new Map<string, { ctimeMs: number; dateAddedMs: number }>()

function downloadsDir(): string {
  return app.getPath('downloads')
}

function isInsideDownloads(path: string): boolean {
  const rel = relative(resolve(downloadsDir()), resolve(path))
  return rel === '' || (!!rel && !rel.startsWith('..') && !rel.startsWith(sep))
}

function fileId(path: string): string {
  return `${FILE_ID_PREFIX}${path}`
}

function pathFromFileId(id: string): string | undefined {
  if (!id.startsWith(FILE_ID_PREFIX)) return undefined
  const path = id.slice(FILE_ID_PREFIX.length)
  return isInsideDownloads(path) ? path : undefined
}

function sortDownloads(entries: DownloadEntry[]): DownloadEntry[] {
  return entries.sort((a, b) => {
    const aTime = a.completedAt ?? a.startedAt
    const bTime = b.completedAt ?? b.startedAt
    return bTime - aTime
  })
}

function parseMdlsDate(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '(null)') return undefined
  const iso = trimmed
    .replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T')
    .replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2')
  const time = Date.parse(iso)
  return Number.isFinite(time) ? time : undefined
}

function fallbackDateAddedMs(path: string): number {
  try {
    const stat = statSync(path)
    const created = stat.birthtimeMs || 0
    return created > 0 ? created : stat.mtimeMs
  } catch {
    return Date.now()
  }
}

function loadDateAddedMap(paths: string[]): Map<string, number> {
  const result = new Map<string, number>()
  const uncached: string[] = []

  for (const path of paths) {
    try {
      const stat = statSync(path)
      const cached = dateAddedCache.get(path)
      if (cached && cached.ctimeMs === stat.ctimeMs) {
        result.set(path, cached.dateAddedMs)
      } else {
        uncached.push(path)
      }
    } catch {
      // File disappeared while scanning.
    }
  }

  if (uncached.length > 0 && process.platform === 'darwin') {
    try {
      const output = execFileSync('mdls', ['-raw', '-name', 'kMDItemDateAdded', ...uncached], {
        encoding: 'utf8',
        timeout: 1500,
        maxBuffer: 1024 * 1024
      })
      const values = output.split('\0')
      uncached.forEach((path, index) => {
        const dateAddedMs = parseMdlsDate(values[index] ?? '') ?? fallbackDateAddedMs(path)
        try {
          dateAddedCache.set(path, { ctimeMs: statSync(path).ctimeMs, dateAddedMs })
        } catch {
          // File disappeared while scanning.
        }
        result.set(path, dateAddedMs)
      })
    } catch {
      for (const path of uncached) {
        const dateAddedMs = fallbackDateAddedMs(path)
        try {
          dateAddedCache.set(path, { ctimeMs: statSync(path).ctimeMs, dateAddedMs })
        } catch {
          // File disappeared while scanning.
        }
        result.set(path, dateAddedMs)
      }
    }
  } else {
    for (const path of uncached) {
      const dateAddedMs = fallbackDateAddedMs(path)
      try {
        dateAddedCache.set(path, { ctimeMs: statSync(path).ctimeMs, dateAddedMs })
      } catch {
        // File disappeared while scanning.
      }
      result.set(path, dateAddedMs)
    }
  }

  return result
}

function safeDownloadFilename(filename: string): string {
  const base = basename(filename).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  return base || 'download'
}

function uniqueDownloadPath(filename: string): string {
  const dir = downloadsDir()
  const safeName = safeDownloadFilename(filename)
  const ext = extname(safeName)
  const stem = ext ? safeName.slice(0, -ext.length) : safeName

  for (let i = 0; i < 1000; i++) {
    const candidateName = i === 0 ? safeName : `${stem} (${i})${ext}`
    const candidate = join(dir, candidateName)
    if (!existsSync(candidate) && !reservedSavePaths.has(candidate)) {
      reservedSavePaths.add(candidate)
      return candidate
    }
  }

  const fallback = join(dir, `${stem}-${Date.now()}${ext}`)
  reservedSavePaths.add(fallback)
  return fallback
}

function shouldSkipDirent(dirent: Dirent): boolean {
  const name = dirent.name
  if (!dirent.isFile() && !dirent.isDirectory()) return true
  if (!name || name.startsWith('.')) return true
  const lower = name.toLowerCase()
  return TEMP_DOWNLOAD_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

async function thumbnailDataUrlForPath(path: string, mtimeMs: number): Promise<string | undefined> {
  const cached = thumbnailCache.get(path)
  if (cached && cached.mtimeMs === mtimeMs) return cached.dataUrl

  try {
    if (!existsSync(path)) return undefined
    const image = await nativeImage.createThumbnailFromPath(path, {
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE
    })
    const dataUrl = image.isEmpty() ? undefined : image.toDataURL()
    thumbnailCache.set(path, { mtimeMs, dataUrl })
    return dataUrl
  } catch {
    thumbnailCache.set(path, { mtimeMs, dataUrl: undefined })
    return undefined
  }
}

async function entryForPath(path: string, dateAddedMs = fallbackDateAddedMs(path)): Promise<DownloadEntry | undefined> {
  if (!isInsideDownloads(path) || !existsSync(path) || hiddenPaths.has(path)) return undefined

  try {
    const stat = statSync(path)
    if (!stat.isFile() && !stat.isDirectory()) return undefined
    const timestamp = dateAddedMs > 0 ? dateAddedMs : Date.now()
    return {
      id: fileId(path),
      filename: basename(path),
      path,
      url: '',
      mimeType: '',
      state: 'completed',
      receivedBytes: stat.isFile() ? stat.size : 0,
      totalBytes: stat.isFile() ? stat.size : 0,
      startedAt: timestamp,
      completedAt: timestamp,
      thumbnailDataUrl: await thumbnailDataUrlForPath(path, stat.mtimeMs)
    }
  } catch {
    return undefined
  }
}

async function scanRecentDownloads(limit: number): Promise<DownloadEntry[]> {
  let dirents: Dirent[] = []
  try {
    dirents = readdirSync(downloadsDir(), { withFileTypes: true })
  } catch {
    return []
  }

  const paths: string[] = []
  for (const dirent of dirents) {
    if (shouldSkipDirent(dirent)) continue
    const path = join(downloadsDir(), dirent.name)
    if (hiddenPaths.has(path) || reservedSavePaths.has(path)) continue
    try {
      const stat = statSync(path)
      if (stat.isFile() || stat.isDirectory()) paths.push(path)
    } catch {
      // File disappeared while scanning.
    }
  }

  const dateAddedByPath = loadDateAddedMap(paths)
  const candidates = paths.map((path) => ({
    path,
    time: dateAddedByPath.get(path) ?? fallbackDateAddedMs(path)
  }))
  candidates.sort((a, b) => b.time - a.time)

  const entries: DownloadEntry[] = []
  for (const candidate of candidates.slice(0, limit)) {
    const entry = await entryForPath(candidate.path, candidate.time)
    if (entry) entries.push(entry)
  }
  return entries
}

async function currentDownloads(): Promise<DownloadEntry[]> {
  const active = Array.from(activeDownloads.values()).filter((entry) => !hiddenPaths.has(entry.path))
  const scanned = await scanRecentDownloads(MAX_DOWNLOADS + active.length)
  const byPath = new Set(active.map((entry) => entry.path))
  return sortDownloads([
    ...active,
    ...scanned.filter((entry) => !byPath.has(entry.path))
  ]).slice(0, MAX_DOWNLOADS)
}

function emitDownloadsChanged(): void {
  if (!win || win.isDestroyed()) return
  const target = win
  void currentDownloads().then((entries) => {
    if (!target.isDestroyed()) target.webContents.send('downloads:changed', entries)
  })
}

function wireDownloadSession(): void {
  if (sessionWired) return
  sessionWired = true

  getBrowserSession().on('will-download', (_event, item) => {
    const filename = safeDownloadFilename(item.getFilename() || 'download')
    const savePath = uniqueDownloadPath(filename)
    item.setSavePath(savePath)

    const startedAtSeconds = item.getStartTime()
    const entry: DownloadEntry = {
      id: randomUUID(),
      filename,
      path: savePath,
      url: item.getURL(),
      mimeType: item.getMimeType(),
      state: 'progressing',
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      startedAt: startedAtSeconds > 0 ? startedAtSeconds * 1000 : Date.now()
    }

    activeDownloads.set(entry.id, entry)
    emitDownloadsChanged()

    let lastProgressEmit = 0
    item.on('updated', (_event, state) => {
      const current = activeDownloads.get(entry.id)
      if (!current) return

      activeDownloads.set(entry.id, {
        ...current,
        state: state === 'interrupted' ? 'interrupted' : 'progressing',
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes()
      })

      const now = Date.now()
      if (now - lastProgressEmit > 250) {
        lastProgressEmit = now
        emitDownloadsChanged()
      }
    })

    item.once('done', (_event, state) => {
      reservedSavePaths.delete(savePath)
      activeDownloads.delete(entry.id)
      if (state !== 'completed') hiddenPaths.delete(savePath)
      emitDownloadsChanged()
    })
  })
}

async function findDownload(id: string): Promise<DownloadEntry | undefined> {
  const active = activeDownloads.get(id)
  if (active && !hiddenPaths.has(active.path)) return active

  const path = pathFromFileId(id)
  if (!path) return undefined
  return entryForPath(path)
}

function registerIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true

  ipcMain.handle('downloads:list', () => currentDownloads())

  ipcMain.handle('downloads:openFolder', async () => {
    const error = await shell.openPath(downloadsDir())
    return { ok: !error, error: error || undefined }
  })

  ipcMain.handle('downloads:openFile', async (_event, id: string) => {
    const entry = await findDownload(id)
    if (!entry || entry.state !== 'completed') return { ok: false, error: 'Download is not available' }
    const error = await shell.openPath(entry.path)
    emitDownloadsChanged()
    return { ok: !error, error: error || undefined }
  })

  ipcMain.handle('downloads:showInFinder', async (_event, id: string) => {
    const entry = await findDownload(id)
    if (!entry || entry.state !== 'completed') return { ok: false, error: 'Download is not available' }
    shell.showItemInFolder(entry.path)
    emitDownloadsChanged()
    return { ok: true }
  })

  ipcMain.handle('downloads:copyPath', async (_event, id: string) => {
    const entry = await findDownload(id)
    if (!entry) return { ok: false, error: 'Download is not available' }
    clipboard.writeText(entry.path)
    return { ok: true }
  })

  ipcMain.handle('downloads:remove', async (_event, id: string) => {
    const entry = await findDownload(id)
    if (entry) hiddenPaths.add(entry.path)
    activeDownloads.delete(id)
    emitDownloadsChanged()
    return { ok: true }
  })
}

export function setupDownloads(mainWindow: BrowserWindow): void {
  win = mainWindow
  wireDownloadSession()
  registerIpcHandlers()
}

export function flushDownloadsSync(): void {
  // The tray is backed by ~/Downloads now, with no persisted ArcNext-only history.
}
