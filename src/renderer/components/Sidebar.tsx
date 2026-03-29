import { useState, useEffect, useCallback, useRef } from 'react'
import { usePaneStore, Workspace, PaneInfo, TerminalPaneInfo, BrowserPaneInfo } from '../store/paneStore'
import { allPaneIds } from '../model/gridLayout'
import { groupUnpinnedWorkspaces } from '../model/workspaceGrouping'
import { paneDisplayTitle, formatTitle } from '../model/titleFormatter'
import type { AgentState } from '../../shared/types'
import AgentIndicator from './AgentIndicator'

function SpeakerIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg className="ws-speaker" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" fill="currentColor" stroke="none" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    )
  }
  return (
    <svg className="ws-speaker" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

function useDismissible<T>(value: T | null, setter: (v: null) => void): void {
  useEffect(() => {
    if (!value) return
    const dismiss = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      setter(null)
    }
    document.addEventListener('click', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('click', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [value, setter])
}

function FaviconIcon({ pane, size = 12 }: { pane: PaneInfo; size?: number }) {
  const [error, setError] = useState(false)
  const faviconUrl = pane.type === 'browser' ? (pane as BrowserPaneInfo).faviconUrl : undefined

  useEffect(() => { setError(false) }, [faviconUrl])

  if (!faviconUrl || error) {
    return <>{'\u{1F310}'}</>
  }

  return (
    <img
      className="ws-favicon"
      src={faviconUrl}
      alt=""
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  )
}

const COLOR_PALETTE = [
  '#74c0fc', '#51cf66', '#ffd43b', '#ff6b6b',
  '#cc5de8', '#66d9e8', '#ff922b', undefined
] as const

function ColorPicker({
  x, y, currentColor, onSelect
}: {
  x: number; y: number; currentColor: string | undefined
  onSelect: (color: string | undefined) => void
}) {
  return (
    <div className="color-picker" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {COLOR_PALETTE.map((color, i) => (
        <button
          key={i}
          className={`color-swatch ${(color === currentColor || (!color && !currentColor)) ? 'swatch-active' : ''}`}
          style={color ? { background: color } : undefined}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  )
}

export default function Sidebar() {
  const workspaces = usePaneStore((s) => s.workspaces)
  const activeWorkspaceId = usePaneStore((s) => s.activeWorkspaceId)
  const panes = usePaneStore((s) => s.panes)
  const switchWorkspace = usePaneStore((s) => s.switchWorkspace)
  const addWorkspace = usePaneStore((s) => s.addWorkspace)
  const removeWorkspace = usePaneStore((s) => s.removeWorkspace)
  const closePaneInWorkspace = usePaneStore((s) => s.closePaneInWorkspace)
  const mergeWorkspaces = usePaneStore((s) => s.mergeWorkspaces)
  const separateWorkspace = usePaneStore((s) => s.separateWorkspace)
  const setWorkspaceColor = usePaneStore((s) => s.setWorkspaceColor)
  const setWorkspaceName = usePaneStore((s) => s.setWorkspaceName)
  const sidebarWidth = usePaneStore((s) => s.sidebarWidth)
  const sidebarCollapsed = usePaneStore((s) => s.sidebarCollapsed)
  const toggleSidebar = usePaneStore((s) => s.toggleSidebar)
  const setSidebarWidth = usePaneStore((s) => s.setSidebarWidth)

  const setOverlay = usePaneStore((s) => s.setOverlay)
  const agentStates = usePaneStore((s) => s.agentStates)
  const audioStates = usePaneStore((s) => s.audioStates)
  const sidebarGrouped = usePaneStore((s) => s.sidebarGrouped)
  const setSidebarGrouped = usePaneStore((s) => s.setSidebarGrouped)

  const moveWorkspace = usePaneStore((s) => s.moveWorkspace)
  const pinWorkspace = usePaneStore((s) => s.pinWorkspace)
  const unpinWorkspace = usePaneStore((s) => s.unpinWorkspace)
  const sleepWorkspace = usePaneStore((s) => s.sleepWorkspace)
  const wakeWorkspace = usePaneStore((s) => s.wakeWorkspace)

  const [dragSourceId, setDragSourceId] = useState<string | null>(null)
  const [dragOverState, setDragOverState] = useState<{
    targetId: string
    position: 'before' | 'after' | 'on'
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; workspaceId: string } | null>(null)
  const [colorPicker, setColorPicker] = useState<{ x: number; y: number; workspaceId: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dividerDropActive, setDividerDropActive] = useState(false)

  const sidebarPopupOpen = !!(contextMenu || colorPicker)
  useEffect(() => {
    setOverlay('sidebar', sidebarPopupOpen)
    return () => setOverlay('sidebar', false)
  }, [sidebarPopupOpen, setOverlay])

  useDismissible(contextMenu, () => setContextMenu(null))
  useDismissible(colorPicker, () => setColorPicker(null))

  useEffect(() => {
    window.arcnext.sidebar.setTrafficLightsVisible(!sidebarCollapsed)
  }, [sidebarCollapsed])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = usePaneStore.getState().sidebarWidth

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = startWidth + (ev.clientX - startX)
      setSidebarWidth(newWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [setSidebarWidth])

  return (
    <div
      className={`sidebar${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      style={{ width: sidebarCollapsed ? 48 : sidebarWidth }}
    >
      <div className="sidebar-header">
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1.5" y="2.5" width="13" height="10" rx="2" />
            <line x1="6" y1="2.5" x2="6" y2="12.5" />
            <line x1="3" y1="5.5" x2="5" y2="5.5" />
            <line x1="3" y1="7.5" x2="5" y2="7.5" />
            <line x1="3" y1="9.5" x2="5" y2="9.5" />
          </svg>
        </button>
      </div>
      <div className="sidebar-list" onDragOver={(e) => { if (dragSourceId) e.preventDefault() }}>
        {(() => {
          const pinnedWs = workspaces.filter((w) => w.pinned)
          const unpinnedWs = workspaces.filter((w) => !w.pinned)

          const handleDragOver = (ws: Workspace) => (e: React.DragEvent) => {
            e.preventDefault()
            if (dragSourceId === ws.id) { setDragOverState(null); return }
            const rect = e.currentTarget.getBoundingClientRect()
            const ratio = (e.clientY - rect.top) / rect.height
            const position = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'on'
            const srcIdx = workspaces.findIndex((w) => w.id === dragSourceId)
            const tgtIdx = workspaces.findIndex((w) => w.id === ws.id)
            if (position === 'before' && tgtIdx === srcIdx + 1) { setDragOverState(null); return }
            if (position === 'after' && tgtIdx === srcIdx - 1) { setDragOverState(null); return }
            if (dragOverState?.targetId === ws.id && dragOverState?.position === position) return
            setDragOverState({ targetId: ws.id, position })
          }

          const handleDrop = (ws: Workspace) => (e: React.DragEvent) => {
            e.preventDefault()
            if (dragSourceId && dragSourceId !== ws.id && dragOverState) {
              const sourceWs = workspaces.find((w) => w.id === dragSourceId)
              if (dragOverState.position === 'on') {
                // Wake dormant workspace before merging
                if (ws.dormant) wakeWorkspace(ws.id)
                if (sourceWs?.dormant) wakeWorkspace(dragSourceId)
                mergeWorkspaces(ws.id, dragSourceId, e.shiftKey ? 'vertical' : 'horizontal')
              } else {
                // Check if crossing pinned boundary
                const sourceIsPinned = sourceWs?.pinned
                const targetIsPinned = ws.pinned
                if (!sourceIsPinned && targetIsPinned) {
                  pinWorkspace(dragSourceId)
                } else if (sourceIsPinned && !targetIsPinned) {
                  unpinWorkspace(dragSourceId)
                }
                // Reorder
                const updated = usePaneStore.getState().workspaces
                const fromIndex = updated.findIndex((w) => w.id === dragSourceId)
                let toIndex = updated.findIndex((w) => w.id === ws.id)
                if (dragOverState.position === 'after') toIndex++
                if (fromIndex < toIndex) toIndex--
                moveWorkspace(fromIndex, toIndex)
              }
            }
            setDragSourceId(null)
            setDragOverState(null)
            setDividerDropActive(false)
          }

          const renderRow = (ws: Workspace) => {
            const wsPaneIds = allPaneIds(ws.grid)
            // Compute aggregate agent state and per-pane agent map for this workspace
            let wsAgentState: AgentState | null = null
            let wsPaneAgentStates: Map<string, AgentState> | undefined
            for (const pid of wsPaneIds) {
              const as = agentStates.get(pid)
              if (!as) continue
              if (!wsPaneAgentStates) wsPaneAgentStates = new Map()
              wsPaneAgentStates.set(pid, as)
              if (as.status === 'thinking') { wsAgentState = as; break }
              if (!wsAgentState) wsAgentState = as
            }
            // Compute aggregate audio state for this workspace
            let wsAudioState: { muted: boolean; paneIds: string[] } | null = null
            {
              let hasPlaying = false
              let allMuted = true
              const playingPaneIds: string[] = []
              for (const pid of wsPaneIds) {
                const audio = audioStates.get(pid)
                if (audio?.playing) {
                  hasPlaying = true
                  playingPaneIds.push(pid)
                  if (!audio.muted) allMuted = false
                }
              }
              if (hasPlaying) wsAudioState = { muted: allMuted, paneIds: playingPaneIds }
            }
            return (
            <WorkspaceRow
              key={ws.id}
              workspace={ws}
              panes={panes}
              collapsed={sidebarCollapsed}
              isActive={ws.id === activeWorkspaceId}
              isDragging={ws.id === dragSourceId}
              dropPosition={dragOverState?.targetId === ws.id && ws.id !== dragSourceId ? dragOverState.position : null}
              agentState={wsAgentState}
              paneAgentStates={wsPaneAgentStates}
              audioState={wsAudioState}
              grouped={sidebarGrouped}
              onSelect={() => {
                if (ws.dormant) wakeWorkspace(ws.id)
                switchWorkspace(ws.id)
              }}
              onSleep={() => sleepWorkspace(ws.id)}
              onRemove={() => removeWorkspace(ws.id)}
              onClosePane={(paneId) => closePaneInWorkspace(ws.id, paneId)}
              isEditing={editingId === ws.id}
              onDoubleClick={() => {
                if (!sidebarCollapsed) {
                  setContextMenu(null)
                  setColorPicker(null)
                  setEditingId(ws.id)
                }
              }}
              onRename={(name) => {
                setWorkspaceName(ws.id, name)
                setEditingId(null)
              }}
              onCancelRename={() => setEditingId(null)}
              onDragStart={() => setDragSourceId(ws.id)}
              onDragOver={handleDragOver(ws)}
              onDragLeave={(e) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                  setDragOverState(null)
                }
              }}
              onDrop={handleDrop(ws)}
              onDragEnd={() => {
                setDragSourceId(null)
                setDragOverState(null)
                setDividerDropActive(false)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setColorPicker(null)
                setEditingId(null)
                setContextMenu({ x: e.clientX, y: e.clientY, workspaceId: ws.id })
              }}
            />
          )}

          return (
            <>
              {pinnedWs.map(renderRow)}
              <div
                className={`sidebar-divider${dividerDropActive ? ' divider-drop-active' : ''}${sidebarGrouped ? ' divider-grouped' : ''}`}
                onDragOver={(e) => {
                  if (dragSourceId) {
                    e.preventDefault()
                    setDividerDropActive(true)
                  }
                }}
                onDragLeave={() => setDividerDropActive(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragSourceId) {
                    const sourceWs = workspaces.find((w) => w.id === dragSourceId)
                    if (sourceWs && !sourceWs.pinned) {
                      pinWorkspace(dragSourceId)
                    } else if (sourceWs && sourceWs.pinned) {
                      unpinWorkspace(dragSourceId)
                    }
                  }
                  setDragSourceId(null)
                  setDragOverState(null)
                  setDividerDropActive(false)
                }}
              >
                {!sidebarCollapsed && (
                  <button
                    className="divider-group-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSidebarGrouped(!sidebarGrouped)
                    }}
                    title={sidebarGrouped ? 'Ungroup workspaces' : 'Group workspaces'}
                  >
                    {sidebarGrouped ? 'Ungroup' : 'Group'}
                  </button>
                )}
              </div>
              {sidebarGrouped ? (
                groupUnpinnedWorkspaces(unpinnedWs, panes).map((group) => (
                  <div key={group.key} className="ws-group">
                    {!sidebarCollapsed && (
                      <div className="ws-group-header">{group.label}</div>
                    )}
                    {group.workspaces.map(renderRow)}
                  </div>
                ))
              ) : (
                unpinnedWs.map(renderRow)
              )}
            </>
          )
        })()}
        <button
          className={`sidebar-add${dragSourceId && dragOverState?.targetId === '__add' ? ' sidebar-add-drop' : ''}`}
          onClick={() => addWorkspace()}
          onDragOver={(e) => { if (dragSourceId) { e.preventDefault(); setDragOverState({ targetId: '__add', position: 'before' }) } }}
          onDragLeave={() => setDragOverState(null)}
          onDrop={(e) => {
            e.preventDefault()
            if (dragSourceId) {
              const sourceWs = workspaces.find((w) => w.id === dragSourceId)
              if (sourceWs?.pinned) unpinWorkspace(dragSourceId)
              const updated = usePaneStore.getState().workspaces
              const from = updated.findIndex((w) => w.id === dragSourceId)
              if (from < updated.length - 1) moveWorkspace(from, updated.length - 1)
            }
            setDragSourceId(null); setDragOverState(null)
          }}
        >
          {sidebarCollapsed ? '+' : '+ New Workspace'}
        </button>
      </div>
      {contextMenu && (() => {
        const ctxWs = workspaces.find((w) => w.id === contextMenu.workspaceId)
        return (
          <div
            className="ctx-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="ctx-menu-item"
              onClick={() => {
                setEditingId(contextMenu.workspaceId)
                setContextMenu(null)
              }}
            >
              Rename
            </button>
            <button
              className="ctx-menu-item"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setColorPicker({ x: rect.right + 4, y: rect.top, workspaceId: contextMenu.workspaceId })
                setContextMenu(null)
              }}
            >
              Color
            </button>
            {ctxWs && allPaneIds(ctxWs.grid).length > 1 && (
              <button
                className="ctx-menu-item"
                onClick={() => {
                  separateWorkspace(contextMenu.workspaceId)
                  setContextMenu(null)
                }}
              >
                Separate All
              </button>
            )}
          </div>
        )
      })()}
      {colorPicker && (
        <ColorPicker
          x={colorPicker.x}
          y={colorPicker.y}
          currentColor={workspaces.find((w) => w.id === colorPicker.workspaceId)?.color}
          onSelect={(color) => {
            setWorkspaceColor(colorPicker.workspaceId, color)
            setColorPicker(null)
          }}
        />
      )}
      {!sidebarCollapsed && (
        <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
      )}
    </div>
  )
}

interface WorkspaceRowProps {
  workspace: Workspace
  panes: Map<string, PaneInfo>
  collapsed: boolean
  isActive: boolean
  isDragging: boolean
  dropPosition: 'before' | 'after' | 'on' | null
  agentState: AgentState | null
  paneAgentStates?: Map<string, AgentState>
  audioState: { muted: boolean; paneIds: string[] } | null
  isEditing: boolean
  grouped: boolean
  onSelect: () => void
  onSleep: () => void
  onRemove: () => void
  onClosePane: (paneId: string) => void
  onDoubleClick: () => void
  onRename: (name: string) => void
  onCancelRename: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function WorkspaceRow({
  workspace, panes, collapsed, isActive, isDragging, dropPosition, agentState, paneAgentStates, audioState, isEditing, grouped,
  onSelect, onSleep, onRemove, onClosePane, onDoubleClick, onRename, onCancelRename,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onContextMenu
}: WorkspaceRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const paneIds = allPaneIds(workspace.grid)
  const paneInfos = paneIds.map((id) => panes.get(id)).filter(Boolean) as PaneInfo[]
  const isSinglePane = paneInfos.length === 1
  const wsColor = workspace.color

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!audioState) return
    for (const pid of audioState.paneIds) {
      window.arcnext.browser.toggleMute(pid)
    }
  }

  const hasCustomName = workspace.name && !workspace.name.startsWith('Workspace ')
  const firstPane = paneInfos[0]
  const defaultTitle = firstPane ? paneDisplayTitle(firstPane, grouped) || 'shell' : 'shell'
  const displayTitle = hasCustomName ? workspace.name : defaultTitle
  const isBrowserWorkspace = firstPane?.type === 'browser'
  const initial = (displayTitle === 'shell' ? 'S' : displayTitle.split('/').pop() || 'S').charAt(0).toUpperCase()

  const audioBtn = audioState && (
    <button className="ws-audio-btn" onClick={handleToggleMute} title={audioState.muted ? 'Unmute' : 'Mute'}>
      <SpeakerIcon muted={audioState.muted} />
    </button>
  )

  // Show agent indicator instead of default icon when an agent is detected
  const terminalIcon = agentState
    ? <AgentIndicator status={agentState.status} />
    : '\u25A0'
  const icon = isBrowserWorkspace && firstPane ? <FaviconIcon pane={firstPane} /> : terminalIcon

  const className = [
    'ws-row',
    isActive && 'active',
    isDragging && 'ws-dragging',
    workspace.dormant && 'ws-dormant',
    dropPosition === 'on' && 'ws-drop-target',
    dropPosition === 'before' && 'ws-insert-before',
    dropPosition === 'after' && 'ws-insert-after'
  ].filter(Boolean).join(' ')

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleRenameSubmit = (value: string) => {
    const trimmed = value.trim()
    onRename(trimmed || '')
  }

  return (
    <div
      className={className}
      style={wsColor ? { '--ws-color': wsColor } as React.CSSProperties : undefined}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      title={collapsed ? displayTitle : undefined}
    >
      {collapsed ? (
        <div className="ws-collapsed-icon">
          {agentState ? <AgentIndicator status={agentState.status} /> : isBrowserWorkspace && firstPane ? <FaviconIcon pane={firstPane} size={16} /> : initial}
          {audioState && (
            <button className="ws-audio-badge" onClick={handleToggleMute} title={audioState.muted ? 'Unmute' : 'Mute'}>
              <SpeakerIcon muted={audioState.muted} />
            </button>
          )}
        </div>
      ) : isEditing ? (
        <div className="ws-single">
          <span className="ws-icon">{icon}</span>
          <input
            data-suppress-shortcuts
            ref={inputRef}
            className="ws-rename-input"
            defaultValue={hasCustomName ? workspace.name : ''}
            placeholder={formatTitle(defaultTitle)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                handleRenameSubmit(e.currentTarget.value)
              } else if (e.key === 'Escape') {
                onCancelRename()
              }
            }}
            onBlur={(e) => handleRenameSubmit(e.currentTarget.value)}
          />
        </div>
      ) : hasCustomName ? (
        <div className="ws-single">
          <span className="ws-icon">{icon}</span>
          {audioBtn}
          <span className="ws-title">{workspace.name}</span>
        </div>
      ) : isSinglePane ? (
        <div className="ws-single">
          <span className="ws-icon">{icon}</span>
          {audioBtn}
          <span className="ws-title">{formatTitle(paneDisplayTitle(firstPane))}</span>
        </div>
      ) : (
        <div className="ws-multi">
          {paneInfos.map((p) => {
            const paneAgent = paneAgentStates?.get(p.id)
            const pillIcon = paneAgent
              ? <><AgentIndicator status={paneAgent.status} />{' '}</>
              : p.type === 'browser' ? <><FaviconIcon pane={p} />{' '}</> : null
            return (
            <span key={p.id} className={`ws-pill ${isActive && p.id === workspace.activePaneId ? 'pill-active' : ''}`}>
              {pillIcon}{formatTitle(paneDisplayTitle(p))}
              {isActive && (
                <button
                  className="pill-close"
                  draggable={false}
                  onClick={(e) => { e.stopPropagation(); onClosePane(p.id) }}
                >
                  &times;
                </button>
              )}
            </span>
          )})}
        </div>
      )}
      {(!isActive || isSinglePane || workspace.pinned) && !isEditing && (() => {
        const isSleepAction = workspace.pinned && isActive
        return (
          <button
            className={`ws-close${isSleepAction ? ' ws-close-sleep' : ''}`}
            draggable={false}
            title={isSleepAction ? 'Close and Keep Pinned' : 'Archive this tab'}
            onClick={(e) => {
              e.stopPropagation()
              isSleepAction ? onSleep() : onRemove()
            }}
          >
            {isSleepAction ? '\u2013' : '\u00d7'}
          </button>
        )
      })()}
    </div>
  )
}

