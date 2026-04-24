/**
 * Snapshot = ARIA-accurate accessibility tree, keyed by stable refs.
 *
 * A bundled Playwright-derived script runs in the page and produces a
 * structured JSON tree. This surfaces things CDP's `Accessibility.getFullAXTree`
 * doesn't — empty textareas, pre-hydration React, custom-role elements —
 * and the refs stay stable across re-renders because they're keyed to live
 * DOM elements, not tree-walk order.
 *
 * Refs reset automatically on navigation because the injected script re-runs
 * on every new document.
 */

import type { WebContents } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AxNode, Snapshot } from './protocol'
import { send, ensureAttached, BridgeError } from './cdp'
import { ErrorCode } from './protocol'

let cachedBundle: string | null = null

function loadBundle(): string {
  if (cachedBundle) return cachedBundle
  const bundlePath = join(__dirname, 'injected', 'snapshot-bundle.js')
  cachedBundle = readFileSync(bundlePath, 'utf-8')
  return cachedBundle
}

/**
 * Inject the page-side bridge. Called on CDP attach. Uses
 * `Page.addScriptToEvaluateOnNewDocument` so later navigations auto-reinject,
 * and one immediate `Runtime.evaluate` so the current document has it.
 */
export async function injectBundle(paneId: string): Promise<void> {
  const bundle = loadBundle()
  await send(paneId, 'Page.addScriptToEvaluateOnNewDocument', { source: bundle })
  await send(paneId, 'Runtime.evaluate', {
    expression: bundle,
    awaitPromise: false,
    returnByValue: false
  })
}

interface EvalSuccess<T> {
  result: { type: string; value?: T; description?: string }
  exceptionDetails?: { text: string; exception?: { description?: string } }
}

async function evalInPage<T>(paneId: string, expression: string): Promise<T> {
  const r = await send<EvalSuccess<T>>(paneId, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false
  })
  if (r.exceptionDetails) {
    const msg = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
    throw new BridgeError(ErrorCode.CDPError, `page eval failed: ${msg}`)
  }
  if (r.result.type === 'undefined') {
    throw new BridgeError(ErrorCode.CDPError, 'page eval returned undefined — bundle not loaded?')
  }
  return r.result.value as T
}

/** Wire shape returned by `window.__arcnextBridge.snapshot()`. Mirrored in entry.ts. */
interface WireNode {
  ref?: string
  role: string
  name?: string
  value?: string
  children?: WireNode[]
  props?: Record<string, string | boolean | number>
}

interface RawSnapshot {
  tree: WireNode
  url: string
  title: string
}

function toAxNode(w: WireNode): AxNode {
  const node: AxNode = { ref: w.ref ?? '', role: w.role }
  if (w.name) node.name = w.name
  if (w.value) node.value = w.value
  if (w.props) {
    // Stuff notable ARIA props into `description` so they survive our wire
    // protocol without growing a new field. Format: "checked disabled level=3".
    const bits: string[] = []
    for (const [k, v] of Object.entries(w.props)) {
      if (v === true) bits.push(k)
      else bits.push(`${k}=${v}`)
    }
    if (bits.length > 0) node.description = bits.join(' ')
  }
  if (w.children && w.children.length > 0) {
    node.children = w.children.map(toAxNode)
  }
  return node
}

export async function takeSnapshot(paneId: string, wc: WebContents): Promise<Snapshot> {
  await ensureAttached(paneId, wc)
  const raw = await evalInPage<RawSnapshot | null>(
    paneId,
    'window.__arcnextBridge ? window.__arcnextBridge.snapshot() : null'
  )
  if (!raw) throw new BridgeError(ErrorCode.CDPError, 'arcnext bridge not injected on page')
  return {
    paneId,
    url: raw.url,
    title: raw.title,
    tree: toAxNode(raw.tree),
    capturedAt: Date.now()
  }
}

interface LocateResult {
  ok: boolean
  x?: number
  y?: number
  reason?: string
}

export async function resolveRef(paneId: string, ref: string): Promise<{ x: number; y: number }> {
  const r = await evalInPage<LocateResult>(
    paneId,
    `window.__arcnextBridge ? window.__arcnextBridge.locate(${JSON.stringify(ref)}) : {ok: false, reason: 'bridge not injected'}`
  )
  if (!r.ok) {
    throw new BridgeError(ErrorCode.RefNotFound, `ref ${ref} not found: ${r.reason ?? 'unknown'}`)
  }
  return { x: r.x!, y: r.y! }
}

/**
 * CSS-selector fallback for agents that pass raw selectors. Uses
 * DOM.querySelector + getBoxModel since the page-side bridge only tracks
 * refs emitted in snapshots.
 */
export async function resolveSelector(paneId: string, selector: string): Promise<{ x: number; y: number }> {
  interface QueryResult { root: { nodeId: number } }
  interface QuerySelectorResult { nodeId: number }
  interface BoxModel { model: { content: number[] } }

  const doc = await send<QueryResult>(paneId, 'DOM.getDocument', { depth: 0 })
  const found = await send<QuerySelectorResult>(paneId, 'DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector
  })
  if (!found.nodeId) {
    throw new BridgeError(ErrorCode.RefNotFound, `selector not matched: ${selector}`)
  }
  try {
    await send(paneId, 'DOM.scrollIntoViewIfNeeded', { nodeId: found.nodeId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new BridgeError(ErrorCode.CDPError, `scrollIntoView failed for selector ${selector}: ${msg}`)
  }
  const box = await send<BoxModel>(paneId, 'DOM.getBoxModel', { nodeId: found.nodeId })
  const [x1, y1, x2, y2, x3, y3, x4, y4] = box.model.content
  return { x: (x1 + x2 + x3 + x4) / 4, y: (y1 + y2 + y3 + y4) / 4 }
}

interface FillOk { ok: true; value?: string }
interface FillErr { ok: false; reason?: string }
type FillPageResult = FillOk | FillErr

/**
 * Set the value of a form field through React's native value-setter.
 * Returns the post-fill `.value` on success so the caller can verify
 * without a second snapshot.
 */
export async function fillRef(
  paneId: string,
  ref: string,
  text: string
): Promise<{ ok: boolean; value?: string; reason?: string }> {
  const r = await evalInPage<FillPageResult>(
    paneId,
    `window.__arcnextBridge ? window.__arcnextBridge.fill(${JSON.stringify(ref)}, ${JSON.stringify(text)}) : {ok: false, reason: 'bridge not injected'}`
  )
  if (r.ok) return { ok: true, value: r.value }
  return { ok: false, reason: r.reason }
}
