/**
 * ArcNext page-side bridge.
 *
 * Injected into every frame on ensureAttached. Exposes a single global
 * (window.__arcnextBridge) that the main-process CDP driver calls via
 * Runtime.evaluate. All DOM/ARIA logic lives in vendored Playwright code
 * under ./vendor/playwright — we only glue it to our protocol here.
 *
 * Lifecycle: re-runs on every document load (via CDP
 * Page.addScriptToEvaluateOnNewDocument), so refs reset automatically on
 * navigation. Refs are stable within a single page lifetime.
 */

import { generateAriaTree, type AriaSnapshot } from './vendor/playwright/ariaSnapshot'
import type { AriaNode } from './vendor/playwright/ariaTypes'

interface LocateResult {
  ok: boolean
  x?: number
  y?: number
  width?: number
  height?: number
  reason?: string
}

/**
 * Our wire node — a trimmed AriaNode without Playwright internals like
 * `box`, `receivesPointerEvents`, generic-role wrappers, or prop objects
 * the agent doesn't need. Keeping it small so snapshots stay cheap to
 * serialize across CDP.
 */
interface WireNode {
  ref?: string
  role: string
  name?: string
  value?: string
  children?: WireNode[]
  props?: Record<string, string | boolean | number>
}

interface SnapshotResult {
  tree: WireNode
  url: string
  title: string
}

let lastSnapshot: AriaSnapshot | null = null

/**
 * Walk up from an element looking for a `<label>` ancestor (or sibling
 * `<label>` before the input). Returns the label's trimmed text content, or
 * undefined if none. The YC form wraps inputs in a `<label>` without `for=`;
 * ARIA name computation correctly ignores it, but agents need something to
 * target by. We surface it as a fallback name.
 */
function nearestLabelText(el: Element): string | undefined {
  // 1. ancestor <label>
  let node: Element | null = el.parentElement
  let hops = 0
  while (node && hops < 6) {
    if (node.tagName === 'LABEL') {
      const text = node.textContent?.trim().replace(/\s+/g, ' ')
      if (text) return text.slice(0, 160)
    }
    node = node.parentElement
    hops++
  }
  // 2. preceding sibling <label> (within the same form group)
  let prev = el.previousElementSibling
  while (prev) {
    if (prev.tagName === 'LABEL') {
      const text = prev.textContent?.trim().replace(/\s+/g, ' ')
      if (text) return text.slice(0, 160)
    }
    prev = prev.previousElementSibling
  }
  // 3. an ancestor that contains a <label> as its first descendant
  let parent: Element | null = el.parentElement
  hops = 0
  while (parent && hops < 3) {
    const label = parent.querySelector('label')
    if (label && !label.contains(el) && el.parentElement?.contains(label)) {
      const text = label.textContent?.trim().replace(/\s+/g, ' ')
      if (text) return text.slice(0, 160)
    }
    parent = parent.parentElement
    hops++
  }
  return undefined
}

function readValue(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) return el.value || undefined
  if (el instanceof HTMLTextAreaElement) return el.value || undefined
  if (el instanceof HTMLSelectElement) return el.value || undefined
  return undefined
}

/**
 * Convert Playwright's AriaNode tree into our wire format:
 *   - Drop `generic` role nodes that carry no name (promote children).
 *   - For interactable fields with empty names, try to enrich with the
 *     nearest <label> text so agents can pick them out.
 *   - Attach `value` for form fields (Playwright doesn't include it).
 *   - Drop `box`, `receivesPointerEvents`, and string-only children padding.
 */
