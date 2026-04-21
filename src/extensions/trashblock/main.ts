import { app, protocol, ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { TrashblockData } from './types'

const UNLOCK_DURATION_MS = 10 * 60 * 1000

const DEFAULTS: TrashblockData = {
  enabled: true,
  blockedSites: [],
  unlockPhrase: 'I should be working on something productive',
  unlockedSites: {},
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  daysConfigured: false
}

let data: TrashblockData = { ...DEFAULTS }
let storePath = ''
const reblockTimers = new Map<string, NodeJS.Timeout>()
let midnightTimer: NodeJS.Timeout | null = null
let openUrlFn: ((url: string) => void) | null = null
let pendingPhrase: string | null = null
let pendingDays: number[] | null = null
const changeListeners = new Set<() => void>()

function load(): void {
  storePath = join(app.getPath('userData'), 'trashblock.json')
  if (!existsSync(storePath)) return
  try {
    data = { ...DEFAULTS, ...JSON.parse(readFileSync(storePath, 'utf-8')) }
  } catch { /* use defaults */ }
}

function save(): void {
  writeFileSync(storePath, JSON.stringify(data, null, 2))
}

function notifyChanged(): void {
  for (const fn of changeListeners) fn()
}

function cleanDomain(input: string): string {
  let d = input.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.replace(/\/.*$/, '')
  d = d.replace(/:\d+$/, '')
  return d
}

function matchBlockedDomain(hostname: string): string | null {
  for (const domain of data.blockedSites) {
    if (hostname === domain || hostname.endsWith('.' + domain)) return domain
  }
  return null
}

function isUnlocked(domain: string): boolean {
  const expiry = data.unlockedSites[domain]
  if (!expiry) return false
  if (expiry > Date.now()) return true
  delete data.unlockedSites[domain]
  save()
  return false
}

function isTodayActive(): boolean {
  return data.activeDays.includes(new Date().getDay())
}

function scheduleReblock(domain: string, expiry: number): void {
  const existing = reblockTimers.get(domain)
  if (existing) clearTimeout(existing)
  const delay = expiry - Date.now()
  if (delay <= 0) return
  reblockTimers.set(domain, setTimeout(() => {
    delete data.unlockedSites[domain]
    save()
    reblockTimers.delete(domain)
    notifyChanged()
  }, delay))
}

function scheduleMidnightSync(): void {
  if (midnightTimer) clearTimeout(midnightTimer)
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 10, 0)
  midnightTimer = setTimeout(() => {
    cleanExpiredUnlocks()
    save()
    notifyChanged()
    scheduleMidnightSync()
  }, midnight.getTime() - now.getTime())
}

function cleanExpiredUnlocks(): void {
  const now = Date.now()
  for (const [domain, expiry] of Object.entries(data.unlockedSites)) {
    if (expiry <= now) {
      delete data.unlockedSites[domain]
      const timer = reblockTimers.get(domain)
      if (timer) { clearTimeout(timer); reblockTimers.delete(domain) }
    }
  }
}

function normalizeQuotes(str: string): string {
  return str
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
}

function normalizeText(str: string): string {
  return str.replace(/\s+/g, ' ').trim()
}

function handleProtocol(request: Request): Response {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/api/')) return handleApi(url)

  const fileName = url.pathname === '/'
    ? 'index.html'
    : url.pathname.replace(/^\/blocked\//, '').replace(/^\//, '')
  const filePath = join(__dirname, 'extensions', 'trashblock', 'blockPage', fileName)

  try {
    const content = readFileSync(filePath)
    const ext = fileName.substring(fileName.lastIndexOf('.'))
    const mime: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8'
    }
    return new Response(content, {
      headers: { 'Content-Type': mime[ext] || 'application/octet-stream' }
    })
  } catch {
    return new Response('Not Found', { status: 404 })
  }
}

