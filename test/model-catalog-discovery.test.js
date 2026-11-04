import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  catalogAgeDays,
  diffCatalogSnapshots,
  discoveryStatus,
  freeModelViolations,
  isCatalogStale,
  isSafeProviderName,
  parseVerboseProviderOutput,
  providersFromFlatOutput,
  validateCatalogSnapshot
} from '../src/core/model-catalog.js'
import { main, writeJsonAtomic } from '../scripts/refresh-model-catalog.mjs'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TEST_DIR, '..')
const SOURCE = readFileSync(join(ROOT, 'src', 'core', 'model-catalog.js'), 'utf8')
const TIER_SOURCE = readFileSync(join(ROOT, 'src', 'core', 'tier-models.js'), 'utf8')
const SCRIPT_SOURCE = readFileSync(join(ROOT, 'scripts', 'refresh-model-catalog.mjs'), 'utf8')
const README = readFileSync(join(ROOT, 'README.md'), 'utf8')

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-catalog-discovery-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
}

function entry(id, { input = null, output = null, context = null, contextOutput = null } = {}) {
  return { id, cost: { input, output }, limit: { context, output: contextOutput } }
}

function snapshot(providers) {
  return { providers }
}

function validSnapshot() {
  return {
    generated_at: '2026-11-04',
    source: {
      method: 'opencode models <provider> --verbose --refresh',
      providers: ['alpha', 'beta']
    },
    providers: {
      alpha: [{ id: 'alpha/a', cost: { input: 1, output: 2 }, limit: { context: 100, output: 10 } }],
      beta: [{ id: 'beta/b', cost: null, limit: null }]
    }
  }
}

