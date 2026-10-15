import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeAffectedSet } from '../src/core/affected-set.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CLI = join(TEST_DIR, '..', 'src', 'cli', 'index.js')

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-affected-'))
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

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
}

function recursiveListing(dir) {
  return readdirSync(dir, { recursive: true }).map((p) => String(p).replace(/\\/g, '/')).sort()
}

// Grafo de prueba: a <- b <- c (dependientes directos y transitivos),
// legacy.cjs importa a por require(), y leaf.js queda sin dependientes.
function seedGraph(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1\n')
  writeFileSync(join(dir, 'src', 'b.js'), "import { a } from './a.js'\nexport const b = a\n")
  writeFileSync(join(dir, 'src', 'c.js'), "import { b } from './b.js'\nexport const c = b\n")
  writeFileSync(join(dir, 'src', 'leaf.js'), 'export const leaf = 1\n')
  writeFileSync(join(dir, 'src', 'legacy.cjs'), "const { a } = require('./a.js')\nmodule.exports = { a }\n")
}

const AFFECTED_A = ['src/a.js', 'src/b.js', 'src/c.js', 'src/legacy.cjs']

describe('affected-set — helper determinístico (throughput-pipeline)', () => {
  it('incluye dependientes directos y transitivos, no sólo los archivos tocados', () => {
    withDir((dir) => {
      seedGraph(dir)
      const { affected } = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      assert.deepEqual(affected, AFFECTED_A)
    })
  })

  it('es determinístico: dos corridas sobre el mismo estado dan el mismo set', () => {
    withDir((dir) => {
      seedGraph(dir)
      const first = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      const second = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      assert.deepEqual(first, second)
    })
  })

  it('sin dependientes el set es exactamente el de archivos tocados', () => {
    withDir((dir) => {
      seedGraph(dir)
      const { affected } = computeAffectedSet({ rootDir: dir, seeds: ['src/leaf.js'] })
      assert.deepEqual(affected, ['src/leaf.js'])
    })
  })

  it('siempre incluye la semilla aunque no sea un nodo del grafo', () => {
    withDir((dir) => {
      seedGraph(dir)
      const { affected } = computeAffectedSet({ rootDir: dir, seeds: ['README.md'] })
      assert.deepEqual(affected, ['README.md'])
    })
  })

  it('normaliza la semilla: la ruta absoluta y la relativa dan el mismo set', () => {
    withDir((dir) => {
      seedGraph(dir)
      const rel = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      const abs = computeAffectedSet({ rootDir: dir, seeds: [join(dir, 'src', 'a.js')] })
      assert.deepEqual(abs.affected, rel.affected)
    })
  })

  it('respeta los ignores del proyecto: no expande dentro de node_modules', () => {
    withDir((dir) => {
      seedGraph(dir)
      mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true })
      writeFileSync(join(dir, 'node_modules', 'dep', 'x.js'), "import './a.js'\n")
      const { affected } = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      assert.ok(!affected.some((f) => f.startsWith('node_modules/')), 'node_modules queda fuera del grafo')
    })
  })
})

describe('affected-set — casos no resolubles se reportan inconclusos', () => {
  function seedUnresolved(dir) {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1\n')
    writeFileSync(join(dir, 'src', 'dynamic.js'), 'export async function load(x) { return import(x) }\n')
    writeFileSync(join(dir, 'src', 'dynamic.cjs'), 'module.exports = (m) => require(m)\n')
    writeFileSync(join(dir, 'src', 'missing.js'), "import './does-not-exist.js'\n")
  }

  it('reporta los imports dinámicos (ESM y CJS) y el relativo irresoluble como inconclusos', () => {
    withDir((dir) => {
      seedUnresolved(dir)
      const { affected, unresolved } = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      const byFile = Object.fromEntries(unresolved.map((u) => [u.file, u.specifier]))
      // categoría 3: argumento no literal (no un literal puro), ambas formas, con valor estable
      assert.equal(byFile['src/dynamic.js'], 'import(<dynamic>)')
      assert.equal(byFile['src/dynamic.cjs'], 'require(<dynamic>)')
      // categoría 4: relativo irresoluble
      assert.equal(byFile['src/missing.js'], './does-not-exist.js')
      // un caso irresoluble no se asume cubierto: el destino fantasma no entra en el set
      assert.deepEqual(affected, ['src/a.js'])
    })
  })

  it('sobre-reporte conservador: una mención en comentario se marca inconclusa, nunca se asume cubierta', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'comment.js'), "// return import('./nope.js')\nexport const z = 1\n")
      const { unresolved } = computeAffectedSet({ rootDir: dir, seeds: ['src/comment.js'] })
      assert.equal(unresolved.length, 1)
      assert.equal(unresolved[0].file, 'src/comment.js')
      assert.equal(unresolved[0].specifier, './nope.js')
    })
  })
})

