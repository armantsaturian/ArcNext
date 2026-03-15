import { useEffect, useRef } from 'react'
import { usePaneStore } from '../store/paneStore'
import { attachTerminal, detachTerminal, fitTerminal, focusTerminal, writeToTerminalPTY } from '../model/terminalManager'

interface Props {
  paneId: string
}

function shellEscape(path: string): string {
  return "'" + path.replace(/'/g, "'\\''") + "'"
}

function getFilePath(file: File): string {
  // Electron 32+: webUtils.getPathForFile exposed via preload
  try {
    const p = window.arcnext.getPathForFile(file)
    if (p) return p
  } catch { /* fallback */ }
  // Legacy fallback for older Electron (deprecated but functional with sandbox:false)
  return (file as File & { path?: string }).path ?? ''
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
    let rafId = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => fitTerminal(paneId))
    })
    observer.observe(el)
    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [paneId])

  // Native DOM drag-and-drop — more reliable than React synthetic events over
  // xterm's imperatively-added DOM tree
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let enterCount = 0

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      enterCount++
      if (enterCount === 1) container.classList.add('drag-over')
    }

    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const onDragLeave = () => {
      enterCount--
      if (enterCount <= 0) {
        enterCount = 0
        container.classList.remove('drag-over')
      }
    }

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      enterCount = 0
      container.classList.remove('drag-over')

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const paths: string[] = []
      for (let i = 0; i < files.length; i++) {
        const p = getFilePath(files[i])
        if (p) paths.push(shellEscape(p))
      }
      if (paths.length > 0) {
        writeToTerminalPTY(paneId, paths.join(' '))
        focusTerminal(paneId)
      }
    }

    container.addEventListener('dragenter', onDragEnter)
    container.addEventListener('dragover', onDragOver)
    container.addEventListener('dragleave', onDragLeave)
    container.addEventListener('drop', onDrop)

    return () => {
      container.removeEventListener('dragenter', onDragEnter)
      container.removeEventListener('dragover', onDragOver)
      container.removeEventListener('dragleave', onDragLeave)
      container.removeEventListener('drop', onDrop)
      container.classList.remove('drag-over')
    }
  }, [paneId])

  return (
    <div
      className={`terminal-pane${isActive ? ' active' : ''}`}
      onMouseDown={() => setActive(paneId)}
      ref={containerRef}
    />
  )
}
