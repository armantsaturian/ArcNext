/**
 * Bridge installer — optional, user-driven via a Settings toggle.
 *
 * What it does on install:
 *   1. Symlinks (or copies) the bundled `arcnext-bridge` CLI into
 *      `~/.local/bin/arcnext-bridge` so any shell with `~/.local/bin` in PATH
 *      can reach it — Terminal.app, iTerm, VS Code, etc.
 *   2. Injects a small sentinel-bracketed block into each configured agent's
 *      user-global instructions file (Claude, Codex, OpenCode).
 *
 * What it does on uninstall:
 *   - Reads the manifest of files it touched and removes only the sentinel
 *     block (for agent configs) or the file itself (for the symlink). Never
 *     touches anything outside the sentinels.
 *
 * Install is idempotent. Rerun safely on app upgrade.
 *
 * The `~/.arcnext/bridge.json` discovery file written by server.ts is
 * separate (it's always present while the server runs, not gated by this
 * toggle — see server.ts for rationale).
 */

import { app } from 'electron'
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, copyFileSync, chmodSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'

const SENTINEL_START = '<!-- arcnext-bridge:start -->'
const SENTINEL_END = '<!-- arcnext-bridge:end -->'

interface AgentConfig {
  name: string
  path: string
}

const AGENT_CONFIGS: AgentConfig[] = [
  { name: 'claude',   path: join(homedir(), '.claude', 'CLAUDE.md') },
  { name: 'codex',    path: join(homedir(), '.codex', 'AGENTS.md') },
  { name: 'opencode', path: join(homedir(), '.config', 'opencode', 'AGENTS.md') }
]

const CLI_LINK = join(homedir(), '.local', 'bin', 'arcnext-bridge')

interface InstallManifest {
  version: 1
  installedAt: number
  /** Files we wholly own. Remove on uninstall. */
  ownedFiles: string[]
  /** Files we injected a sentinel block into. Strip the block on uninstall. */
  injectedFiles: string[]
}

function manifestPath(): string {
  return join(app.getPath('userData'), 'webbridge-install-manifest.json')
}

function loadManifest(): InstallManifest | null {
  const path = manifestPath()
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf-8')) as InstallManifest } catch { return null }
}

function saveManifest(m: InstallManifest): void {
  writeFileSync(manifestPath(), JSON.stringify(m, null, 2))
}

function clearManifest(): void {
  const path = manifestPath()
  if (existsSync(path)) try { unlinkSync(path) } catch { /* ignore */ }
}

function bridgeBlock(): string {
  return [
    SENTINEL_START,
    '',
    '## ArcNext browser bridge',
    '',
    'When ArcNext is running, the `arcnext-bridge` CLI can see and drive browser panes',
    'open inside it. Use it whenever the user asks you to do something on a web page.',
    '',
    '- `arcnext-bridge panes` — list open panes (paneId, url, title)',
    '- `arcnext-bridge open <url>` — open a new pane',
    '- `arcnext-bridge snapshot <paneId>` — accessibility tree with numbered refs (e.g. `e23`)',
    '- `arcnext-bridge click <paneId> <ref>` / `type <paneId> <ref> <text>` / `press <paneId> <key>`',
    '- `arcnext-bridge navigate <paneId> <url>` / `back` / `forward` / `reload` / `scroll`',
    '- `arcnext-bridge screenshot <paneId>` — PNG of the visible page',
    '- `arcnext-bridge wait <paneId> --role <role> --name <substring>`',
    '',
    'Run `arcnext-bridge --help` or `arcnext-bridge <command> --help` for the authoritative reference.',
    '',
    'Workflow: snapshot first to get refs → act by ref. The human sees each action',
    '(sky-blue glow on the pane and in the sidebar) and can interrupt by clicking or typing.',
    '',
    SENTINEL_END,
    ''
  ].join('\n')
}

function stripBlock(content: string): string {
  const start = content.indexOf(SENTINEL_START)
  if (start === -1) return content
  const end = content.indexOf(SENTINEL_END, start)
  if (end === -1) return content
  const after = end + SENTINEL_END.length
  // Consume a trailing newline if present so we don't leave a blank line
  const trailingNewline = content[after] === '\n' ? 1 : 0
  // Also consume the immediately-preceding newline before the block, if any,
  // so surrounding paragraphs stay clean.
  const leading = start > 0 && content[start - 1] === '\n' ? 1 : 0
  return content.slice(0, start - leading) + content.slice(after + trailingNewline)
}

