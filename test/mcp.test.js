import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CLI = join(TEST_DIR, '..', 'src', 'cli', 'index.js')

async function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-mcp-'))
  try {
    return await fn(dir)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort
    }
  }
}

function mcpClient(cwd) {
  const child = spawn(process.execPath, [CLI, 'mcp'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  let buffer = ''
  const pending = new Map()
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      const text = line.trim()
      if (!text) continue
      const msg = JSON.parse(text)
      if (msg.id !== null && msg.id !== undefined && pending.has(msg.id)) {
        const resolve = pending.get(msg.id)
        pending.delete(msg.id)
        resolve(msg)
      }
    }
  })
  const send = (id, method, params) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando respuesta a ${method}`)), 10000)
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  return { child, send, close: () => child.kill() }
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ANCLETO_MUSE_SPARK: '0' } })
}

describe('MCP de memoria propia (ancleto mcp)', () => {
  it('handshake, tools/list y round-trip de una regla', async () => {
    await withDir(async (dir) => {
      const { child, send, close } = mcpClient(dir)
      try {
        const init = await send(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
        assert.equal(init.result.serverInfo.name, 'ancleto-memory')
        assert.equal(init.result.protocolVersion, '2024-11-05')

        const list = await send(2, 'tools/list')
        assert.deepEqual(list.result.tools.map((t) => t.name), ['searchMemory', 'recordRule', 'recordDecision'])
        const rule = list.result.tools.find((t) => t.name === 'recordRule')
        assert.deepEqual(rule.inputSchema.properties.scope.enum, ['project', 'feature', 'task'])

        const rec = await send(3, 'tools/call', {
          name: 'recordRule',
          arguments: { memory_key: 'api-error-format', content: 'Los errores de API devuelven { code, message }.' }
        })
        assert.equal(rec.result.isError, undefined)
        assert.equal(JSON.parse(rec.result.content[0].text).node.memory_key, 'api-error-format')

        const search = await send(4, 'tools/call', { name: 'searchMemory', arguments: { query: 'errores de API' } })
        const hits = JSON.parse(search.result.content[0].text)
        assert.equal(hits.length, 1)
        assert.equal(hits[0].memory_key, 'api-error-format')

        assert.ok(existsSync(join(dir, '.ancleto', 'memory.db')), 'crea la DB del proyecto')
      } finally {
        close()
      }
    })
  })

  it('tool y metodo desconocidos devuelven error JSON-RPC', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        const tool = await send(1, 'tools/call', { name: 'noExiste', arguments: {} })
        assert.equal(tool.error.code, -32602)
        const method = await send(2, 'metodo/raro', {})
        assert.equal(method.error.code, -32601)
      } finally {
        close()
      }
    })
  })

  it('una regla sin scope entra en project y aparece en el working context del CLI', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        await send(1, 'tools/call', {
          name: 'recordRule',
          arguments: { memory_key: 'scope-default', content: 'Regla sin scope explicito.' }
        })
      } finally {
        close()
      }
      const ctx = runCli(['memory', 'context', '--scope', 'project'], dir)
      assert.equal(ctx.status, 0)
      assert.match(ctx.stdout, /scope-default/)
      assert.match(ctx.stdout, /Regla sin scope explicito/)
      assert.match(ctx.stdout, /<ProjectMemoryRules>/)
    })
  })
})

describe('CLI memory list (issue #12)', () => {
  it('lista nodos activos y filtra por type/scope', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        await send(1, 'tools/call', { name: 'recordRule', arguments: { memory_key: 'r-proj', content: 'Regla de proyecto.' } })
        await send(2, 'tools/call', { name: 'recordDecision', arguments: { memory_key: 'd-feat', content: 'Decision de feature.', scope: 'feature' } })
      } finally {
        close()
      }

      const all = runCli(['memory', 'list'], dir)
      assert.equal(all.status, 0)
      assert.match(all.stdout, /r-proj/)
      assert.match(all.stdout, /d-feat/)
      assert.match(all.stdout, /2 nodo\(s\)/)

      const rules = runCli(['memory', 'list', '--type', 'rule'], dir)
      assert.match(rules.stdout, /r-proj/)
      assert.doesNotMatch(rules.stdout, /d-feat/)

      const feat = runCli(['memory', 'list', '--scope', 'feature'], dir)
      assert.match(feat.stdout, /d-feat/)
      assert.doesNotMatch(feat.stdout, /r-proj/)

      const json = runCli(['memory', 'list', '--json'], dir)
      const parsed = JSON.parse(json.stdout)
      assert.equal(parsed.length, 2)
      assert.ok(parsed.every((n) => n.memory_key && n.type && n.scope))
    })
  })

  it('memory list es read-only: no modifica el WAL ni la DB', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        await send(1, 'tools/call', { name: 'recordRule', arguments: { memory_key: 'ro-1', content: 'Regla para read-only.' } })
      } finally {
        close()
      }

      // Esperar a que el MCP hijo termine de cerrar (checkpoint) antes de medir.
      const settle = async () => {
        const { statSync } = await import('node:fs')
        const path = join(dir, '.ancleto', 'memory.db-wal')
        let prev = -1
        for (let i = 0; i < 20; i++) {
          const size = existsSync(path) ? statSync(path).size : 0
          if (size === prev) return size
          prev = size
          await new Promise((r) => setTimeout(r, 50))
        }
        return prev
      }
      const before = await settle()

      const r = runCli(['memory', 'list'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /ro-1/)

      const after = await settle()
      assert.equal(after, before, `memory list no debe tocar el WAL (antes ${before}, despues ${after})`)

      // y los datos siguen intactos
      const again = runCli(['memory', 'list', '--json'], dir)
      assert.equal(JSON.parse(again.stdout).length, 1)
    })
  })

  it('memory list avisa si el repo no tiene memoria', async () => {
    await withDir(async (dir) => {
      const r = runCli(['memory', 'list'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stderr, /no hay memoria en este repo/)
    })
  })

  it('memory list rechaza filtros invalidos', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try { await send(1, 'tools/call', { name: 'recordRule', arguments: { memory_key: 'x', content: 'x' } }) } finally { close() }
      assert.equal(runCli(['memory', 'list', '--type', 'nope'], dir).status, 1)
      assert.equal(runCli(['memory', 'list', '--scope', 'nope'], dir).status, 1)
    })
  })

  it('memory doctor deja el WAL fusionado (checkpoint)', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        await send(1, 'tools/call', { name: 'recordRule', arguments: { memory_key: 'ck-1', content: 'Regla para checkpoint.' } })
      } finally {
        close()
      }
      const walPath = join(dir, '.ancleto', 'memory.db-wal')
      const { statSync } = await import('node:fs')
      const before = existsSync(walPath) ? statSync(walPath).size : 0

      const r = runCli(['memory', 'doctor'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /Checkpoint WAL: WAL fusionado/)

      const after = existsSync(walPath) ? statSync(walPath).size : 0
      assert.ok(after < before || after === 0, `el WAL debe reducirse (antes ${before}, despues ${after})`)
    })
  })
})
