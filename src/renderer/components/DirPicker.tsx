import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { writeToTerminalPTY, focusTerminal } from '../model/terminalManager'
import { useActiveWorkspace } from '../store/paneStore'

interface DirEntry {
  path: string
  visitCount: number
  lastVisit: number
  score: number
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

export default function DirPicker({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [allEntries, setAllEntries] = useState<DirEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const ws = useActiveWorkspace()

  useEffect(() => {
    inputRef.current?.focus()
    window.arcnext.dirHistory.query().then(setAllEntries)
  }, [])

  const filtered = query
    ? allEntries.filter((e) => fuzzyMatch(e.path, query))
    : allEntries
  const results = filtered.slice(0, 20)

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current
    if (!container) return
    const item = container.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const selectDir = useCallback((path: string) => {
    if (!ws) return
    const escaped = path.replace(/'/g, "'\\''")
    writeToTerminalPTY(ws.activePaneId, `cd '${escaped}'\n`)
    onClose()
    setTimeout(() => focusTerminal(ws.activePaneId), 0)
  }, [ws, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        onClose()
        if (ws) setTimeout(() => focusTerminal(ws.activePaneId), 0)
        break
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) selectDir(results[selectedIndex].path)
        break
    }
  }, [results, selectedIndex, selectDir, onClose, ws])

  return (
    <div className="dir-picker-overlay" onClick={onClose}>
      <div className="dir-picker" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="dir-picker-input"
          placeholder="Go to directory..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="dir-picker-results" ref={resultsRef}>
          {results.map((entry, i) => {
            const name = entry.path.split('/').filter(Boolean).pop() || entry.path
            return (
              <div
                key={entry.path}
                className={`dir-picker-item${i === selectedIndex ? ' selected' : ''}`}
                onClick={() => selectDir(entry.path)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="dir-picker-name">{highlightMatch(name, query)}</span>
                <span className="dir-picker-path">{highlightMatch(entry.path, query)}</span>
              </div>
            )
          })}
          {results.length === 0 && query && (
            <div className="dir-picker-empty">No matching directories</div>
          )}
          {results.length === 0 && !query && (
            <div className="dir-picker-empty">No directory history yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
