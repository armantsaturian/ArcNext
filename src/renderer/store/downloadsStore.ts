import { useSyncExternalStore } from 'react'
import type { DownloadEntry } from '../../shared/types'

let snapshot: DownloadEntry[] = []
let requestId = 0
let unsubscribeIpc: (() => void) | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function setSnapshot(entries: DownloadEntry[]): void {
  snapshot = entries
  emit()
}

function getSnapshot(): DownloadEntry[] {
  return snapshot
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)

  if (listeners.size === 1) {
    unsubscribeIpc = window.arcnext.downloads.onChanged(setSnapshot)
    refreshDownloads()
  }

  return () => {
    listeners.delete(callback)
    if (listeners.size === 0) {
      unsubscribeIpc?.()
      unsubscribeIpc = null
    }
  }
}

export function useDownloadsSnapshot(): DownloadEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function refreshDownloads(): void {
  const currentRequestId = ++requestId
  window.arcnext.downloads.list()
    .then((entries) => {
      if (currentRequestId === requestId) setSnapshot(entries)
    })
    .catch(() => {})
}