async function withDirAsync(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-catalog-discovery-'))
  try {
    return await fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
}

// Par de rutas temporales para el seam `main`: el catálogo base se escribe con el
// snapshot válido y el candidato todavía no existe.
function catalogFixture(dir) {
  const catalogPath = join(dir, 'catalog.json')
  const candidatePath = join(dir, 'candidate.json')
  const base = `${JSON.stringify(validSnapshot(), null, 2)}\n`
  writeFileSync(catalogPath, base)
  return { catalogPath, candidatePath, base }
}

// Runner inyectado para una corrida `available`: enumera `alpha` y `opencode`, y el
// candidato incluye `opencode/big-pickle` gratis porque el script exige ese ID.
function availableRun() {
  return (args) => {
    if (args[0] === 'models' && args.length === 2) {
      return { status: 0, error: null, stdout: 'alpha/a\nopencode/big-pickle\n', stderr: '', offline: false }
    }
    const stdout = args[1] === 'alpha'
      ? 'alpha/a\n{ "cost": { "input": 1, "output": 2 }, "limit": { "context": 100, "output": 10 } }\n'
      : 'opencode/big-pickle\n{ "cost": { "input": 0, "output": 0 }, "limit": { "context": 200000, "output": 32000 } }\n'
    return { status: 0, error: null, stdout, stderr: '', offline: false }
  }
}

// `main` imprime el estado en stdout; se captura sin tocar procesos ni red.
async function captureLogs(fn) {
  const lines = []
  const original = console.log
  console.log = (...args) => { lines.push(args.join(' ')) }
  try {
    const value = await fn()
    return { value, output: lines.join('\n') }
  } finally {
    console.log = original
  }
}

describe('providersFromFlatOutput', () => {
  it('enumera cinco proveedores e ignora duplicados, líneas vacías y líneas sin /', () => {
    const raw = [
      'anthropic/claude-sonnet-4',
      'commandcode/deepseek/deepseek-v4.1-flash',
      'openai/gpt-5',
      '',
      'opencode/big-pickle',
      'opencode-go/qwen3.8-max',
      'sin-separador',
      '   ',
      'anthropic/claude-opus-4',
      'commandcode/deepseek/deepseek-v4.1-flash'
    ].join('\n')
    assert.deepEqual(
      providersFromFlatOutput(raw),
      ['anthropic', 'commandcode', 'openai', 'opencode', 'opencode-go']
    )
  })

  it('toma el primer segmento como proveedor de un ID multisegmento', () => {
    assert.deepEqual(
      providersFromFlatOutput('commandcode/deepseek/deepseek-v4.1-flash'),
      ['commandcode']
    )
  })

  it('tolera entradas no string y salidas vacías', () => {
    assert.deepEqual(providersFromFlatOutput(null), [])
    assert.deepEqual(providersFromFlatOutput(''), [])
    assert.deepEqual(providersFromFlatOutput('/solo-id'), [])
  })
})

describe('isSafeProviderName', () => {
  it('acepta un nombre que empieza alfanumérico y sólo usa punto, guion y guion bajo', () => {
    for (const name of ['opencode', 'opencode-go', 'commandcode', 'a.b-c_1']) {
      assert.equal(isSafeProviderName(name), true, `${name} es un nombre seguro`)
    }
  })

  it('rechaza vacíos, no strings, separadores de ruta y metacaracteres de shell', () => {
    for (const name of [
      '',
      null,
      42,
      {},
      'a/b',
      'a b',
      'a&b',
      'a|b',
      'a>b',
      'a<b',
      'a(b)',
      'a;b',
      '../x'
    ]) {
      assert.equal(isSafeProviderName(name), false, `${JSON.stringify(name)} es inseguro`)
    }
  })
})

describe('parseVerboseProviderOutput', () => {
  it('parsea cost y limit por entrada y conserva la primera aparición de un ID duplicado', () => {
    const raw = [
      'opencode/big-pickle',
      '{',
      '  "cost": { "input": 0, "output": 0 },',
      '  "limit": { "context": 200000, "output": 32000 }',
      '}',
      '',
      'opencode/secundario',
      '{ "cost": { "input": 1, "output": 2 } }',
      '',
      'opencode/sin-metadatos',
      'opencode/big-pickle',
      '{ "cost": { "input": 9, "output": 9 } }',
      ''
    ].join('\n')

    const entries = parseVerboseProviderOutput('opencode', raw)
    assert.deepEqual(entries.map((e) => e.id), [
      'opencode/big-pickle',
      'opencode/secundario',
      'opencode/sin-metadatos'
    ])
    assert.deepEqual(entries[0].cost, { input: 0, output: 0 })
    assert.deepEqual(entries[0].limit, { context: 200000, output: 32000 })
    assert.deepEqual(entries[1].cost, { input: 1, output: 2 })
    assert.equal(entries[1].limit, null)
    assert.equal(entries[2].cost, null)
    assert.equal(entries[2].limit, null)
  })

  it('un bloque JSON malformado no lanza y deja la entrada sin metadatos', () => {
    const raw = [
      'opencode/roto',
      '{ "cost": { "input": 1,',
      'opencode/sano',
      '{ "cost": { "input": 0, "output": 0 } }'
    ].join('\n')
    const entries = parseVerboseProviderOutput('opencode', raw)
    assert.deepEqual(entries.map((e) => e.id), ['opencode/roto', 'opencode/sano'])
    assert.equal(entries[0].cost, null)
    assert.equal(entries[0].limit, null)
    assert.deepEqual(entries[1].cost, { input: 0, output: 0 })
  })

  it('sólo reconoce encabezados del proveedor pedido', () => {
    const raw = [
      'alpha/a',
      '{ "cost": { "input": 1, "output": 1 } }',
      'beta/b',
      '{ "cost": { "input": 2, "output": 2 } }'
    ].join('\n')
    const entries = parseVerboseProviderOutput('alpha', raw)
    assert.deepEqual(entries.map((e) => e.id), ['alpha/a'])
  })
})

describe('diffCatalogSnapshots', () => {
  const before = snapshot({
    alpha: [entry('alpha/a', { input: 1, output: 2, context: 100, contextOutput: 10 })],
    beta: [entry('beta/b', { input: 5, output: 5 })]
  })

  it('reporta altas de proveedores e IDs', () => {
    const next = snapshot({
      alpha: [
        entry('alpha/a', { input: 1, output: 2, context: 100, contextOutput: 10 }),
        entry('alpha/z')
      ],
      gamma: [entry('gamma/c')]
    })
    const diff = diffCatalogSnapshots(before, next)
    assert.deepEqual(diff.providersAdded, ['gamma'])
    assert.deepEqual(diff.providersRemoved, ['beta'])
    assert.deepEqual(diff.idsAdded, [{ provider: 'alpha', id: 'alpha/z' }, { provider: 'gamma', id: 'gamma/c' }])
    assert.deepEqual(diff.idsRemoved, [{ provider: 'beta', id: 'beta/b' }])
  })

  it('reporta cambio de cost con valor anterior y nuevo', () => {
    const next = snapshot({
      alpha: [entry('alpha/a', { input: 3, output: 2, context: 100, contextOutput: 10 })],
      beta: [entry('beta/b', { input: 5, output: 5 })]
    })
    assert.deepEqual(diffCatalogSnapshots(before, next).changes, [
      { provider: 'alpha', id: 'alpha/a', field: 'cost.input', before: 1, after: 3 }
    ])
  })

  it('reporta cambio de limit con valor anterior y nuevo', () => {
    const next = snapshot({
      alpha: [entry('alpha/a', { input: 1, output: 2, context: 200, contextOutput: 10 })],
      beta: [entry('beta/b', { input: 5, output: 5 })]
    })
    assert.deepEqual(diffCatalogSnapshots(before, next).changes, [
      { provider: 'alpha', id: 'alpha/a', field: 'limit.context', before: 100, after: 200 }
    ])
  })

  it('un snapshot igual a sí mismo produce un diff vacío', () => {
    assert.deepEqual(diffCatalogSnapshots(before, before), {
      providersAdded: [],
      providersRemoved: [],
      idsAdded: [],
      idsRemoved: [],
      changes: []
    })
  })

  it('ordena proveedores e IDs de forma determinista sin importar el orden de entrada', () => {
    const next = snapshot({
      beta: [entry('beta/b', { input: 0, output: 0 })],
      alpha: [
        entry('alpha/b'),
        entry('alpha/a')
      ]
    })
    const diff = diffCatalogSnapshots(snapshot({}), next)
    assert.deepEqual(diff.providersAdded, ['alpha', 'beta'])
    assert.deepEqual(diff.idsAdded, [
      { provider: 'alpha', id: 'alpha/a' },
      { provider: 'alpha', id: 'alpha/b' },
      { provider: 'beta', id: 'beta/b' }
    ])
  })
})

describe('validateCatalogSnapshot', () => {
  it('acepta un snapshot con fecha, método, proveedores alineados e IDs con prefijo', () => {
    assert.deepEqual(validateCatalogSnapshot(validSnapshot()), { ok: true, errors: [] })
  })

  it('rechaza una fecha inválida', () => {
    const result = validateCatalogSnapshot({ ...validSnapshot(), generated_at: '04-11-2026' })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.includes('generated_at')))
  })

  it('rechaza fechas imposibles del calendario y acepta bisiestos reales', () => {
    for (const invalid of ['2026-13-01', '2026-02-31', '2025-02-29']) {
      const result = validateCatalogSnapshot({ ...validSnapshot(), generated_at: invalid })
      assert.equal(result.ok, false, `${invalid} debe rechazarse`)
      assert.ok(result.errors.some((e) => e.includes('generated_at')), `${invalid}: error de generated_at`)
    }
    for (const valid of ['2024-02-29', '2026-11-04']) {
      assert.deepEqual(
        validateCatalogSnapshot({ ...validSnapshot(), generated_at: valid }),
        { ok: true, errors: [] },
        `${valid} debe aceptarse`
      )
    }
  })

  it('rechaza source.providers desalineado de las claves de providers', () => {
    const valid = validSnapshot()
    const result = validateCatalogSnapshot({
      ...valid,
      source: { ...valid.source, providers: ['alpha'] }
    })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.includes('source.providers no coincide')))
  })

  it('rechaza un proveedor sin entradas', () => {
    const valid = validSnapshot()
    const result = validateCatalogSnapshot({
      ...valid,
      source: { ...valid.source, providers: ['alpha', 'beta', 'gamma'] },
      providers: { ...valid.providers, gamma: [] }
    })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.includes('providers.gamma debe tener al menos una entrada')))
  })

  it('rechaza un ID sin el prefijo del proveedor', () => {
    const valid = validSnapshot()
    const result = validateCatalogSnapshot({
      ...valid,
      providers: { ...valid.providers, alpha: [{ id: 'otro/a', cost: null, limit: null }] }
    })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.includes('no tiene el prefijo alpha/')))
  })

  it('rechaza IDs duplicados', () => {
    const valid = validSnapshot()
    const result = validateCatalogSnapshot({
      ...valid,
      providers: {
        ...valid.providers,
        alpha: [
          { id: 'alpha/a', cost: null, limit: null },
          { id: 'alpha/a', cost: null, limit: null }
        ]
      }
    })
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.includes('alpha/a está duplicado')))
  })

  it('rechaza un snapshot sin source', () => {
    const valid = validSnapshot()
    delete valid.source
    const result = validateCatalogSnapshot(valid)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.includes('source debe ser un objeto')))
  })
})

