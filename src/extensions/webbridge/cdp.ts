/**
 * Thin wrapper around Electron's webContents.debugger (CDP) so tool handlers
 * don't have to think about lifecycle.
 *
 * We attach lazily on first use per pane and detach when the pane is destroyed
 * or the browser navigates away from the remote-debugging-usable state.
 * DevTools-open collisions are surfaced as a typed error.
 */

import type { WebContents } from 'electron'
import { ErrorCode } from './protocol'

export class BridgeError extends Error {
  constructor(public code: number, message: string, public data?: unknown) {
    super(message)
  }
}

interface CdpSession {
  wc: WebContents
  attached: boolean
  detachHandler: () => void
  crashedHandler: () => void
  destroyedHandler: () => void
}

const sessions = new Map<string, CdpSession>()

export async function attach(paneId: string, wc: WebContents): Promise<void> {
  let existing = sessions.get(paneId)

  if (existing && existing.wc === wc && existing.attached && !wc.isDestroyed() && wc.debugger.isAttached()) {
    return
  }

  if (existing) {
    await detach(paneId).catch(() => {})
    existing = undefined
  }

  if (wc.isDestroyed()) {
    throw new BridgeError(ErrorCode.UnknownPane, `WebContents for pane ${paneId} is destroyed`)
  }

  try {
    wc.debugger.attach('1.3')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/already attached/i.test(msg)) {
      throw new BridgeError(
        ErrorCode.DebuggerConflict,
        `Cannot attach to pane ${paneId}: DevTools or another debugger is attached. Close DevTools and retry.`
      )
    }
    throw new BridgeError(ErrorCode.CDPError, `attach failed: ${msg}`)
  }

  const detachHandler = (): void => {
    const s = sessions.get(paneId)
    if (s) s.attached = false
  }
  const crashedHandler = (): void => {
    const s = sessions.get(paneId)
    if (s) s.attached = false
  }
  const destroyedHandler = (): void => {
    sessions.delete(paneId)
  }

  wc.debugger.on('detach', detachHandler)
  wc.once('render-process-gone', crashedHandler)
  wc.once('destroyed', destroyedHandler)

  sessions.set(paneId, {
    wc,
    attached: true,
    detachHandler,
    crashedHandler,
    destroyedHandler
  })

  // Enable the domains we actually use
  await send(paneId, 'DOM.enable', {})
  await send(paneId, 'Runtime.enable', {})
  await send(paneId, 'Page.enable', {})

  // Inject the page-side bridge. Local require (not top-level import) because
  // snapshot.ts imports from this file, and a top-level import would create a
  // cycle.
  const { injectBundle } = await import('./snapshot')
  await injectBundle(paneId)
}

export async function detach(paneId: string): Promise<void> {
  const s = sessions.get(paneId)
  if (!s) return
  try {
    s.wc.debugger.off('detach', s.detachHandler)
    if (s.attached && !s.wc.isDestroyed() && s.wc.debugger.isAttached()) {
      s.wc.debugger.detach()
    }
  } catch { /* ignore */ }
  sessions.delete(paneId)
}

/** Core CDP call. Auto-attaches if needed (callers pass the wc separately in `ensureAttached`). */
export async function send<T = unknown>(paneId: string, method: string, params: unknown = {}): Promise<T> {
  const s = sessions.get(paneId)
  if (!s || !s.attached) {
    throw new BridgeError(ErrorCode.CDPError, `pane ${paneId} not attached (call attach first)`)
  }
  if (s.wc.isDestroyed()) {
    throw new BridgeError(ErrorCode.UnknownPane, `pane ${paneId} webcontents destroyed`)
  }
  try {
    return await s.wc.debugger.sendCommand(method, params as object) as T
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new BridgeError(ErrorCode.CDPError, `${method} failed: ${msg}`)
  }
}

/** Small helper for tool handlers: attach if needed, then send. */
export async function ensureAttached(paneId: string, wc: WebContents): Promise<void> {
  const s = sessions.get(paneId)
  if (s && s.attached && s.wc === wc && !wc.isDestroyed() && wc.debugger.isAttached()) return
  await attach(paneId, wc)
}

export function detachAll(): void {
  for (const paneId of Array.from(sessions.keys())) {
    void detach(paneId)
  }
}