describe('affected-set — frontera de externos (Fix A: no relativos son externos)', () => {
  it('un specifier no relativo es externo: sin arista, sin unresolved, contado en externalCount', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1\n')
      writeFileSync(
        join(dir, 'src', 'ext.js'),
        "import fs from 'node:fs'\nimport pkg from 'some-pkg'\nimport alias from '@/lib/alias'\nexport const e = [fs, pkg, alias]\n"
      )
      const { affected, unresolved, externalCount } = computeAffectedSet({
        rootDir: dir,
        seeds: ['src/ext.js']
      })
      // externos por construcción: no crean arista ni entran en el set…
      assert.deepEqual(affected, ['src/ext.js'])
      // …y no figuran entre los inconclusos
      assert.deepEqual(unresolved, [])
      // …pero sí se cuentan como data
      assert.equal(externalCount, 3)
    })
  })

  it('externalCount es determinístico sobre múltiples archivos', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), "import 'node:fs'\nimport 'node:path'\n")
      writeFileSync(join(dir, 'src', 'b.js'), "import 'some-pkg'\nexport const b = 1\n")
      const first = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      const second = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      assert.equal(first.externalCount, 3)
      assert.equal(second.externalCount, first.externalCount)
    })
  })

  it('la contraparte negativa (alias => inconclusive) no se enuncia: el alias es externo', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), "import x from '@/lib/x'\nexport const a = x\n")
      const { unresolved, externalCount } = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      assert.equal(externalCount, 1)
      assert.ok(
        !unresolved.some((u) => u.specifier === '@/lib/x'),
        'un alias NO se reporta inconcluso (limitación documentada, no hueco)'
      )
    })
  })
})

describe('affected-set — clasificador conservador por argumento (Fix α2)', () => {
  it('prefijo literal + expresión ⇒ inconcluso, no estático (no asume cubierto el prefijo)', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1\n')
      writeFileSync(join(dir, 'src', 'p.js'), "export const load = (name) => require('./p/' + name)\n")
      writeFileSync(join(dir, 'src', 'loc.js'), "export const t = (lang) => import('./locales/' + lang)\n")
      const { affected, unresolved } = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      const byFile = Object.fromEntries(unresolved.map((u) => [u.file, u.specifier]))
      // categoría 3: el argumento no es un literal puro ⇒ inconcluso por forma
      assert.equal(byFile['src/p.js'], 'require(<dynamic>)')
      assert.equal(byFile['src/loc.js'], 'import(<dynamic>)')
      // el prefijo literal no genera arista: el destino no se asume cubierto
      assert.deepEqual(affected, ['src/a.js'])
    })
  })

  it('literal puro con espacios ⇒ estático, sin falso positivo (ni inconcluso ni dinámico)', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1\n')
      writeFileSync(join(dir, 'src', 'spaced.cjs'), "const a = require( './a.js' )\nmodule.exports = { a }\n")
      writeFileSync(join(dir, 'src', 'pkg.cjs'), "const x = require( 'x' )\nmodule.exports = { x }\n")
      const { affected, unresolved, externalCount } = computeAffectedSet({
        rootDir: dir,
        seeds: ['src/a.js']
      })
      // el literal puro (aunque tenga espacios) no se reporta inconcluso
      assert.deepEqual(unresolved, [])
      // el relativo resoluble sí crea arista: aparece como dependiente en el set
      assert.ok(affected.includes('src/spaced.cjs'))
      // y el no relativo se cuenta como externo, nunca como inconcluso
      assert.equal(externalCount, 1)
    })
  })
})

