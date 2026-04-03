export type Direction = 'horizontal' | 'vertical'
export type NavDirection = 'left' | 'right' | 'up' | 'down'

export interface GridRow {
  height: number
  paneId: string
}

export interface GridColumn {
  width: number
  rows: GridRow[]
}

export interface GridLayout {
  columns: GridColumn[]
}

/** Create a grid with a single pane */
export function createGrid(paneId: string): GridLayout {
  return { columns: [{ width: 1, rows: [{ height: 1, paneId }] }] }
}

/** Add a new column to the right with a single pane, equalizing widths */
export function addColumn(grid: GridLayout, paneId: string): GridLayout {
  const count = grid.columns.length + 1
  const width = 1 / count
  return {
    columns: [
      ...grid.columns.map((c) => ({ ...c, width })),
      { width, rows: [{ height: 1, paneId }] }
    ]
  }
}

/** Add a new row below the given pane in its column. Ratio controls how much of the split the top pane keeps (default 0.5). */
export function addRowBelow(grid: GridLayout, targetPaneId: string, newPaneId: string, ratio = 0.5): GridLayout {
  const colIdx = grid.columns.findIndex((c) => c.rows.some((r) => r.paneId === targetPaneId))
  if (colIdx === -1) return grid

  const col = grid.columns[colIdx]
  const rowIdx = col.rows.findIndex((r) => r.paneId === targetPaneId)
  if (rowIdx === -1) return grid

  const newRows = [...col.rows]
  const targetHeight = newRows[rowIdx].height
  newRows[rowIdx] = { ...newRows[rowIdx], height: targetHeight * ratio }
  newRows.splice(rowIdx + 1, 0, { height: targetHeight * (1 - ratio), paneId: newPaneId })

  return {
    columns: grid.columns.map((c, i) => i === colIdx ? { ...c, rows: newRows } : c)
  }
}

/** Remove a pane from the grid. Collapses empty columns. Redistributes space. */
export function removePane(grid: GridLayout, paneId: string): GridLayout | null {
  const colIdx = grid.columns.findIndex((c) => c.rows.some((r) => r.paneId === paneId))
  if (colIdx === -1) return null

  const col = grid.columns[colIdx]
  const rowIdx = col.rows.findIndex((r) => r.paneId === paneId)
  if (rowIdx === -1) return null

  if (col.rows.length === 1) {
    // Last row in column — remove the column
    if (grid.columns.length === 1) return null // last pane
    const remaining = grid.columns.filter((_, i) => i !== colIdx)
    const totalWidth = remaining.reduce((sum, c) => sum + c.width, 0)
    return {
      columns: remaining.map((c) => ({ ...c, width: c.width / totalWidth }))
    }
  }

  // Remove the row and redistribute height
  const newRows = col.rows.filter((_, i) => i !== rowIdx)
  const totalHeight = newRows.reduce((sum, r) => sum + r.height, 0)
  const normalizedRows = newRows.map((r) => ({ ...r, height: r.height / totalHeight }))

  return {
    columns: grid.columns.map((c, i) =>
      i === colIdx ? { ...c, rows: normalizedRows } : c
    )
  }
}

/** Collect all pane IDs in column-major order (left to right, top to bottom) */
export function allPaneIds(grid: GridLayout): string[] {
  const ids: string[] = []
  for (const col of grid.columns) {
    for (const row of col.rows) {
      ids.push(row.paneId)
    }
  }
  return ids
}

/** Find a pane's position in the grid */
export function findPane(grid: GridLayout, paneId: string): { colIdx: number; rowIdx: number } | null {
  for (let colIdx = 0; colIdx < grid.columns.length; colIdx++) {
    const rowIdx = grid.columns[colIdx].rows.findIndex((r) => r.paneId === paneId)
    if (rowIdx !== -1) return { colIdx, rowIdx }
  }
  return null
}

