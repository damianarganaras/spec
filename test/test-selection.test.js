import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  existsSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planTestSelection, TEST_MANIFEST_PATH } from '../src/core/test-selection.js'
import { buildImportGraph, computeAffectedSet } from '../src/core/affected-set.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TEST_DIR, '..')
const CLI = join(ROOT, 'src', 'cli', 'index.js')
const CONSUMER = join(ROOT, 'scripts', 'test-affected.mjs')

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-test-selection-'))
  try {
    return fn(dir)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort
    }
  }
}

function write(dir, rel, content) {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

// Fixture minima: package.json con `type: module` (los .js del fixture usan ESM),
// dos módulos de src y un test que importa uno de ellos.
function seedPackage(dir) {
  write(dir, 'package.json', JSON.stringify({ name: 'fixture', version: '1.0.0', type: 'module' }, null, 2))
}

function writeManifest(dir, manifest) {
  write(dir, TEST_MANIFEST_PATH, JSON.stringify(manifest, null, 2))
}

function env(extra = {}) {
  const next = { ...process.env, ...extra }
  // Un `node --test` anidado no debe heredar el contexto interno del runner padre.
  delete next.NODE_TEST_CONTEXT
  return next
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: env() })
}

function runConsumer(args, cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [CONSUMER, ...args], {
    cwd,
    encoding: 'utf8',
    env: env(extraEnv)
  })
}

// Test de fixture que, si se ejecuta, deja un sentinel: prueba que el consumidor
// no ejecutó nada sin inspeccionar su salida.
function sentinelTest({ importPath, envVar }) {
  return [
    "import { test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import { writeFileSync } from 'node:fs'",
    `import * as mod from '${importPath}'`,
    "test('fixture', () => {",
    `  writeFileSync(process.env.${envVar}, 'ran')`,
    "  assert.equal(typeof mod, 'object')",
    '})',
    ''
  ].join('\n')
}

function sentinelTestWithoutImport({ envVar }) {
  return [
    "import { test } from 'node:test'",
    "import assert from 'node:assert/strict'",
    "import { writeFileSync } from 'node:fs'",
    "test('fixture', () => {",
    `  writeFileSync(process.env.${envVar}, 'ran')`,
    '  assert.ok(true)',
    '})',
    ''
  ].join('\n')
}

// Snapshot recursivo de bytes + mtime para probar que el plan es read-only.
function snapshotTree(dir) {
  const out = {}
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childAbs = join(abs, entry.name)
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(childAbs, childRel)
      } else if (entry.isFile()) {
        const st = statSync(childAbs)
        const hash = createHash('sha256').update(readFileSync(childAbs)).digest('hex')
        out[childRel] = `${st.size}:${st.mtimeMs}:${hash}`
      }
    }
  }
  walk(dir, '')
  return out
}

function testUniverse(root) {
  let entries
  try {
    entries = readdirSync(join(root, 'test'), { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => `test/${entry.name}`)
    .sort()
}

function closureTouchesSrc(start, edges) {
  const seen = new Set()
  const stack = [start]
  while (stack.length > 0) {
    const current = stack.pop()
    if (seen.has(current)) continue
    seen.add(current)
    if (current === 'src' || current.startsWith('src/')) return true
    for (const dep of edges.get(current) || []) {
      if (!seen.has(dep)) stack.push(dep)
    }
  }
  return false
}

describe('test-selection — contrato del CLI affected', () => {
  it('sin --tests el JSON conserva exactamente los cuatro campos y sus valores', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/lib.js', 'export const lib = 1\n')
      write(dir, 'test/uses-lib.test.js', "import { lib } from '../src/lib.js'\nexport const v = lib\n")
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const res = runCli(['affected', '--json', '--cwd', dir, 'src/lib.js'], dir)
      assert.equal(res.status, 0, res.stderr)
      const parsed = JSON.parse(res.stdout)
      assert.deepEqual(Object.keys(parsed), ['seeds', 'affected', 'unresolved', 'externalCount'])
      assert.equal(Object.hasOwn(parsed, 'tests'), false)

      const expected = computeAffectedSet({ rootDir: dir, seeds: ['src/lib.js'] })
      assert.deepEqual(parsed, {
        seeds: expected.seeds,
        affected: expected.affected,
        unresolved: expected.unresolved,
        externalCount: expected.externalCount
      })
    })
  })

  it('--tests implica salida JSON y NO se interpreta como semilla', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/lib.js', 'export const lib = 1\n')
      write(dir, 'test/uses-lib.test.js', "import { lib } from '../src/lib.js'\nexport const v = lib\n")
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const res = runCli(['affected', '--tests', '--cwd', dir, 'src/lib.js'], dir)
      assert.equal(res.status, 0, res.stderr)
      const parsed = JSON.parse(res.stdout)
      assert.deepEqual(parsed.seeds, ['src/lib.js'])
      assert.ok(parsed.tests)
      for (const key of ['complete', 'reasons', 'selected', 'excluded']) {
        assert.ok(Object.hasOwn(parsed.tests, key), `tests.${key}`)
      }
      assert.ok(parsed.tests.selected.includes('test/uses-lib.test.js'))
    })
  })
})

