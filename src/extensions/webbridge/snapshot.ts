/**
 * Snapshot = ARIA-accurate accessibility tree rendered into a compact text
 * format, keyed by stable refs.
 *
 * Implementation: a bundled Playwright-derived script runs in the page and
 * computes the tree client-side. This surfaces things CDP's
 * `Accessibility.getFullAXTree` doesn't — empty textareas, elements before
 * hydration, custom-role elements — and keeps the same ref stable across
 * re-renders because it's keyed to live DOM elements, not tree-walk order.
 *
 * Refs reset automatically on navigation because the injected script re-runs
 * on every new document.
 */

import type { WebContents } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Snapshot } from './protocol'
import { send, ensureAttached, BridgeError } from './cdp'
import { ErrorCode } from './protocol'

let cachedBundle: string | null = null

function loadBundle(): string {
  if (cachedBundle) return cachedBundle
  // out/main/snapshot.js lives next to this file at runtime;
  // the bundled script ships at out/main/injected/snapshot-bundle.js.
  const bundlePath = join(__dirname, 'injected', 'snapshot-bundle.js')
  cachedBundle = readFileSync(bundlePath, 'utf-8')
  return cachedBundle
}

/**
 * Inject the page-side bridge into the given pane. Called on CDP attach.
 * Uses `Page.addScriptToEvaluateOnNewDocument` so later navigations
 * auto-reinject, and one immediate `Runtime.evaluate` so the current
 * document has it.
 */
export async function injectBundle(paneId: string): Promise<void> {
  const bundle = loadBundle()
  await send(paneId, 'Page.addScriptToEvaluateOnNewDocument', { source: bundle })
  // current page
  await send(paneId, 'Runtime.evaluate', {
    expression: bundle,
    awaitPromise: false,
    returnByValue: false
  })
}

/**
 * Called externally on navigation. The page-side bridge already resets its
 * state when the document reloads, so we have nothing to clean up in main —
 * this is kept as a no-op hook in case we later cache per-pane data in main.
 */
export function invalidateRefs(_paneId: string): void {
  /* no-op — refs live in the injected script, which re-executes on navigation */
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

interface RawSnapshot {
  text: string
  url: string
  title: string
}

/**
 * Render the raw text snapshot into our AxNode tree by parsing the
 * indentation-based format Playwright emits ("- textbox \"label\" [ref=e23]").
 * We only need this because our on-wire protocol is tree-shaped; a pure text
 * snapshot would also work for agents.
 */
import type { AxNode } from './protocol'

const LINE_RE = /^(\s*)- (.+?)$/
const ROLE_RE = /^([a-z][a-zA-Z0-9]*)(?:\s+"((?:[^"\\]|\\.)*)")?(.*)$/
const REF_RE = /\[ref=([^\]]+)\]/
const VALUE_RE = /:\s*(.+)$/

function parseTextSnapshot(text: string): AxNode {
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const root: AxNode = { ref: '', role: 'root', children: [] }
  const stack: Array<{ depth: number; node: AxNode }> = [{ depth: -1, node: root }]

  for (const raw of lines) {
    const m = LINE_RE.exec(raw)
    if (!m) continue
    const depth = m[1].length
    let content = m[2]

    // Pop stack until we find our parent
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop()
    const parent = stack[stack.length - 1].node

    // Leaf text nodes: "- text: foo"
    if (content.startsWith('text: ')) {
      const textNode: AxNode = { ref: '', role: 'text', name: content.slice(6) }
      ;(parent.children ||= []).push(textNode)
      continue
    }

    // Inline value: "- textbox \"Label\" [ref=e23]: value"
    let inlineValue: string | undefined
    const valueMatch = VALUE_RE.exec(content)
    if (valueMatch && !content.includes('"' + valueMatch[1])) {
      // crude: value only counts if it's after closing bracket
      const lastBracket = content.lastIndexOf(']')
      const colonIdx = content.indexOf(':', lastBracket >= 0 ? lastBracket : 0)
      if (colonIdx >= 0 && colonIdx > content.lastIndexOf('"')) {
        inlineValue = content.slice(colonIdx + 1).trim()
        content = content.slice(0, colonIdx)
      }
    }

    const refMatch = REF_RE.exec(content)
    const ref = refMatch ? refMatch[1] : ''

    const m2 = ROLE_RE.exec(content)
    const role = m2 ? m2[1] : 'unknown'
    const name = m2?.[2]

    const node: AxNode = { ref, role }
    if (name) node.name = name
    if (inlineValue) node.value = inlineValue

    ;(parent.children ||= []).push(node)
    stack.push({ depth, node })
  }

  // If root has exactly one child (common — a single top-level region), promote it
  if (root.children?.length === 1) return root.children[0]
  return root
}

export async function takeSnapshot(paneId: string, wc: WebContents): Promise<Snapshot> {
  await ensureAttached(paneId, wc)
  const raw = await evalInPage<RawSnapshot | null>(
    paneId,
    'window.__arcnextBridge ? window.__arcnextBridge.snapshot() : null'
  )
  if (!raw) throw new BridgeError(ErrorCode.CDPError, 'arcnext bridge not injected on page')
  const tree = parseTextSnapshot(raw.text)
  return {
    paneId,
    url: raw.url,
    title: raw.title,
    tree,
    capturedAt: Date.now()
  }
}

interface LocateResult {
  ok: boolean
  x?: number
  y?: number
  reason?: string
}

/**
 * Resolve a ref to viewport coords, via the page-side bridge. Also
 * scrolls the element into view before returning.
 */
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
 * Resolve a CSS selector to viewport coords. Still here for agents that pass
 * selectors directly. Uses DOM.querySelector + getBoxModel since the page-side
 * bridge only tracks accessibility-tree refs.
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

  // scroll into view — don't swallow errors silently; if this fails, the
  // getBoxModel that follows probably fails too, and we want to know why.
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

/**
 * Set the value of a form field through React's internal tracker. Returns
 * true if the page-side bridge succeeded, false otherwise (caller should
 * fall back to focus+type).
 */
export async function fillRef(paneId: string, ref: string, text: string): Promise<boolean> {
  const r = await evalInPage<LocateResult>(
    paneId,
    `window.__arcnextBridge ? window.__arcnextBridge.fill(${JSON.stringify(ref)}, ${JSON.stringify(text)}) : {ok: false}`
  )
  return !!r.ok
}
