import { BrowserWindow, ipcMain } from 'electron'
import * as pty from 'node-pty'
import { homedir } from 'os'
import { join } from 'path'
import { getPtyEnv } from '../extensions/webbridge/main'

const ptys = new Map<string, pty.IPty>()

const shellIntegrationDir = join(
  __dirname.replace('app.asar', 'app.asar.unpacked'),
  'shell-integration'
)

/** Directory that contains the bundled arcnext-bridge CLI. */
const binDir = join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bin')

export function setupPTY(window: BrowserWindow): void {
  ipcMain.on('pty:create', (_event, paneId: string, cwd?: string) => {
    const shell = process.env.SHELL || '/bin/zsh'
    // Filter env to only string values — Electron can inject non-strings
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v
    }
    // Ensure UTF-8 encoding for the PTY.
    // macOS GUI apps launched from Finder/Dock often lack locale env vars,
    // causing the shell to fall back to Mac Roman and garble multi-byte chars.
    // LC_ALL takes precedence over everything, then LC_CTYPE for encoding, then LANG.
    const hasUtf8 = (v?: string): boolean => !!v && /utf-?8/i.test(v)
    if (!hasUtf8(env['LC_ALL'])) {
      if (env['LC_ALL']) delete env['LC_ALL'] // non-UTF-8 LC_ALL would override our fix
      if (!hasUtf8(env['LANG'])) {
        env['LANG'] = env['LANG']
          ? env['LANG'].replace(/\..*$/, '.UTF-8')  // preserve language, fix encoding
          : 'en_US.UTF-8'
      }
    }
    // Inject shell integration for zsh
    if (shell.endsWith('/zsh') || shell === 'zsh') {
      env['ARCNEXT_SHELL_INTEGRATION'] = '1'
      env['ARCNEXT_ORIGINAL_ZDOTDIR'] = env['ZDOTDIR'] || env['HOME'] || homedir()
      env['ZDOTDIR'] = shellIntegrationDir
    }
    // Inject web-bridge env so agents in this shell can reach the bridge.
    for (const [k, v] of Object.entries(getPtyEnv())) env[k] = v
    // Prepend the bundled CLI dir to PATH so `arcnext-bridge` resolves.
    env['PATH'] = env['PATH'] ? `${binDir}:${env['PATH']}` : binDir
    const term = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || homedir(),
      env
    })

    ptys.set(paneId, term)

    term.onData((data) => {
      if (!window.isDestroyed()) window.webContents.send('pty:data', paneId, data)
    })

    term.onExit(({ exitCode }) => {
      ptys.delete(paneId)
      if (!window.isDestroyed()) window.webContents.send('pty:exit', paneId, exitCode)
    })
  })

  ipcMain.on('pty:write', (_event, paneId: string, data: string) => {
    ptys.get(paneId)?.write(data)
  })

  ipcMain.on('pty:resize', (_event, paneId: string, cols: number, rows: number) => {
    ptys.get(paneId)?.resize(cols, rows)
  })

  ipcMain.on('pty:kill', (_event, paneId: string) => {
    ptys.get(paneId)?.kill()
    ptys.delete(paneId)
  })
}

export function killAllPTY(): void {
  for (const [, term] of ptys) {
    term.kill()
  }
  ptys.clear()
}