describe('test-selection — plan puro', () => {
  it('selecciona por arista de import y no lo excluye', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/lib.js', 'export const lib = 1\n')
      write(dir, 'test/uses-lib.test.js', "import { lib } from '../src/lib.js'\nexport const v = lib\n")
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/lib.js'] })
      assert.equal(plan.complete, true)
      assert.ok(plan.selected.includes('test/uses-lib.test.js'))
      assert.equal(plan.excluded.some((entry) => entry.file === 'test/uses-lib.test.js'), false)
    })
  })

  it('selecciona por coupling declarado aunque no exista arista de import', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/cli/index.js', 'export function main() { return 0 }\n')
      // Solo referencia el CLI como string: no hay arista de import.
      write(
        dir,
        'test/spawn.test.js',
        "import { spawnSync } from 'node:child_process'\nconst CLI = '../src/cli/index.js'\nexport const run = () => spawnSync(process.execPath, [CLI])\n"
      )
      writeManifest(dir, {
        version: 1,
        always: [],
        couplings: [
          {
            trigger: ['src/cli/**'],
            tests: ['test/spawn.test.js'],
            reason: 'spawns the CLI without importing it'
          }
        ]
      })

      const { edges } = buildImportGraph(dir)
      assert.equal((edges.get('test/spawn.test.js') || new Set()).has('src/cli/index.js'), false)

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/cli/index.js'] })
      assert.equal(plan.complete, true)
      assert.ok(plan.selected.includes('test/spawn.test.js'))
      assert.equal(plan.excluded.some((entry) => entry.file === 'test/spawn.test.js'), false)
    })
  })

  it('selecciona siempre un test declarado en always, para toda semilla', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/a.js', 'export const a = 1\n')
      write(dir, 'src/b.js', 'export const b = 2\n')
      write(dir, 'test/always.test.js', "import assert from 'node:assert/strict'\nassert.ok(true)\n")
      writeManifest(dir, { version: 1, always: ['test/always.test.js'], couplings: [] })

      for (const seed of ['src/a.js', 'src/b.js']) {
        const plan = planTestSelection({ rootDir: dir, seeds: [seed] })
        assert.equal(plan.complete, true)
        assert.ok(plan.selected.includes('test/always.test.js'), seed)
        assert.equal(plan.excluded.some((entry) => entry.file === 'test/always.test.js'), false)
      }
    })
  })

  it('excluded enumera el complemento exacto de U con reason not-affected', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/lib.js', 'export const lib = 1\n')
      write(dir, 'src/other.js', 'export const other = 2\n')
      write(dir, 'test/lib.test.js', "import { lib } from '../src/lib.js'\nexport const v = lib\n")
      write(dir, 'test/other.test.js', "import { other } from '../src/other.js'\nexport const v = other\n")
      write(dir, 'test/always.test.js', "import assert from 'node:assert/strict'\nassert.ok(true)\n")
      writeManifest(dir, { version: 1, always: ['test/always.test.js'], couplings: [] })

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/lib.js'] })
      assert.equal(plan.complete, true)
      assert.deepEqual(plan.selected, ['test/always.test.js', 'test/lib.test.js'])
      assert.deepEqual(plan.excluded, [{ file: 'test/other.test.js', reason: 'not-affected' }])

      const universe = testUniverse(dir)
      const selectedSet = new Set(plan.selected)
      const excludedSet = new Set(plan.excluded.map((entry) => entry.file))
      for (const test of universe) {
        const inSelected = selectedSet.has(test)
        const inExcluded = excludedSet.has(test)
        assert.notEqual(inSelected, inExcluded, `${test} debe estar en exactamente uno`)
      }
      assert.equal(selectedSet.size + excludedSet.size, universe.length)
    })
  })

  it('dos corridas producen JSON byte-idéntico y orden lexicográfico', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/lib.js', 'export const lib = 1\n')
      write(dir, 'src/other.js', 'export const other = 2\n')
      write(dir, 'test/lib.test.js', "import { lib } from '../src/lib.js'\nexport const v = lib\n")
      write(dir, 'test/other.test.js', "import { other } from '../src/other.js'\nexport const v = other\n")
      write(dir, 'test/always.test.js', "import assert from 'node:assert/strict'\nassert.ok(true)\n")
      writeManifest(dir, { version: 1, always: ['test/always.test.js'], couplings: [] })

      const first = planTestSelection({ rootDir: dir, seeds: ['src/lib.js'] })
      const second = planTestSelection({ rootDir: dir, seeds: ['src/lib.js'] })
      assert.equal(JSON.stringify(first), JSON.stringify(second))
      assert.deepEqual(first.selected, [...first.selected].sort())
      assert.deepEqual(first.reasons, [...first.reasons].sort())
      assert.deepEqual(
        first.excluded.map((entry) => entry.file),
        [...first.excluded.map((entry) => entry.file)].sort()
      )
    })
  })

  it('computar el plan es read-only: no escribe archivos ni crea sidecars', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/lib.js', 'export const lib = 1\n')
      write(dir, 'test/uses-lib.test.js', "import { lib } from '../src/lib.js'\nexport const v = lib\n")
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const before = snapshotTree(dir)
      planTestSelection({ rootDir: dir, seeds: ['src/lib.js'] })
      assert.deepEqual(snapshotTree(dir), before)
      assert.equal(existsSync(join(dir, '.ancleto')), false)
    })
  })
})

