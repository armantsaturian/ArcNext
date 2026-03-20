import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { writeToTerminalPTY, focusTerminal } from '../model/terminalManager'
import { usePaneStore, useActiveWorkspace, type BrowserPaneInfo } from '../store/paneStore'
import { allPaneIds } from '../model/splitTree'

interface DirEntry {
  path: string
  visitCount: number
  lastVisit: number
  score: number
}

interface WebEntry {
  url: string
  title: string
  faviconUrl: string
  visitCount: number
  lastVisit: number
  score: number
}

type PickerItemType = 'dir' | 'web' | 'web-open' | 'web-switch' | 'web-open-new'

interface PickerItem {
  type: PickerItemType
  key: string
  // Dir fields
  dirPath?: string
  // Web fields
  url?: string
  title?: string
  faviconUrl?: string
  // Switch fields
  switchWorkspaceId?: string
  switchWorkspaceName?: string
}

interface Props {
  onClose: () => void
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let j = 0
  for (let i = 0; i < lower.length && j < q.length; i++) {
    if (lower[i] === q[j]) j++
  }
  return j === q.length
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const parts: ReactNode[] = []
  let j = 0
  let plain = ''
  for (let i = 0; i < text.length; i++) {
    if (j < q.length && lower[i] === q[j]) {
      if (plain) { parts.push(plain); plain = '' }
      parts.push(<mark key={i}>{text[i]}</mark>)
      j++
    } else {
      plain += text[i]
    }
  }
  if (plain) parts.push(plain)
  return parts
}

