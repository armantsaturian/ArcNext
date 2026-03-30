import { describe, expect, it, vi } from 'vitest'
import { injectSearchResultWorkspaceLinks, isSearchResultsPage } from '../searchResultWorkspaces'

describe('searchResultWorkspaces', () => {
  it('detects supported search result pages', () => {
    expect(isSearchResultsPage('https://www.google.com/search?q=hello')).toBe(true)
    expect(isSearchResultsPage('https://www.bing.com/search?q=hello')).toBe(true)
    expect(isSearchResultsPage('https://duckduckgo.com/?q=hello')).toBe(true)
    expect(isSearchResultsPage('https://example.com/')).toBe(false)
    expect(isSearchResultsPage('notaurl')).toBe(false)
  })

  it('injects target=_blank patching only on supported search result pages', () => {
    const executeJavaScript = vi.fn(() => Promise.resolve(true))

    const injected = injectSearchResultWorkspaceLinks(
      { executeJavaScript } as Pick<Electron.WebContents, 'executeJavaScript'>,
      'https://www.google.com/search?q=hello'
    )

    expect(injected).toBe(true)
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    const script = executeJavaScript.mock.calls[0]?.[0]
    expect(script).toContain("target = '_blank'")
    expect(script).toContain('#search a[href] h3')
  })

  it('skips injection on non-search pages', () => {
    const executeJavaScript = vi.fn(() => Promise.resolve(true))

    const injected = injectSearchResultWorkspaceLinks(
      { executeJavaScript } as Pick<Electron.WebContents, 'executeJavaScript'>,
      'https://example.com/article'
    )

    expect(injected).toBe(false)
    expect(executeJavaScript).not.toHaveBeenCalled()
  })
})
