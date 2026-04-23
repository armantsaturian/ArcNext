import { describe, it, expect } from 'vitest'

// We can't import installer.ts directly (it imports electron's `app`), so
// we re-implement the pure string helpers here and keep them in sync with
// the real ones. If this drifts, fix both places. They're small.
const START = '<!-- arcnext-bridge:start -->'
const END = '<!-- arcnext-bridge:end -->'

function stripBlock(content: string): string {
  const start = content.indexOf(START)
  if (start === -1) return content
  const end = content.indexOf(END, start)
  if (end === -1) return content
  const after = end + END.length
  const trailingNewline = content[after] === '\n' ? 1 : 0
  const leading = start > 0 && content[start - 1] === '\n' ? 1 : 0
  return content.slice(0, start - leading) + content.slice(after + trailingNewline)
}

function injectBlock(content: string, block: string): string {
  const stripped = stripBlock(content)
  const separator = stripped.length === 0 || stripped.endsWith('\n\n') ? '' : (stripped.endsWith('\n') ? '\n' : '\n\n')
  return stripped + separator + block
}

const BLOCK = `${START}\n\n## Test\n\n${END}\n`

describe('webbridge installer string helpers', () => {
  it('inject into empty file produces only the block', () => {
    const out = injectBlock('', BLOCK)
    expect(out).toBe(BLOCK)
  })

  it('inject preserves user content above the block', () => {
    const out = injectBlock('# my rules\n\ntext\n', BLOCK)
    expect(out.startsWith('# my rules\n\ntext\n\n')).toBe(true)
    expect(out.endsWith(BLOCK)).toBe(true)
  })

  it('inject is idempotent — repeated calls produce the same content', () => {
    const once = injectBlock('# my rules\n', BLOCK)
    const twice = injectBlock(once, BLOCK)
    expect(twice).toBe(once)
  })

  it('inject replaces a pre-existing block in place (end of file)', () => {
    const existing = `# my rules\n\n${START}\n\nstale\n\n${END}\n`
    const out = injectBlock(existing, BLOCK)
    expect(out.match(new RegExp(START, 'g'))?.length).toBe(1)
    expect(out).not.toContain('stale')
  })

  it('inject replaces a block in the middle and preserves what follows', () => {
    const existing = `above\n\n${START}\n\nstale\n\n${END}\n\nbelow\n`
    const out = injectBlock(existing, BLOCK)
    expect(out).toContain('above')
    expect(out).toContain('below')
    expect(out).not.toContain('stale')
    expect(out.match(new RegExp(START, 'g'))?.length).toBe(1)
  })

  it('strip removes only the block (end of file)', () => {
    const existing = `# my rules\n\n${START}\nX\n${END}\n`
    expect(stripBlock(existing)).toBe('# my rules\n')
  })

  it('strip preserves content on both sides', () => {
    const existing = `above\n\n${START}\nX\n${END}\n\nbelow\n`
    expect(stripBlock(existing)).toBe('above\n\nbelow\n')
  })

  it('strip is a no-op when no block present', () => {
    expect(stripBlock('# clean file\n')).toBe('# clean file\n')
  })
})
