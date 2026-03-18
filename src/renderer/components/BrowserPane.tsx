import { useEffect, useRef, useState, useCallback } from 'react'
import { usePaneStore, type BrowserPaneInfo } from '../store/paneStore'

interface Props {
  paneId: string
  workspaceId: string
}

export default function BrowserPane({ paneId, workspaceId }: Props) {
  const placeholderRef = useRef<HTMLDivElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = useState('')
  const [error, setError] = useState<{ code: number; desc: string } | null>(null)

  const pane = usePaneStore((s) => {
    const p = s.panes.get(paneId)
    return p?.type === 'browser' ? p as BrowserPaneInfo : null
  })
  const isWorkspaceActive = usePaneStore((s) => s.activeWorkspaceId === workspaceId)
  const isActivePane = usePaneStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId)
    return ws?.activePaneId === paneId
  })
  const setActive = usePaneStore((s) => s.setActivePaneInWorkspace)

  const url = pane?.url ?? ''
  const canGoBack = pane?.canGoBack ?? false
  const canGoForward = pane?.canGoForward ?? false
  const isLoading = pane?.isLoading ?? false

  // Sync URL input with store URL when not editing
  useEffect(() => {
    if (document.activeElement !== urlInputRef.current) {
      setUrlInput(url)
    }
  }, [url])

  // Clear error on navigation
  useEffect(() => {
    setError(null)
  }, [url])

  // Create WebContentsView on mount, destroy on unmount
  useEffect(() => {
    window.arcnext.browser.create(paneId, url)
    return () => {
      window.arcnext.browser.destroy(paneId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId]) // url intentionally excluded — create once with initial url

  // Show/hide based on workspace activity and error state
  useEffect(() => {
    if (isWorkspaceActive && !error) {
      window.arcnext.browser.show(paneId)
      // Report bounds immediately on show
      if (placeholderRef.current) {
        const rect = placeholderRef.current.getBoundingClientRect()
        window.arcnext.browser.setBounds(paneId, {
          x: rect.x, y: rect.y, width: rect.width, height: rect.height
        })
      }
    } else {
      window.arcnext.browser.hide(paneId)
    }
  }, [isWorkspaceActive, error, paneId])

  // Report bounds on resize
  useEffect(() => {
    const el = placeholderRef.current
    if (!el) return
    let rafId = 0
    const report = () => {
      if (!isWorkspaceActive || error) return
      const rect = el.getBoundingClientRect()
      window.arcnext.browser.setBounds(paneId, {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height
      })
    }
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(report)
    })
    observer.observe(el)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [paneId, isWorkspaceActive, error])

  // Listen for load failures
  useEffect(() => {
    return window.arcnext.browser.onLoadFailed((id, code, desc) => {
      if (id === paneId) setError({ code, desc })
    })
  }, [paneId])

  const handleUrlSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const val = urlInput.trim()
    if (val) {
      window.arcnext.browser.navigate(paneId, val)
      setError(null)
      urlInputRef.current?.blur()
    }
  }, [paneId, urlInput])

  const handleUrlKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setUrlInput(url)
      urlInputRef.current?.blur()
    }
    // Stop propagation for text editing keys so global shortcuts don't interfere
    e.stopPropagation()
  }, [url])

  if (!pane) return null

  const isHttps = url.startsWith('https://')

  return (
    <div
      className={`browser-pane${isActivePane ? ' active' : ''}`}
      onMouseDown={() => setActive(paneId)}
    >
      <div className="browser-nav">
        <button
          className="browser-nav-btn"
          disabled={!canGoBack}
          onClick={() => window.arcnext.browser.goBack(paneId)}
          title="Back"
        >
          ‹
        </button>
        <button
          className="browser-nav-btn"
          disabled={!canGoForward}
          onClick={() => window.arcnext.browser.goForward(paneId)}
          title="Forward"
        >
          ›
        </button>
        <button
          className="browser-nav-btn"
          onClick={() =>
            isLoading
              ? window.arcnext.browser.stop(paneId)
              : window.arcnext.browser.reload(paneId)
          }
          title={isLoading ? 'Stop' : 'Reload'}
        >
          {isLoading ? '✕' : '↻'}
        </button>
        <form className="browser-url-form" onSubmit={handleUrlSubmit}>
          {isHttps && <span className="browser-url-lock">🔒</span>}
          <input
            ref={urlInputRef}
            className="browser-url-input"
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => setUrlInput(url)}
            onKeyDown={handleUrlKeyDown}
            spellCheck={false}
          />
        </form>
      </div>
      <div className="browser-content" ref={placeholderRef}>
        {error && (
          <div className="browser-error">
            <div className="browser-error-title">Failed to load page</div>
            <div className="browser-error-detail">
              {error.desc} (error {error.code})
            </div>
            <button
              className="browser-error-retry"
              onClick={() => {
                setError(null)
                window.arcnext.browser.reload(paneId)
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