describe('discoveryStatus', () => {
  const available = { binaryMissing: false, networkMarker: false, failedProviders: [], providerCount: 2 }

  it('clasifica available cuando hay proveedores, sin fallos ni marcador offline', () => {
    assert.equal(discoveryStatus(available), 'available')
  })

  it('binary-missing tiene precedencia sobre partial y network-unavailable', () => {
    assert.equal(
      discoveryStatus({ binaryMissing: true, networkMarker: true, failedProviders: ['a'], providerCount: 0 }),
      'binary-missing'
    )
  })

  it('clasifica partial cuando un proveedor falla, incluso con marcador offline', () => {
    assert.equal(
      discoveryStatus({ binaryMissing: false, networkMarker: true, failedProviders: ['a'], providerCount: 2 }),
      'partial'
    )
  })

  it('clasifica partial cuando no se enumeró ningún proveedor', () => {
    assert.equal(
      discoveryStatus({ binaryMissing: false, networkMarker: false, failedProviders: [], providerCount: 0 }),
      'partial'
    )
  })

  it('clasifica network-unavailable cuando sólo está el marcador offline', () => {
    assert.equal(
      discoveryStatus({ binaryMissing: false, networkMarker: true, failedProviders: [], providerCount: 2 }),
      'network-unavailable'
    )
  })
})

