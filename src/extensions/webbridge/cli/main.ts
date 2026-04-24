/**
 * arcnext-bridge — CLI for driving ArcNext browser panes from a terminal pane.
 *
 * Connects over Unix domain socket using newline-delimited JSON-RPC 2.0.
 * Required env:
 *   ARCNEXT_BRIDGE_SOCK  path to the socket
 *   ARCNEXT_BRIDGE_TOKEN auth token injected by ArcNext into the PTY
 *
 * Zero external deps — Node built-ins only.
 */

import * as net from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  ErrorCode,
  Method,
  type AxNode,
  type HelloResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type OpenResult,
  type PaneSummary,
  type ScreenshotResult,
  type Snapshot,
  type WaitResult
} from '../protocol'

const CLI_VERSION = '0.1.0'
const CLIENT_NAME = 'arcnext-bridge-cli'

// ---------- exit codes ----------
const EXIT_OK = 0
const EXIT_GENERIC = 1
const EXIT_NO_SOCK = 2
const EXIT_CONNECT = 3
const EXIT_AUTH = 4
const EXIT_TARGET = 5
const EXIT_LOCK = 6
const EXIT_DEBUGGER = 7
const EXIT_TIMEOUT = 8

function exitCodeForJsonRpcError(code: number): number {
  switch (code) {
    case ErrorCode.AuthRequired:
    case ErrorCode.AuthFailed:
      return EXIT_AUTH
    case ErrorCode.UnknownPane:
    case ErrorCode.RefNotFound:
      return EXIT_TARGET
    case ErrorCode.LockConflict:
    case ErrorCode.NotAcquired:
    case ErrorCode.UserYielded:
      return EXIT_LOCK
    case ErrorCode.DebuggerConflict:
      return EXIT_DEBUGGER
    case ErrorCode.Timeout:
      return EXIT_TIMEOUT
    default:
      return EXIT_GENERIC
  }
}

// ---------- JSON-RPC client ----------
class BridgeClient {
  private sock: net.Socket | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>()
  private buf = ''
  private closed = false

  async connect(sockPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ path: sockPath })
      let settled = false
      const onError = (err: Error): void => {
        if (settled) return
        settled = true
        reject(err)
      }
      s.once('error', onError)
      s.once('connect', () => {
        if (settled) return
        settled = true
        s.removeListener('error', onError)
        this.sock = s
        s.setEncoding('utf8')
        s.on('data', (chunk) => this.onData(String(chunk)))
        s.on('error', (err) => this.onClose(err))
        s.on('close', () => this.onClose(null))
        resolve()
      })
    })
  }

  private onData(chunk: string): void {
    this.buf += chunk
    let idx: number
    while ((idx = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, idx)
      this.buf = this.buf.slice(idx + 1)
      if (!line.trim()) continue
      let msg: JsonRpcResponse
      try {
        msg = JSON.parse(line) as JsonRpcResponse
      } catch {
        continue
      }
      if (typeof msg.id !== 'number') continue
      const p = this.pending.get(msg.id)
      if (!p) continue
      this.pending.delete(msg.id)
      if ('error' in msg) {
        const err = new BridgeError(msg.error.code, msg.error.message, msg.error.data)
        p.reject(err)
      } else {
        p.resolve(msg.result)
      }
    }
  }

  private onClose(err: Error | null): void {
    if (this.closed) return
    this.closed = true
    const failure = err ?? new Error('connection closed')
    for (const { reject } of this.pending.values()) reject(failure)
    this.pending.clear()
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.sock || this.closed) return Promise.reject(new Error('not connected'))
    const id = this.nextId++
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (r) => resolve(r as T), reject })
      this.sock!.write(JSON.stringify(req) + '\n', (werr) => {
        if (werr) {
          this.pending.delete(id)
          reject(werr)
        }
      })
    })
  }

  close(): void {
    this.closed = true
    try {
      this.sock?.end()
    } catch {
      // ignore
    }
    this.sock = null
  }
}

