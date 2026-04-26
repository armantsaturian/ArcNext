import { useSyncExternalStore } from 'react'
import type { XNextTweet } from '../../extensions/xnext/types'

interface XNextStateApi {
  getState(): Promise<{ enabled: boolean }>
  setEnabled(enabled: boolean): Promise<void>
  checkAvailable(): Promise<{ available: boolean }>
  onChanged(cb: () => void): () => void
}

interface XNextFeedApi extends XNextStateApi {
  getFeed(): Promise<XNextTweet[]>
  post(text: string, mediaPaths: string[]): Promise<{ ok: boolean; error?: string }>
  pickMedia(): Promise<string[]>
}

export interface XNextSnapshot {
  enabled: boolean
  xcliMissing: boolean
  tweets: XNextTweet[]
  loading: boolean
}

const DEFAULT_SNAPSHOT: XNextSnapshot = {
  enabled: false,
  xcliMissing: false,
  tweets: [],
  loading: false
}

let snapshot = DEFAULT_SNAPSHOT
let stateRequestId = 0
let feedRequestId = 0
let unsubscribeIpc: (() => void) | null = null
const listeners = new Set<() => void>()

function getSettingsXNext(): XNextStateApi | undefined {
  const w = window as Window & { settings?: { xnext?: XNextStateApi } }
  return w.settings?.xnext
}

function getStateApi(): XNextStateApi | undefined {
  return window.arcnext?.xnext ?? getSettingsXNext()
}

function getFeedApi(): XNextFeedApi | undefined {
  return window.arcnext?.xnext
}

function emit(): void {
  for (const listener of listeners) listener()
}

function setSnapshot(patch: Partial<XNextSnapshot>): void {
  const next = { ...snapshot, ...patch }
  if (
    next.enabled === snapshot.enabled &&
    next.xcliMissing === snapshot.xcliMissing &&
    next.tweets === snapshot.tweets &&
    next.loading === snapshot.loading
  ) return

  snapshot = next
  emit()
}

function getSnapshot(): XNextSnapshot {
  return snapshot
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)

  if (listeners.size === 1) {
    const api = getStateApi()
    unsubscribeIpc = api?.onChanged(refreshXNextState) ?? null
    refreshXNextState()
  }

  return () => {
    listeners.delete(callback)
    if (listeners.size === 0) {
      unsubscribeIpc?.()
      unsubscribeIpc = null
    }
  }
}

export function useXNextSnapshot(): XNextSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function refreshXNextState(): void {
  const api = getStateApi()
  if (!api) return

  const requestId = ++stateRequestId
  Promise.all([api.getState(), api.checkAvailable()])
    .then(([state, availability]) => {
      if (requestId !== stateRequestId) return

      const wasEnabled = snapshot.enabled
      setSnapshot({
        enabled: state.enabled,
        xcliMissing: !availability.available,
        loading: state.enabled ? snapshot.loading : false
      })

      if (state.enabled && !wasEnabled) refreshXNextFeed()
    })
    .catch(() => {})
}

export function refreshXNextFeed(): void {
  const api = getFeedApi()
  if (!api || !snapshot.enabled) return

  const requestId = ++feedRequestId
  setSnapshot({ loading: true })

  api.getFeed()
    .then((feed) => {
      if (requestId !== feedRequestId) return
      setSnapshot({
        tweets: feed.length > 0 ? feed : snapshot.tweets,
        loading: false
      })
    })
    .catch(() => {
      if (requestId === feedRequestId) setSnapshot({ loading: false })
    })

  api.checkAvailable()
    .then(({ available }) => setSnapshot({ xcliMissing: !available }))
    .catch(() => {})
}

export function setXNextEnabled(enabled: boolean): void {
  const api = getStateApi()
  if (!api) return

  setSnapshot({ enabled, loading: enabled ? snapshot.loading : false })
  api.setEnabled(enabled)
    .then(() => {
      refreshXNextState()
      if (enabled) refreshXNextFeed()
    })
    .catch(() => {
      setSnapshot({ enabled: !enabled })
    })
}

export async function postXNext(text: string, mediaPaths: string[]): Promise<{ ok: boolean; error?: string }> {
  const api = getFeedApi()
  if (!api) return { ok: false, error: 'XNext is unavailable' }

  const result = await api.post(text, mediaPaths)
  if (result.ok) refreshXNextFeed()
  if (result.error === 'xcli not installed') setSnapshot({ xcliMissing: true })
  return result
}

export async function pickXNextMedia(): Promise<string[]> {
  const api = getFeedApi()
  if (!api) return []
  return api.pickMedia()
}
