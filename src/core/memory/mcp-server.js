import { createMemoryEngine, defaultMemoryDbPath } from './engine.js'
import { memoryTools, createMemoryToolHandlers } from './tools.js'

const PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = { name: 'ancleto-memory', version: '1.0.0' }

export function createMemoryServer({ dbPath = defaultMemoryDbPath() } = {}) {
  let engine = null
  let handlers = null

  function toolkit() {
    if (!engine) {
      engine = createMemoryEngine(dbPath)
      handlers = createMemoryToolHandlers(engine, { source: 'mcp:ancleto-memory' })
    }
    return handlers
  }

  const respond = (id, result) => ({ jsonrpc: '2.0', id, result })
  const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

  function handle(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return null
    const { id, method, params } = message
    if (typeof method === 'string' && method.startsWith('notifications/')) return null
    if (id === undefined || id === null) return null

    switch (method) {
      case 'initialize':
        return respond(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO })
      case 'ping':
        return respond(id, {})
      case 'tools/list':
        return respond(id, { tools: memoryTools })
      case 'tools/call': {
        const name = params && params.name
        const args = (params && params.arguments) || {}
        const tool = toolkit()[name]
        if (!tool) return fail(id, -32602, `tool desconocida: ${name}`)
        try {
          const result = tool(args)
          return respond(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] })
        } catch (err) {
          return respond(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true })
        }
      }
      default:
        return fail(id, -32601, `metodo no soportado: ${method}`)
    }
  }

  function close() {
    if (engine) {
      engine.close()
      engine = null
      handlers = null
    }
  }

  return { handle, close, dbPath }
}

export async function serveMemoryMcp({ dbPath = defaultMemoryDbPath(), input = process.stdin, output = process.stdout } = {}) {
  const server = createMemoryServer({ dbPath })
  const write = (obj) => output.write(JSON.stringify(obj) + '\n')

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    server.close()
    try { input.pause() } catch {}
  }

  input.setEncoding('utf8')
  let buffer = ''
  input.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      const text = line.trim()
      if (!text) continue
      let message
      try {
        message = JSON.parse(text)
      } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalido' } })
        continue
      }
      const response = server.handle(message)
      if (response) write(response)
    }
  })
  input.on('end', stop)
  process.on('SIGINT', () => { stop(); process.exit(0) })
  process.on('SIGTERM', () => { stop(); process.exit(0) })
}
