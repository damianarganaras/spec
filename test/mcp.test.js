import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMemoryEngine } from '../src/core/memory/engine.js'

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

// El MCP hijo puede alcanzar a checkpointear al cerrarse: esperar a que el
// tamaño del -wal se estabilice antes de medirlo.
async function settleWalSize(walPath) {
  let prev = -1
  for (let i = 0; i < 20; i++) {
    const size = existsSync(walPath) ? statSync(walPath).size : 0
    if (size === prev) return size
    prev = size
    await new Promise((r) => setTimeout(r, 50))
  }
  return prev
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

describe('MCP de memoria propia (ancleto mcp)', () => {
  it('handshake, tools/list y round-trip de una regla', async () => {
    await withDir(async (dir) => {
      const { send, close } = mcpClient(dir)
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
      const before = await settleWalSize(join(dir, '.ancleto', 'memory.db-wal'))

      const r = runCli(['memory', 'list'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /ro-1/)

      const after = await settleWalSize(join(dir, '.ancleto', 'memory.db-wal'))
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

  // D2: el modo default es estrictamente read-only; el checkpoint (y con el la
  // garantia de "seguro para copiar") solo ocurre con --rebuild.
  it('memory doctor en modo default no fusiona el WAL ni cambia la DB', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        await send(1, 'tools/call', { name: 'recordRule', arguments: { memory_key: 'ck-ro-1', content: 'Regla para doctor read-only.' } })
      } finally {
        close()
      }

      const dbPath = join(dir, '.ancleto', 'memory.db')
      const walPath = `${dbPath}-wal`
      const walSize = await settleWalSize(walPath)
      assert.ok(walSize > 0, `el -wal debe arrancar con frames sin checkpoint (size ${walSize})`)

      const before = { db: hashFile(dbPath), wal: hashFile(walPath), walSize }

      const r = runCli(['memory', 'doctor'], dir)
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /− Checkpoint WAL: omitido/)
      assert.match(r.stdout, /Checkpoint WAL: omitido[^\n]*read-only/)

      const after = { db: hashFile(dbPath), wal: hashFile(walPath), walSize: statSync(walPath).size }
      assert.equal(after.db, before.db, '.db no debe cambiar en modo default')
      assert.equal(after.wal, before.wal, 'el modo default no debe fusionar el WAL')
      assert.ok(after.walSize >= before.walSize, `el WAL no debe achicarse (antes ${before.walSize}, despues ${after.walSize})`)
    })
  })

  it('memory doctor --rebuild fusiona el WAL y lo deja seguro para copiar', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        await send(1, 'tools/call', { name: 'recordRule', arguments: { memory_key: 'ck-1', content: 'Regla para checkpoint.' } })
      } finally {
        close()
      }

      const dbPath = join(dir, '.ancleto', 'memory.db')
      const walPath = `${dbPath}-wal`
      const before = await settleWalSize(walPath)
      assert.ok(before > 0, `--rebuild debe tener frames para fusionar (size ${before})`)

      const r = runCli(['memory', 'doctor', '--rebuild'], dir)
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /✔ Checkpoint WAL: WAL fusionado en el \.db/)
      assert.doesNotMatch(r.stdout, /Checkpoint WAL: omitido/)

      const after = existsSync(walPath) ? statSync(walPath).size : 0
      assert.equal(after, 0, `--rebuild debe fusionar y truncar el WAL (antes ${before}, despues ${after})`)

      // el checkpoint no pierde datos: la regla sigue legible
      const list = runCli(['memory', 'list'], dir)
      assert.equal(list.status, 0, list.stderr)
      assert.match(list.stdout, /ck-1/)
    })
  })
})

// memory-ops-export-import-gc: cobertura de los subcomandos CLI (T4/T5/T6).
// El engine ya esta cubierto en test/memory-engine.test.js; aca se verifica el
// wiring CLI -> engine, el formato de salida y que gc no toque activos.
describe('CLI memory export/import (memory-ops-export-import-gc)', () => {
  it('export escribe solo activos, sanitiza paths y reimportar es idempotente', async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'exp-a', type: 'rule', scope: 'project', content: 'ver C:\\Users\\damia\\repo', justification: 'o /Users/alice/work' })
      eng.recordNode({ memory_key: 'exp-b', type: 'decision', scope: 'feature', content: 'decision activa' })
      eng.recordNode({ memory_key: 'exp-sup', type: 'rule', scope: 'project', content: 'version vieja' })
      eng.recordNode({ memory_key: 'exp-sup', type: 'rule', scope: 'project', content: 'version nueva' }) // supersede
      eng.close()

      const stdoutRun = runCli(['memory', 'export'], dir)
      assert.equal(stdoutRun.status, 0)
      const nodes = JSON.parse(stdoutRun.stdout)
      assert.deepEqual(nodes.map((n) => n.memory_key).sort(), ['exp-a', 'exp-b', 'exp-sup'])
      assert.equal(nodes.find((n) => n.memory_key === 'exp-sup').content, 'version nueva')
      const a = nodes.find((n) => n.memory_key === 'exp-a')
      assert.match(a.content, /<redacted>/)
      assert.match(a.justification, /<redacted>/)
      assert.ok(!a.content.includes('C:\\Users') && !a.justification.includes('/Users/'))

      const fileRun = runCli(['memory', 'export', '--out', 'backup.json'], dir)
      assert.equal(fileRun.status, 0)
      assert.ok(existsSync(join(dir, 'backup.json')))

      const imported = runCli(['memory', 'import', 'backup.json'], dir)
      assert.equal(imported.status, 0)
      assert.match(imported.stdout, /insertados:0 actualizados:0 omitidos:3/)
    })
  })
})