describe('freeModelViolations', () => {
  const catalog = snapshot({
    opencode: [
      { id: 'opencode/big-pickle', cost: { input: 0, output: 0 } },
      { id: 'opencode/otro', cost: { input: 1, output: 0 } }
    ]
  })

  it('acepta big-pickle con costo 0 en entrada y salida', () => {
    assert.deepEqual(freeModelViolations(catalog, ['opencode/big-pickle']), [])
  })

  it('reporta un costo distinto de 0', () => {
    const caro = snapshot({
      opencode: [{ id: 'opencode/big-pickle', cost: { input: 1, output: 0 } }]
    })
    assert.deepEqual(freeModelViolations(caro, ['opencode/big-pickle']), ['opencode/big-pickle'])
  })

  it('reporta un ID ausente del snapshot', () => {
    assert.deepEqual(freeModelViolations(catalog, ['opencode/inexistente']), ['opencode/inexistente'])
  })
})

describe('catalogAgeDays e isCatalogStale', () => {
  it('calcula la antigüedad de una fecha fresca', () => {
    assert.equal(catalogAgeDays('2026-11-01', new Date('2026-11-04T12:00:00Z')), 3)
    assert.equal(isCatalogStale('2026-11-01', new Date('2026-11-04T12:00:00Z')), false)
  })

  it('90 días exactos no es stale y 91 días sí', () => {
    assert.equal(catalogAgeDays('2026-01-01', new Date('2026-04-01T00:00:00Z')), 90)
    assert.equal(isCatalogStale('2026-01-01', new Date('2026-04-01T00:00:00Z')), false)
    assert.equal(catalogAgeDays('2026-01-01', new Date('2026-04-02T00:00:00Z')), 91)
    assert.equal(isCatalogStale('2026-01-01', new Date('2026-04-02T00:00:00Z')), true)
  })

  it('una fecha inválida devuelve null/false sin lanzar', () => {
    for (const invalid of ['2026-13-01', 'no-es-fecha', null, undefined]) {
      assert.equal(catalogAgeDays(invalid, new Date('2026-11-04T00:00:00Z')), null)
      assert.equal(isCatalogStale(invalid, new Date('2026-11-04T00:00:00Z')), false)
    }
  })

  it('interpreta generated_at en UTC, no en la zona local del host', () => {
    // 23:59:59Z del mismo día: 0 días. 00:00:00Z del día siguiente: 1 día.
    assert.equal(catalogAgeDays('2026-01-01', new Date('2026-01-01T23:59:59Z')), 0)
    assert.equal(catalogAgeDays('2026-01-01', new Date('2026-01-02T00:00:00Z')), 1)
    // 01:00+02:00 sigue siendo el día anterior en UTC.
    assert.equal(catalogAgeDays('2026-01-01', new Date('2026-01-02T01:00:00+02:00')), 0)
  })
})