class BridgeError extends Error {
  constructor(public code: number, message: string, public data?: unknown) {
    super(message)
  }
}

// ---------- argv parsing ----------
interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | boolean>
  wantJson: boolean
  wantHelp: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  let wantJson = false
  let wantHelp = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') {
      wantJson = true
    } else if (a === '--help' || a === '-h') {
      wantHelp = true
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1)
      } else {
        const key = a.slice(2)
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('-')) {
          flags[key] = next
          i++
        } else {
          flags[key] = true
        }
      }
    } else if (a.startsWith('-') && a.length > 1 && a !== '-') {
      const key = a.slice(1)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { positional, flags, wantJson, wantHelp }
}

function refOrSelector(input: string): { ref?: string; selector?: string } {
  if (/^e\d+$/.test(input)) return { ref: input }
  return { selector: input }
}

// ---------- help text ----------
const HELP_TEXT = `arcnext-bridge ${CLI_VERSION} — drive ArcNext browser panes from the terminal

USAGE
  arcnext-bridge [--json] <command> [args...]
  arcnext-bridge                      show banner + pane list
  arcnext-bridge --help               show this help
  arcnext-bridge <command> --help     show per-command help

COMMANDS
  panes                               list open browser panes
  open <url>                          open <url> in a new browser pane
  navigate <paneId> <url>             navigate pane to url
  back <paneId>                       history back
  forward <paneId>                    history forward
  reload <paneId> [--no-cache]        reload pane
  snapshot <paneId>                   accessibility snapshot (with refs)
  screenshot <paneId> [--format png|jpeg] [--full-page] [-o <file>]
                                      capture screenshot
  click <paneId> <ref|selector> [--button left|middle|right]
  type <paneId> <ref|selector> <text> [--clear] [--cadence <ms>]
  press <paneId> <key> [--mod alt,shift,meta,control]
  scroll <paneId> [--dx <n>] [--dy <n>]
  wait <paneId> [--selector X] [--ref X] [--role X] [--name X] [--timeout <ms>]
  acquire [<paneId>]                  acquire debugger lock
  release <paneId>                    release debugger lock
  stop <paneId>                       stop current page load

GLOBAL FLAGS
  --json                              print raw JSON result
  --help, -h                          show help
  --version, -v                       show version

ENV
  ARCNEXT_BRIDGE_SOCK                 path to Unix socket (required)
  ARCNEXT_BRIDGE_TOKEN                auth token (required)
`

const COMMAND_HELP: Record<string, string> = {
  panes: 'panes — list open browser panes (no args)',
  open: 'open <url> — open a url in a new browser pane',
  navigate: 'navigate <paneId> <url> — navigate pane to url',
  back: 'back <paneId> — history back',
  forward: 'forward <paneId> — history forward',
  reload: 'reload <paneId> [--no-cache] — reload pane',
  snapshot: 'snapshot <paneId> — accessibility snapshot with refs',
  screenshot:
    'screenshot <paneId> [--format png|jpeg] [--full-page] [-o <file>] — capture image',
  click:
    'click <paneId> <ref|selector> [--button left|middle|right] — click element',
  type:
    'type <paneId> <ref|selector> <text> [--clear] [--cadence <ms>] — type text into element',
  press: 'press <paneId> <key> [--mod alt,shift,meta,control] — press a key',
  scroll: 'scroll <paneId> [--dx <n>] [--dy <n>] — scroll by delta pixels',
  wait:
    'wait <paneId> [--selector|--ref|--role|--name X] [--timeout <ms>] — wait for condition',
  acquire: 'acquire [<paneId>] — acquire debugger lock (server picks pane if omitted)',
  release: 'release <paneId> — release debugger lock',
  stop: 'stop <paneId> — stop current page load'
}

// ---------- output helpers ----------
function jsonOk(result: unknown): void {
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n')
}

function jsonErr(code: number, message: string): void {
  process.stdout.write(JSON.stringify({ ok: false, error: { code, message } }) + '\n')
}