function handleApi(url: URL): Response {
  const endpoint = url.pathname.replace('/api/', '')

  switch (endpoint) {
    case 'phrase':
      return json({ phrase: data.unlockPhrase })

    case 'unlock': {
      const site = url.searchParams.get('site')
      if (site) {
        const expiry = Date.now() + UNLOCK_DURATION_MS
        data.unlockedSites[site] = expiry
        save()
        scheduleReblock(site, expiry)
        notifyChanged()
      }
      return json({ ok: true })
    }

    case 'remove': {
      const site = url.searchParams.get('site')
      if (site) {
        data.blockedSites = data.blockedSites.filter(d => d !== site)
        delete data.unlockedSites[site]
        const timer = reblockTimers.get(site)
        if (timer) { clearTimeout(timer); reblockTimers.delete(site) }
        save()
        notifyChanged()
      }
      return json({ ok: true })
    }

    case 'apply-pending-phrase':
      if (pendingPhrase) {
        data.unlockPhrase = pendingPhrase
        pendingPhrase = null
        save()
        notifyChanged()
      }
      return json({ ok: true })

    case 'apply-pending-days':
      if (pendingDays) {
        data.activeDays = pendingDays
        data.daysConfigured = true
        pendingDays = null
        save()
        notifyChanged()
      }
      return json({ ok: true })

    default:
      return new Response('Not Found', { status: 404 })
  }
}

function json(obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json' }
  })
}

function setupIPC(): void {
  ipcMain.handle('trashblock:getState', () => ({
    enabled: data.enabled,
    blockedSites: data.blockedSites,
    unlockPhrase: data.unlockPhrase,
    unlockedSites: data.unlockedSites,
    activeDays: data.activeDays,
    daysConfigured: data.daysConfigured
  }))

  ipcMain.handle('trashblock:setEnabled', (_e, enabled: boolean) => {
    data.enabled = enabled
    save()
    notifyChanged()
  })

  ipcMain.handle('trashblock:addSite', (_e, rawDomain: string) => {
    const domain = cleanDomain(rawDomain)
    if (!domain || data.blockedSites.includes(domain)) return false
    data.blockedSites.push(domain)
    save()
    notifyChanged()
    return true
  })

  ipcMain.handle('trashblock:removeSite', (_e, domain: string) => {
    const url = `arcnext-block://blocked/index.html?site=${encodeURIComponent(domain)}&action=remove`
    openUrlFn?.(url)
    return { needsChallenge: true }
  })

  ipcMain.handle('trashblock:savePhrase', (_e, newPhrase: string) => {
    const normalized = normalizeText(normalizeQuotes(newPhrase))
    if (!normalized) return false

    if (!data.unlockPhrase || data.unlockPhrase === normalized) {
      data.unlockPhrase = normalized
      save()
      notifyChanged()
      return { saved: true }
    }

    pendingPhrase = normalized
    openUrlFn?.('arcnext-block://blocked/index.html?action=changePhrase')
    return { needsChallenge: true }
  })

  ipcMain.handle('trashblock:saveDays', (_e, days: number[]) => {
    if (!data.daysConfigured || !data.unlockPhrase) {
      data.activeDays = days
      data.daysConfigured = true
      save()
      notifyChanged()
      return { saved: true }
    }

    pendingDays = days
    openUrlFn?.('arcnext-block://blocked/index.html?action=changeDays')
    return { needsChallenge: true }
  })
}

export function registerTrashblockScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'arcnext-block',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }])
}

export function setupTrashblock(
  browserSession: Electron.Session,
  openUrl: (url: string) => void
): void {
  openUrlFn = openUrl
  load()

  for (const [domain, expiry] of Object.entries(data.unlockedSites)) {
    if (expiry > Date.now()) scheduleReblock(domain, expiry)
  }
  scheduleMidnightSync()

  browserSession.protocol.handle('arcnext-block', handleProtocol)

  browserSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      if (details.resourceType !== 'mainFrame' || !data.enabled || data.blockedSites.length === 0) {
        callback({})
        return
      }

      let hostname: string
      try { hostname = new URL(details.url).hostname } catch { callback({}); return }

      if (!isTodayActive()) { callback({}); return }

      const blocked = matchBlockedDomain(hostname)
      if (!blocked || isUnlocked(blocked)) { callback({}); return }

      callback({
        redirectURL: `arcnext-block://blocked/index.html?site=${encodeURIComponent(blocked)}`
      })
    }
  )

  setupIPC()
}

export function onTrashblockChanged(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => { changeListeners.delete(listener) }
}

export function flushTrashblockSync(): void {
  if (!storePath) return
  cleanExpiredUnlocks()
  save()
}
