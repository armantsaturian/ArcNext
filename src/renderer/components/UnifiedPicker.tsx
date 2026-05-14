import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { usePaneStore } from '../store/paneStore'
import type { CommandEntry, DirEntry, WebEntry } from '../../shared/types'
import {
  ensureProtocol,
  hostnameFromUrl,
  bareUrl,
  compactUrl,
  looksLikeUrl
} from '../../shared/urlUtils'
import {
  createInitialPickerSelectionState,
  movePickerSelection,
  selectPickerIndex,
  syncPickerSelection
} from '../model/pickerSelection'
import { substringMatch, filterWebEntries, filterCommandEntries, highlightSubstring, computeGhostText } from '../model/pickerHelpers'

type PickerItemType = 'dir' | 'web' | 'command'

interface PickerItem {
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

interface Props {
  onClose: () => void
}

const DIR_BOOST = 1.5

function PickerRow({ item, idx, selected, onSelect, onHover, compact, children }: {
  item: PickerItem
  idx: number
  selected: boolean
  onSelect: (item: PickerItem) => void
  onHover: (idx: number) => void
  compact?: boolean
  children: ReactNode
}) {
  return (
    <div
      key={item.key}
      data-selectable
      className={`picker-item${compact ? ' picker-item-compact' : ''}${selected ? ' selected' : ''}`}
      onClick={() => onSelect(item)}
      onMouseMove={() => onHover(idx)}
    >
      {children}
    </div>
  )
}

export default function UnifiedPicker({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [commandQuery, setCommandQuery] = useState('')
  const [runTarget, setRunTarget] = useState<PickerItem | null>(null)
  const [allDirEntries, setAllDirEntries] = useState<DirEntry[]>([])
  const [allWebEntries, setAllWebEntries] = useState<WebEntry[]>([])
  const [allCommandEntries, setAllCommandEntries] = useState<CommandEntry[]>([])
  const [selection, setSelection] = useState(createInitialPickerSelectionState)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const addWorkspace = usePaneStore((s) => s.addWorkspace)
  const addBrowserWorkspace = usePaneStore((s) => s.addBrowserWorkspace)

  useEffect(() => {
    inputRef.current?.focus()
    Promise.all([
      window.arcnext.dirHistory.query(),
      window.arcnext.dirDiscovery.query(),
      window.arcnext.webHistory.query(),
      window.arcnext.commandHistory.query()
    ]).then(([visited, discovered, webs, commands]) => {
      const visitedPaths = new Set(visited.map((e) => e.path))
      const newDiscovered = discovered.filter((e) => !visitedPaths.has(e.path))
      setAllDirEntries([...visited, ...newDiscovered])
      setAllWebEntries(webs)
      setAllCommandEntries(commands)
    })
  }, [])

  // --- Memoized data pipeline ---

  const sortedDirs = useMemo(() => {
    const items: PickerItem[] = (query
      ? allDirEntries.filter((e) => substringMatch(e.path, query) !== -1)
      : allDirEntries
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
  }, [query, allDirEntries])

  const sortedWebs = useMemo(() => {
    const limit = query ? 15 : 4
    return filterWebEntries(allWebEntries, query, limit).map((e) => ({
      type: 'web' as const,
      key: `web:${e.url}`,
      label: bareUrl(e.url),
      displayName: e.title || hostnameFromUrl(e.url),
      score: e.score,
      url: e.url,
      title: e.title,
      faviconUrl: e.faviconUrl
    }))
  }, [query, allWebEntries])

  const directUrlItems = useMemo(() => {
    const items: PickerItem[] = []
    if (!query || !looksLikeUrl(query)) return items

    const targetUrl = ensureProtocol(query)
    const bareTarget = bareUrl(targetUrl)

    items.push({
      type: 'web',
      key: `open:${targetUrl}`,
      label: bareTarget,
      displayName: `Open ${query}`,
      score: Infinity,
      url: targetUrl,
      title: `Open ${query}`
    })
    return items
  }, [query])

  const googleSearchItem = useMemo((): PickerItem[] => {
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
  }, [query])

  const commandItems = useMemo((): PickerItem[] => {
    if (!runTarget) return []

    const trimmed = commandQuery.trim()
    const historyLimit = trimmed ? 10 : 6
    const historyItems = filterCommandEntries(allCommandEntries, commandQuery, historyLimit)
      .map((e) => ({
        type: 'command' as const,
        key: `command-history:${e.command}`,
        label: e.command,
        displayName: e.command,
        score: e.score,
        command: e.command
      }))

    if (!trimmed) return historyItems

    const hasExactHistoryItem = historyItems.some((item) => item.command === trimmed)
    const directItem: PickerItem = {
      type: 'command',
      key: `command-direct:${trimmed}`,
      label: trimmed,
      displayName: `Run "${trimmed}"`,
      score: Infinity,
      command: trimmed
    }

    return hasExactHistoryItem ? historyItems : [...historyItems, directItem]
  }, [runTarget, commandQuery, allCommandEntries])

  const allItems = useMemo(
    () => runTarget
      ? commandItems
      : [...sortedDirs, ...directUrlItems, ...sortedWebs, ...googleSearchItem],
    [runTarget, commandItems, sortedDirs, directUrlItems, sortedWebs, googleSearchItem]
  )

  // Section offsets for flat indexing
  const dirOffset = 0
  const directUrlOffset = sortedDirs.length
  const webOffset = directUrlOffset + directUrlItems.length
  const searchOffset = webOffset + sortedWebs.length
  const commandOffset = 0

  const itemKeys = useMemo(() => allItems.map((item) => item.key), [allItems])
  const selectedIndex = selection.selectedIndex
  const selectedItem = allItems[selectedIndex]
  const activeQuery = runTarget ? commandQuery : query

  const ghostText = (() => {
    if (!activeQuery) return ''
    if (!selectedItem) return ''
    return computeGhostText(selectedItem.label, activeQuery)
  })()

  useEffect(() => {
    setSelection((prev) => syncPickerSelection(prev, itemKeys))
  }, [itemKeys])

  useEffect(() => {
    const container = resultsRef.current
    if (!container) return
    const selectables = container.querySelectorAll('[data-selectable]')
    const item = selectables[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleRunCommand = useCallback((command: string) => {
    const cwd = runTarget?.dirPath
    if (!cwd) return
    const trimmed = command.trim()
    addWorkspace(cwd, trimmed ? { initialCommand: trimmed } : undefined)
    if (trimmed) window.arcnext.commandHistory.visit(trimmed)
    onClose()
  }, [addWorkspace, onClose, runTarget])

  const handleSelect = useCallback((item: PickerItem) => {
    switch (item.type) {
      case 'dir':
        if (item.dirPath) {
          addWorkspace(item.dirPath)
          onClose()
        }
        break
      case 'web':
        if (item.url) {
          addBrowserWorkspace(ensureProtocol(item.url))
          onClose()
        }
        break
      case 'command':
        handleRunCommand(item.command || item.displayName)
        break
    }
  }, [addWorkspace, addBrowserWorkspace, onClose, handleRunCommand])

  const handleNewBlankWorkspace = useCallback(() => {
    addWorkspace()
    onClose()
  }, [addWorkspace, onClose])

  const handleHover = useCallback((idx: number) => {
    setSelection((prev) => selectPickerIndex(prev, itemKeys, idx))
  }, [itemKeys])

  const acceptGhost = useCallback(() => {
    if (!ghostText) return false
    const item = allItems[selectedIndex]
    if (!item) return false
    setQuery(item.label)
    return true
  }, [ghostText, allItems, selectedIndex])

  const enterRunMode = useCallback((item: PickerItem) => {
    if (item.type !== 'dir' || !item.dirPath) return false
    setRunTarget(item)
    setCommandQuery('')
    setSelection(createInitialPickerSelectionState())
    requestAnimationFrame(() => inputRef.current?.focus())
    return true
  }, [])

  const exitRunMode = useCallback(() => {
    setRunTarget(null)
    setCommandQuery('')
    setSelection(createInitialPickerSelectionState())
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const acceptActiveGhost = useCallback(() => {
    if (!ghostText) return false
    const item = allItems[selectedIndex]
    if (!item) return false
    if (runTarget) {
      setCommandQuery(item.label)
    } else {
      setQuery(item.label)
    }
    return true
  }, [ghostText, allItems, selectedIndex, runTarget])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        if (runTarget) exitRunMode()
        else onClose()
        break
      case 'Tab':
        e.preventDefault()
        if (runTarget) {
          acceptActiveGhost()
        } else {
          const item = allItems[selectedIndex]
          if (!item || !enterRunMode(item)) acceptGhost()
        }
        break
      case 'Backspace':
        if (runTarget && commandQuery === '') {
          e.preventDefault()
          exitRunMode()
        }
        break
      case 'ArrowRight': {
        const input = inputRef.current
        if (input && input.selectionStart === input.value.length && ghostText) {
          e.preventDefault()
          acceptActiveGhost()
        }
        break
      }
      case 'ArrowDown':
        e.preventDefault()
        setSelection((prev) => movePickerSelection(prev, itemKeys, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelection((prev) => movePickerSelection(prev, itemKeys, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (runTarget) {
          const selected = allItems[selectedIndex]
          const typedCommand = commandQuery.trim()
          if (typedCommand) {
            handleRunCommand(selected?.type === 'command' ? selected.command || typedCommand : typedCommand)
          } else if (selected?.type === 'command' && selection.hasUserNavigated) {
            handleRunCommand(selected.command || '')
          } else {
            handleRunCommand('')
          }
        } else if (allItems[selectedIndex]) {
          handleSelect(allItems[selectedIndex])
        } else {
          handleNewBlankWorkspace()
        }
        break
    }
  }, [
    allItems,
    selectedIndex,
    selection.hasUserNavigated,
    handleSelect,
    handleNewBlankWorkspace,
    onClose,
    acceptGhost,
    acceptActiveGhost,
    ghostText,
    itemKeys,
    runTarget,
    commandQuery,
    handleRunCommand,
    enterRunMode,
    exitRunMode
  ])

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <div className={`picker-input-wrapper${runTarget ? ' picker-input-wrapper-run' : ''}`}>
          {runTarget && (
            <span className="picker-run-prefix">{runTarget.displayName}</span>
          )}
          <div className="picker-input-stack">
            <div className="picker-ghost" aria-hidden="true">
              <span className="picker-ghost-hidden">{activeQuery}</span>
              <span className="picker-ghost-completion">{ghostText}</span>
            </div>
            <input
              ref={inputRef}
              className="picker-input"
              placeholder={runTarget ? 'Command to run…' : 'New tab — directory or website...'}
              value={activeQuery}
              onChange={(e) => runTarget ? setCommandQuery(e.target.value) : setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          {!runTarget && selectedItem?.type === 'dir' && (
            <div className="picker-input-hint" aria-hidden="true">
              <span>Run command</span>
              <kbd>Tab</kbd>
            </div>
          )}
        </div>
        <div className="picker-results" ref={resultsRef}>
          {runTarget ? (
            <>
              <div className="picker-section-header">command</div>
              {commandItems.map((item, i) => {
                const idx = commandOffset + i
                return (
                  <PickerRow key={item.key} item={item} idx={idx} selected={idx === selectedIndex} onSelect={handleSelect} onHover={handleHover}>
                    <div className="picker-item-web-row">
                      <span className="picker-item-favicon-icon">$</span>
                      <span className="picker-item-name picker-item-name-truncate">{highlightSubstring(item.displayName, commandQuery)}</span>
                    </div>
                  </PickerRow>
                )
              })}
              {commandItems.length === 0 && (
                <div className="picker-empty">Type a command, or choose one after you have some history.</div>
              )}
              <div className="picker-run-path">{runTarget.dirPath}</div>
            </>
          ) : sortedDirs.length > 0 && (
            <>
              <div className="picker-section-header">dirs</div>
              {sortedDirs.map((item, i) => {
                const idx = dirOffset + i
                return (
                  <PickerRow key={item.key} item={item} idx={idx} selected={idx === selectedIndex} onSelect={handleSelect} onHover={handleHover}>
                    <span className="picker-item-name">{highlightSubstring(item.displayName, query)}</span>
                    <span className="picker-item-path">{highlightSubstring(item.dirPath!, query)}</span>
                  </PickerRow>
                )
              })}
            </>
          )}

          {!runTarget && (directUrlItems.length > 0 || sortedWebs.length > 0) && (
            <>
              {sortedDirs.length > 0 && <div className="picker-section-divider" />}
              <div className="picker-section-header">web</div>

              {directUrlItems.map((item, i) => {
                const idx = directUrlOffset + i
                return (
                  <PickerRow key={item.key} item={item} idx={idx} selected={idx === selectedIndex} onSelect={handleSelect} onHover={handleHover}>
                    <div className="picker-item-web-row">
                      <span className="picker-item-favicon-icon">{'\u{1F310}'}</span>
                      <span className="picker-item-name">{item.displayName}</span>
                    </div>
                  </PickerRow>
                )
              })}

              {sortedWebs.map((item, i) => {
                const idx = webOffset + i
                return (
                  <PickerRow key={item.key} item={item} idx={idx} selected={idx === selectedIndex} onSelect={handleSelect} onHover={handleHover} compact>
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
                      <span className="picker-item-name picker-item-name-truncate">{highlightSubstring(item.displayName, query)}</span>
                      <span className="picker-item-url-compact">{compactUrl(item.url!)}</span>
                    </div>
                  </PickerRow>
                )
              })}
            </>
          )}

          {!runTarget && googleSearchItem.length > 0 && (
            <>
              {(sortedDirs.length > 0 || directUrlItems.length > 0 || sortedWebs.length > 0) && (
                <div className="picker-section-divider" />
              )}
              {googleSearchItem.map((item, i) => {
                const idx = searchOffset + i
                return (
                  <PickerRow key={item.key} item={item} idx={idx} selected={idx === selectedIndex} onSelect={handleSelect} onHover={handleHover}>
                    <div className="picker-item-web-row">
                      <span className="picker-item-favicon-icon">{'\u{1F50D}'}</span>
                      <span className="picker-item-name">{item.displayName}</span>
                    </div>
                  </PickerRow>
                )
              })}
            </>
          )}

          {!runTarget && allItems.length === 0 && !query && (
            <div className="picker-empty">No history yet — press Enter for a blank terminal</div>
          )}
        </div>
      </div>
    </div>
  )
}
