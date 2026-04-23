/**
 * Snapshot = compact accessibility tree keyed by stable refs.
 *
 * Per snapshot we assign sequential refs ("e1", "e2", ...) to the nodes we keep.
 * The ref→backendNodeId mapping is kept alive per pane so subsequent
 * click/type calls can resolve a ref back to coordinates without a new snapshot.
 *
 * The mapping is invalidated on navigation (Page.frameNavigated) and on
 * explicit refresh via snapshot().
 */

import type { WebContents } from 'electron'
import type { AxNode, Snapshot } from './protocol'
import { send, ensureAttached, BridgeError } from './cdp'
import { ErrorCode } from './protocol'

interface RefEntry {
  ref: string
  backendNodeId: number
}

interface PaneRefs {
  byRef: Map<string, RefEntry>
}

const refsByPane = new Map<string, PaneRefs>()

/** Clear stored refs — called on navigation. */
export function invalidateRefs(paneId: string): void {
  refsByPane.delete(paneId)
}

interface RawAxNode {
  nodeId: string
  ignored?: boolean
  role?: { value: string }
  name?: { value: string }
  value?: { value: unknown }
  description?: { value: string }
  childIds?: string[]
  backendDOMNodeId?: number
}

interface GetFullAXTreeResult {
  nodes: RawAxNode[]
}

function isInteresting(node: RawAxNode): boolean {
  if (node.ignored) return false
  const role = node.role?.value
  if (!role) return false
  // strip noise roles that just add depth
  if (role === 'none' || role === 'presentation' || role === 'generic' || role === 'InlineTextBox' || role === 'LineBreak') return false
  return true
}

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined
}

export async function takeSnapshot(paneId: string, wc: WebContents): Promise<Snapshot> {
  await ensureAttached(paneId, wc)

  const result = await send<GetFullAXTreeResult>(paneId, 'Accessibility.getFullAXTree', {})

  const byNodeId = new Map<string, RawAxNode>()
  for (const n of result.nodes) byNodeId.set(n.nodeId, n)

  // Find root: first non-ignored with childIds, or the first node
  const root = result.nodes[0]
  if (!root) throw new BridgeError(ErrorCode.CDPError, 'empty AX tree')

  let refCounter = 1
  const refs: PaneRefs = { byRef: new Map() }

  const visit = (rawId: string): AxNode | null => {
    const n = byNodeId.get(rawId)
    if (!n) return null
    const children: AxNode[] = []
    for (const childId of n.childIds ?? []) {
      const child = visit(childId)
      if (child) children.push(child)
    }

    if (!isInteresting(n)) {
      // Flatten: pull this node's children up by returning a "stub" only if
      // it has a single interesting child. Otherwise return null and let the
      // parent collapse us.
      if (children.length === 1) return children[0]
      if (children.length === 0) return null
      // multi-child generic: keep as a grouping node so structure is preserved
      return { ref: '', role: n.role?.value ?? 'group', children }
    }

    const role = n.role?.value ?? 'unknown'
    const name = firstString(n.name?.value)
    const value = firstString(n.value?.value)
    const description = firstString(n.description?.value)
    const ref = `e${refCounter++}`

    const backendId = n.backendDOMNodeId
    if (backendId) {
      refs.byRef.set(ref, { ref, backendNodeId: backendId })
    }

    const out: AxNode = { ref, role }
    if (name) out.name = name
    if (value) out.value = value
    if (description) out.description = description
    if (children.length > 0) out.children = children
    return out
  }

  const tree = visit(root.nodeId) ?? { ref: '', role: 'root' }

  refsByPane.set(paneId, refs)

  return {
    paneId,
    url: wc.getURL(),
    title: wc.getTitle(),
    tree,
    capturedAt: Date.now()
  }
}

/**
 * Resolve a ref to the DOM content-rect center. Requires a prior snapshot
 * in this pane. Returns {x, y} in viewport coords suitable for Input dispatch.
 */
export async function resolveRef(paneId: string, ref: string): Promise<{ x: number; y: number }> {
  const table = refsByPane.get(paneId)
  const entry = table?.byRef.get(ref)
  if (!entry) {
    throw new BridgeError(ErrorCode.RefNotFound, `ref ${ref} not found — run snapshot first`)
  }

  interface BoxModel {
    model: { content: number[] } // [x1,y1,x2,y2,x3,y3,x4,y4]
  }

  const box = await send<BoxModel>(paneId, 'DOM.getBoxModel', { backendNodeId: entry.backendNodeId })
  const [x1, y1, x2, y2, x3, y3, x4, y4] = box.model.content
  return { x: (x1 + x2 + x3 + x4) / 4, y: (y1 + y2 + y3 + y4) / 4 }
}

/**
 * Resolve a CSS selector to coordinates. Falls back when agents send raw selectors.
 */
export async function resolveSelector(paneId: string, selector: string): Promise<{ x: number; y: number }> {
  interface QueryResult { root: { nodeId: number } }
  interface QuerySelectorResult { nodeId: number }
  interface BoxModel { model: { content: number[] } }

  const doc = await send<QueryResult>(paneId, 'DOM.getDocument', { depth: 0 })
  const found = await send<QuerySelectorResult>(paneId, 'DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector
  })
  if (!found.nodeId) {
    throw new BridgeError(ErrorCode.RefNotFound, `selector not matched: ${selector}`)
  }

  // scroll into view
  await send(paneId, 'DOM.scrollIntoViewIfNeeded', { nodeId: found.nodeId }).catch(() => {})

  const box = await send<BoxModel>(paneId, 'DOM.getBoxModel', { nodeId: found.nodeId })
  const [x1, y1, x2, y2, x3, y3, x4, y4] = box.model.content
  return { x: (x1 + x2 + x3 + x4) / 4, y: (y1 + y2 + y3 + y4) / 4 }
}
