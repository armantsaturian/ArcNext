/**
 * ArcNext page-side bridge.
 *
 * Injected into every frame on ensureAttached. Exposes a single global
 * (window.__arcnextBridge) that the main-process CDP driver calls via
 * Runtime.evaluate. All DOM/ARIA logic lives in vendored Playwright code
 * under ./vendor/playwright — we only glue it to our protocol here.
 *
 * Life cycle: re-runs on every document load (via CDP
 * Page.addScriptToEvaluateOnNewDocument), so refs reset automatically on
 * navigation. Refs are stable within a single page lifetime.
 */

import { generateAriaTree, renderAriaTree, type AriaSnapshot } from './vendor/playwright/ariaSnapshot'

interface LocateResult {
  ok: boolean
  x?: number
  y?: number
  width?: number
  height?: number
  reason?: string
}

interface SnapshotResult {
  text: string
  url: string
  title: string
}

let lastSnapshot: AriaSnapshot | null = null

function takeSnapshot(): SnapshotResult {
  const snap = generateAriaTree(document.body, { mode: 'ai' })
  lastSnapshot = snap
  const { text } = renderAriaTree(snap, { mode: 'ai' })
  return {
    text,
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
    // Scroll element into the viewport center so the click site is valid.
    (el as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'center' })
  } catch {
    /* some elements (e.g. SVG in Safari) don't expose scrollIntoView */
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

function focus(ref: string): LocateResult {
  const el = elementForRef(ref)
  if (!el) return { ok: false, reason: 'ref not in last snapshot' }
  try {
    (el as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'center' })
    ;(el as HTMLElement).focus?.()
  } catch {
    return { ok: false, reason: 'focus threw' }
  }
  const rect = el.getBoundingClientRect()
  return {
    ok: true,
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: rect.width,
    height: rect.height
  }
}

/**
 * Set the `.value` of an `<input>` or `<textarea>` through React's internal
 * value tracker, then fire bubbling input+change events. Needed because
 * `Input.insertText` (and setting `.value` directly) bypasses React's
 * tracker and the form never sees the change.
 *
 * For non-React pages this is just a native setter + event — still harmless.
 */
function fill(ref: string, text: string): LocateResult {
  const el = elementForRef(ref)
  if (!el) return { ok: false, reason: 'ref not in last snapshot' }
  const tag = el.tagName
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
    return { ok: false, reason: `fill only supports input/textarea, got ${tag}` }
  }
  try {
    const proto = tag === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    const setter = desc?.set
    if (!setter) return { ok: false, reason: 'no value setter' }
    ;(el as HTMLElement).focus?.()
    setter.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
  const rect = el.getBoundingClientRect()
  return {
    ok: true,
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: rect.width,
    height: rect.height
  }
}

interface ArcnextBridge {
  snapshot: () => SnapshotResult
  locate: (ref: string) => LocateResult
  focus: (ref: string) => LocateResult
  fill: (ref: string, text: string) => LocateResult
}

declare global {
  interface Window {
    __arcnextBridge?: ArcnextBridge
  }
}

// Idempotent: re-injection replaces the old object.
window.__arcnextBridge = { snapshot: takeSnapshot, locate, focus, fill }
