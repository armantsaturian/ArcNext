import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentState } from '../../shared/types'
import {
  onCommandStart,
  onPtyData,
  onUserInputSubmit,
  removePaneTracking,
  setAgentStateCallback,
  startIdleChecker
} from '../model/agentDetector'

describe('agentDetector Codex state', () => {
  const paneIds: string[] = []
  let events: Array<{ paneId: string; state: AgentState | null }>

  beforeEach(() => {
    events = []
    setAgentStateCallback((paneId, state) => {
      events.push({ paneId, state })
    })
  })

  afterEach(() => {
    for (const paneId of paneIds) removePaneTracking(paneId)
    paneIds.length = 0
    setAgentStateCallback(() => {})
    vi.useRealTimers()
  })

  function paneId(name: string): string {
    const id = `agent-detector-${name}-${Math.random()}`
    paneIds.push(id)
    return id
  }

  it('starts interactive Codex as idle and ignores TUI redraws before a prompt submit', () => {
    const pane = paneId('idle-redraw')

    onCommandStart(pane, 'codex --dangerously-bypass-approvals-and-sandbox')
    onPtyData(pane)
    onPtyData(pane)

    expect(events).toEqual([
      { paneId: pane, state: { agent: 'codex', status: 'idle' } }
    ])
  })

  it('marks Codex as thinking after prompt submit, then idles after output quiets down', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const pane = paneId('submitted-turn')
    const stopIdleChecker = startIdleChecker()

    onCommandStart(pane, 'codex')
    onUserInputSubmit(pane)

    expect(events.at(-1)).toEqual({
      paneId: pane,
      state: { agent: 'codex', status: 'thinking' }
    })

    vi.advanceTimersByTime(1000)
    onPtyData(pane)
    vi.advanceTimersByTime(2500)

    expect(events.at(-1)).toEqual({
      paneId: pane,
      state: { agent: 'codex', status: 'idle' }
    })

    stopIdleChecker()
  })

  it('does not restart Codex thinking from redraw output after the turn has idled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(200_000)
    const pane = paneId('idle-redraw-after-turn')
    const stopIdleChecker = startIdleChecker()

    onCommandStart(pane, 'codex')
    onUserInputSubmit(pane)
    onPtyData(pane)
    vi.advanceTimersByTime(2500)

    const eventCountAfterIdle = events.length
    onPtyData(pane)

    expect(events).toHaveLength(eventCountAfterIdle)
    expect(events.at(-1)).toEqual({
      paneId: pane,
      state: { agent: 'codex', status: 'idle' }
    })

    stopIdleChecker()
  })
})
