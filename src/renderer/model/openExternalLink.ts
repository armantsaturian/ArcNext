type OpenWindowFn = (url?: string | URL, target?: string, features?: string) => Window | null

/**
 * xterm's default WebLinksAddon handler opens a blank popup first and then
 * mutates location.href. Electron's setWindowOpenHandler only sees the first
 * blank open, which leaves the new page stuck on about:blank.
 * Open the final URL directly instead.
 */
export function openExternalLink(
  url: string,
  openWindow: OpenWindowFn = window.open.bind(window)
): void {
  openWindow(url, '_blank', 'noopener,noreferrer')
}