function toWire(node: AriaNode | string, elements: Map<string, Element>): WireNode | string | null {
  if (typeof node === 'string') {
    const t = node.trim()
    return t ? t : null
  }
  const kids: WireNode[] = []
  for (const c of node.children || []) {
    const w = toWire(c, elements)
    if (w === null) continue
    if (typeof w === 'string') {
      // promote bare strings into a text node
      kids.push({ role: 'text', name: w })
      continue
    }
    kids.push(w)
  }

  const role = node.role
  const hasName = !!node.name
  const ref = node.ref

  // Strip noisy generic wrappers that contribute nothing. If the generic has
  // a single wire child, just return that child (hoist). If it has multiple
  // children, hoist them into the parent by returning a "hoist" marker the
  // outer loop flattens — easier: return the child array via a synthetic
  // fragment node, then flatten one level up.
  if ((role === 'generic' || role === 'none' || role === 'presentation') && !hasName) {
    if (kids.length === 0) return null
    if (kids.length === 1) return kids[0]
    // Leave as a group so we don't destroy semantics, but without ref it
    // won't clutter ref-heavy output.
    return { role: 'group', children: kids }
  }

  const wire: WireNode = { role }
  if (ref) wire.ref = ref
  if (hasName) {
    wire.name = node.name
  } else if (ref && (role === 'textbox' || role === 'combobox' || role === 'checkbox' || role === 'radio')) {
    const el = elements.get(ref)
    if (el) {
      const lbl = nearestLabelText(el)
      if (lbl) wire.name = lbl
    }
  }

  // form value
  if (ref) {
    const el = elements.get(ref)
    if (el) {
      const v = readValue(el)
      if (v) wire.value = v
    }
  }

  // Interesting aria props
  const props: Record<string, string | boolean | number> = {}
  if (node.checked !== undefined) props.checked = node.checked
  if (node.disabled) props.disabled = true
  if (node.expanded !== undefined) props.expanded = node.expanded
  if (node.level !== undefined) props.level = node.level
  if (node.pressed !== undefined) props.pressed = node.pressed
  if (node.selected) props.selected = true
  if (Object.keys(props).length > 0) wire.props = props

  if (kids.length > 0) wire.children = kids
  return wire
}

function takeSnapshot(): SnapshotResult {
  const snap = generateAriaTree(document.body, { mode: 'ai' })
  lastSnapshot = snap
  const wire = toWire(snap.root, snap.elements)
  const tree: WireNode = typeof wire === 'object' && wire !== null
    ? wire
    : { role: 'root' }
  return {
    tree,
    url: document.location.href,
    title: document.title
  }
}

function elementForRef(ref: string): Element | null {
  if (!lastSnapshot) return null
  return lastSnapshot.elements.get(ref) ?? null
}

function locate(ref: string): LocateResult {
  const el = elementForRef(ref)
  if (!el) return { ok: false, reason: 'ref not in last snapshot' }
  try {
    (el as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'center' })
  } catch {
    /* some elements don't expose scrollIntoView */
  }
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    return { ok: false, reason: 'element has zero size' }
  }
  return {
    ok: true,
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: rect.width,
    height: rect.height
  }
}

interface FillResult extends LocateResult {
  value?: string
}

/**
 * Set the `.value` of an `<input>` or `<textarea>` through React's internal
 * value tracker, then fire bubbling input+change events. Needed because
 * `Input.insertText` (and setting `.value` directly) bypasses React's
 * tracker and the form never sees the change.
 *
 * Returns the post-fill `.value` so the caller can verify without a new
 * snapshot round-trip.
 */
function fill(ref: string, text: string): FillResult {
  const el = elementForRef(ref)
  if (!el) return { ok: false, reason: 'ref not in last snapshot' }
  const tag = el.tagName
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
    return { ok: false, reason: `fill only supports input/textarea, got ${tag}` }
  }
  try {
    const proto = tag === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (!setter) return { ok: false, reason: 'no value setter' }
    ;(el as HTMLElement).focus?.()
    setter.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
  const rect = el.getBoundingClientRect()
  const actual = (el as HTMLInputElement | HTMLTextAreaElement).value
  return {
    ok: true,
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: rect.width,
    height: rect.height,
    value: actual.length > 200 ? actual.slice(0, 200) + '…' : actual
  }
}

interface ArcnextBridge {
  snapshot: () => SnapshotResult
  locate: (ref: string) => LocateResult
  fill: (ref: string, text: string) => FillResult
}

declare global {
  interface Window {
    __arcnextBridge?: ArcnextBridge
  }
}

// Idempotent: re-injection replaces the old object.
window.__arcnextBridge = { snapshot: takeSnapshot, locate, fill }
