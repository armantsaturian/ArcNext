import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SplitNode } from '../model/splitTree'
import { usePaneStore } from '../store/paneStore'
import TerminalPane from './TerminalPane'

const DIVIDER_SIZE = 4

interface PaneBounds {
  paneId: string
  left: number
  top: number
  width: number
  height: number
}

interface DividerInfo {
  key: string
  direction: 'horizontal' | 'vertical'
  left: number
  top: number
  width: number
  height: number
  firstPaneId: string
  splitOrigin: number
  splitSpan: number
}

interface Props {
  node: SplitNode
}

export default function SplitView({ node }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

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

  const panes = useMemo(
    () => computePanes(node, 0, 0, size.w, size.h),
    [node, size.w, size.h]
  )

  const dividers = useMemo(
    () => computeDividers(node, 0, 0, size.w, size.h),
    [node, size.w, size.h]
  )

  return (
    <div ref={containerRef} className="split-root">
      {panes.map((p) => (
        <div
          key={p.paneId}
          className="split-pane-wrapper"
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: p.width,
            height: p.height,
          }}
        >
          <TerminalPane paneId={p.paneId} />
        </div>
      ))}
      {dividers.map((d) => (
        <Divider key={d.key} info={d} containerRef={containerRef} tree={node} />
      ))}
    </div>
  )
}

function Divider({ info, containerRef, tree }: {
  info: DividerInfo
  containerRef: React.RefObject<HTMLDivElement | null>
  tree: SplitNode
}) {
  const setTree = usePaneStore((s) => s.setTree)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const onMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const mouse = info.direction === 'horizontal'
        ? ev.clientX - rect.left - info.splitOrigin
        : ev.clientY - rect.top - info.splitOrigin
      const ratio = mouse / (info.splitSpan - DIVIDER_SIZE)
      const clamped = Math.max(0.1, Math.min(0.9, ratio))
      setTree(updateRatio(tree, info.firstPaneId, clamped))
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = info.direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [info, tree, setTree, containerRef])

  return (
    <div
      className={`split-divider ${info.direction}`}
      style={{
        position: 'absolute',
        left: info.left,
        top: info.top,
        width: info.width,
        height: info.height,
      }}
      onMouseDown={onMouseDown}
    />
  )
}

function getFirstLeafId(node: SplitNode): string {
  if (node.type === 'leaf') return node.paneId
  return getFirstLeafId(node.first)
}

function computePanes(node: SplitNode, left: number, top: number, w: number, h: number): PaneBounds[] {
  if (node.type === 'leaf') {
    return [{ paneId: node.paneId, left, top, width: w, height: h }]
  }
  if (node.direction === 'horizontal') {
    const avail = w - DIVIDER_SIZE
    const fw = avail * node.ratio
    return [
      ...computePanes(node.first, left, top, fw, h),
      ...computePanes(node.second, left + fw + DIVIDER_SIZE, top, avail - fw, h),
    ]
  }
  const avail = h - DIVIDER_SIZE
  const fh = avail * node.ratio
  return [
    ...computePanes(node.first, left, top, w, fh),
    ...computePanes(node.second, left, top + fh + DIVIDER_SIZE, w, avail - fh),
  ]
}

function computeDividers(node: SplitNode, left: number, top: number, w: number, h: number): DividerInfo[] {
  if (node.type === 'leaf') return []
  if (node.direction === 'horizontal') {
    const avail = w - DIVIDER_SIZE
    const fw = avail * node.ratio
    return [
      {
        key: `${getFirstLeafId(node.first)}-${getFirstLeafId(node.second)}`,
        direction: 'horizontal',
        left: left + fw, top, width: DIVIDER_SIZE, height: h,
        firstPaneId: getFirstLeafId(node.first),
        splitOrigin: left, splitSpan: w
      },
      ...computeDividers(node.first, left, top, fw, h),
      ...computeDividers(node.second, left + fw + DIVIDER_SIZE, top, avail - fw, h),
    ]
  }
  const avail = h - DIVIDER_SIZE
  const fh = avail * node.ratio
  return [
    {
      key: `${getFirstLeafId(node.first)}-${getFirstLeafId(node.second)}`,
      direction: 'vertical',
      left, top: top + fh, width: w, height: DIVIDER_SIZE,
      firstPaneId: getFirstLeafId(node.first),
      splitOrigin: top, splitSpan: h
    },
    ...computeDividers(node.first, left, top, w, fh),
    ...computeDividers(node.second, left, top + fh + DIVIDER_SIZE, w, avail - fh),
  ]
}

function updateRatio(tree: SplitNode, targetId: string, ratio: number): SplitNode {
  if (tree.type === 'leaf') return tree
  if (getFirstLeafId(tree.first) === targetId) {
    return { ...tree, ratio }
  }
  return {
    ...tree,
    first: updateRatio(tree.first, targetId, ratio),
    second: updateRatio(tree.second, targetId, ratio)
  }
}