function fail(message: string, exit: number, wantJson: boolean): never {
  if (wantJson) jsonErr(exit, message)
  else process.stderr.write(`error: ${message}\n`)
  process.exit(exit)
}

function padRight(s: string, n: number): string {
  if (s.length >= n) return s
  return s + ' '.repeat(n - s.length)
}

function formatPanes(panes: PaneSummary[]): string {
  if (panes.length === 0) return '(no browser panes open)\n'
  const idW = Math.max(6, ...panes.map((p) => p.paneId.length))
  const urlW = Math.max(3, ...panes.map((p) => p.url.length))
  const lines: string[] = []
  lines.push(`${padRight('paneId', idW)}  ${padRight('url', urlW)}  title`)
  for (const p of panes) {
    lines.push(`${padRight(p.paneId, idW)}  ${padRight(p.url, urlW)}  ${p.title}`)
  }
  return lines.join('\n') + '\n'
}

function formatSnapshot(snap: Snapshot): string {
  const lines: string[] = []
  lines.push(`# ${snap.title || snap.url}`)
  lines.push(`# pane=${snap.paneId} url=${snap.url}`)
  const walk = (node: AxNode, depth: number): void => {
    const hasName = typeof node.name === 'string' && node.name.length > 0
    const hasChildren = Array.isArray(node.children) && node.children.length > 0
    if (hasName || hasChildren || depth === 0) {
      const indent = '  '.repeat(depth)
      const name = hasName ? ` "${node.name}"` : ''
      lines.push(`${indent}- ${node.role}${name} [ref=${node.ref}]`)
    }
    if (hasChildren) {
      for (const c of node.children!) walk(c, depth + 1)
    }
  }
  walk(snap.tree, 0)
  return lines.join('\n') + '\n'
}

function parseModifiers(
  raw: string | boolean | undefined
): Array<'alt' | 'control' | 'meta' | 'shift'> | undefined {
  if (typeof raw !== 'string') return undefined
  const allowed = new Set(['alt', 'control', 'meta', 'shift'])
  const out: Array<'alt' | 'control' | 'meta' | 'shift'> = []
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!allowed.has(part)) throw new Error(`unknown modifier: ${part}`)
    out.push(part as 'alt' | 'control' | 'meta' | 'shift')
  }
  return out.length ? out : undefined
}