describe('writeJsonAtomic', () => {
  it('escribe un archivo nuevo con JSON legible', () => {
    withDir((dir) => {
      const target = join(dir, 'nuevo.json')
      writeJsonAtomic(target, { a: 1 })
      assert.equal(readFileSync(target, 'utf8'), `${JSON.stringify({ a: 1 }, null, 2)}\n`)
    })
  })

  it('reemplaza un archivo existente sin dejar temporales', () => {
    withDir((dir) => {
      const target = join(dir, 'catalogo.json')
      writeFileSync(target, '{"viejo":true}')
      writeJsonAtomic(target, { nuevo: true })
      assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { nuevo: true })
      assert.deepEqual(readdirSync(dir).sort(), ['catalogo.json'])
    })
  })

  it('ante un destino inválido falla, no trunca el contenido previo y limpia el temporal', () => {
    withDir((dir) => {
      const target = join(dir, 'destino-directorio')
      mkdirSync(target)
      writeFileSync(join(target, 'marcador.txt'), 'intacto')
      assert.throws(() => writeJsonAtomic(target, { a: 1 }))
      assert.ok(statSync(target).isDirectory(), 'el destino sigue siendo un directorio')
      assert.equal(readFileSync(join(target, 'marcador.txt'), 'utf8'), 'intacto')
      assert.deepEqual(
        readdirSync(dir).filter((name) => name.endsWith('.tmp')),
        [],
        'no queda el archivo temporal'
      )
    })
  })
})

