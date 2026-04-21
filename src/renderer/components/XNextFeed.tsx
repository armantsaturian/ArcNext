import { useState, useEffect, useCallback, useRef } from 'react'
import { usePaneStore } from '../store/paneStore'
import type { XNextTweet } from '../../extensions/xnext/types'

const MOCK_TWEETS: XNextTweet[] = [
  { id: '1', handle: 'collision', text: 'Encyclopaedic knowledge of the restaurant industry — DoorDash foray into autonomous delivery', url: 'https://x.com/i/status/2046575428589220256' },
  { id: '2', handle: 'GregoryScaduto', text: 'Gender discourse has become stupid. Stupid, in the technical sense.' },
  { id: '3', handle: 'nurijanian', text: 'DHH spent 20 years dismissing product management. Then admitted he was wrong.', url: 'https://x.com/i/status/2046273217472713086' },
  { id: '4', handle: 'karpathy', text: 'The hottest new programming language is English' },
  { id: '5', handle: 'elonmusk', text: 'The algorithm is the editor', url: 'https://x.com/elonmusk/status/123' },
  { id: '6', handle: 'tobi', text: 'Before you hire, ask: can AI do this? If yes, don\'t hire.' },
  { id: '7', handle: 'naval', text: 'Specific knowledge is found by pursuing your genuine curiosity' },
  { id: '8', handle: 'paulg', text: 'The best founders are relentlessly resourceful' },
  { id: '9', handle: 'sama', text: 'Intelligence too cheap to meter is coming soon' },
  { id: '10', handle: 'levelsio', text: 'Just ship it. Perfect is the enemy of done.', url: 'https://levelsio.com' },
  { id: '11', handle: 'george__mack', text: 'High agency people find a way. Low agency people find an excuse.' },
  { id: '12', handle: 'waitbutwhy', text: 'The cook follows the recipe. The chef invents one.' },
]

export default function XNextFeed() {
  const sidebarCollapsed = usePaneStore((s) => s.sidebarCollapsed)
  const [enabled, setEnabled] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [tweets] = useState<XNextTweet[]>(MOCK_TWEETS)
  const [composeText, setComposeText] = useState('')
  const [composing, setComposing] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    window.arcnext.xnext?.getState().then((s: { enabled: boolean }) => {
      setEnabled(s.enabled)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const unsub = window.arcnext.xnext?.onChanged(load)
    return () => { unsub?.() }
  }, [load])

  useEffect(() => {
    if (composing && inputRef.current) inputRef.current.focus()
  }, [composing])

  const openTweet = (tweet: XNextTweet) => {
    const url = tweet.url || `https://x.com/${tweet.handle}/status/${tweet.id}`
    window.arcnext.browser.openInNewWorkspace(url)
  }

  if (!enabled) return null

  if (sidebarCollapsed) {
    return (
      <div className="xnext-collapsed">
        <button className="xnext-collapsed-icon" onClick={() => setCollapsed(!collapsed)} title="XNext Feed">
          𝕏
        </button>
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
            onClick={() => setComposing(!composing)}
            title="Compose"
          >
            +
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
                  if (e.key === 'Enter' && composeText.trim()) {
                    setComposeText('')
                    setComposing(false)
                  }
                  if (e.key === 'Escape') {
                    setComposing(false)
                    setComposeText('')
                  }
                }}
              />
            </div>
          )}
          <div className="xnext-feed" ref={feedRef}>
            {tweets.map((t) => (
              <div key={t.id} className="xnext-tweet" onClick={() => openTweet(t)}>
                <span className="xnext-handle">@{t.handle}</span>
                <span className="xnext-text">{t.text}</span>
                {t.url && <a className="xnext-link" onClick={(e) => e.stopPropagation()} href="#">↗</a>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
