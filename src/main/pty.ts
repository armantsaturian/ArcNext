import { BrowserWindow, ipcMain } from 'electron'
import * as pty from 'node-pty'
import { homedir } from 'os'
import { join } from 'path'

const ptys = new Map<string, pty.IPty>()

const shellIntegrationDir = join(__dirname, 'shell-integration')

export function setupPTY(window: BrowserWindow): void {
  ipcMain.on('pty:create', (_event, paneId: string, cwd?: string) => {
    const shell = process.env.SHELL || '/bin/zsh'
    // Filter env to only string values — Electron can inject non-strings
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v
    }
    // Inject shell integration for zsh
    if (shell.endsWith('/zsh') || shell === 'zsh') {
      env['ARCNEXT_SHELL_INTEGRATION'] = '1'
      env['ARCNEXT_ORIGINAL_ZDOTDIR'] = env['ZDOTDIR'] || env['HOME'] || homedir()
      env['ZDOTDIR'] = shellIntegrationDir
    }
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