describe('CLI memory gc (memory-ops-export-import-gc)', () => {
  it('dry-run no borra; gc purga superseded antiguos y preserva los activos', async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'gc-old', type: 'rule', scope: 'project', content: 'vieja', createdAt: new Date(Date.now() - 40 * 86400000).toISOString() })
      eng.recordNode({ memory_key: 'gc-old', type: 'rule', scope: 'project', content: 'nueva' })
      eng.recordNode({ memory_key: 'gc-keep', type: 'rule', scope: 'project', content: 'activa' })
      eng.close()

      const dry = runCli(['memory', 'gc', '--dry-run'], dir)
      assert.equal(dry.status, 0)
      assert.match(dry.stdout, /1 nodo\(s\), ~\d+ bytes a liberar/)
      let all = JSON.parse(runCli(['memory', 'list', '--all', '--json'], dir).stdout)
      assert.equal(all.filter((n) => n.status === 'superseded').length, 1)

      const real = runCli(['memory', 'gc', '--days', '30'], dir)
      assert.equal(real.status, 0)
      assert.match(real.stdout, /1 nodo\(s\) purgados \+ VACUUM \+ REINDEX/)
      all = JSON.parse(runCli(['memory', 'list', '--all', '--json'], dir).stdout)
      assert.equal(all.filter((n) => n.status === 'superseded').length, 0)
      assert.deepEqual(all.filter((n) => n.status === 'active').map((n) => n.memory_key).sort(), ['gc-keep', 'gc-old'])
    })
  })

  it('rechaza un --days no entero positivo', async () => {
    await withDir(async (dir) => {
      const r = runCli(['memory', 'gc', '--days', '0'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /--days invalido/)
    })
  })
})

// memory-actor-provenance: la procedencia MCP es runtime-owned, auditable en
// `memory list --json` y no forjable desde los args de la tool.
describe('MCP de memoria propia — procedencia (memory-actor-provenance)', () => {
  it("una regla escrita via tool MCP persiste source = 'mcp:ancleto-memory' y aparece en memory list --json", async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        const rec = await send(1, 'tools/call', {
          name: 'recordRule',
          arguments: { memory_key: 'prov-mcp', content: 'Procedencia de la superficie MCP.' }
        })
        assert.equal(rec.result.isError, undefined)
      } finally {
        close()
      }

      const json = runCli(['memory', 'list', '--json'], dir)
      assert.equal(json.status, 0)
      const node = JSON.parse(json.stdout).find((n) => n.memory_key === 'prov-mcp')
      assert.ok(node, 'el nodo escrito por MCP debe aparecer en list --json')
      assert.equal(node.source, 'mcp:ancleto-memory')
    })
  })

  it('un source forjado en los args de la tool no altera la procedencia persistida', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        const rec = await send(1, 'tools/call', {
          name: 'recordRule',
          arguments: { memory_key: 'prov-forge', content: 'Intento de forja.', source: 'agent:hacker' }
        })
        assert.equal(rec.result.isError, undefined)
      } finally {
        close()
      }

      const json = runCli(['memory', 'list', '--json'], dir)
      const node = JSON.parse(json.stdout).find((n) => n.memory_key === 'prov-forge')
      assert.ok(node, 'el nodo forjado debe seguir apareciendo')
      assert.equal(node.source, 'mcp:ancleto-memory')
      assert.notEqual(node.source, 'agent:hacker')
    })
  })

  it('los inputSchema de las tools MCP no exponen source', async () => {
    await withDir(async (dir) => {
      const { close, send } = mcpClient(dir)
      try {
        const list = await send(1, 'tools/list')
        const serialized = JSON.stringify(list.result.tools.map((t) => t.inputSchema))
        assert.doesNotMatch(serialized, /source/)
      } finally {
        close()
      }
    })
  })
})