function looksLikeUrl(input: string): boolean {
  if (/^https?:\/\//i.test(input)) return true
  return input.includes('.') && !input.includes(' ') && input.length > 3
}

function normalizeForCompare(url: string): string {
  try {
    const u = new URL(url)
    u.hostname = u.hostname.toLowerCase()
    let normalized = u.toString()
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
    return normalized
  } catch {
    return url.replace(/\/$/, '').toLowerCase()
  }
}

function ensureProtocol(input: string): string {
  if (/^https?:\/\//i.test(input)) return input
  return `https://${input}`
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export default function UnifiedPicker({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [allDirEntries, setAllDirEntries] = useState<DirEntry[]>([])
  const [allWebEntries, setAllWebEntries] = useState<WebEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const ws = useActiveWorkspace()
  const panes = usePaneStore((s) => s.panes)
  const workspaces = usePaneStore((s) => s.workspaces)
  const addBrowserWorkspace = usePaneStore((s) => s.addBrowserWorkspace)
  const switchWorkspace = usePaneStore((s) => s.switchWorkspace)

  useEffect(() => {
    inputRef.current?.focus()
    Promise.all([
      window.arcnext.dirHistory.query(),
      window.arcnext.webHistory.query()
    ]).then(([dirs, webs]) => {
      setAllDirEntries(dirs)
      setAllWebEntries(webs)
    })
  }, [])

  // Filter dir entries
  const filteredDirs = query
    ? allDirEntries.filter((e) => fuzzyMatch(e.path, query))
    : allDirEntries
  const dirLimit = query ? 15 : 4
  const dirItems: PickerItem[] = filteredDirs.slice(0, dirLimit).map((e) => ({
    type: 'dir' as const,
    key: `dir:${e.path}`,
    dirPath: e.path
  }))

  // Filter web entries
  const filteredWebs = query
    ? allWebEntries.filter((e) =>
        fuzzyMatch(e.url, query) ||
        (e.title && fuzzyMatch(e.title, query))
      )
    : allWebEntries
  const webLimit = query ? 15 : 4
  const webHistoryItems: PickerItem[] = filteredWebs.slice(0, webLimit).map((e) => ({
    type: 'web' as const,
    key: `web:${e.url}`,
    url: e.url,
    title: e.title,
    faviconUrl: e.faviconUrl
  }))

  // Find open browser panes for "already open" detection
  const openBrowserPanes: Array<{ paneId: string; url: string; workspaceId: string; workspaceName: string }> = []
  for (const w of workspaces) {
    const wsPaneIds = allPaneIds(w.tree)
    for (const pid of wsPaneIds) {
      const pane = panes.get(pid)
      if (pane?.type === 'browser') {
        const bp = pane as BrowserPaneInfo
        openBrowserPanes.push({
          paneId: pid,
          url: bp.url,
          workspaceId: w.id,
          workspaceName: w.name || bp.title || hostnameFromUrl(bp.url)
        })
      }
    }
  }

  // Build direct URL item + switch items
  const directUrlItems: PickerItem[] = []
  if (query && looksLikeUrl(query)) {
    const targetUrl = ensureProtocol(query)
    const normalizedTarget = normalizeForCompare(targetUrl)

    // Check if already open
    const match = openBrowserPanes.find(
      (p) => normalizeForCompare(p.url) === normalizedTarget
    )

    if (match) {
      directUrlItems.push({
        type: 'web-switch',
        key: `switch:${match.workspaceId}`,
        url: targetUrl,
        title: `Switch to "${match.workspaceName}"`,
        switchWorkspaceId: match.workspaceId,
        switchWorkspaceName: match.workspaceName
      })
      directUrlItems.push({
        type: 'web-open-new',
        key: `open-new:${targetUrl}`,
        url: targetUrl,
        title: 'Open in new workspace'
      })
    } else {
      directUrlItems.push({
        type: 'web-open',
        key: `open:${targetUrl}`,
        url: targetUrl,
        title: `Open ${query}`
      })
    }
  }

  // Build flat selectable items array
  const allItems: PickerItem[] = [...dirItems, ...directUrlItems, ...webHistoryItems]

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current
    if (!container) return
    // Find the actual DOM element for the selected item
    const selectables = container.querySelectorAll('[data-selectable]')
    const item = selectables[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const selectDir = useCallback((path: string) => {
    if (!ws) return
    const escaped = path.replace(/'/g, "'\\''")
    writeToTerminalPTY(ws.activePaneId, `cd '${escaped}'\n`)
    onClose()
    setTimeout(() => focusTerminal(ws.activePaneId), 0)
  }, [ws, onClose])

  const selectWeb = useCallback((url: string) => {
    addBrowserWorkspace(ensureProtocol(url))
    onClose()
  }, [addBrowserWorkspace, onClose])

  const selectSwitch = useCallback((workspaceId: string) => {
    switchWorkspace(workspaceId)
    onClose()
  }, [switchWorkspace, onClose])

  const handleSelect = useCallback((item: PickerItem) => {
    switch (item.type) {
      case 'dir':
        if (item.dirPath) selectDir(item.dirPath)
        break
      case 'web':
      case 'web-open':
      case 'web-open-new':
        if (item.url) selectWeb(item.url)
        break
      case 'web-switch':
        if (item.switchWorkspaceId) selectSwitch(item.switchWorkspaceId)
        break
    }
  }, [selectDir, selectWeb, selectSwitch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        onClose()
        if (ws) setTimeout(() => focusTerminal(ws.activePaneId), 0)
        break
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (allItems[selectedIndex]) handleSelect(allItems[selectedIndex])
        break
    }
  }, [allItems, selectedIndex, handleSelect, onClose, ws])

  // Track which flat index we're at while rendering
  let flatIndex = 0

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="picker-input"
          placeholder="Go to directory or website..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="picker-results" ref={resultsRef}>
          {/* Dir section */}
          {dirItems.length > 0 && (
            <>
              <div className="picker-section-header">dirs</div>
              {dirItems.map((item) => {
                const idx = flatIndex++
                const name = item.dirPath!.split('/').filter(Boolean).pop() || item.dirPath!
                return (
                  <div
                    key={item.key}
                    data-selectable
                    className={`picker-item${idx === selectedIndex ? ' selected' : ''}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="picker-item-name">{highlightMatch(name, query)}</span>
                    <span className="picker-item-path">{highlightMatch(item.dirPath!, query)}</span>
                  </div>
                )
              })}
            </>
          )}

          {/* Web section */}
          {(directUrlItems.length > 0 || webHistoryItems.length > 0) && (
            <>
              {dirItems.length > 0 && <div className="picker-section-divider" />}
              <div className="picker-section-header">web</div>

              {/* Direct URL / switch items */}
              {directUrlItems.map((item) => {
                const idx = flatIndex++
                return (
                  <div
                    key={item.key}
                    data-selectable
                    className={`picker-item${idx === selectedIndex ? ' selected' : ''}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="picker-item-web-row">
                      <span className="picker-item-favicon-icon">{'\u{1F310}'}</span>
                      <span className="picker-item-name">{item.title}</span>
                      {item.type === 'web-switch' && (
                        <span className="picker-item-badge">open</span>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* History items */}
              {webHistoryItems.map((item) => {
                const idx = flatIndex++
                const displayTitle = item.title || hostnameFromUrl(item.url!)
                return (
                  <div
                    key={item.key}
                    data-selectable
                    className={`picker-item${idx === selectedIndex ? ' selected' : ''}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="picker-item-web-row">
                      {item.faviconUrl ? (
                        <img
                          className="picker-item-favicon"
                          src={item.faviconUrl}
                          alt=""
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <span className="picker-item-favicon-icon">{'\u{1F310}'}</span>
                      )}
                      <span className="picker-item-name">{highlightMatch(displayTitle, query)}</span>
                    </div>
                    <span className="picker-item-path">{highlightMatch(item.url!, query)}</span>
                  </div>
                )
              })}
            </>
          )}

          {allItems.length === 0 && query && (
            <div className="picker-empty">No matching results</div>
          )}
          {allItems.length === 0 && !query && (
            <div className="picker-empty">No history yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
