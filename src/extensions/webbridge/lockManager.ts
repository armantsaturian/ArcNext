/**
 * Per-pane ownership. A session acquires a pane; only that session can run
 * write-tools on it until it releases, disconnects, or is preempted.
 *
 * "Yield to human" preempts the lock: any user input on the pane (mousedown,
 * keydown) calls yield(paneId), which revokes the lock immediately. The next
 * agent write-call gets an UserYielded error.
 */

export type LockEvent =
  | { type: 'acquired'; paneId: string; sessionId: string }
  | { type: 'released'; paneId: string; sessionId: string }
  | { type: 'yielded'; paneId: string; sessionId: string; reason: string }

type Listener = (event: LockEvent) => void

interface Lock {
  paneId: string
  sessionId: string
  acquiredAt: number
  lastActivity: number
}

const IDLE_MS = 60_000

const locks = new Map<string, Lock>()
const listeners = new Set<Listener>()

function emit(event: LockEvent): void {
  for (const l of listeners) {
    try { l(event) } catch { /* swallow */ }
  }
}

export function onLockEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getLock(paneId: string): Lock | undefined {
  return locks.get(paneId)
}

export function holder(paneId: string): string | undefined {
  return locks.get(paneId)?.sessionId
}

/** Attempt to acquire a pane. Returns true on success, false if held by another session. */
export function acquire(paneId: string, sessionId: string): boolean {
  const existing = locks.get(paneId)
  if (existing && existing.sessionId !== sessionId) return false
  const now = Date.now()
  locks.set(paneId, {
    paneId,
    sessionId,
    acquiredAt: existing?.acquiredAt ?? now,
    lastActivity: now
  })
  if (!existing) emit({ type: 'acquired', paneId, sessionId })
  return true
}

/** Release a pane. No-op if not held by this session. */
export function release(paneId: string, sessionId: string): void {
  const existing = locks.get(paneId)
  if (!existing || existing.sessionId !== sessionId) return
  locks.delete(paneId)
  emit({ type: 'released', paneId, sessionId })
}

/** Release all panes held by a session (used on disconnect). */
export function releaseAllFor(sessionId: string): void {
  for (const [paneId, lock] of locks.entries()) {
    if (lock.sessionId === sessionId) {
      locks.delete(paneId)
      emit({ type: 'released', paneId, sessionId })
    }
  }
}

/** Preempt whatever session holds this pane — used when the human interacts. */
export function yieldPane(paneId: string, reason = 'user-input'): void {
  const existing = locks.get(paneId)
  if (!existing) return
  locks.delete(paneId)
  emit({ type: 'yielded', paneId, sessionId: existing.sessionId, reason })
}

/** Check a session owns a pane. Also bumps activity timestamp on success. */
export function ensureOwned(paneId: string, sessionId: string): 'ok' | 'not-acquired' | 'held-by-other' {
  const existing = locks.get(paneId)
  if (!existing) return 'not-acquired'
  if (existing.sessionId !== sessionId) return 'held-by-other'
  existing.lastActivity = Date.now()
  return 'ok'
}

/** Called periodically to release idle locks. */
export function sweepIdle(now: number = Date.now()): void {
  for (const [paneId, lock] of locks.entries()) {
    if (now - lock.lastActivity > IDLE_MS) {
      locks.delete(paneId)
      emit({ type: 'released', paneId, sessionId: lock.sessionId })
    }
  }
}

/** Testing helper. */
export function _reset(): void {
  locks.clear()
  listeners.clear()
}
