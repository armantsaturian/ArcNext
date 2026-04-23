/**
 * Web Bridge extension entry point.
 *
 * Wires:
 *   - JSON-RPC server on Unix socket at userData/webbridge.sock
 *   - Lock lifecycle events → renderer IPC (glow on acquire/release)
 *   - Pane destroy → CDP detach + lock release
 *   - Renderer user-input signal → yieldPane (preempts agent lock)
 *
 * Exposes getPtyEnv() so main/pty.ts can inject ARCNEXT_BRIDGE_SOCK and
 * ARCNEXT_BRIDGE_TOKEN into every spawned shell.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getBrowserView, onPaneLifecycle } from '../../main/browserViewManager'
import { detach as cdpDetach, detachAll as cdpDetachAll } from './cdp'
import { invalidateRefs } from './snapshot'
import * as locks from './lockManager'
import * as overlay from './overlay'
import { getSocketPath, getToken, startServer, stopServer } from './server'
import { setupWebBridgeSettings } from './settings'
import { setMainWindow } from './tools'

let ready = false

export async function setupWebBridge(mainWindow: BrowserWindow): Promise<void> {
  setMainWindow(mainWindow)
  setupWebBridgeSettings()

  const sockPath = join(app.getPath('userData'), 'webbridge.sock')
  try {
    await startServer(sockPath)
    ready = true
    // eslint-disable-next-line no-console
    console.log(`[webbridge] listening on ${sockPath}`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[webbridge] failed to start:', err)
    return
  }

  // Dev-only: write connection info to a side file so smoke tests can attach
  // without having to spawn a real PTY. Only runs when ELECTRON_RENDERER_URL
  // is set, which electron-vite sets exclusively in `npm run dev`.
  if (process.env.ELECTRON_RENDERER_URL) {
    const devInfoPath = join(app.getPath('userData'), 'webbridge-dev.json')
    try {
      writeFileSync(devInfoPath, JSON.stringify({ sock: getSocketPath(), token: getToken() }))
    } catch { /* ignore */ }
  }

  // Token-discovery file at ~/.arcnext/bridge.json (0600).
  // Always written while the server runs — this is how the CLI finds
  // ArcNext from shells where ARCNEXT_BRIDGE_SOCK/TOKEN weren't injected
  // (e.g. Terminal.app, iTerm, VS Code terminal).
  const discoveryDir = join(homedir(), '.arcnext')
  const discoveryPath = join(discoveryDir, 'bridge.json')
  try {
    mkdirSync(discoveryDir, { recursive: true })
    writeFileSync(discoveryPath, JSON.stringify({
      sock: getSocketPath(),
      token: getToken(),
      pid: process.pid,
      writtenAt: Date.now()
    }))
    try { chmodSync(discoveryPath, 0o600) } catch { /* best effort */ }
  } catch { /* ignore — bridge still works for in-PTY shells */ }

  app.on('before-quit', () => {
    if (existsSync(discoveryPath)) try { unlinkSync(discoveryPath) } catch { /* ignore */ }
  })

  // Forward lock events to the renderer (sidebar glow) AND update the in-page
  // overlay hold state so the sky-blue ring sits on top of the site, not
  // behind it.
  locks.onLockEvent((event) => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send(`bridge:${event.type}`, event.paneId, 'sessionId' in event ? event.sessionId : null)

    const managed = getBrowserView(event.paneId)
    if (!managed || managed.view.webContents.isDestroyed()) return
    const holds = event.type === 'acquired'
    void overlay.setHold(managed.view.webContents, event.paneId, holds)
  })

  // Pane lifecycle: hook before-input-event on create (for yield), keep the
  // in-page overlay alive across navigations, clean up on destroy.
  onPaneLifecycle((event) => {
    if (event.type === 'destroyed') {
      void cdpDetach(event.paneId)
      invalidateRefs(event.paneId)
      locks.yieldPane(event.paneId, 'pane-destroyed')
      overlay.clearPaneState(event.paneId)
      return
    }
    const managed = getBrowserView(event.paneId)
    if (!managed) return
    const wc = managed.view.webContents
    // Yield-on-user-input: first physical keypress or mousedown in the pane
    // preempts whatever session holds it.
    wc.on('before-input-event', () => {
      if (locks.holder(event.paneId)) locks.yieldPane(event.paneId, 'user-input')
    })
    // Re-apply overlay hold state after each navigation — the page DOM is
    // wiped, so our <div> has to be re-injected.
    wc.on('did-finish-load', () => {
      if (locks.holder(event.paneId)) {
        void overlay.setHold(wc, event.paneId, true)
      }
    })
  })

  // Renderer reports human input on a pane → yield whatever agent held it.
  ipcMain.on('bridge:userInputOnPane', (_e, paneId: string) => {
    locks.yieldPane(paneId, 'user-input')
  })

  // Idle sweeper — release locks that have gone stale.
  const sweeperInterval = setInterval(() => locks.sweepIdle(), 10_000)

  app.on('before-quit', () => {
    clearInterval(sweeperInterval)
    cdpDetachAll()
    stopServer()
  })
}

/** PTY env vars to inject so shells spawned inside ArcNext can reach the bridge. */
export function getPtyEnv(): Record<string, string> {
  if (!ready) return {}
  return {
    ARCNEXT_BRIDGE_SOCK: getSocketPath(),
    ARCNEXT_BRIDGE_TOKEN: getToken()
  }
}
