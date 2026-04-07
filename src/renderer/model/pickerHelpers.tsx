import type { ReactNode } from 'react'
import type { WebEntry } from '../../shared/types'

export function substringMatch(text: string, query: string): number {
  return text.toLowerCase().indexOf(query.toLowerCase())
}

/** Filter, deduplicate, sort, and limit web history entries by query. */
export function filterWebEntries(entries: WebEntry[], query: string, limit: number): WebEntry[] {
  const filtered = query
    ? entries.filter(e =>
        substringMatch(e.url, query) !== -1 ||
        (e.title && substringMatch(e.title, query) !== -1)
      )
    : entries

  const dedupMap = new Map<string, WebEntry>()
  for (const e of filtered) {
    const k = (e.title || e.url).toLowerCase()
    const existing = dedupMap.get(k)
    if (!existing || e.score > existing.score) dedupMap.set(k, e)
  }

  return [...dedupMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function highlightSubstring(text: string, query: string): ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function computeGhostText(label: string, query: string): string {
  if (!query) return ''
  const idx = label.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return ''
  return label.slice(idx + query.length)
}
