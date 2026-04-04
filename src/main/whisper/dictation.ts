import { BrowserWindow, ipcMain, shell, systemPreferences } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFileSync, unlinkSync } from 'fs'
import { ensureWhisperReady, isWhisperReady, getWhisperPaths } from './modelManager'

const SAMPLE_RATE = 16000
const PROCESS_INTERVAL_MS = 1000

interface DictationSession {
  paneId: string
  audioChunks: Buffer[]
  processTimer: NodeJS.Timeout | null
  processing: boolean
}

const sessions = new Map<string, DictationSession>()
let modelPromise: Promise<void> | null = null

function createWavBuffer(pcmData: Buffer): Buffer {
  const header = Buffer.alloc(44)
  const dataSize = pcmData.length
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)          // PCM
  header.writeUInt16LE(1, 22)          // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  header.writeUInt16LE(2, 32)          // block align
  header.writeUInt16LE(16, 34)         // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcmData])
}

function runWhisper(wavPath: string): Promise<string> {
  const { binary, model } = getWhisperPaths()
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(binary, [
      '-m', model,
      '-f', wavPath,
      '--no-timestamps',
      '-l', 'en',
      '--print-progress', 'false',
      '--print-special', 'false',
      '-t', '4'
    ])

    let stdout = ''
    proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr?.on('data', () => {})
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`whisper exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

const WHISPER_JUNK = /(<\|[^|]*\|>|\[_[A-Z]+_\]|\[BLANK_AUDIO\]|\[INAUDIBLE\]|\([^)]*(?:crowd|music|applause|laughter|silence)[^)]*\)|>> )/gi

function cleanWhisperOutput(raw: string): string {
  const text = raw.replace(WHISPER_JUNK, '').replace(/\s+/g, ' ').trim()
  return text.length <= 1 ? '' : text
}

async function processAudio(session: DictationSession, window: BrowserWindow): Promise<void> {
  if (session.audioChunks.length === 0 || session.processing) return
  session.processing = true

  const pcmData = Buffer.concat(session.audioChunks)
  session.audioChunks = []

  if (pcmData.length < SAMPLE_RATE * 2 * 0.5) {
    session.audioChunks.push(pcmData)
    session.processing = false
    return
  }

  const wavBuffer = createWavBuffer(pcmData)
  const tempFile = join(tmpdir(), `arcnext-dict-${session.paneId}-${Date.now()}.wav`)

  try {
    writeFileSync(tempFile, wavBuffer)
    const raw = await runWhisper(tempFile)
    const text = cleanWhisperOutput(raw)
    if (text && !window.isDestroyed()) {
      window.webContents.send('dictation:text', session.paneId, text + ' ')
    }
  } catch (err) {
    console.error('[dictation] transcription error:', err)
  } finally {
    try { unlinkSync(tempFile) } catch {}
    session.processing = false
  }
}

export function setupDictation(window: BrowserWindow): void {
  ipcMain.handle('dictation:ensureModel', async () => {
    if (isWhisperReady()) return { ready: true }

    if (!modelPromise) {
      modelPromise = ensureWhisperReady()
    }

    try {
      await modelPromise
      return { ready: true }
    } catch (err) {
      console.error('[dictation] ensureModel failed:', err)
      modelPromise = null
      return { ready: false, error: (err as Error).message }
    }
  })

  ipcMain.on('dictation:start', (_event, paneId: string) => {
    if (sessions.has(paneId)) return

    const session: DictationSession = {
      paneId,
      audioChunks: [],
      processTimer: null,
      processing: false
    }

    session.processTimer = setInterval(() => {
      processAudio(session, window)
    }, PROCESS_INTERVAL_MS)

    sessions.set(paneId, session)
  })

  ipcMain.on('dictation:stop', (_event, paneId: string) => {
    const session = sessions.get(paneId)
    if (!session) return

    if (session.processTimer) {
      clearInterval(session.processTimer)
      session.processTimer = null
    }

    processAudio(session, window).finally(() => {
      sessions.delete(paneId)
    })
  })

  ipcMain.on('dictation:audioChunk', (_event, paneId: string, pcmData: ArrayBuffer) => {
    const session = sessions.get(paneId)
    if (!session) return
    session.audioChunks.push(Buffer.from(pcmData))
  })

  ipcMain.handle('dictation:checkMicPermission', () => {
    return systemPreferences.getMediaAccessStatus('microphone')
  })

  ipcMain.handle('dictation:requestMicPermission', async () => {
    return systemPreferences.askForMediaAccess('microphone')
  })

  ipcMain.handle('dictation:openMicSettings', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
  })
}

export function stopAllDictation(): void {
  for (const [, session] of sessions) {
    if (session.processTimer) clearInterval(session.processTimer)
  }
  sessions.clear()
}
