import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GridLayout, resizeColumns, resizeRows } from '../model/gridLayout'
import { usePaneStore } from '../store/paneStore'
import TerminalPane from './TerminalPane'
import BrowserPane from './BrowserPane'
import ErrorBoundary from './ErrorBoundary'

function PaneRenderer({ paneId, workspaceId }: { paneId: string; workspaceId: string }) {
  const paneType = usePaneStore((s) => s.panes.get(paneId)?.type ?? 'terminal')
  const closePane = usePaneStore((s) => s.closePane)

  return (
    <ErrorBoundary fallback="pane" onReset={() => closePane(paneId)}>
      {paneType === 'browser'
        ? <BrowserPane paneId={paneId} workspaceId={workspaceId} />
        : <TerminalPane paneId={paneId} />}
    </ErrorBoundary>
  )
}

const DIVIDER_SIZE = 4
const DIVIDER_HIT_PAD = 5 // extra px each side → 14px total hit target

interface PaneBounds {
  paneId: string
  left: number
  top: number
  width: number
  height: number
}

interface ColDividerInfo {
  key: string
  colIdx: number
  left: number
  top: number
  width: number
  height: number
}

interface RowDividerInfo {
  key: string
  colIdx: number
  rowIdx: number
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  grid: GridLayout
  workspaceId: string
}

export default function GridView({ grid, workspaceId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const activePaneId = usePaneStore((s) => s.workspaces.find((w) => w.id === workspaceId)?.activePaneId)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { panes, colDividers, rowDividers } = useMemo(
    () => computeLayout(grid, size.w, size.h),
    [grid, size.w, size.h]
  )

  return (
    <div ref={containerRef} className="split-root">
      {panes.map((p) => (
        <div
          key={p.paneId}
          className={`split-pane-wrapper${panes.length > 1 && p.paneId === activePaneId ? ' pane-focused' : ''}`}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: p.width,
            height: p.height,
          }}
        >
          <PaneRenderer paneId={p.paneId} workspaceId={workspaceId} />
        </div>
      ))}
      {colDividers.map((d) => (
        <ColDivider key={d.key} info={d} containerRef={containerRef} grid={grid} />
      ))}
      {rowDividers.map((d) => (
        <RowDivider key={d.key} info={d} containerRef={containerRef} grid={grid} />
      ))}
    </div>
  )
}

function ColDivider({ info, containerRef, grid }: {
  info: ColDividerInfo
  containerRef: React.RefObject<HTMLDivElement | null>
  grid: GridLayout
}) {
  const setGrid = usePaneStore((s) => s.setGrid)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    // Compute the left edge and combined pixel width of the two columns
    const totalW = container.getBoundingClientRect().width
    const colDividerCount = grid.columns.length - 1
    const availW = totalW - colDividerCount * DIVIDER_SIZE

    let leftEdge = 0
    for (let i = 0; i < info.colIdx; i++) {
      leftEdge += grid.columns[i].width * availW + DIVIDER_SIZE
    }
    const combinedW = (grid.columns[info.colIdx].width + grid.columns[info.colIdx + 1].width) * availW

    const onMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const mouse = ev.clientX - rect.left - leftEdge
      const ratio = mouse / combinedW
      setGrid(resizeColumns(grid, info.colIdx, ratio))
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
  }, [info, grid, setGrid, containerRef])

  return (
    <div
      className="split-divider horizontal"
      style={{
        position: 'absolute',
        left: info.left - DIVIDER_HIT_PAD,
        top: info.top,
        width: info.width + DIVIDER_HIT_PAD * 2,
        height: info.height,
      }}
      onMouseDown={onMouseDown}
    />
  )
}

function RowDivider({ info, containerRef, grid }: {
  info: RowDividerInfo
  containerRef: React.RefObject<HTMLDivElement | null>
  grid: GridLayout
}) {
  const setGrid = usePaneStore((s) => s.setGrid)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const col = grid.columns[info.colIdx]
    const totalH = container.getBoundingClientRect().height
    const rowDividerCount = col.rows.length - 1
    const availH = totalH - rowDividerCount * DIVIDER_SIZE

    let topEdge = 0
    for (let i = 0; i < info.rowIdx; i++) {
      topEdge += col.rows[i].height * availH + DIVIDER_SIZE
    }
    const combinedH = (col.rows[info.rowIdx].height + col.rows[info.rowIdx + 1].height) * availH

    const onMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const mouse = ev.clientY - rect.top - topEdge
      const ratio = mouse / combinedH
      setGrid(resizeRows(grid, info.colIdx, info.rowIdx, ratio))
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [info, grid, setGrid, containerRef])

  return (
    <div
      className="split-divider vertical"
      style={{
        position: 'absolute',
        left: info.left,
        top: info.top - DIVIDER_HIT_PAD,
        width: info.width,
        height: info.height + DIVIDER_HIT_PAD * 2,
      }}
      onMouseDown={onMouseDown}
    />
  )
}

function computeLayout(grid: GridLayout, totalW: number, totalH: number) {
  const panes: PaneBounds[] = []
  const colDividers: ColDividerInfo[] = []
  const rowDividers: RowDividerInfo[] = []

  const colCount = grid.columns.length
  const colDividerCount = colCount - 1
  const availW = totalW - colDividerCount * DIVIDER_SIZE

  let x = 0
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    const col = grid.columns[colIdx]
    const colW = availW * col.width

    const rowCount = col.rows.length
    const rowDividerCount = rowCount - 1
    const availH = totalH - rowDividerCount * DIVIDER_SIZE

    let y = 0
    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      const row = col.rows[rowIdx]
      const rowH = availH * row.height

      panes.push({
        paneId: row.paneId,
        left: x,
        top: y,
        width: colW,
        height: rowH
      })

      if (rowIdx < rowCount - 1) {
        rowDividers.push({
          key: `row-${colIdx}-${rowIdx}`,
          colIdx,
          rowIdx,
          left: x,
          top: y + rowH,
          width: colW,
          height: DIVIDER_SIZE,
        })
      }

      y += rowH + DIVIDER_SIZE
    }

    if (colIdx < colCount - 1) {
      colDividers.push({
        key: `col-${colIdx}`,
        colIdx,
        left: x + colW,
        top: 0,
        width: DIVIDER_SIZE,
        height: totalH
      })
    }

    x += colW + DIVIDER_SIZE
  }

  return { panes, colDividers, rowDividers }
}