describe('test-selection — gate de completitud', () => {
  it('un test sin cierre a src y no declarado abre manifest-gap', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/a.js', 'export const a = 1\n')
      write(dir, 'test/orphan.test.js', "import assert from 'node:assert/strict'\nassert.ok(true)\n")
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/a.js'] })
      assert.equal(plan.complete, false)
      assert.ok(plan.reasons.includes('manifest-gap'))
      assert.equal(plan.reasons.includes('unresolved-in-closure'), false)
    })
  })

  it('un import irresoluble en el cierre abre unresolved-in-closure', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/broken.js', "import { x } from './missing.js'\nexport const y = x\n")
      // Su propio import dinámico es inconcluso: además se selecciona por precaución.
      write(dir, 'test/dyn.test.js', 'export const load = (name) => import(name)\n')
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/broken.js'] })
      assert.equal(plan.complete, false)
      assert.ok(plan.reasons.includes('unresolved-in-closure'))
      assert.ok(plan.selected.includes('test/dyn.test.js'))
    })
  })

  it('manifiesto ausente abre manifest-missing', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/a.js', 'export const a = 1\n')
      write(dir, 'test/uses.test.js', "import { a } from '../src/a.js'\nexport const v = a\n")

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/a.js'] })
      assert.equal(plan.complete, false)
      assert.deepEqual(plan.reasons, ['manifest-missing'])
    })
  })

  it('manifiesto no parseable, versión distinta o ruta fuera de U abre manifest-invalid', () => {
    const cases = [
      ['no parseable', '{ not json'],
      ['version distinta de 1', JSON.stringify({ version: 2, always: [], couplings: [] })],
      ['ruta fuera de U', JSON.stringify({ version: 1, always: ['test/nope.test.js'], couplings: [] })]
    ]
    for (const [label, body] of cases) {
      withDir((dir) => {
        seedPackage(dir)
        write(dir, 'src/a.js', 'export const a = 1\n')
        write(dir, 'test/uses.test.js', "import { a } from '../src/a.js'\nexport const v = a\n")
        write(dir, TEST_MANIFEST_PATH, body)

        const plan = planTestSelection({ rootDir: dir, seeds: ['src/a.js'] })
        assert.equal(plan.complete, false, label)
        assert.deepEqual(plan.reasons, ['manifest-invalid'], label)
      })
    }
  })

  it('un glob sin archivos abre test-glob-missing', () => {
    withDir((dir) => {
      seedPackage(dir)
      mkdirSync(join(dir, 'test'), { recursive: true })
      write(dir, 'src/a.js', 'export const a = 1\n')
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/a.js'] })
      assert.equal(plan.complete, false)
      assert.deepEqual(plan.reasons, ['test-glob-missing'])
      assert.deepEqual(plan.selected, [])
      assert.deepEqual(plan.excluded, [])
    })
  })
})

