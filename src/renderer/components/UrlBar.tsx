import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { WebEntry } from '../../shared/types'
import { filterWebEntries, highlightSubstring, computeGhostText } from '../model/pickerHelpers'
import {
  ensureProtocol,
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

interface Props {
  paneId: string
  url: string
  isHttps: boolean
  isActivePane: boolean
  onNavigate: (url: string) => void
  onDropdownChange?: (open: boolean) => void
}

interface SuggestionItem {
  key: string
  label: string
  displayName: string
  url: string
  faviconUrl?: string
  score: number
}

export default function UrlBar({ paneId, url, isHttps, isActivePane, onNavigate, onDropdownChange }: Props) {
  const [urlInput, setUrlInput] = useState(url)
  const [editing, setEditing] = useState(false)
  const [webEntries, setWebEntries] = useState<WebEntry[]>([])
  const [selection, setSelection] = useState(createInitialPickerSelectionState)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Sync URL input when not editing
  useEffect(() => {
    if (!editing) setUrlInput(url)
  }, [url, editing])

  // Listen for Cmd+L focus event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.paneId === paneId && isActivePane) {
        window.arcnext.browser.focusRenderer()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('browser-focus-url', handler)
    return () => window.removeEventListener('browser-focus-url', handler)
  }, [paneId, isActivePane])

  const query = editing ? urlInput : ''

  const suggestions = useMemo(() => {
    if (!query) return []

    const webItems: SuggestionItem[] = filterWebEntries(webEntries, query, 8)
      .map(e => ({
        key: `web:${e.url}`,
        label: bareUrl(e.url),
        displayName: e.title || bareUrl(e.url),
        url: e.url,
        faviconUrl: e.faviconUrl,
        score: e.score,
      }))

    const items: SuggestionItem[] = []

    if (looksLikeUrl(query)) {
      const targetUrl = ensureProtocol(query)
      items.push({
        key: `open:${targetUrl}`,
        label: bareUrl(targetUrl),
        displayName: `Open ${query}`,
        url: targetUrl,
        score: Infinity,
      })
    }

    items.push(...webItems)

    items.push({
      key: `search:${query}`,
      label: query,
      displayName: `Search Google for "${query}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      score: -Infinity,
    })

    return items
  }, [query, webEntries])

  const itemKeys = useMemo(() => suggestions.map(s => s.key), [suggestions])

  useEffect(() => {
    setSelection(prev => syncPickerSelection(prev, itemKeys))
  }, [itemKeys])

  // Auto-scroll dropdown to selected item
  useEffect(() => {
    const container = dropdownRef.current
    if (!container) return
    const items = container.querySelectorAll('[data-selectable]')
    const el = items[selection.selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selection.selectedIndex])

  const selectedIndex = selection.selectedIndex

  const ghostText = useMemo(() => {
    if (!query) return ''
    const item = suggestions[selectedIndex]
    if (!item) return ''
    return computeGhostText(item.label, query)
  }, [query, suggestions, selectedIndex])

  const navigate = useCallback((targetUrl: string) => {
    onNavigate(targetUrl)
    setEditing(false)
    inputRef.current?.blur()
  }, [onNavigate])

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select()
    setEditing(true)
    window.arcnext.webHistory.query().then(setWebEntries)
  }, [])

  const handleBlur = useCallback(() => {
    setEditing(false)
    setUrlInput(url)
    setSelection(createInitialPickerSelectionState())
  }, [url])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value)
    setSelection(createInitialPickerSelectionState())
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const item = suggestions[selectedIndex]
    if (item) {
      navigate(item.url)
    } else {
      const val = urlInput.trim()
      if (val) navigate(val)
    }
  }, [suggestions, selectedIndex, urlInput, navigate])

  const acceptGhost = useCallback(() => {
    if (!ghostText) return false
    const item = suggestions[selectedIndex]
    if (!item) return false
    setUrlInput(item.label)
    return true
  }, [ghostText, suggestions, selectedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        setEditing(false)
        setUrlInput(url)
        inputRef.current?.blur()
        break
      case 'Tab':
        if (ghostText) {
          e.preventDefault()
          acceptGhost()
        }
        break
      case 'ArrowRight': {
        const input = inputRef.current
        if (input && input.selectionStart === input.value.length && ghostText) {
          e.preventDefault()
          acceptGhost()
        }
        break
      }
      case 'ArrowDown':
        if (suggestions.length > 0) {
          e.preventDefault()
          setSelection(prev => movePickerSelection(prev, itemKeys, 1))
        }
        break
      case 'ArrowUp':
        if (suggestions.length > 0) {
          e.preventDefault()
          setSelection(prev => movePickerSelection(prev, itemKeys, -1))
        }
        break
    }
    e.stopPropagation()
  }, [url, ghostText, suggestions, itemKeys, acceptGhost])

  const handleItemMouseDown = useCallback((e: React.MouseEvent, item: SuggestionItem) => {
    e.preventDefault()
    navigate(item.url)
  }, [navigate])

  const handleItemHover = useCallback((idx: number) => {
    setSelection(prev => selectPickerIndex(prev, itemKeys, idx))
  }, [itemKeys])

  const showDropdown = editing && query.length > 0 && suggestions.length > 0

  // Notify parent so it can hide WebContentsView (native views paint over DOM)
  useEffect(() => {
    onDropdownChange?.(showDropdown)
  }, [showDropdown, onDropdownChange])

  return (
    <div className="browser-url-wrapper">
      <form className="browser-url-form" onSubmit={handleSubmit}>
        {isHttps && !editing && <span className="browser-url-lock">🔒</span>}
        <div className="browser-url-input-area">
          {editing && ghostText && (
            <div className="browser-url-ghost" aria-hidden="true">
              <span className="browser-url-ghost-hidden">{urlInput}</span>
              <span className="browser-url-ghost-completion">{ghostText}</span>
            </div>
          )}
          <input
            data-suppress-shortcuts
            ref={inputRef}
            className="browser-url-input"
            type="text"
            value={urlInput}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
        </div>
      </form>
      {showDropdown && (
        <div className="browser-url-dropdown" ref={dropdownRef}>
          {suggestions.map((item, idx) => (
            <div
              key={item.key}
              data-selectable
              className={`browser-url-dropdown-item${idx === selectedIndex ? ' selected' : ''}`}
              onMouseDown={(e) => handleItemMouseDown(e, item)}
              onMouseMove={() => handleItemHover(idx)}
            >
              <div className="browser-url-dropdown-row">
                {item.faviconUrl ? (
                  <img
                    className="browser-url-dropdown-favicon"
                    src={item.faviconUrl}
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span className="browser-url-dropdown-favicon-icon">
                    {item.key.startsWith('search:') ? '\u{1F50D}' : '\u{1F310}'}
                  </span>
                )}
                <span className="browser-url-dropdown-name">
                  {highlightSubstring(item.displayName, query)}
                </span>
                {item.key.startsWith('web:') && (
                  <span className="browser-url-dropdown-url">{compactUrl(item.url)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
