import { useState, useEffect, useCallback, useRef } from 'react'
import { usePaneStore } from '../store/paneStore'
import type { XNextTweet } from '../../extensions/xnext/types'

export default function XNextFeed() {
  const sidebarCollapsed = usePaneStore((s) => s.sidebarCollapsed)
  const [enabled, setEnabled] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [tweets, setTweets] = useState<XNextTweet[]>([])
  const [loading, setLoading] = useState(false)
  const [composeText, setComposeText] = useState('')
  const [composing, setComposing] = useState(false)
  const [mediaPaths, setMediaPaths] = useState<string[]>([])
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const loadState = useCallback(() => {
    window.arcnext.xnext?.getState().then((s: { enabled: boolean }) => {
      setEnabled(s.enabled)
    }).catch(() => {})
  }, [])

  const loadFeed = useCallback(() => {
    setLoading(true)
    window.arcnext.xnext?.getFeed().then((feed: XNextTweet[]) => {
      if (feed.length > 0) setTweets(feed)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadState()
    loadFeed()
    const unsub = window.arcnext.xnext?.onChanged(loadState)
    return () => { unsub?.() }
  }, [loadState, loadFeed])

  useEffect(() => {
    if (composing && inputRef.current) inputRef.current.focus()
  }, [composing])

  const submitPost = async () => {
    if (!composeText.trim() || posting) return
    setPosting(true)
    setPostError('')
    const result = await window.arcnext.xnext.post(composeText, mediaPaths)
    setPosting(false)
    if (result.ok) {
      setComposeText('')
      setMediaPaths([])
      setComposing(false)
    } else {
      setPostError(result.error || 'Failed to post')
    }
  }

  const pickMedia = async () => {
    const paths = await window.arcnext.xnext.pickMedia()
    if (paths.length > 0) setMediaPaths(prev => [...prev, ...paths].slice(0, 4))
  }

  const removeMedia = (index: number) => {
    setMediaPaths(prev => prev.filter((_, i) => i !== index))
  }

  const closeCompose = () => {
    setComposing(false)
    setComposeText('')
    setMediaPaths([])
    setPostError('')
  }

  const openTweet = (tweet: XNextTweet) => {
    window.arcnext.browser.openInNewWorkspace(tweet.url)
  }

  if (!enabled) return null

  if (sidebarCollapsed) {
    return (
      <div className="xnext-collapsed">
        <div className="xnext-collapsed-icon" title="XNext Feed">𝕏</div>
      </div>
    )
  }

  return (
    <div className="xnext-panel">
      <div className="xnext-header">
        <span className="xnext-title">𝕏</span>
        <div className="xnext-header-actions">
          <button
            className="xnext-compose-btn"
            onClick={() => composing ? closeCompose() : setComposing(true)}
            title="Compose"
          >
            {composing ? '×' : '+'}
          </button>
          <button
            className={`xnext-refresh-btn${loading ? ' xnext-spinning' : ''}`}
            onClick={loadFeed}
            title="Refresh feed"
            disabled={loading}
          >
            ↻
          </button>
          <button
            className="xnext-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          {composing && (
            <div className="xnext-compose">
              <input
                ref={inputRef}
                data-suppress-shortcuts
                className="xnext-compose-input"
                placeholder="What's happening?"
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter' && !e.shiftKey) submitPost()
                  if (e.key === 'Escape') closeCompose()
                }}
              />
              <div className="xnext-compose-actions">
                <button className="xnext-media-btn" onClick={pickMedia} title="Attach media" disabled={mediaPaths.length >= 4}>
                  📎
                </button>
                <button
                  className="xnext-post-btn"
                  onClick={submitPost}
                  disabled={!composeText.trim() || posting}
                >
                  {posting ? '...' : 'Post'}
                </button>
              </div>
              {mediaPaths.length > 0 && (
                <div className="xnext-media-list">
                  {mediaPaths.map((p, i) => (
                    <span key={i} className="xnext-media-tag">
                      {p.split('/').pop()}
                      <button className="xnext-media-remove" onClick={() => removeMedia(i)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              {postError && <div className="xnext-post-error">{postError}</div>}
            </div>
          )}
          <div className="xnext-feed" ref={feedRef}>
            {tweets.length === 0 && !loading && (
              <div className="xnext-empty">No tweets yet. Hit ↻ to refresh.</div>
            )}
            {tweets.map((t) => (
              <div key={t.id} className="xnext-tweet" onClick={() => openTweet(t)}>
                {t.retweetedBy && <span className="xnext-rt">RT @{t.retweetedBy}</span>}
                <span className="xnext-handle">@{t.handle}</span>
                <span className="xnext-text">{t.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