describe('test-selection — invariante negativa de completitud', () => {
  it('complete:true NO promete cobertura semántica universal (no analiza el cuerpo del test)', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/a.js', 'export const a = 1\n')
      // Referencia la ruta de src como string, sin importarla: sin arista y sin
      // declaración, el plan no la infiere por análisis del cuerpo.
      write(
        dir,
        'test/string-ref.test.js',
        "import assert from 'node:assert/strict'\nconst SOURCE = '../src/a.js'\nassert.ok(SOURCE)\n"
      )
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/a.js'] })
      assert.equal(plan.complete, false)
      assert.ok(plan.reasons.includes('manifest-gap'))
      assert.equal(plan.selected.includes('test/string-ref.test.js'), false)
      assert.ok(plan.excluded.some((entry) => entry.file === 'test/string-ref.test.js'))
    })
  })

  it('un test declarado cubre el acoplamiento no-import sólo por declaración', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/a.js', 'export const a = 1\n')
      write(
        dir,
        'test/string-ref.test.js',
        "import assert from 'node:assert/strict'\nconst SOURCE = '../src/a.js'\nassert.ok(SOURCE)\n"
      )
      writeManifest(dir, { version: 1, always: ['test/string-ref.test.js'], couplings: [] })

      const plan = planTestSelection({ rootDir: dir, seeds: ['src/a.js'] })
      assert.equal(plan.complete, true)
      assert.ok(plan.selected.includes('test/string-ref.test.js'))
      // El plan sólo expone el gate; no agrega una promesa de cobertura semántica.
      assert.deepEqual(Object.keys(plan).sort(), ['complete', 'excluded', 'reasons', 'selected'])
    })
  })
})

