import { describe, expect, it } from 'vitest'
import { substringMatch, computeGhostText, filterWebEntries } from '../model/pickerHelpers'
import type { WebEntry } from '../../shared/types'

function webEntry(url: string, title: string, score: number): WebEntry {
  return { url, title, faviconUrl: '', visitCount: 1, lastVisit: Date.now(), score }
}

describe('substringMatch', () => {
  it('returns index of case-insensitive match', () => {
    expect(substringMatch('GitHub.com', 'git')).toBe(0)
    expect(substringMatch('example.com/path', 'PATH')).toBe(12)
  })

  it('returns -1 when no match', () => {
    expect(substringMatch('example.com', 'xyz')).toBe(-1)
  })
})

describe('computeGhostText', () => {
  it('returns suffix after query match in label', () => {
    expect(computeGhostText('github.com/anthropics', 'github')).toBe('.com/anthropics')
  })

  it('is case-insensitive', () => {
    expect(computeGhostText('GitHub.com', 'git')).toBe('Hub.com')
  })

  it('returns empty string for no match', () => {
    expect(computeGhostText('example.com', 'xyz')).toBe('')
  })

  it('returns empty string for empty query', () => {
    expect(computeGhostText('example.com', '')).toBe('')
  })
})

describe('filterWebEntries', () => {
  const entries: WebEntry[] = [
    webEntry('https://github.com', 'GitHub', 10),
    webEntry('https://google.com', 'Google', 20),
    webEntry('https://gitlab.com', 'GitLab', 5),
    webEntry('https://example.com', 'Example', 15),
  ]

  it('filters by URL substring', () => {
    const result = filterWebEntries(entries, 'git', 10)
    expect(result.map(e => e.url)).toEqual([
      'https://github.com',
      'https://gitlab.com',
    ])
  })

  it('filters by title substring', () => {
    const result = filterWebEntries(entries, 'Google', 10)
    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://google.com')
  })

  it('sorts by score descending', () => {
    const result = filterWebEntries(entries, '', 10)
    expect(result.map(e => e.score)).toEqual([20, 15, 10, 5])
  })

  it('limits results', () => {
    const result = filterWebEntries(entries, '', 2)
    expect(result).toHaveLength(2)
    expect(result.map(e => e.score)).toEqual([20, 15])
  })

  it('deduplicates by title, keeping highest score', () => {
    const duped: WebEntry[] = [
      webEntry('https://github.com/a', 'GitHub', 5),
      webEntry('https://github.com/b', 'GitHub', 15),
      webEntry('https://gitlab.com', 'GitLab', 10),
    ]
    const result = filterWebEntries(duped, 'git', 10)
    expect(result).toHaveLength(2)
    expect(result[0].url).toBe('https://github.com/b')
    expect(result[1].url).toBe('https://gitlab.com')
  })

  it('deduplicates by URL when title is empty', () => {
    const duped: WebEntry[] = [
      webEntry('https://example.com', '', 5),
      webEntry('https://example.com', '', 10),
    ]
    const result = filterWebEntries(duped, '', 10)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(10)
  })

  it('returns empty array when no entries match', () => {
    expect(filterWebEntries(entries, 'zzzzz', 10)).toEqual([])
  })
})
