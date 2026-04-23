/**
 * JSON-RPC 2.0 server on a Unix domain socket.
 *
 * Each connection is a session:
 *   1. First message MUST be `hello` with the token. Any other first message or
 *      a wrong token closes the connection.
 *   2. After hello, the connection can call any other method.
 *   3. On disconnect, the session's locks are released.
 *
 * Wire format: newline-delimited JSON (one request per line).
 */

import { createServer, Server, Socket } from 'net'
import { randomBytes } from 'crypto'
import { existsSync, unlinkSync, chmodSync } from 'fs'
import { handlers } from './tools'
import * as locks from './lockManager'
import {
  ErrorCode,
  Method,
  PROTOCOL_VERSION,
  type HelloParams,
  type HelloResult,
  type JsonRpcRequest,
  type JsonRpcResponse
} from './protocol'
import { BridgeError } from './cdp'

interface Session {
  sessionId: string
  authed: boolean
}

let token = ''
let sockPath = ''
let server: Server | null = null

export function getToken(): string { return token }
export function getSocketPath(): string { return sockPath }

export function startServer(socketPath: string): Promise<void> {
  token = randomBytes(32).toString('hex')
  sockPath = socketPath

  // Remove stale socket if present
  if (existsSync(sockPath)) {
    try { unlinkSync(sockPath) } catch { /* ignore */ }
  }

  server = createServer((socket) => { handleConnection(socket) })

  return new Promise((resolve, reject) => {
    server!.on('error', reject)
    server!.listen(sockPath, () => {
      try { chmodSync(sockPath, 0o600) } catch { /* best effort */ }
      resolve()
    })
  })
}

export function stopServer(): void {
  if (server) {
    try { server.close() } catch { /* ignore */ }
    server = null
  }
  if (sockPath && existsSync(sockPath)) {
    try { unlinkSync(sockPath) } catch { /* ignore */ }
  }
}

function handleConnection(socket: Socket): void {
  const session: Session = {
    sessionId: randomBytes(8).toString('hex'),
    authed: false
  }

  let buf = ''

  const send = (response: JsonRpcResponse): void => {
    if (socket.destroyed) return
    socket.write(JSON.stringify(response) + '\n')
  }

  socket.on('data', (chunk) => {
    buf += chunk.toString('utf-8')
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (!line.trim()) continue

      let req: JsonRpcRequest
      try {
        req = JSON.parse(line) as JsonRpcRequest
      } catch {
        send({
          jsonrpc: '2.0',
          id: null,
          error: { code: ErrorCode.ParseError, message: 'invalid JSON' }
        })
        continue
      }

      void dispatch(session, req).then(send).catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        send({
          jsonrpc: '2.0',
          id: req?.id ?? null,
          error: { code: ErrorCode.InternalError, message }
        })
      })
    }
  })

  const cleanup = (): void => {
    locks.releaseAllFor(session.sessionId)
  }
  socket.on('close', cleanup)
  socket.on('error', cleanup)
}

async function dispatch(session: Session, req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = typeof req.id === 'number' ? req.id : 0

  try {
    if (!session.authed) {
      if (req.method !== Method.Hello) {
        return {
          jsonrpc: '2.0', id,
          error: { code: ErrorCode.AuthRequired, message: 'first call must be hello' }
        }
      }
      const params = (req.params ?? {}) as HelloParams
      if (params.token !== token) {
        return {
          jsonrpc: '2.0', id,
          error: { code: ErrorCode.AuthFailed, message: 'invalid token' }
        }
      }
      session.authed = true
      const result: HelloResult = {
        protocolVersion: PROTOCOL_VERSION,
        sessionId: session.sessionId
      }
      return { jsonrpc: '2.0', id, result }
    }

    const handler = (handlers as Record<string, (params: unknown, sessionId: string) => Promise<unknown>>)[req.method]
    if (!handler) {
      return {
        jsonrpc: '2.0', id,
        error: { code: ErrorCode.MethodNotFound, message: `unknown method: ${req.method}` }
      }
    }

    const result = await handler(req.params ?? {}, session.sessionId)
    return { jsonrpc: '2.0', id, result }
  } catch (err) {
    if (err instanceof BridgeError) {
      return {
        jsonrpc: '2.0', id,
        error: { code: err.code, message: err.message, data: err.data }
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return {
      jsonrpc: '2.0', id,
      error: { code: ErrorCode.InternalError, message }
    }
  }
}