describe('affected-set — ajustes finales: comentario callee-(, formas ignoradas y ocurrencias', () => {
  it('un comentario entre el callee y ( deja la llamada en el clasificador', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1\n')
      // literal relativo tras comentario: estático ⇒ arista (no inconcluso)
      writeFileSync(
        join(dir, 'src', 'edge.cjs'),
        "const { a } = require/*c*/('./a.js')\nmodule.exports = { a }\n"
      )
      // idem para la forma `import (`: el comentario no la vuelve dinámica
      writeFileSync(join(dir, 'src', 'edge.mjs'), "import/*c*/('./a.js')\nexport const e = 1\n")
      // argumento no literal tras comentario: inconcluso
      writeFileSync(join(dir, 'src', 'dyn.cjs'), 'module.exports = (name) => require/*c*/(name)\n')
      // literal no relativo tras comentario: externo (dato), nunca inconcluso
      writeFileSync(
        join(dir, 'src', 'ext.cjs'),
        "const x = require/*c*/('some-pkg')\nmodule.exports = { x }\n"
      )
      const { affected, unresolved, externalCount } = computeAffectedSet({
        rootDir: dir,
        seeds: ['src/a.js']
      })
      assert.ok(affected.includes('src/edge.cjs'), 'require/*c*/ de relativo es arista, no inconcluso')
      assert.ok(affected.includes('src/edge.mjs'), 'import/*c*/ de relativo es arista, no inconcluso')
      assert.deepEqual(unresolved, [{ file: 'src/dyn.cjs', specifier: 'require(<dynamic>)' }])
      assert.equal(externalCount, 1)
    })
  })

  it('no cuenta import.meta, el import estático ni require.resolve( como llamadas', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1\n')
      // sólo formas que NO son llamadas: import.meta y require.resolve(
      writeFileSync(
        join(dir, 'src', 'meta.js'),
        "console.log(import.meta.url)\nconst r = require.resolve('./ghost.js')\nexport const m = r\n"
      )
      // un import estático: sigue siendo arista estática (categoría 1), no una llamada
      writeFileSync(join(dir, 'src', 'static.js'), "import { a } from './a.js'\nexport const s = a\n")
      const { affected, unresolved, externalCount } = computeAffectedSet({
        rootDir: dir,
        seeds: ['src/a.js']
      })
      // ni import.meta ni require.resolve( generan arista…
      assert.ok(!affected.includes('src/meta.js'), 'import.meta y require.resolve( no crean aristas')
      // …y el import estático aporta sólo su arista normal, sin volverse «dinámico»
      assert.deepEqual(affected, ['src/a.js', 'src/static.js'])
      assert.deepEqual(unresolved, [])
      assert.equal(externalCount, 0)
    })
  })

  it('externalCount cuenta ocurrencias, no paquetes distintos: el mismo pkg 2× suma 2', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), "import 'some-pkg'\nimport 'some-pkg'\nexport const a = 1\n")
      const { unresolved, externalCount } = computeAffectedSet({ rootDir: dir, seeds: ['src/a.js'] })
      assert.equal(externalCount, 2)
      assert.deepEqual(unresolved, [])
    })
  })
})

