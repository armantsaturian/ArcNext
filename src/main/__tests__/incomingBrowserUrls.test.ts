import { describe, expect, it } from 'vitest'
import { isIncomingBrowserUrl } from '../incomingBrowserUrls'

describe('isIncomingBrowserUrl', () => {
  it('accepts browser-loadable external URLs', () => {
    expect(isIncomingBrowserUrl('https://example.com')).toBe(true)
    expect(isIncomingBrowserUrl('http://localhost:3000')).toBe(true)
    expect(isIncomingBrowserUrl('file:///Users/test/page.html')).toBe(true)
  })

  it('rejects unsupported or malformed URLs', () => {
    expect(isIncomingBrowserUrl('mailto:test@example.com')).toBe(false)
    expect(isIncomingBrowserUrl('arcnext://example')).toBe(false)
    expect(isIncomingBrowserUrl('not a url')).toBe(false)
  })
})