describe('consumidor scripts/test-affected.mjs', () => {
  it('--plan-only --json imprime el plan y no ejecuta tests', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/lib.js', 'export const lib = 1\n')
      write(dir, 'test/would-run.test.js', sentinelTestWithoutImport({ envVar: 'SENTINEL_PLAN' }))
      writeManifest(dir, { version: 1, always: ['test/would-run.test.js'], couplings: [] })

      const sentinel = join(dir, 'ran-plan.txt')
      const res = runConsumer(['--plan-only', '--json', '--cwd', dir, 'src/lib.js'], dir, {
        SENTINEL_PLAN: sentinel
      })
      assert.equal(res.status, 0, res.stderr)
      const plan = JSON.parse(res.stdout)
      assert.equal(plan.complete, true)
      assert.ok(plan.selected.includes('test/would-run.test.js'))
      assert.equal(existsSync(sentinel), false)
    })
  })

  it('con complete:true ejecuta sólo tests.selected', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/lib.js', 'export const lib = 1\n')
      write(dir, 'src/other.js', 'export const other = 2\n')
      write(dir, 'test/lib.test.js', sentinelTest({ importPath: '../src/lib.js', envVar: 'SENTINEL_A' }))
      write(dir, 'test/other.test.js', sentinelTest({ importPath: '../src/other.js', envVar: 'SENTINEL_B' }))
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const selectedSentinel = join(dir, 'ran-a.txt')
      const excludedSentinel = join(dir, 'ran-b.txt')
      const res = runConsumer(['--cwd', dir, 'src/lib.js'], dir, {
        SENTINEL_A: selectedSentinel,
        SENTINEL_B: excludedSentinel
      })
      assert.equal(res.status, 0, res.stderr)
      assert.equal(existsSync(selectedSentinel), true)
      assert.equal(existsSync(excludedSentinel), false)
    })
  })

  it('con complete:false imprime reasons y cae a la suite completa', () => {
    withDir((dir) => {
      seedPackage(dir)
      write(dir, 'src/a.js', 'export const a = 1\n')
      write(dir, 'test/orphan.test.js', sentinelTestWithoutImport({ envVar: 'SENTINEL_FULL' }))
      writeManifest(dir, { version: 1, always: [], couplings: [] })

      const sentinel = join(dir, 'ran-full.txt')
      const res = runConsumer(['--cwd', dir, 'src/a.js'], dir, { SENTINEL_FULL: sentinel })
      assert.equal(res.status, 0, res.stderr)
      assert.match(res.stderr, /manifest-gap/)
      assert.equal(existsSync(sentinel), true)
    })
  })
})

describe('test-selection — guard de clasificación cerrada (repo real)', () => {
  function readRealManifest() {
    return JSON.parse(readFileSync(join(ROOT, TEST_MANIFEST_PATH), 'utf8'))
  }

  function assertManifestPath(path, universe) {
    assert.equal(typeof path, 'string')
    assert.equal(path.startsWith('/'), false, path)
    assert.equal(path.includes('\\'), false, path)
    assert.equal(/^[A-Za-z]:/.test(path), false, path)
    assert.ok(universe.includes(path), `${path} no es miembro de U`)
    assert.equal(existsSync(join(ROOT, path)), true, `${path} no existe`)
  }

  it('el manifiesto es version 1 y todas sus rutas existen y son miembros de U', () => {
    const manifest = readRealManifest()
    assert.equal(manifest.version, 1)
    const universe = testUniverse(ROOT)
    for (const path of manifest.always) assertManifestPath(path, universe)
    for (const coupling of manifest.couplings) {
      assert.ok(Array.isArray(coupling.trigger) && coupling.trigger.length > 0)
      assert.ok(Array.isArray(coupling.tests) && coupling.tests.length > 0)
      assert.equal(typeof coupling.reason, 'string')
      assert.ok(coupling.reason.trim().length > 0)
      for (const path of coupling.tests) assertManifestPath(path, universe)
    }
  })

  it('todo test de U sin cierre a src está declarado en el manifiesto', () => {
    const manifest = readRealManifest()
    const universe = testUniverse(ROOT)
    const declared = new Set(manifest.always)
    for (const coupling of manifest.couplings) {
      for (const path of coupling.tests) declared.add(path)
    }
    const { edges } = buildImportGraph(ROOT)
    const gaps = universe.filter((test) => !declared.has(test) && !closureTouchesSrc(test, edges))
    assert.deepEqual(gaps, [], `tests sin clasificar: ${gaps.join(', ')}`)
  })

  it('el test nuevo es import-eligible: no abre manifest-gap y entra al plan', () => {
    const plan = planTestSelection({ rootDir: ROOT, seeds: ['src/core/test-selection.js'] })
    assert.equal(plan.reasons.includes('manifest-gap'), false)
    assert.ok(plan.selected.includes('test/test-selection.test.js'))
  })
})