function toInt(v: string | boolean | undefined, name: string): number | undefined {
  if (v === undefined) return undefined
  if (typeof v === 'boolean') throw new Error(`${name} requires a number`)
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`)
  return n
}

// ---------- env / connect ----------
/**
 * Resolve connection info.
 *
 * Preference order:
 *   1. ARCNEXT_BRIDGE_SOCK + ARCNEXT_BRIDGE_TOKEN env vars
 *      (always present in ArcNext-spawned PTYs)
 *   2. ~/.arcnext/bridge.json discovery file
 *      (written by the running ArcNext main process — lets this CLI work
 *      from any shell on the machine, not just ones spawned by ArcNext)
 */
function resolveConnection(): { sock: string; token: string } | null {
  const envSock = process.env.ARCNEXT_BRIDGE_SOCK
  const envToken = process.env.ARCNEXT_BRIDGE_TOKEN
  if (envSock) return { sock: envSock, token: envToken ?? '' }

  const discoveryPath = path.join(os.homedir(), '.arcnext', 'bridge.json')
  try {
    const raw = fs.readFileSync(discoveryPath, 'utf-8')
    const parsed = JSON.parse(raw) as { sock?: string; token?: string }
    if (parsed.sock && parsed.token) return { sock: parsed.sock, token: parsed.token }
  } catch {
    /* missing or unreadable — fall through */
  }
  return null
}

function getSockPath(wantJson: boolean): string {
  const conn = resolveConnection()
  if (!conn) {
    fail(
      'ArcNext bridge not available. Either run this command inside an ArcNext terminal, or start ArcNext first (it publishes connection info to ~/.arcnext/bridge.json).',
      EXIT_NO_SOCK,
      wantJson
    )
  }
  return conn.sock
}

async function connectAndHello(wantJson: boolean): Promise<BridgeClient> {
  const conn = resolveConnection()
  if (!conn) {
    fail(
      'ArcNext bridge not available. Either run this command inside an ArcNext terminal, or start ArcNext first (it publishes connection info to ~/.arcnext/bridge.json).',
      EXIT_NO_SOCK,
      wantJson
    )
  }
  const client = new BridgeClient()
  try {
    await client.connect(conn.sock)
  } catch {
    fail(`cannot connect to ArcNext bridge at ${conn.sock}`, EXIT_CONNECT, wantJson)
  }
  try {
    await client.call<HelloResult>(Method.Hello, {
      token: conn.token,
      clientName: CLIENT_NAME,
      clientVersion: CLI_VERSION
    })
  } catch (err) {
    client.close()
    if (err instanceof BridgeError) {
      fail(err.message || 'auth failed', EXIT_AUTH, wantJson)
    }
    fail('auth failed', EXIT_AUTH, wantJson)
  }
  return client
}

// ---------- banner (no-args mode) ----------
async function showBanner(wantJson: boolean): Promise<void> {
  const conn = resolveConnection()
  if (!conn) {
    if (wantJson) {
      jsonErr(EXIT_NO_SOCK, 'ArcNext bridge not available')
    } else {
      process.stdout.write('arcnext-bridge ' + CLI_VERSION + '\n')
      process.stdout.write('socket:    (not found)\n')
      process.stdout.write('status:    unavailable\n')
      process.stdout.write(
        'note:      start ArcNext first, or run this inside an ArcNext terminal\n'
      )
      process.stdout.write("run 'arcnext-bridge --help' for commands\n")
    }
    process.exit(EXIT_NO_SOCK)
  }
  const sockPath = conn.sock

  const client = new BridgeClient()
  let status = 'connected'
  let panes: PaneSummary[] = []
  let connectErr: string | null = null
  try {
    await client.connect(sockPath)
    try {
      await client.call<HelloResult>(Method.Hello, {
        token: conn.token,
        clientName: CLIENT_NAME,
        clientVersion: CLI_VERSION
      })
      try {
        panes = await client.call<PaneSummary[]>(Method.Panes)
      } catch (err) {
        connectErr = err instanceof Error ? err.message : String(err)
        status = 'error'
      }
    } catch (err) {
      status = 'auth failed'
      connectErr = err instanceof Error ? err.message : String(err)
    }
  } catch (err) {
    status = 'unreachable'
    connectErr = err instanceof Error ? err.message : String(err)
  } finally {
    client.close()
  }

  if (wantJson) {
    jsonOk({ sockPath, status, panes, error: connectErr })
    return
  }

  process.stdout.write(`arcnext-bridge ${CLI_VERSION}\n`)
  process.stdout.write(`socket:    ${sockPath}\n`)
  process.stdout.write(`status:    ${status}${connectErr ? ` (${connectErr})` : ''}\n`)
  process.stdout.write('\npanes:\n')
  process.stdout.write(formatPanes(panes))
  process.stdout.write("\nrun 'arcnext-bridge --help' for commands\n")
}

// ---------- command dispatch ----------
async function runCommand(cmd: string, args: ParsedArgs): Promise<void> {
  if (args.wantHelp) {
    const help = COMMAND_HELP[cmd]
    process.stdout.write((help ?? `unknown command: ${cmd}`) + '\n')
    process.exit(help ? EXIT_OK : EXIT_GENERIC)
  }

  const wantJson = args.wantJson
  const client = await connectAndHello(wantJson)
  try {
    switch (cmd) {
      case 'panes': {
        const res = await client.call<PaneSummary[]>(Method.Panes)
        if (wantJson) jsonOk(res)
        else process.stdout.write(formatPanes(res))
        return
      }

      case 'open': {
        const url = args.positional[0]
        if (!url) throw new Error('open requires <url>')
        const res = await client.call<OpenResult>(Method.Open, { url })
        if (wantJson) jsonOk(res)
        else process.stdout.write(`ok — opened ${res.paneId} at ${res.url}\n`)
        return
      }

      case 'navigate': {
        const [paneId, url] = args.positional
        if (!paneId || !url) throw new Error('navigate requires <paneId> <url>')
        const res = await client.call(Method.Navigate, { paneId, url })
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      case 'back':
      case 'forward': {
        const paneId = args.positional[0]
        if (!paneId) throw new Error(`${cmd} requires <paneId>`)
        const method = cmd === 'back' ? Method.Back : Method.Forward
        const res = await client.call(method, { paneId })
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      case 'reload': {
        const paneId = args.positional[0]
        if (!paneId) throw new Error('reload requires <paneId>')
        const ignoreCache = args.flags['no-cache'] === true
        const res = await client.call(Method.Reload, { paneId, ignoreCache })
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      case 'snapshot': {
        const paneId = args.positional[0]
        if (!paneId) throw new Error('snapshot requires <paneId>')
        const res = await client.call<Snapshot>(Method.Snapshot, { paneId })
        if (wantJson) jsonOk(res)
        else process.stdout.write(formatSnapshot(res))
        return
      }

      case 'screenshot': {
        const paneId = args.positional[0]
        if (!paneId) throw new Error('screenshot requires <paneId>')
        const formatFlag = args.flags['format']
        const format: 'png' | 'jpeg' | undefined =
          formatFlag === 'png' || formatFlag === 'jpeg' ? formatFlag : undefined
        const fullPage = args.flags['full-page'] === true
        const outFlag = args.flags['o']
        const res = await client.call<ScreenshotResult>(Method.Screenshot, {
          paneId,
          format,
          fullPage
        })
        if (wantJson) {
          jsonOk(res)
          return
        }
        const ext = res.mime === 'image/jpeg' ? 'jpg' : 'png'
        const buf = Buffer.from(res.base64, 'base64')
        let outPath: string
        if (typeof outFlag === 'string' && outFlag.length > 0) {
          outPath = path.resolve(outFlag)
        } else {
          outPath = path.join(os.tmpdir(), `arcnext-${paneId}-${Date.now()}.${ext}`)
        }
        fs.writeFileSync(outPath, buf)
        if (typeof outFlag === 'string') {
          process.stdout.write(`saved ${outPath}\n`)
        } else {
          process.stdout.write(
            `${res.width}x${res.height} ${res.mime} (${res.base64.length} base64 chars) → ${outPath}\n`
          )
        }
        return
      }

      case 'click': {
        const [paneId, target] = args.positional
        if (!paneId || !target) throw new Error('click requires <paneId> <ref|selector>')
        const btn = args.flags['button']
        const button: 'left' | 'middle' | 'right' | undefined =
          btn === 'left' || btn === 'middle' || btn === 'right' ? btn : undefined
        const res = await client.call(Method.Click, {
          paneId,
          ...refOrSelector(target),
          button
        })
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      case 'type': {
        const [paneId, target, ...rest] = args.positional
        if (!paneId || !target || rest.length === 0) {
          throw new Error('type requires <paneId> <ref|selector> <text>')
        }
        const text = rest.join(' ')
        const clearFirst = args.flags['clear'] === true
        const cadenceMs = toInt(args.flags['cadence'], '--cadence')
        const res = await client.call<{ ok: true; value?: string; method?: string }>(Method.Type, {
          paneId,
          ...refOrSelector(target),
          text,
          clearFirst,
          cadenceMs
        })
        if (wantJson) jsonOk(res)
        else if (res.value !== undefined) {
          // Text mode shows the readback so agents can see what landed.
          process.stdout.write(`ok — value=${JSON.stringify(res.value)}\n`)
        } else {
          process.stdout.write('ok\n')
        }
        return
      }

      case 'press': {
        const [paneId, key] = args.positional
        if (!paneId || !key) throw new Error('press requires <paneId> <key>')
        const modifiers = parseModifiers(args.flags['mod'])
        const res = await client.call(Method.Press, { paneId, key, modifiers })
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      case 'scroll': {
        const paneId = args.positional[0]
        if (!paneId) throw new Error('scroll requires <paneId>')
        const dx = toInt(args.flags['dx'], '--dx')
        const dy = toInt(args.flags['dy'], '--dy')
        const res = await client.call(Method.Scroll, { paneId, dx, dy })
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      case 'wait': {
        const paneId = args.positional[0]
        if (!paneId) throw new Error('wait requires <paneId>')
        const selector =
          typeof args.flags['selector'] === 'string' ? args.flags['selector'] : undefined
        const ref = typeof args.flags['ref'] === 'string' ? args.flags['ref'] : undefined
        const role = typeof args.flags['role'] === 'string' ? args.flags['role'] : undefined
        const name = typeof args.flags['name'] === 'string' ? args.flags['name'] : undefined
        const timeoutMs = toInt(args.flags['timeout'], '--timeout')
        const res = await client.call<WaitResult>(Method.Wait, {
          paneId,
          selector,
          ref,
          role,
          name,
          timeoutMs
        })
        if (wantJson) jsonOk(res)
        else if (res.matched) process.stdout.write(`matched${res.ref ? ` ref=${res.ref}` : ''}\n`)
        else process.stdout.write('not matched\n')
        return
      }

      case 'acquire': {
        const paneId = args.positional[0]
        const res = await client.call(Method.Acquire, paneId ? { paneId } : {})
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      case 'release': {
        const paneId = args.positional[0]
        if (!paneId) throw new Error('release requires <paneId>')
        const res = await client.call(Method.Release, { paneId })
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      case 'stop': {
        const paneId = args.positional[0]
        if (!paneId) throw new Error('stop requires <paneId>')
        const res = await client.call(Method.Stop, { paneId })
        if (wantJson) jsonOk(res)
        else process.stdout.write('ok\n')
        return
      }

      default:
        fail(`unknown command: ${cmd}`, EXIT_GENERIC, wantJson)
    }
  } finally {
    client.close()
  }
}

// ---------- entrypoint ----------
async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  // --version / -v short-circuit
  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(CLI_VERSION + '\n')
    return
  }

  // global --help / -h (no subcommand)
  if (argv.length === 0) {
    const parsed = parseArgs(argv)
    await showBanner(parsed.wantJson)
    return
  }

  if (argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(HELP_TEXT)
    return
  }

  // Parse the whole argv — the first *positional* is the subcommand, regardless
  // of where global flags appear. `arcnext-bridge --json panes` and
  // `arcnext-bridge panes --json` both work.
  const allParsed = parseArgs(argv)
  const cmd = allParsed.positional[0]
  const rest: ParsedArgs = {
    positional: allParsed.positional.slice(1),
    flags: allParsed.flags,
    wantJson: allParsed.wantJson,
    wantHelp: allParsed.wantHelp
  }

  if (!cmd) {
    // only global flags given
    await showBanner(allParsed.wantJson)
    return
  }

  if (cmd.startsWith('-')) {
    process.stderr.write(`unknown option: ${cmd}\n`)
    process.exit(EXIT_GENERIC)
  }

  try {
    await runCommand(cmd, rest)
  } catch (err) {
    if (err instanceof BridgeError) {
      const exit = exitCodeForJsonRpcError(err.code)
      if (rest.wantJson) jsonErr(err.code, err.message)
      else process.stderr.write(`error: ${err.message}\n`)
      process.exit(exit)
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (rest.wantJson) jsonErr(EXIT_GENERIC, msg)
    else process.stderr.write(`error: ${msg}\n`)
    process.exit(EXIT_GENERIC)
  }
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(EXIT_GENERIC)
})
