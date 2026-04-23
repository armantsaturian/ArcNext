import { app, dialog, ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import type { XNextData, XNextTweet } from './types'

const DEFAULTS: XNextData = { enabled: true }
const FEED_COUNT = 30

let data: XNextData = { ...DEFAULTS }
let storePath = ''
let cachedFeed: XNextTweet[] = []
let fetching = false
const changeListeners = new Set<() => void>()

function load(): void {
  storePath = join(app.getPath('userData'), 'xnext.json')
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

function resolveXcli(): string {
  const home = app.getPath('home')
  const pyenvShim = join(home, '.pyenv', 'shims', 'xcli')
  if (existsSync(pyenvShim)) return pyenvShim
  return 'xcli'
}

function xcliEnv(): NodeJS.ProcessEnv {
  const home = app.getPath('home')
  return {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
    PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${home}/.local/bin`
  }
}

let xcliAvailable: boolean | null = null

function checkXcli(): Promise<boolean> {
  if (xcliAvailable === true) return Promise.resolve(true)

  return new Promise((resolve) => {
    const home = app.getPath('home')
    const pyenvShim = join(home, '.pyenv', 'shims', 'xcli')
    if (existsSync(pyenvShim)) {
      xcliAvailable = true
      resolve(true)
      return
    }
    execFile('which', ['xcli'], { timeout: 3000, env: xcliEnv() }, (err) => {
      xcliAvailable = !err
      resolve(xcliAvailable)
    })
  })
}

function parseTweets(raw: unknown[]): XNextTweet[] {
  return raw.map((t: Record<string, unknown>) => {
    const author = t.author as Record<string, string> | undefined
    const handle = author?.username || 'unknown'
    const id = (t.id as string) || ''
    const text = (t.text as string) || ''
    const retweetedBy = (t.retweetedBy as string) || undefined
    return {
      id,
      handle,
      text,
      url: `https://x.com/${handle}/status/${id}`,
      retweetedBy
    }
  }).filter(t => t.text)
}

function fetchFeed(): Promise<XNextTweet[]> {
  if (fetching) return Promise.resolve(cachedFeed)
  fetching = true

  return new Promise((resolve) => {
    const xcli = resolveXcli()
    execFile(xcli, ['feed', '-n', String(FEED_COUNT), '--json'], {
      timeout: 20000,
      env: xcliEnv()
    }, (err, stdout) => {
      fetching = false
      if (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') xcliAvailable = false
        resolve(cachedFeed)
        return
      }
      xcliAvailable = true

      const jsonLine = stdout.split('\n').find(l => l.trim().startsWith('['))
      if (!jsonLine) {
        resolve(cachedFeed)
        return
      }

      try {
        const raw = JSON.parse(jsonLine)
        cachedFeed = parseTweets(raw)
        resolve(cachedFeed)
      } catch {
        resolve(cachedFeed)
      }
    })
  })
}

function postTweet(text: string, mediaPaths: string[]): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xcli = resolveXcli()
    const args = ['post', text]
    for (const p of mediaPaths) {
      args.push('-m', p)
    }
    execFile(xcli, args, {
      timeout: 30000,
      env: xcliEnv()
    }, (err, _stdout, stderr) => {
      if (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          xcliAvailable = false
          resolve({ ok: false, error: 'xcli not installed' })
          return
        }
        const msg = stderr?.trim() || err.message
        resolve({ ok: false, error: msg })
        return
      }
      xcliAvailable = true
      resolve({ ok: true })
    })
  })
}

export function setupXNext(): void {
  load()

  ipcMain.handle('xnext:getState', () => ({ enabled: data.enabled }))

  ipcMain.handle('xnext:checkAvailable', async () => {
    return { available: await checkXcli() }
  })

  ipcMain.handle('xnext:setEnabled', (_e, enabled: boolean) => {
    data.enabled = enabled
    save()
    notifyChanged()
  })

  ipcMain.handle('xnext:getFeed', async () => {
    return fetchFeed()
  })

  ipcMain.handle('xnext:post', async (_e, text: string, mediaPaths: string[]) => {
    return postTweet(text, mediaPaths)
  })

  ipcMain.handle('xnext:pickMedia', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'gif', 'mp4', 'webp'] }
      ]
    })
    if (result.canceled) return []
    return result.filePaths.slice(0, 4)
  })
}

export function onXNextChanged(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => { changeListeners.delete(listener) }
}

export function flushXNextSync(): void {
  if (!storePath) return
  save()
}
