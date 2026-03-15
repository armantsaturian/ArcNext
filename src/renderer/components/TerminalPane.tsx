import { useEffect, useRef } from 'react'
import { usePaneStore } from '../store/paneStore'
import { attachTerminal, detachTerminal, fitTerminal, focusTerminal } from '../model/terminalManager'

interface Props {
  paneId: string
}

export default function TerminalPane({ paneId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ws = usePaneStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId))
  const setActive = usePaneStore((s) => s.setActivePaneInWorkspace)
  const isActive = ws?.activePaneId === paneId

  // Attach terminal DOM to this container on mount, park on unmount
  useEffect(() => {
    if (!containerRef.current) return
    attachTerminal(paneId, containerRef.current)
    return () => detachTerminal(paneId)
  }, [paneId])

  // Focus when active
  useEffect(() => {
    if (isActive) focusTerminal(paneId)
  }, [isActive, paneId])

  // Refit on container resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => fitTerminal(paneId))
    observer.observe(el)
    return () => observer.disconnect()
  }, [paneId])

  return (
    <div
      className={`terminal-pane ${isActive ? 'active' : ''}`}
      onMouseDown={() => setActive(paneId)}
      ref={containerRef}
    />
  )
}
