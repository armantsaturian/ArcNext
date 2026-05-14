import type { CommandEntry, DirEntry, WebEntry } from '../../shared/types'
import { ensureProtocol, hostnameFromUrl, bareUrl, looksLikeUrl } from '../../shared/urlUtils'
import { substringMatch, filterWebEntries, filterCommandEntries } from './pickerHelpers'

export type PickerItemType = 'dir' | 'web' | 'command'

export interface PickerItem {
  type: PickerItemType
  key: string
  label: string        // text used for ghost text completion
  displayName: string  // what to show in the list
  score: number
  dirPath?: string
  url?: string
  title?: string
  faviconUrl?: string
  command?: string
}

const DIR_BOOST = 1.5

export function buildDirItems(entries: DirEntry[], query: string): PickerItem[] {
  const items: PickerItem[] = (query
    ? entries.filter((e) => substringMatch(e.path, query) !== -1)
    : entries
  ).map((e) => {
    const name = e.path.split('/').filter(Boolean).pop() || e.path
    return {
      type: 'dir' as const,
      key: `dir:${e.path}`,
      label: name,
      displayName: name,
      score: e.score * DIR_BOOST,
      dirPath: e.path
    }
  })
  const limit = query ? 15 : 4
  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}

export function buildWebItems(entries: WebEntry[], query: string): PickerItem[] {
  const limit = query ? 15 : 4
  return filterWebEntries(entries, query, limit).map((e) => ({
    type: 'web' as const,
    key: `web:${e.url}`,
    label: bareUrl(e.url),
    displayName: e.title || hostnameFromUrl(e.url),
    score: e.score,
    url: e.url,
    title: e.title,
    faviconUrl: e.faviconUrl
  }))
}

export function buildDirectUrlItems(query: string): PickerItem[] {
  if (!query || !looksLikeUrl(query)) return []

  const targetUrl = ensureProtocol(query)
  const bareTarget = bareUrl(targetUrl)
  return [{
    type: 'web',
    key: `open:${targetUrl}`,
    label: bareTarget,
    displayName: `Open ${query}`,
    score: Infinity,
    url: targetUrl,
    title: `Open ${query}`
  }]
}

export function buildGoogleSearchItems(query: string): PickerItem[] {
  if (!query) return []
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
  return [{
    type: 'web',
    key: `search:${query}`,
    label: query,
    displayName: `Search Google for "${query}"`,
    score: -Infinity,
    url: searchUrl
  }]
}

export function buildCommandItems(entries: CommandEntry[], query: string): PickerItem[] {
  const trimmed = query.trim()
  const historyLimit = trimmed ? 10 : 6
  return filterCommandEntries(entries, query, historyLimit).map((e) => ({
    type: 'command' as const,
    key: `command-history:${e.command}`,
    label: e.command,
    displayName: e.command,
    score: e.score,
    command: e.command
  }))
}
