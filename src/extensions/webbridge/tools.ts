/**
 * Tool handlers. Each maps 1:1 to a Method name in protocol.ts.
 *
 * Pipeline for every write-tool call:
 *   1. resolvePane → look up WebContentsView
 *   2. ensureAttached → CDP attach lazily
 *   3. ensureOwned → verify session holds the pane lock
 *   4. execute → the action itself
 *   5. notify renderer → pane glows while acting
 */

import type { WebContents } from 'electron'
import { BrowserWindow } from 'electron'
import { getBrowserView, listBrowserViews } from '../../main/browserViewManager'
import { ensureAttached, send, BridgeError } from './cdp'
import { clickAt, pressKey, scrollBy, typeText, type MouseButton, type Modifier } from './input'
import * as locks from './lockManager'
import * as overlay from './overlay'
import {
  ErrorCode,
  type AcquireParams,
  type ClickParams,
  type EvaluateParams,
  type EvaluateResult,
  type NavParams,
  type NavigateParams,
  type OpenParams,
  type OpenResult,
  type PaneSummary,
  type PressParams,
  type ReleaseParams,
  type ReloadParams,
  type ScreenshotParams,
  type ScreenshotResult,
  type ScrollParams,
  type Snapshot,
  type SnapshotParams,
  type StopParams,
  type TypeParams,
  type WaitParams,
  type WaitResult
} from './protocol'
import { resolveRef, resolveSelector, takeSnapshot, fillRef } from './snapshot'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

type ActKind = 'read' | 'click' | 'type' | 'nav'

function notifyActed(paneId: string, kind: ActKind): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bridge:agentActed', paneId, kind)
  }
  // In-page overlay pulse (sits above the page, not behind it).
  const managed = getBrowserView(paneId)
  if (managed && !managed.view.webContents.isDestroyed()) {
    void overlay.pulse(managed.view.webContents, paneId)
  }
}

function resolvePaneWC(paneId: string): WebContents {
  const managed = getBrowserView(paneId)
  if (!managed) {
    throw new BridgeError(ErrorCode.UnknownPane, `no pane with id ${paneId}`)
  }
  if (managed.view.webContents.isDestroyed()) {
    throw new BridgeError(ErrorCode.UnknownPane, `pane ${paneId} webcontents destroyed`)
  }
  return managed.view.webContents
}

/**
 * Ensure this session can act on the pane.
 *
 * Each CLI invocation is a short-lived connection, so requiring an explicit
 * `acquire` before every call would be hostile. Instead: if the pane is free,
 * auto-acquire for the duration of this call. If held by another session,
 * fail with LockConflict. Explicit `acquire` still works for agents that
 * want to batch multi-step flows over one connection.
 */
function requireOwned(paneId: string, sessionId: string): void {
  const status = locks.ensureOwned(paneId, sessionId)
  if (status === 'ok') return
  if (status === 'held-by-other') {
    const holder = locks.holder(paneId)
    throw new BridgeError(ErrorCode.LockConflict, `pane ${paneId} is held by another session (${holder})`)
  }
  // not-acquired → auto-acquire
  if (!locks.acquire(paneId, sessionId)) {
    const holder = locks.holder(paneId)
    throw new BridgeError(ErrorCode.LockConflict, `pane ${paneId} is held by another session (${holder})`)
  }
}

async function resolveTarget(
  paneId: string,
  ref: string | undefined,
  selector: string | undefined
): Promise<{ x: number; y: number }> {
  if (ref) return resolveRef(paneId, ref)
  if (selector) return resolveSelector(paneId, selector)
  throw new BridgeError(ErrorCode.InvalidParams, 'ref or selector required')
}