function injectBlock(content: string): string {
  const stripped = stripBlock(content)
  const separator = stripped.length === 0 || stripped.endsWith('\n\n') ? '' : (stripped.endsWith('\n') ? '\n' : '\n\n')
  return stripped + separator + bridgeBlock()
}

/** Resolve the bundled CLI path in both dev and packaged builds. */
function bundledCliPath(): string {
  // __dirname is out/main in both dev and production; the CLI lives at
  // out/main/bin/arcnext-bridge — see vite config's buildBridgeCli plugin.
  // In packaged builds, out/main/bin is asarUnpacked.
  return join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bin', 'arcnext-bridge')
}

function installCli(): string {
  const src = bundledCliPath()
  if (!existsSync(src)) {
    throw new Error(`bundled arcnext-bridge not found at ${src}`)
  }

  mkdirSync(dirname(CLI_LINK), { recursive: true })

  // Remove whatever's there already (could be an old symlink or a stale copy).
  if (existsSync(CLI_LINK) || lstatSafely(CLI_LINK)) {
    try { unlinkSync(CLI_LINK) } catch { /* ignore */ }
  }

  // Prefer symlink so app updates are picked up automatically.
  try {
    symlinkSync(src, CLI_LINK)
  } catch {
    // Filesystems that don't support symlinks (e.g. certain network mounts) — copy.
    copyFileSync(src, CLI_LINK)
    chmodSync(CLI_LINK, 0o755)
  }

  return CLI_LINK
}

function lstatSafely(p: string): import('fs').Stats | null {
  try { return lstatSync(p) } catch { return null }
}

function removeCli(): void {
  if (existsSync(CLI_LINK) || lstatSafely(CLI_LINK)) {
    try { unlinkSync(CLI_LINK) } catch { /* ignore */ }
  }
}

function injectIntoConfig(cfg: AgentConfig): boolean {
  try {
    mkdirSync(dirname(cfg.path), { recursive: true })
    const existing = existsSync(cfg.path) ? readFileSync(cfg.path, 'utf-8') : ''
    const next = injectBlock(existing)
    if (next === existing) return false
    writeFileSync(cfg.path, next)
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[webbridge/installer] failed to inject into ${cfg.path}:`, err)
    return false
  }
}

function stripFromConfig(cfg: AgentConfig): boolean {
  if (!existsSync(cfg.path)) return false
  try {
    const content = readFileSync(cfg.path, 'utf-8')
    const stripped = stripBlock(content)
    if (stripped === content) return false
    if (stripped.trim() === '') {
      // We created this file and we're the only thing in it — delete it so
      // uninstall is truly clean.
      unlinkSync(cfg.path)
    } else {
      writeFileSync(cfg.path, stripped)
    }
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[webbridge/installer] failed to strip from ${cfg.path}:`, err)
    return false
  }
}

export interface InstallResult {
  ok: boolean
  cliPath?: string
  injected: string[]
  errors: string[]
}

export function install(): InstallResult {
  const result: InstallResult = { ok: true, injected: [], errors: [] }
  let cliPath: string | undefined

  try {
    cliPath = installCli()
    result.cliPath = cliPath
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
    result.ok = false
  }

  const injected: string[] = []
  for (const cfg of AGENT_CONFIGS) {
    if (injectIntoConfig(cfg)) injected.push(cfg.path)
  }
  result.injected = injected

  const manifest: InstallManifest = {
    version: 1,
    installedAt: Date.now(),
    ownedFiles: cliPath ? [cliPath] : [],
    injectedFiles: injected
  }
  try { saveManifest(manifest) } catch { /* ignore */ }

  return result
}

export interface UninstallResult {
  ok: boolean
  removed: string[]
  stripped: string[]
  errors: string[]
}

export function uninstall(): UninstallResult {
  const result: UninstallResult = { ok: true, removed: [], stripped: [], errors: [] }
  const manifest = loadManifest()

  // Always try the known paths — manifest might be missing but files could
  // still be present from an earlier install.
  try {
    removeCli()
    result.removed.push(CLI_LINK)
  } catch (err) {
    result.errors.push(`cli: ${err instanceof Error ? err.message : String(err)}`)
    result.ok = false
  }

  const toStrip = manifest?.injectedFiles ?? AGENT_CONFIGS.map((c) => c.path)
  for (const p of toStrip) {
    const cfg = AGENT_CONFIGS.find((c) => c.path === p) ?? { name: 'unknown', path: p }
    if (stripFromConfig(cfg)) result.stripped.push(cfg.path)
  }

  clearManifest()
  return result
}

export function isInstalled(): boolean {
  // Installed if either the symlink exists OR we have a manifest.
  return !!loadManifest() || !!lstatSafely(CLI_LINK)
}
