import { useState, useEffect, useCallback } from 'react'
import { usePaneStore, Workspace, PaneInfo } from '../store/paneStore'
import { allPaneIds } from '../model/splitTree'

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
  const sidebarWidth = usePaneStore((s) => s.sidebarWidth)
  const sidebarCollapsed = usePaneStore((s) => s.sidebarCollapsed)
  const toggleSidebar = usePaneStore((s) => s.toggleSidebar)
  const setSidebarWidth = usePaneStore((s) => s.setSidebarWidth)

  const [dragSourceId, setDragSourceId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; workspaceId: string } | null>(null)
  const [colorPicker, setColorPicker] = useState<{ x: number; y: number; workspaceId: string } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const dismiss = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      setContextMenu(null)
    }
    document.addEventListener('click', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('click', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!colorPicker) return
    const dismiss = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      setColorPicker(null)
    }
    document.addEventListener('click', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('click', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [colorPicker])

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
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="2" width="14" height="11" rx="2" />
            <polyline points="4,6 7,8 4,10" fill="none" />
            <line x1="8" y1="10" x2="12" y2="10" />
          </svg>
        </button>
      </div>
      <div className="sidebar-list">
        {workspaces.map((ws) => (
          <WorkspaceRow
            key={ws.id}
            workspace={ws}
            panes={panes}
            collapsed={sidebarCollapsed}
            isActive={ws.id === activeWorkspaceId}
            isDragging={ws.id === dragSourceId}
            isDropTarget={ws.id === dragOverId && ws.id !== dragSourceId}
            onSelect={() => switchWorkspace(ws.id)}
            onClose={() => removeWorkspace(ws.id)}
            onClosePane={(paneId) => closePaneInWorkspace(ws.id, paneId)}
            onDoubleClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setContextMenu(null)
              setColorPicker({ x: rect.right + 4, y: rect.top, workspaceId: ws.id })
            }}
            onDragStart={() => setDragSourceId(ws.id)}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverId(ws.id)
            }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                setDragOverId(null)
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragSourceId && dragSourceId !== ws.id) {
                const direction = e.shiftKey ? 'horizontal' : 'vertical'
                mergeWorkspaces(ws.id, dragSourceId, direction)
              }
              setDragSourceId(null)
              setDragOverId(null)
            }}
            onDragEnd={() => {
              setDragSourceId(null)
              setDragOverId(null)
            }}
            onContextMenu={(e) => {
              if (ws.tree.type !== 'split') return
              e.preventDefault()
              setColorPicker(null)
              setContextMenu({ x: e.clientX, y: e.clientY, workspaceId: ws.id })
            }}
          />
        ))}
      </div>
      {contextMenu && (
        <div
          className="ctx-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ctx-menu-item"
            onClick={() => {
              separateWorkspace(contextMenu.workspaceId)
              setContextMenu(null)
            }}
          >
            Separate
          </button>
        </div>
      )}
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
      <div className="sidebar-footer">
        <button className="sidebar-add" onClick={addWorkspace}>
          {sidebarCollapsed ? '+' : '+ New Workspace'}
        </button>
      </div>
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
  isDropTarget: boolean
  onSelect: () => void
  onClose: () => void
  onClosePane: (paneId: string) => void
  onDoubleClick: (e: React.MouseEvent) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function WorkspaceRow({
  workspace, panes, collapsed, isActive, isDragging, isDropTarget,
  onSelect, onClose, onClosePane, onDoubleClick, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  onContextMenu
}: WorkspaceRowProps) {
  const paneIds = allPaneIds(workspace.tree)
  const paneInfos = paneIds.map((id) => panes.get(id)).filter(Boolean) as PaneInfo[]
  const isSinglePane = paneInfos.length === 1
  const wsColor = workspace.color

  const className = [
    'ws-row',
    isActive && 'active',
    isDragging && 'ws-dragging',
    isDropTarget && 'ws-drop-target'
  ].filter(Boolean).join(' ')

  const title = paneInfos[0]?.title || 'shell'
  const initial = (title === 'shell' ? 'S' : title.split('/').pop() || 'S').charAt(0).toUpperCase()

  return (
    <div
      className={className}
      style={wsColor ? { '--ws-color': wsColor } as React.CSSProperties : undefined}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      title={collapsed ? title : undefined}
    >
      {collapsed ? (
        <div className="ws-collapsed-icon">
          {initial}
        </div>
      ) : isSinglePane ? (
        <div className="ws-single">
          <span className="ws-icon">&#9632;</span>
          <span className="ws-title">{formatTitle(paneInfos[0].title)}</span>
        </div>
      ) : (
        <div className="ws-multi">
          {paneInfos.map((p) => (
            <span key={p.id} className={`ws-pill ${p.id === workspace.activePaneId ? 'pill-active' : ''}`}>
              {formatTitle(p.title)}
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
          ))}
        </div>
      )}
      {!(isActive && !isSinglePane) && (
        <button
          className="ws-close"
          draggable={false}
          onClick={(e) => { e.stopPropagation(); onClose() }}
        >
          &times;
        </button>
      )}
    </div>
  )
}

function formatTitle(title: string): string {
  if (!title || title === 'shell') return 'shell'
  // Truncate long titles, show last path segment if it looks like a path
  const parts = title.split('/')
  const name = parts[parts.length - 1] || title
  return name.length > 18 ? name.slice(0, 16) + '...' : name
}