/** Get the adjacent pane ID wrapping around, for focus cycling */
export function adjacentPaneId(grid: GridLayout, currentId: string, offset: 1 | -1): string {
  const ids = allPaneIds(grid)
  const idx = ids.indexOf(currentId)
  if (idx === -1) return ids[0]
  return ids[(idx + offset + ids.length) % ids.length]
}

/** Navigate directionally from a pane within the grid */
export function navigateDirection(grid: GridLayout, currentId: string, dir: NavDirection): string | null {
  const pos = findPane(grid, currentId)
  if (!pos) return null

  const { colIdx, rowIdx } = pos

  switch (dir) {
    case 'left': {
      if (colIdx === 0) return null // at left boundary
      const targetCol = grid.columns[colIdx - 1]
      const targetRowIdx = Math.min(rowIdx, targetCol.rows.length - 1)
      return targetCol.rows[targetRowIdx].paneId
    }
    case 'right': {
      if (colIdx === grid.columns.length - 1) return null // at right boundary
      const targetCol = grid.columns[colIdx + 1]
      const targetRowIdx = Math.min(rowIdx, targetCol.rows.length - 1)
      return targetCol.rows[targetRowIdx].paneId
    }
    case 'up': {
      if (rowIdx === 0) return null // at top boundary
      return grid.columns[colIdx].rows[rowIdx - 1].paneId
    }
    case 'down': {
      const col = grid.columns[colIdx]
      if (rowIdx === col.rows.length - 1) return null // at bottom boundary
      return col.rows[rowIdx + 1].paneId
    }
  }
}

/** Merge two grids: source columns are appended to target */
export function mergeGrids(target: GridLayout, source: GridLayout): GridLayout {
  const allCols = [...target.columns, ...source.columns]
  const count = allCols.length
  const width = 1 / count
  return {
    columns: allCols.map((c) => ({ ...c, width }))
  }
}

/** Merge source grid into a specific column of target as new rows */
export function mergeGridAsRows(target: GridLayout, source: GridLayout, targetColIdx: number): GridLayout {
  const sourceRows = source.columns.flatMap((c) => c.rows)
  const col = target.columns[targetColIdx]
  if (!col) return target

  const allRows = [...col.rows, ...sourceRows]
  const count = allRows.length
  const height = 1 / count
  const normalizedRows = allRows.map((r) => ({ ...r, height }))

  return {
    columns: target.columns.map((c, i) =>
      i === targetColIdx ? { ...c, rows: normalizedRows } : c
    )
  }
}

/** Resize a column divider: adjusts widths of columns at colIdx and colIdx+1 */
export function resizeColumns(grid: GridLayout, colIdx: number, ratio: number): GridLayout {
  if (colIdx < 0 || colIdx >= grid.columns.length - 1) return grid

  const left = grid.columns[colIdx]
  const right = grid.columns[colIdx + 1]
  const combined = left.width + right.width
  const clamped = Math.max(0.05, Math.min(0.95, ratio))
  const newLeft = combined * clamped
  const newRight = combined - newLeft

  return {
    columns: grid.columns.map((c, i) => {
      if (i === colIdx) return { ...c, width: newLeft }
      if (i === colIdx + 1) return { ...c, width: newRight }
      return c
    })
  }
}

/** Resize a row divider: adjusts heights of rows at rowIdx and rowIdx+1 in the given column */
export function resizeRows(grid: GridLayout, colIdx: number, rowIdx: number, ratio: number): GridLayout {
  const col = grid.columns[colIdx]
  if (!col || rowIdx < 0 || rowIdx >= col.rows.length - 1) return grid

  const top = col.rows[rowIdx]
  const bottom = col.rows[rowIdx + 1]
  const combined = top.height + bottom.height
  const clamped = Math.max(0.05, Math.min(0.95, ratio))
  const newTop = combined * clamped
  const newBottom = combined - newTop

  const newRows = col.rows.map((r, i) => {
    if (i === rowIdx) return { ...r, height: newTop }
    if (i === rowIdx + 1) return { ...r, height: newBottom }
    return r
  })

  return {
    columns: grid.columns.map((c, i) => i === colIdx ? { ...c, rows: newRows } : c)
  }
}
