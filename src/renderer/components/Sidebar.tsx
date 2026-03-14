import { usePaneStore, Workspace, PaneInfo } from '../store/paneStore'
import { allPaneIds } from '../model/splitTree'

export default function Sidebar() {
  const workspaces = usePaneStore((s) => s.workspaces)
  const activeWorkspaceId = usePaneStore((s) => s.activeWorkspaceId)
  const panes = usePaneStore((s) => s.panes)
  const switchWorkspace = usePaneStore((s) => s.switchWorkspace)
  const addWorkspace = usePaneStore((s) => s.addWorkspace)
  const removeWorkspace = usePaneStore((s) => s.removeWorkspace)

  return (
    <div className="sidebar">
      <div className="sidebar-header" />
      <div className="sidebar-list">
        {workspaces.map((ws) => (
          <WorkspaceRow
            key={ws.id}
            workspace={ws}
            panes={panes}
            isActive={ws.id === activeWorkspaceId}
            onSelect={() => switchWorkspace(ws.id)}
            onClose={() => removeWorkspace(ws.id)}
          />
        ))}
      </div>
      <div className="sidebar-footer">
        <button className="sidebar-add" onClick={addWorkspace}>
          + New Workspace
        </button>
      </div>
    </div>
  )
}

interface WorkspaceRowProps {
  workspace: Workspace
  panes: Map<string, PaneInfo>
  isActive: boolean
  onSelect: () => void
  onClose: () => void
}

function WorkspaceRow({ workspace, panes, isActive, onSelect, onClose }: WorkspaceRowProps) {
  const paneIds = allPaneIds(workspace.tree)
  const paneInfos = paneIds.map((id) => panes.get(id)).filter(Boolean) as PaneInfo[]
  const isSinglePane = paneInfos.length === 1

  return (
    <div
      className={`ws-row ${isActive ? 'active' : ''}`}
      onClick={onSelect}
    >
      {isSinglePane ? (
        <div className="ws-single">
          <span className="ws-icon">&#9632;</span>
          <span className="ws-title">{formatTitle(paneInfos[0].title)}</span>
        </div>
      ) : (
        <div className="ws-multi">
          {paneInfos.map((p) => (
            <span key={p.id} className={`ws-pill ${p.id === workspace.activePaneId ? 'pill-active' : ''}`}>
              {formatTitle(p.title)}
            </span>
          ))}
        </div>
      )}
      <button
        className="ws-close"
        onClick={(e) => { e.stopPropagation(); onClose() }}
      >
        &times;
      </button>
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
