export interface BrowserGroup {
  key: string
  label: string
}

const BROWSER_GROUP_PREFIX = 'browser:'
const UNKNOWN_BROWSER_GROUP: BrowserGroup = { key: `${BROWSER_GROUP_PREFIX}unknown`, label: 'WEB' }

const APP_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  'google-calendar': 'Google Calendar',
  'google-docs': 'Google Docs',
  'google-drive': 'Google Drive',
  'google-forms': 'Google Forms',
  'google-meet': 'Google Meet',
  'google-sheets': 'Google Sheets',
  'google-slides': 'Google Slides',
  'google-search': 'Google Search',
  github: 'GitHub',
  youtube: 'YouTube',
  'youtube-music': 'YouTube Music',
  notion: 'Notion',
  linear: 'Linear',
  slack: 'Slack',
  figma: 'Figma',
  x: 'X',
  linkedin: 'LinkedIn'
}

function appGroup(app: keyof typeof APP_LABELS): BrowserGroup {
  return { key: `${BROWSER_GROUP_PREFIX}app:${app}`, label: APP_LABELS[app] }
}

function domainGroup(hostname: string): BrowserGroup {
  return { key: `${BROWSER_GROUP_PREFIX}domain:${hostname}`, label: hostname }
}

function localGroup(): BrowserGroup {
  return { key: `${BROWSER_GROUP_PREFIX}local:localhost`, label: 'localhost' }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost')
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '')
}

function isGoogleSearchHost(hostname: string): boolean {
  return hostname === 'google.com' || hostname.startsWith('google.')
}

export function browserGroupForUrl(url: string): BrowserGroup {
  try {
    const parsed = new URL(url)
    const hostname = normalizeHostname(parsed.hostname)
    const pathname = parsed.pathname.toLowerCase()

    if (!hostname) return UNKNOWN_BROWSER_GROUP
    if (isLocalHostname(hostname)) return localGroup()

    if (hostname === 'mail.google.com' || hostname === 'gmail.com') return appGroup('gmail')
    if (hostname === 'calendar.google.com') return appGroup('google-calendar')
    if (hostname === 'drive.google.com') return appGroup('google-drive')
    if (hostname === 'meet.google.com') return appGroup('google-meet')
    if (hostname === 'docs.google.com') {
      if (pathname.startsWith('/spreadsheets')) return appGroup('google-sheets')
      if (pathname.startsWith('/presentation')) return appGroup('google-slides')
      if (pathname.startsWith('/forms')) return appGroup('google-forms')
      return appGroup('google-docs')
    }
    if (isGoogleSearchHost(hostname) && pathname.startsWith('/search')) return appGroup('google-search')

    if (hostname === 'music.youtube.com') return appGroup('youtube-music')
    if (hostname === 'youtube.com' || hostname === 'youtu.be') return appGroup('youtube')
    if (hostname === 'github.com') return appGroup('github')
    if (hostname === 'notion.so' || hostname.endsWith('.notion.site')) return appGroup('notion')
    if (hostname === 'linear.app') return appGroup('linear')
    if (hostname === 'slack.com' || hostname.endsWith('.slack.com')) return appGroup('slack')
    if (hostname === 'figma.com') return appGroup('figma')
    if (hostname === 'x.com' || hostname === 'twitter.com') return appGroup('x')
    if (hostname === 'linkedin.com') return appGroup('linkedin')

    return domainGroup(hostname)
  } catch {
    return UNKNOWN_BROWSER_GROUP
  }
}

export function browserGroupKeyForUrl(url: string): string {
  return browserGroupForUrl(url).key
}

export function browserGroupLabelFromKey(key: string): string | undefined {
  if (!key.startsWith(BROWSER_GROUP_PREFIX)) return undefined

  if (key.startsWith(`${BROWSER_GROUP_PREFIX}app:`)) {
    const app = key.slice(`${BROWSER_GROUP_PREFIX}app:`.length)
    return APP_LABELS[app] ?? app
  }

  if (key.startsWith(`${BROWSER_GROUP_PREFIX}domain:`)) {
    return key.slice(`${BROWSER_GROUP_PREFIX}domain:`.length)
  }

  if (key === `${BROWSER_GROUP_PREFIX}local:localhost`) {
    return 'localhost'
  }

  if (key === UNKNOWN_BROWSER_GROUP.key) {
    return UNKNOWN_BROWSER_GROUP.label
  }

  return key.slice(BROWSER_GROUP_PREFIX.length) || UNKNOWN_BROWSER_GROUP.label
}

export function unknownBrowserGroupKey(): string {
  return UNKNOWN_BROWSER_GROUP.key
}
