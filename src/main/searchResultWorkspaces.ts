interface SearchResultWorkspaceRule {
  match: (url: URL) => boolean
  selectors: string[]
}

const SEARCH_RESULT_WORKSPACE_RULES: SearchResultWorkspaceRule[] = [
  {
    match: (url) => /(^|\.)google\./i.test(url.hostname) && url.pathname === '/search' && url.searchParams.has('q'),
    selectors: [
      '#search a[href] h3',
      '#search a[href] [role="heading"]'
    ]
  },
  {
    match: (url) => /(^|\.)bing\.com$/i.test(url.hostname) && url.pathname === '/search' && url.searchParams.has('q'),
    selectors: [
      '#b_results .b_algo h2 a[href]'
    ]
  },
  {
    match: (url) => /(^|\.)duckduckgo\.com$/i.test(url.hostname) && url.searchParams.has('q'),
    selectors: [
      'a.result__a[href]',
      'a[data-testid="result-title-a"][href]'
    ]
  },
  {
    match: (url) => /^search\.brave\.com$/i.test(url.hostname) && url.pathname === '/search' && url.searchParams.has('q'),
    selectors: [
      'a.snippet-title[href]',
      '.snippet a[href]'
    ]
  },
  {
    match: (url) => /^search\.yahoo\.com$/i.test(url.hostname) && url.pathname === '/search' && url.searchParams.has('p'),
    selectors: [
      '#web h3.title a[href]',
      '#results a[href] h3'
    ]
  },
  {
    match: (url) => /(^|\.)kagi\.com$/i.test(url.hostname) && url.pathname === '/search' && url.searchParams.has('q'),
    selectors: [
      'a.__sri_title_link[href]',
      '.search-result a[href]'
    ]
  }
]

function selectorsForSearchResultPage(url: string): string[] {
  try {
    const parsed = new URL(url)
    return SEARCH_RESULT_WORKSPACE_RULES.find((rule) => rule.match(parsed))?.selectors ?? []
  } catch {
    return []
  }
}

function buildSearchResultWorkspaceScript(selectors: string[]): string {
  return `
    (() => {
      const selectors = ${JSON.stringify(selectors)};
      const marker = 'data-arcnext-search-result-workspace';
      const root = document.documentElement;
      if (!root) return false;

      const patchAnchor = (anchor) => {
        if (!(anchor instanceof HTMLAnchorElement)) return;
        anchor.target = '_blank';

        const rel = new Set((anchor.getAttribute('rel') || '').split(/\\s+/).filter(Boolean));
        rel.add('noopener');
        anchor.setAttribute('rel', Array.from(rel).join(' '));
        anchor.setAttribute(marker, '1');
      };

      const collectAnchors = () => {
        const anchors = new Set();
        for (const selector of selectors) {
          for (const node of document.querySelectorAll(selector)) {
            const anchor = node instanceof HTMLAnchorElement ? node : node.closest('a[href]');
            if (anchor) anchors.add(anchor);
          }
        }
        for (const anchor of anchors) patchAnchor(anchor);
      };

      collectAnchors();

      if (!window.__arcnextSearchResultWorkspaceObserver) {
        const observer = new MutationObserver(() => collectAnchors());
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['href', 'target']
        });
        window.__arcnextSearchResultWorkspaceObserver = observer;
      }

      return true;
    })()
  `
}

export function injectSearchResultWorkspaceLinks(
  wc: Pick<Electron.WebContents, 'executeJavaScript'>,
  url: string
): boolean {
  const selectors = selectorsForSearchResultPage(url)
  if (selectors.length === 0) return false

  wc.executeJavaScript(buildSearchResultWorkspaceScript(selectors))
    .catch(() => {})

  return true
}

export function isSearchResultsPage(url: string): boolean {
  return selectorsForSearchResultPage(url).length > 0
}
