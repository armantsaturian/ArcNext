/**
 * Page overlay — a sky-blue frame injected into the browser pane's DOM so the
 * agent-driving signal appears *on top* of the page (not just on the chrome
 * behind the WebContentsView).
 *
 * The overlay is injected idempotently before each use — navigation wipes it,
 * but we re-inject on the next call. It uses `position: fixed` and a huge
 * z-index so it sits above any page content, with `pointer-events: none` so
 * it never intercepts user input.
 *
 * Visuals:
 *   - A 3px sky-blue ring just inside the viewport edge
 *   - A soft inner shadow so the edges feel darker and well-defined
 *   - The center is fully transparent — the page remains usable
 *   - "acting" brightens the ring and widens the glow for ~600ms per action
 */

import type { WebContents } from 'electron'

const PANE_HOLDS = new Map<string, boolean>()

/** Script lives on `window.__arcnextOverlay`. Idempotent — safe to re-run. */
const OVERLAY_SCRIPT = `
(function () {
  if (window.__arcnextOverlay) return;
  var root = document.createElement('div');
  root.id = '__arcnext_overlay';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'pointer-events:none',
    'z-index:2147483647',
    'border-radius:inherit',
    'transition:box-shadow 220ms ease'
  ].join(';');
  (document.body || document.documentElement).appendChild(root);

  var pulseTimer = null;
  var hold = false;

  function apply(mode) {
    if (mode === 'off') {
      root.style.boxShadow = 'inset 0 0 0 0 rgba(116,192,252,0), inset 0 0 0 0 rgba(0,0,0,0)';
    } else if (mode === 'hold') {
      root.style.boxShadow = [
        'inset 0 0 0 2px rgba(116,192,252,0.7)',
        'inset 0 0 0 3px rgba(0,0,0,0.35)',
        'inset 0 0 18px rgba(116,192,252,0.18)'
      ].join(',');
    } else {
      root.style.boxShadow = [
        'inset 0 0 0 3px rgba(116,192,252,0.95)',
        'inset 0 0 0 4px rgba(0,0,0,0.45)',
        'inset 0 0 36px rgba(116,192,252,0.35)'
      ].join(',');
    }
  }

  window.__arcnextOverlay = {
    setHold: function (on) {
      hold = !!on;
      if (!pulseTimer) apply(hold ? 'hold' : 'off');
    },
    pulse: function () {
      apply('acting');
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(function () {
        pulseTimer = null;
        apply(hold ? 'hold' : 'off');
      }, 600);
    }
  };
})();
`

async function run(wc: WebContents, extra: string): Promise<void> {
  if (wc.isDestroyed()) return
  try {
    await wc.executeJavaScript(OVERLAY_SCRIPT + extra, false)
  } catch { /* page closing / CSP race — swallow */ }
}

export async function setHold(wc: WebContents, paneId: string, on: boolean): Promise<void> {
  PANE_HOLDS.set(paneId, on)
  if (!on) PANE_HOLDS.delete(paneId)
  await run(wc, `window.__arcnextOverlay.setHold(${on ? 'true' : 'false'});`)
}

export async function pulse(wc: WebContents, paneId: string): Promise<void> {
  // Keep hold state consistent in case navigation wiped the overlay.
  const holds = PANE_HOLDS.get(paneId) ? 'true' : 'false'
  await run(wc, `window.__arcnextOverlay.setHold(${holds});window.__arcnextOverlay.pulse();`)
}

export function clearPaneState(paneId: string): void {
  PANE_HOLDS.delete(paneId)
}