export const handlers = {
  async panes(): Promise<PaneSummary[]> {
    return listBrowserViews().map((v) => ({
      paneId: v.paneId,
      url: v.view.webContents.getURL(),
      title: v.view.webContents.getTitle(),
      workspaceId: null // renderer knows this; we don't in main. Left for future.
    }))
  },

  async open(params: OpenParams, _sessionId: string): Promise<OpenResult> {
    if (!params.url) throw new BridgeError(ErrorCode.InvalidParams, 'url required')
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new BridgeError(ErrorCode.InternalError, 'main window unavailable')
    }

    const beforeIds = new Set(listBrowserViews().map((v) => v.paneId))
    mainWindow.webContents.send('browser:openInNewWorkspace', params.url)

    // Poll for the new pane (renderer creates the WebContentsView asynchronously)
    const deadline = Date.now() + 5000
    let newPane: string | undefined
    while (Date.now() < deadline) {
      await sleep(50)
      const found = listBrowserViews().find((v) => !beforeIds.has(v.paneId))
      if (found) { newPane = found.paneId; break }
    }
    if (!newPane) throw new BridgeError(ErrorCode.Timeout, 'timed out waiting for pane to be created')

    return { paneId: newPane, url: params.url }
  },

  async navigate(params: NavigateParams, sessionId: string): Promise<{ ok: true }> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    notifyActed(params.paneId, 'nav')
    await wc.loadURL(params.url)
    return { ok: true }
  },

  async reload(params: ReloadParams, sessionId: string): Promise<{ ok: true }> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    notifyActed(params.paneId, 'nav')
    if (params.ignoreCache) wc.reloadIgnoringCache()
    else wc.reload()
    return { ok: true }
  },

  async back(params: NavParams, sessionId: string): Promise<{ ok: true }> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    notifyActed(params.paneId, 'nav')
    wc.goBack()
    return { ok: true }
  },

  async forward(params: NavParams, sessionId: string): Promise<{ ok: true }> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    notifyActed(params.paneId, 'nav')
    wc.goForward()
    return { ok: true }
  },

  async snapshot(params: SnapshotParams, _sessionId: string): Promise<Snapshot> {
    const wc = resolvePaneWC(params.paneId)
    await ensureAttached(params.paneId, wc)
    notifyActed(params.paneId, 'read')
    return takeSnapshot(params.paneId, wc)
  },

  async screenshot(params: ScreenshotParams, _sessionId: string): Promise<ScreenshotResult> {
    const wc = resolvePaneWC(params.paneId)
    await ensureAttached(params.paneId, wc)
    notifyActed(params.paneId, 'read')

    interface CaptureScreenshotResult { data: string }
    const fmt = params.format === 'jpeg' ? 'jpeg' : 'png'
    const result = await send<CaptureScreenshotResult>(params.paneId, 'Page.captureScreenshot', {
      format: fmt,
      captureBeyondViewport: !!params.fullPage
    })

    interface Dimensions { cssVisualViewport?: { clientWidth: number; clientHeight: number } }
    const dims = await send<Dimensions>(params.paneId, 'Page.getLayoutMetrics', {}).catch(() => ({} as Dimensions))
    const width = dims.cssVisualViewport?.clientWidth ?? 0
    const height = dims.cssVisualViewport?.clientHeight ?? 0

    return {
      paneId: params.paneId,
      mime: fmt === 'jpeg' ? 'image/jpeg' : 'image/png',
      base64: result.data,
      width,
      height
    }
  },

  async click(params: ClickParams, sessionId: string): Promise<{ ok: true }> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    await ensureAttached(params.paneId, wc)
    notifyActed(params.paneId, 'click')
    const { x, y } = await resolveTarget(params.paneId, params.ref, params.selector)
    const button: MouseButton = (params.button as MouseButton) ?? 'left'
    await clickAt(params.paneId, x, y, button)
    return { ok: true }
  },

  async type(params: TypeParams, sessionId: string): Promise<{ ok: true; value?: string; method?: 'fill' | 'insertText' }> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    await ensureAttached(params.paneId, wc)
    notifyActed(params.paneId, 'type')

    // Preferred path for ref-targeted form fields: use the page-side bridge's
    // React-aware fill(), which routes through the native value setter and
    // fires input/change events. Handles controlled components that reject
    // raw `Input.insertText`. Falls back to the classic click+insertText for
    // content-editables, canvas, selectors, and anywhere fill() returns false.
    if (params.ref && !params.selector && !params.cadenceMs) {
      const res = await fillRef(params.paneId, params.ref, params.text).catch(() => ({ ok: false }) as { ok: boolean; value?: string })
      if (res.ok) return { ok: true, value: res.value, method: 'fill' }
    }

    if (params.ref || params.selector) {
      const { x, y } = await resolveTarget(params.paneId, params.ref, params.selector)
      await clickAt(params.paneId, x, y, 'left')
    }
    if (params.clearFirst) {
      // select all + delete
      await pressKey(params.paneId, 'a', ['meta'])
      await pressKey(params.paneId, 'Delete')
    }
    await typeText(params.paneId, params.text, params.cadenceMs ?? 0)
    return { ok: true, method: 'insertText' }
  },

  async press(params: PressParams, sessionId: string): Promise<{ ok: true }> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    await ensureAttached(params.paneId, wc)
    notifyActed(params.paneId, 'type')
    await pressKey(params.paneId, params.key, (params.modifiers as Modifier[] | undefined) ?? [])
    return { ok: true }
  },

  async scroll(params: ScrollParams, sessionId: string): Promise<{ ok: true }> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    await ensureAttached(params.paneId, wc)
    notifyActed(params.paneId, 'nav')
    const x = params.x ?? 200
    const y = params.y ?? 200
    await scrollBy(params.paneId, x, y, params.dx ?? 0, params.dy ?? 0)
    return { ok: true }
  },

  async wait(params: WaitParams, _sessionId: string): Promise<WaitResult> {
    const wc = resolvePaneWC(params.paneId)
    await ensureAttached(params.paneId, wc)
    const timeout = params.timeoutMs ?? 10_000
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
      try {
        if (params.ref) {
          await resolveRef(params.paneId, params.ref)
          return { matched: true, ref: params.ref }
        }
        if (params.selector) {
          await resolveSelector(params.paneId, params.selector)
          return { matched: true }
        }
        if (params.role || params.name) {
          const snap = await takeSnapshot(params.paneId, wc)
          const found = findInTree(snap.tree, params.role, params.name)
          if (found) return { matched: true, ref: found.ref }
        } else {
          // no selector — wait for `document.readyState === complete`
          interface EvalRet { result: { value: string } }
          const ret = await send<EvalRet>(params.paneId, 'Runtime.evaluate', {
            expression: 'document.readyState'
          })
          if (ret.result?.value === 'complete') return { matched: true }
        }
      } catch {
        // not found yet, keep polling
      }
      await sleep(200)
    }
    return { matched: false }
  },

  async acquire(params: AcquireParams, sessionId: string): Promise<{ paneId: string }> {
    let paneId = params.paneId
    if (!paneId) {
      const views = listBrowserViews()
      if (views.length === 0) throw new BridgeError(ErrorCode.UnknownPane, 'no browser panes open')
      paneId = views[0].paneId
    }
    resolvePaneWC(paneId) // validates existence
    if (!locks.acquire(paneId, sessionId)) {
      const h = locks.holder(paneId)
      throw new BridgeError(ErrorCode.LockConflict, `pane ${paneId} is held by another session (${h})`)
    }
    return { paneId }
  },

  async release(params: ReleaseParams, sessionId: string): Promise<{ ok: true }> {
    locks.release(params.paneId, sessionId)
    return { ok: true }
  },

  async stop(params: StopParams, sessionId: string): Promise<{ ok: true }> {
    locks.release(params.paneId, sessionId)
    return { ok: true }
  },

  /**
   * Run arbitrary JS in the page. Escape hatch for anything the structured
   * tools can't express — reach for it when a field has no ref and no
   * queryable selector, or when you need to inspect DOM state. Runs under
   * the same lock discipline as every other write-tool.
   */
  async evaluate(params: EvaluateParams, sessionId: string): Promise<EvaluateResult> {
    const wc = resolvePaneWC(params.paneId)
    requireOwned(params.paneId, sessionId)
    await ensureAttached(params.paneId, wc)
    notifyActed(params.paneId, 'read')

    if (typeof params.expression !== 'string' || params.expression.length === 0) {
      throw new BridgeError(ErrorCode.InvalidParams, 'expression required')
    }

    interface RuntimeEvaluateResult {
      result: { type: string; value?: unknown; description?: string; subtype?: string }
      exceptionDetails?: { text: string; exception?: { description?: string } }
    }

    const r = await send<RuntimeEvaluateResult>(params.paneId, 'Runtime.evaluate', {
      expression: params.expression,
      returnByValue: true,
      awaitPromise: !!params.awaitPromise
    })

    if (r.exceptionDetails) {
      return {
        value: null,
        type: 'error',
        thrown: true,
        description: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
      }
    }
    return {
      value: r.result.value ?? null,
      type: r.result.type,
      thrown: false,
      description: r.result.description
    }
  }
}

// Tree search for wait() — finds first node by role and/or name substring
function findInTree(
  node: import('./protocol').AxNode,
  role: string | undefined,
  name: string | undefined
): { ref: string } | null {
  const roleOk = !role || node.role === role
  const nameOk = !name || (!!node.name && node.name.toLowerCase().includes(name.toLowerCase()))
  if (node.ref && roleOk && nameOk && (role || name)) return { ref: node.ref }
  if (node.children) {
    for (const child of node.children) {
      const found = findInTree(child, role, name)
      if (found) return found
    }
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
