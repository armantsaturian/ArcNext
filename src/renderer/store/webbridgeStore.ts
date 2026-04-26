import { useSyncExternalStore } from 'react'

export interface WebBridgeSnapshot {
  enabled: boolean
  installed: boolean
  busy: boolean
  error: string | null
}

const DEFAULT_SNAPSHOT: WebBridgeSnapshot = {
  enabled: false,
  installed: false,
  busy: false,
  error: null
}

let snapshot = DEFAULT_SNAPSHOT
let requestId = 0
let actionRequestId = 0
let unsubscribeIpc: (() => void) | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function setSnapshot(patch: Partial<WebBridgeSnapshot>): void {
  const next = { ...snapshot, ...patch }
  if (
    next.enabled === snapshot.enabled &&
    next.installed === snapshot.installed &&
    next.busy === snapshot.busy &&
    next.error === snapshot.error
  ) return

  snapshot = next
  emit()
}

function getSnapshot(): WebBridgeSnapshot {
  return snapshot
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)

  if (listeners.size === 1) {
    unsubscribeIpc = window.settings?.webbridge.onChanged(refreshWebBridgeSettings) ?? null
    refreshWebBridgeSettings()
  }

  return () => {
    listeners.delete(callback)
    if (listeners.size === 0) {
      unsubscribeIpc?.()
      unsubscribeIpc = null
    }
  }
}

export function useWebBridgeSnapshot(): WebBridgeSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function refreshWebBridgeSettings(): void {
  const api = window.settings?.webbridge
  if (!api) return

  const currentRequestId = ++requestId
  api.getSettings()
    .then((settings) => {
      if (currentRequestId === requestId) {
        setSnapshot({
          enabled: settings.enabled,
          installed: settings.installed
        })
      }
    })
    .catch(() => {})
}

export function setWebBridgeEnabled(enabled: boolean): void {
  const api = window.settings?.webbridge
  if (!api || snapshot.busy) return

  const currentActionId = ++actionRequestId
  setSnapshot({ busy: true, error: null })

  api.setEnabled(enabled)
    .then(() => {
      if (currentActionId !== actionRequestId) return
      setSnapshot({ enabled, busy: false })
      refreshWebBridgeSettings()
    })
    .catch((err) => {
      if (currentActionId !== actionRequestId) return
      setSnapshot({
        busy: false,
        error: err instanceof Error ? err.message : String(err)
      })
    })
}

export function setWebBridgeInstalled(installed: boolean): void {
  const api = window.settings?.webbridge
  if (!api || snapshot.busy) return

  const currentActionId = ++actionRequestId
  setSnapshot({ busy: true, error: null })

  api.setInstalled(installed)
    .then((result) => {
      if (currentActionId !== actionRequestId) return
      if (result.ok) {
        setSnapshot({ installed, busy: false })
        refreshWebBridgeSettings()
      } else {
        setSnapshot({
          busy: false,
          error: result.errors?.[0] || 'Install failed'
        })
      }
    })
    .catch((err) => {
      if (currentActionId !== actionRequestId) return
      setSnapshot({
        busy: false,
        error: err instanceof Error ? err.message : String(err)
      })
    })
}