describe('guards de contenido del descubrimiento', () => {
  it('los helpers puros no importan procesos, E/S ni red y no ejecutan spawn', () => {
    assert.equal(SOURCE.includes('child_process'), false)
    assert.equal(SOURCE.includes('node:fs'), false)
    assert.equal(SOURCE.includes('spawn('), false)
    assert.equal(SOURCE.includes('node:http'), false)
  })

  it('tier-models.js sigue sin child_process', () => {
    assert.equal(TIER_SOURCE.includes('child_process'), false)
  })

  it('el script filtra con isSafeProviderName antes de spawnear un proveedor', () => {
    assert.match(
      SCRIPT_SOURCE,
      /import\s*{[\s\S]*?\bisSafeProviderName\b[\s\S]*?}\s*from '\.\.\/src\/core\/model-catalog\.js'/
    )
    assert.match(SCRIPT_SOURCE, /enumerated\.filter\(isSafeProviderName\)/)
    const filterIndex = SCRIPT_SOURCE.indexOf('enumerated.filter(isSafeProviderName)')
    const spawnIndex = SCRIPT_SOURCE.indexOf("run(['models', provider, '--verbose', '--refresh'])")
    assert.ok(filterIndex >= 0, 'el filtro de proveedores seguros existe')
    assert.ok(spawnIndex >= 0, 'el spawn por proveedor existe')
    assert.ok(filterIndex < spawnIndex, 'el filtro precede al spawn por proveedor')
  })

  it('el script mantiene el descubrimiento como entry point explícito', () => {
    assert.match(SCRIPT_SOURCE, /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/)
  })

  it('README documenta el procedimiento y las clasificaciones del catálogo', () => {
    for (const token of [
      'binary-missing',
      'network-unavailable',
      'partial',
      '.ancleto/model-catalog.candidate.json',
      '--write'
    ]) {
      assert.ok(README.includes(token), `README no documenta ${token}`)
    }
  })

  it('README enlaza este test y declara el rechazo automático de big-pickle', () => {
    assert.ok(
      README.includes('test/model-catalog-discovery.test.js'),
      'README no referencia este test'
    )
    assert.match(
      README,
      /rechaza el candidato automáticamente si\s+`opencode\/big-pickle` deja de costar 0/
    )
  })

  it('este test no importa child_process ni lanza procesos o red', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    const specifiers = [...self.matchAll(/^import .* from '([^']+)'$/gm)].map((m) => m[1])
    assert.equal(specifiers.some((s) => s === 'node:child_process'), false)
    assert.equal(specifiers.some((s) => s === 'node:http' || s === 'node:https'), false)
    assert.equal(/\bspawnSync\s*\(/.test(self), false)
    assert.equal(/\bexecSync\s*\(/.test(self), false)
  })
})

describe('main con runner inyectado', () => {
  it('network-unavailable no escribe y deja el catálogo byte-idéntico', async () => {
    await withDirAsync(async (dir) => {
      const { catalogPath, candidatePath, base } = catalogFixture(dir)
      const run = (args) => {
        if (args[0] === 'models' && args.length === 2) {
          return {
            status: 0,
            error: null,
            stdout: 'alpha/a\nFailed to fetch models.dev\n',
            stderr: '',
            offline: true
          }
        }
        return {
          status: 0,
          error: null,
          stdout: 'alpha/a\n{ "cost": { "input": 0, "output": 0 } }\n',
          stderr: '',
          offline: false
        }
      }

      const { value, output } = await captureLogs(() => main([], { run, catalogPath, candidatePath }))
      assert.equal(value, 1, 'exit code no cero')
      assert.match(output, /estado: network-unavailable/)
      assert.equal(readFileSync(catalogPath, 'utf8'), base, 'el catálogo no cambia')
      assert.equal(existsSync(candidatePath), false, 'no se escribe el candidato')
    })
  })

  it('un proveedor con ETIMEDOUT clasifica partial y no escribe', async () => {
    await withDirAsync(async (dir) => {
      const { catalogPath, candidatePath, base } = catalogFixture(dir)
      const run = (args) => {
        if (args[0] === 'models' && args.length === 2) {
          return { status: 0, error: null, stdout: 'alpha/a\n', stderr: '', offline: false }
        }
        return {
          status: null,
          error: { code: 'ETIMEDOUT', message: 'timeout' },
          stdout: '',
          stderr: '',
          offline: false
        }
      }

      const { value, output } = await captureLogs(() => main([], { run, catalogPath, candidatePath }))
      assert.equal(value, 1, 'exit code no cero')
      assert.match(output, /estado: partial/)
      assert.equal(readFileSync(catalogPath, 'utf8'), base, 'el catálogo no cambia')
      assert.equal(existsSync(candidatePath), false, 'no se escribe el candidato')
    })
  })

  it('ENOENT clasifica binary-missing y no escribe', async () => {
    await withDirAsync(async (dir) => {
      const { catalogPath, candidatePath, base } = catalogFixture(dir)
      const run = () => ({
        status: null,
        error: { code: 'ENOENT', message: 'spawn opencode ENOENT' },
        stdout: '',
        stderr: '',
        offline: false
      })

      const { value, output } = await captureLogs(() => main([], { run, catalogPath, candidatePath }))
      assert.equal(value, 1, 'exit code no cero')
      assert.match(output, /estado: binary-missing/)
      assert.equal(readFileSync(catalogPath, 'utf8'), base, 'el catálogo no cambia')
      assert.equal(existsSync(candidatePath), false, 'no se escribe el candidato')
    })
  })

  it('available escribe el candidato en dry-run y sólo --write reemplaza el catálogo', async () => {
    await withDirAsync(async (dir) => {
      const { catalogPath, candidatePath, base } = catalogFixture(dir)
      const run = availableRun()

      const dry = await captureLogs(() => main([], { run, catalogPath, candidatePath }))
      assert.equal(dry.value, 0)
      assert.match(dry.output, /estado: available/)
      assert.equal(readFileSync(catalogPath, 'utf8'), base, 'el dry-run no toca el snapshot')
      assert.ok(existsSync(candidatePath), 'el dry-run escribe el candidato')
      const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'))
      assert.deepEqual(validateCatalogSnapshot(candidate), { ok: true, errors: [] })
      assert.deepEqual(candidate.source.providers, ['alpha', 'opencode'])
      assert.deepEqual(
        readdirSync(dir).filter((name) => name.endsWith('.tmp')),
        [],
        'sin temporales tras el dry-run'
      )

      const write = await captureLogs(() => main(['--write'], { run, catalogPath, candidatePath }))
      assert.equal(write.value, 0)
      assert.deepEqual(JSON.parse(readFileSync(catalogPath, 'utf8')), candidate)
      assert.deepEqual(
        readdirSync(dir).filter((name) => name.endsWith('.tmp')),
        [],
        'sin temporales tras --write'
      )
    })
  })

  it('un big-pickle con cost.input distinto de 0 aborta sin escribir', async () => {
    await withDirAsync(async (dir) => {
      const { catalogPath, candidatePath, base } = catalogFixture(dir)
      const run = (args) => {
        if (args[0] === 'models' && args.length === 2) {
          return { status: 0, error: null, stdout: 'opencode/big-pickle\n', stderr: '', offline: false }
        }
        return {
          status: 0,
          error: null,
          stdout: 'opencode/big-pickle\n{ "cost": { "input": 1, "output": 0 } }\n',
          stderr: '',
          offline: false
        }
      }

      const { value, output } = await captureLogs(() => main([], { run, catalogPath, candidatePath }))
      assert.equal(value, 1, 'exit code no cero')
      assert.match(output, /modelo gratuito inválido: opencode\/big-pickle/)
      assert.equal(readFileSync(catalogPath, 'utf8'), base, 'el catálogo no cambia')
      assert.equal(existsSync(candidatePath), false, 'no se escribe el candidato')
    })
  })
})
