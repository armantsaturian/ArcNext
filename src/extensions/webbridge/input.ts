/**
 * CDP Input dispatch — turns high-level intents (click, type, press) into
 * trusted mouse/keyboard events the page cannot distinguish from real input.
 */

import { send } from './cdp'

export type MouseButton = 'left' | 'middle' | 'right'

export async function clickAt(paneId: string, x: number, y: number, button: MouseButton = 'left'): Promise<void> {
  await send(paneId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x, y,
    button: 'none'
  })
  await send(paneId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x, y,
    button,
    clickCount: 1,
    buttons: button === 'left' ? 1 : button === 'right' ? 2 : 4
  })
  await send(paneId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x, y,
    button,
    clickCount: 1,
    buttons: 0
  })
}

/**
 * Insert text.
 *
 * Default path: one CDP call for the whole string — fast, matches paste.
 * With `cadenceMs > 0`: typed char-by-char with a delay, so sites that react
 * to each keypress (autocomplete, live search) see the string grow naturally.
 */
export async function typeText(paneId: string, text: string, cadenceMs = 0): Promise<void> {
  if (cadenceMs <= 0) {
    await send(paneId, 'Input.insertText', { text })
    return
  }
  for (const ch of text) {
    await send(paneId, 'Input.insertText', { text: ch })
    await sleep(cadenceMs)
  }
}

export type Modifier = 'alt' | 'control' | 'meta' | 'shift'

const MOD_BITS: Record<Modifier, number> = {
  alt: 1,
  control: 2,
  meta: 4,
  shift: 8
}

function modifierMask(mods: Modifier[] | undefined): number {
  if (!mods || mods.length === 0) return 0
  let mask = 0
  for (const m of mods) mask |= MOD_BITS[m] ?? 0
  return mask
}

/**
 * A minimal key map. Covers the common ones; unknown keys fall back to using
 * `key` as-is, which works for printable characters via insertText.
 */
interface KeySpec { keyCode: number; code: string; text?: string }

const NAMED_KEYS: Record<string, KeySpec> = {
  Enter:     { keyCode: 13, code: 'Enter', text: '\r' },
  Return:    { keyCode: 13, code: 'Enter', text: '\r' },
  Tab:       { keyCode: 9,  code: 'Tab' },
  Backspace: { keyCode: 8,  code: 'Backspace' },
  Delete:    { keyCode: 46, code: 'Delete' },
  Escape:    { keyCode: 27, code: 'Escape' },
  ArrowUp:   { keyCode: 38, code: 'ArrowUp' },
  ArrowDown: { keyCode: 40, code: 'ArrowDown' },
  ArrowLeft: { keyCode: 37, code: 'ArrowLeft' },
  ArrowRight:{ keyCode: 39, code: 'ArrowRight' },
  Home:      { keyCode: 36, code: 'Home' },
  End:       { keyCode: 35, code: 'End' },
  PageUp:    { keyCode: 33, code: 'PageUp' },
  PageDown:  { keyCode: 34, code: 'PageDown' },
  Space:     { keyCode: 32, code: 'Space', text: ' ' }
}

export async function pressKey(paneId: string, key: string, modifiers: Modifier[] = []): Promise<void> {
  const modMask = modifierMask(modifiers)
  const spec: KeySpec = NAMED_KEYS[key] ?? {
    keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    text: key.length === 1 ? key : undefined
  }

  await send(paneId, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code: spec.code,
    windowsVirtualKeyCode: spec.keyCode,
    nativeVirtualKeyCode: spec.keyCode,
    text: spec.text,
    modifiers: modMask
  })
  if (spec.text) {
    // printable char: let the page receive a char event too
    await send(paneId, 'Input.dispatchKeyEvent', {
      type: 'char',
      key,
      code: spec.code,
      text: spec.text,
      modifiers: modMask
    })
  }
  await send(paneId, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: spec.code,
    windowsVirtualKeyCode: spec.keyCode,
    nativeVirtualKeyCode: spec.keyCode,
    modifiers: modMask
  })
}

export async function scrollBy(paneId: string, x: number, y: number, dx: number, dy: number): Promise<void> {
  await send(paneId, 'Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x, y,
    deltaX: dx,
    deltaY: dy
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
