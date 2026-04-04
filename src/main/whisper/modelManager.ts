import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream, chmodSync, unlinkSync, renameSync } from 'fs'
import { execSync, type ExecSyncOptions } from 'child_process'
import { cpus, homedir } from 'os'
import https from 'https'

const WHISPER_DIR = join(app.getPath('userData'), 'whisper')
const WHISPER_BIN = join(WHISPER_DIR, 'whisper-main')
const WHISPER_VERSION = '1.5.5'

function getModelName(): string {
  return process.env.ARCNEXT_WHISPER_MODEL || 'small.en'
}

function getModelPath(): string {
  return join(WHISPER_DIR, `ggml-${getModelName()}.bin`)
}

export function isWhisperReady(): boolean {
  return existsSync(WHISPER_BIN) && existsSync(getModelPath())
}

export function getWhisperPaths(): { binary: string; model: string } {
  return { binary: WHISPER_BIN, model: getModelPath() }
}

export async function ensureWhisperReady(): Promise<void> {
  mkdirSync(WHISPER_DIR, { recursive: true })

  if (!existsSync(WHISPER_BIN)) {
    console.log('[whisper] compiling whisper.cpp...')
    await downloadAndCompile()
  }

  if (!existsSync(getModelPath())) {
    console.log('[whisper] downloading model:', getModelName())
    await downloadModel()
  }
}

function followRedirects(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (u: string, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'))
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          res.resume()
          return follow(res.headers.location!, redirects + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} downloading ${u}`))
        }
        const file = createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', (err) => { file.close(); reject(err) })
      }).on('error', reject)
    }
    follow(url)
  })
}

/**
 * Electron GUI apps don't inherit the user's shell PATH.
 * Build a PATH that includes common tool locations.
 */
function shellEnv(): ExecSyncOptions['env'] {
  const extra = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    join(homedir(), '.local/bin')
  ]
  const current = process.env.PATH || '/usr/bin:/bin'
  return { ...process.env, PATH: `${extra.join(':')}:${current}` }
}

async function downloadAndCompile(): Promise<void> {
  const tarballUrl = `https://github.com/ggerganov/whisper.cpp/archive/refs/tags/v${WHISPER_VERSION}.tar.gz`
  const tarball = join(WHISPER_DIR, 'whisper-src.tar.gz')

  await followRedirects(tarballUrl, tarball)

  // Extract
  execSync(`tar xzf "${tarball}"`, { cwd: WHISPER_DIR, stdio: 'pipe' })

  const srcDir = join(WHISPER_DIR, `whisper.cpp-${WHISPER_VERSION}`)
  const nCpu = cpus().length
  const env = shellEnv()

  try {
    execSync(`make -j${nCpu} main`, { cwd: srcDir, stdio: 'pipe', timeout: 300_000, env })
  } catch (makeErr) {
    try {
      execSync(`cmake -B build -DWHISPER_METAL=ON`, { cwd: srcDir, stdio: 'pipe', timeout: 60_000, env })
      execSync(`cmake --build build --config Release -j${nCpu} --target main`, { cwd: srcDir, stdio: 'pipe', timeout: 300_000, env })
    } catch (cmakeErr) {
      throw new Error(
        `Compilation failed. Install Xcode CLI tools: xcode-select --install\n` +
        `make: ${(makeErr as Error).message}\ncmake: ${(cmakeErr as Error).message}`
      )
    }
  }

  // Find the compiled binary
  const candidates = [
    join(srcDir, 'main'),
    join(srcDir, 'build', 'bin', 'main'),
    join(srcDir, 'build', 'bin', 'whisper-cli')
  ]
  const builtBin = candidates.find((p) => existsSync(p))
  if (!builtBin) throw new Error('Compilation succeeded but binary not found')

  renameSync(builtBin, WHISPER_BIN)
  chmodSync(WHISPER_BIN, 0o755)

  // Cleanup
  try {
    unlinkSync(tarball)
    execSync(`rm -rf "${srcDir}"`, { stdio: 'pipe' })
  } catch { /* best effort */ }
}

async function downloadModel(): Promise<void> {
  const name = getModelName()
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`
  await followRedirects(url, getModelPath())
}