describe('affected-set — superficie CLI read-only (throughput-pipeline)', () => {
  it('computa el affected-set y es read-only: no crea ni modifica archivos', () => {
    withDir((dir) => {
      seedGraph(dir)
      const before = recursiveListing(dir)
      const r = run(['affected', 'src/a.js'], dir)
      assert.equal(r.status, 0)
      assert.deepEqual(r.stdout.trim().split(/\r?\n/), AFFECTED_A)
      assert.deepEqual(recursiveListing(dir), before, 'el comando no debe escribir nada')
    })
  })

  it('--json devuelve seeds, affected y unresolved parseables', () => {
    withDir((dir) => {
      seedGraph(dir)
      const r = run(['affected', '--json', 'src/a.js'], dir)
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.deepEqual(j.seeds, ['src/a.js'])
      assert.deepEqual(j.affected, AFFECTED_A)
      assert.deepEqual(j.unresolved, [])
    })
  })

  it('--json expone seeds normalizadas en el mismo espacio que affected (T6.3)', () => {
    withDir((dir) => {
      seedGraph(dir)
      const rel = run(['affected', '--json', './src/a.js'], dir)
      const abs = run(['affected', '--json', join(dir, 'src', 'a.js')], dir)
      assert.equal(rel.status, 0)
      assert.equal(abs.status, 0)
      const jr = JSON.parse(rel.stdout)
      const ja = JSON.parse(abs.stdout)
      // ambas formas de semilla colapsan al mismo espacio relativo-posix que affected
      assert.deepEqual(jr.seeds, ['src/a.js'])
      assert.deepEqual(ja.seeds, ['src/a.js'])
      assert.deepEqual(jr.affected, AFFECTED_A)
      assert.deepEqual(ja.affected, AFFECTED_A)
    })
  })

  it('--json expone externalCount como dato y no lo mezcla con unresolved', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), "import 'node:fs'\nexport const a = 1\n")
      const r = run(['affected', '--json', 'src/a.js'], dir)
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.externalCount, 1)
      assert.deepEqual(j.unresolved, [])
    })
  })

  it('la salida humana reporta el conteo de externos como dato en stderr', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), "import 'node:fs'\nexport const a = 1\n")
      const r = run(['affected', 'src/a.js'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /^src\/a\.js$/m)
      assert.match(r.stderr, /1 specifier\(s\) externos/)
    })
  })

  it('--cwd apunta la raíz del grafo, con la semilla antes o después del flag', () => {
    withDir((dir) => {
      seedGraph(dir)
      const before = run(['affected', 'src/a.js', '--cwd', dir], TEST_DIR)
      const after = run(['affected', '--cwd', dir, 'src/a.js'], TEST_DIR)
      assert.equal(before.status, 0)
      assert.equal(after.status, 0)
      assert.equal(before.stdout, after.stdout)
      assert.match(before.stdout, /src\/c\.js/)
    })
  })

  it('sin archivos de entrada falla con uso y exit 1', () => {
    withDir((dir) => {
      const r = run(['affected'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /uso: ancleto affected/)
    })
  })

  it('--cwd sin valor falla con uso y exit 1, sin stack trace', () => {
    withDir((dir) => {
      const r = run(['affected', '--cwd'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /uso: ancleto affected/)
      // uso es un error esperado: no debe filtrarse el stack (marco "at ...:line:col")
      assert.doesNotMatch(r.stderr, /\bat [^\n]*:\d+:\d+\)/)
      assert.equal(r.stdout, '')
    })
  })

  it('con --cwd inexistente no rompe: degrada al conjunto de semillas', () => {
    withDir((dir) => {
      const r = run(['affected', '--json', '--cwd', join(dir, 'nope'), 'src/a.js'], dir)
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.deepEqual(j.affected, ['src/a.js'])
      assert.deepEqual(j.unresolved, [])
    })
  })

  it('reporta los casos inconclusos (dinámico ESM y CJS) en stderr sin asumirlos cubiertos', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'a.js'), 'export const a = 1\n')
      writeFileSync(join(dir, 'src', 'dynamic.js'), 'export const load = (x) => import(x)\n')
      writeFileSync(join(dir, 'src', 'dynamic.cjs'), 'module.exports = (m) => require(m)\n')
      const r = run(['affected', 'src/a.js'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /^src\/a\.js$/m)
      assert.match(r.stderr, /inconclusos/)
      assert.match(r.stderr, /import\(<dynamic>\)/)
      assert.match(r.stderr, /require\(<dynamic>\)/)
    })
  })
})
