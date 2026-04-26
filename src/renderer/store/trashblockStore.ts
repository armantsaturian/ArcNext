import { useSyncExternalStore } from 'react'

export interface TrashblockSnapshot {
  enabled: boolean
}

const DEFAULT_SNAPSHOT: TrashblockSnapshot = {
  enabled: true
}

let snapshot = DEFAULT_SNAPSHOT
let requestId = 0
let unsubscribeIpc: (() => void) | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function setSnapshot(patch: Partial<TrashblockSnapshot>): void {
  const next = { ...snapshot, ...patch }
  if (next.enabled === snapshot.enabled) return

  snapshot = next
  emit()
}

function getSnapshot(): TrashblockSnapshot {
  return snapshot
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)

  if (listeners.size === 1) {
    unsubscribeIpc = window.settings?.trashblock.onChanged(refreshTrashblockState) ?? null
    refreshTrashblockState()
  }

  return () => {
    listeners.delete(callback)
    if (listeners.size === 0) {
      unsubscribeIpc?.()
      unsubscribeIpc = null
    }
  }
}

export function useTrashblockSnapshot(): TrashblockSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function refreshTrashblockState(): void {
  const api = window.settings?.trashblock
  if (!api) return

  const currentRequestId = ++requestId
  api.getState()
    .then((state) => {
      if (currentRequestId === requestId) setSnapshot({ enabled: state.enabled })
    })
    .catch(() => {})
}

export function setTrashblockEnabled(enabled: boolean): void {
  const api = window.settings?.trashblock
  if (!api) return

  const previousEnabled = snapshot.enabled
  setSnapshot({ enabled })

  api.setEnabled(enabled)
    .then(refreshTrashblockState)
    .catch(() => setSnapshot({ enabled: previousEnabled }))
}
