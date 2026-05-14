import { describe, expect, it } from 'vitest'
import { parsePlainShellHistory, parseZshHistory, rankShellHistoryEntries } from '../shellHistory'

describe('shellHistory parsing', () => {
  it('parses extended zsh history timestamps and commands', () => {
    const entries = parseZshHistory([
      ': 1700000000:0;cd ~/Developer/2026/arcnext',
      ': 1700000100:0;codex --dangerously-bypass-approvals-and-sandbox'
    ].join('\n'), 0)

    expect(entries).toEqual([
      {
        command: 'cd ~/Developer/2026/arcnext',
        visitCount: 1,
        lastVisit: 1700000000 * 1000
      },
      {
        command: 'codex --dangerously-bypass-approvals-and-sandbox',
        visitCount: 1,
        lastVisit: 1700000100 * 1000
      }
    ])
  })

  it('deduplicates plain shell history and keeps the latest occurrence', () => {
    const entries = parsePlainShellHistory([
      'npm test',
      'codex',
      'npm test'
    ].join('\n'), 10_000)

    expect(entries.find((e) => e.command === 'npm test')).toEqual({
      command: 'npm test',
      visitCount: 2,
      lastVisit: 10_000
    })
  })

  it('keeps frequent daily commands above merely recent one-offs', () => {
    const now = 10 * 24 * 60 * 60 * 1000
    const ranked = rankShellHistoryEntries([
      {
        command: 'one-off recent command',
        visitCount: 1,
        lastVisit: now - 30 * 60 * 1000
      },
      {
        command: 'codex --dangerously-bypass-approvals-and-sandbox',
        visitCount: 100,
        lastVisit: now - 8 * 24 * 60 * 60 * 1000
      }
    ], 1, now)

    expect(ranked.map((entry) => entry.command)).toEqual([
      'codex --dangerously-bypass-approvals-and-sandbox'
    ])
  })
})