describe('test-selection — pins por clase de escape (repo real)', () => {
  // Plan puro sobre el repo real: NO ejecuta los tests seleccionados. Cada pin
  // afirma pertenencia a `selected` y ausencia en `excluded`, no sólo `complete`,
  // para que un typo en un `trigger` (p. ej. `src/clii/**`) rompa el pin.
  function assertCovered(plan, file) {
    assert.ok(plan.selected.includes(file), `${file} ausente de selected`)
    assert.equal(
      plan.excluded.some((entry) => entry.file === file),
      false,
      `${file} no debe estar en excluded`
    )
  }

  it('un cambio al CLI selecciona la suite que lo spawnea sin importarlo', () => {
    const plan = planTestSelection({ rootDir: ROOT, seeds: ['src/cli/index.js'] })
    assertCovered(plan, 'test/cli.test.js')
    assertCovered(plan, 'test/test-selection.test.js')
    // `test/cli.test.js` también lo cubre el coupling `src/**`; specs-merge sólo
    // entra por `src/cli/**`, así que un typo en ese trigger rompe este pin.
    assertCovered(plan, 'test/specs-merge.test.js')
  })

  it('un delta de change selecciona los guards que lo leen como texto', () => {
    const plan = planTestSelection({
      rootDir: ROOT,
      seeds: ['aspec/changes/ch-06b-affected-test-selection/proposal.md']
    })
    assertCovered(plan, 'test/content-guards.test.js')
    assertCovered(plan, 'test/delta-spec-structure.test.js')
  })

  it('un fixture de memoria selecciona la suite que lo lee sin importarlo', () => {
    const plan = planTestSelection({ rootDir: ROOT, seeds: ['test/fixtures/memory/seed.json'] })
    assertCovered(plan, 'test/memory-fixtures.test.js')
  })

  it('el manifiesto real selecciona la suite que lo consume', () => {
    // Se aísla la regla de precaución por imports irresolubles (que también
    // selecciona esta suite) para que el pin mida el coupling `test/**`.
    const plan = planTestSelection({
      rootDir: ROOT,
      seeds: ['test/affected-tests.json'],
      unresolved: []
    })
    assertCovered(plan, 'test/test-selection.test.js')
  })

  it('una hoja importada selecciona el test que la importa y no lo excluye', () => {
    const plan = planTestSelection({ rootDir: ROOT, seeds: ['src/core/tier-models.js'] })
    assertCovered(plan, 'test/tier-models.test.js')
  })
})

describe('test-selection — pins de los fixes R1', () => {
  it('rechaza couplings con trigger o tests vacíos como manifest-invalid', () => {
    const cases = [
      [
        'trigger vacío',
        { version: 1, always: [], couplings: [{ trigger: [], tests: ['test/uses.test.js'], reason: 'x' }] }
      ],
      [
        'tests vacío',
        { version: 1, always: [], couplings: [{ trigger: ['src/**'], tests: [], reason: 'x' }] }
      ]
    ]
    for (const [label, manifest] of cases) {
      withDir((dir) => {
        seedPackage(dir)
        write(dir, 'src/a.js', 'export const a = 1\n')
        write(dir, 'test/uses.test.js', "import { a } from '../src/a.js'\nexport const v = a\n")
        // Manifiesto inyectado: ejercita la validación sin depender del archivo.
        const plan = planTestSelection({ rootDir: dir, seeds: ['src/a.js'], manifest })
        assert.equal(plan.complete, false, label)
        assert.deepEqual(plan.reasons, ['manifest-invalid'], label)
      })
    }
  })

  it('--plan-only sin semillas sale ≠ 0 y no emite un plan', () => {
    const res = runConsumer(['--plan-only', '--json', '--cwd', ROOT], ROOT)
    assert.notEqual(res.status, 0, res.stderr)
    assert.equal(res.stdout.trim(), '', res.stdout)
    let parsed = null
    try {
      parsed = JSON.parse(res.stdout)
    } catch {
      parsed = null
    }
    if (parsed !== null) {
      assert.equal(Array.isArray(parsed.selected), false, 'no debe emitir un plan')
      assert.equal(Object.hasOwn(parsed, 'tests'), false, 'no debe emitir un plan')
    }
    assert.match(res.stderr, /uso:/)
  })
})
