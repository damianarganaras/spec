import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compileGlob, matchesGlob } from '../src/core/discovery-glob.js'

// Tabla congelada de RESULTADOS: el test no reimplementa el matcher ni copia el regex.
// Los `expected` de los escenarios canónicos y de los pins salen de
// `aspec/specs/cli-diagnostics/spec.md` y de `test/cli.test.js`; los de los límites
// legacy se derivaron una sola vez ejecutando el algoritmo PRE-CAMBIO fuera del repo
// y quedan congelados acá.
const CANONICAL = [
  // **/*.test.* — raíz y anidado; conserva los lookalikes sin el segmento `.test.`
  ['**/*.test.*', 'a.test.js', true],
  ['**/*.test.*', 'src/b.test.js', true],
  ['**/*.test.*', 'test/specs-merge.test.js', true],
  ['**/*.test.*', 'src/foo.testjs', false],
  ['**/*.test.*', 'src/foo.tests.js', false],
  // **/*.spec.* — raíz y anidado; conserva src/spec-utils.js
  ['**/*.spec.*', 'a.spec.js', true],
  ['**/*.spec.*', 'src/nested/b.spec.ts', true],
  ['**/*.spec.*', 'src/spec-utils.js', false],
  // **/__tests__/** — raíz y anidado; conserva el directorio lookalike
  ['**/__tests__/**', '__tests__/a.js', true],
  ['**/__tests__/**', 'src/__tests__/b.js', true],
  ['**/__tests__/**', 'src/__tests__-extra/c.js', false],
  // **/*.png — raíz y anidado; conserva el sufijo extra
  ['**/*.png', 'logo.png', true],
  ['**/*.png', 'assets/icon.png', true],
  ['**/*.png', 'src/a/b/deep.png', true],
  ['**/*.png', 'assets/icon.png.bak', false],
  // Patrón sin ** — prefijo en la raíz, no en subrutas ni en lookalikes
  ['public', 'public', true],
  ['public', 'public/index.html', true],
  ['public', 'public-x/index.html', false],
  ['package-lock.json', 'package-lock.json', true],
  ['package-lock.json', 'src/package-lock.json', false],
  ['documentation', 'documentation-extra/x.md', false],
  ['documentation', 'src/documentation/x.js', false],
  ['**/__tests__/**', '__tests__-extra/y.js', false],
  // ? — un solo carácter, no cruza /
  ['src/?.js', 'src/a.js', true],
  ['src/?.js', 'src/ab.js', false],
  ['src/?.js', 'src/nested/a.js', false],
  // ** intermedio — cero o más segmentos
  ['dist/**/x.js', 'dist/x.js', true],
  ['dist/**/x.js', 'dist/a/b/x.js', true],
  ['dist/**/x.js', 'src/x.js', false],
  // Escenarios de estado: un test-only queda excluido y un estado previo queda STALE
  ['**/*.test.*', 'test/new-case.test.js', true],
  ['**/*.test.*', 'src/foo.test.js', true],
  ['**/*.test.*', 'src/app.js', false]
]

const PINS = [
  // Pins de test/cli.test.js: `**/*.test.*` y `**/*.spec.*`
  ['**/*.test.*', 'src/foo.js', false],
  // Pins de test/cli.test.js: `**/__tests__/**`
  ['**/__tests__/**', '__tests__/x.js', true],
  ['**/__tests__/**', 'src/app.js', false],
  // Pins de test/cli.test.js: `**/*.png`
  ['**/*.png', 'src/app.js', false],
  // Pins de test/cli.test.js: `src/*.js`, lockfiles y metacaracteres literales
  ['src/*.js', 'src/a.js', true],
  ['src/*.js', 'src/nested/a.js', false],
  ['yarn.lock', 'yarn.lock', true],
  ['yarn.lock', 'src/yarn.lock', false],
  ['pnpm-lock.yaml', 'pnpm-lock.yaml', true],
  ['assets/(v1)+x.bin', 'assets/(v1)+x.bin', true],
  ['assets/(v1)+x.bin', 'assets/v1x.bin', false],
  // Pins de test/cli.test.js: `build/**/x.js`
  ['build/**/x.js', 'build/x.js', true],
  ['build/**/x.js', 'build/a/b/x.js', true],
  ['build/**/x.js', 'src/x.js', false]
]

const LEGACY = [
  // ** embebido: se traduce a `.*` y puede cruzar /
  ['a**b', 'a/b', true],
  ['a**b', 'a/x/b', true],
  ['***', 'a/b', true],
  ['x**', 'x/y', true],
  ['**x', 'a/x', true],
  // `.` no cruza newline: un segmento con \n no matchea
  ['**/**', 'x\ny', false],
  ['**', 'x\ny', false],
  // `[^/]` (de `?` y `*`) sí cruza newline, a diferencia de `.`
  ['a?b', 'a\nb', true],
  // **/ y /** como glob completo: sólo prefijo/sufijo con /
  ['**/', 'a/', true],
  ['**/', 'a/b', false],
  ['**/', '', true],
  ['/**', '/a/b', true],
  ['/**', 'a/b', false],
  ['/**', '', true],
  // Glob vacío: ancla `^(/|$)`; conserva el quirk legacy de aceptar `/x`
  ['', '', true],
  ['', 'a', false],
  ['', '/x', true],
  // Rutas con separador inicial o final explícito
  ['./x', './x', true],
  ['./x', 'x', false],
  ['./x', './x/y', true],
  ['/x', '/x', true],
  ['/x', 'x', false],
  ['/x', '/x/y', true],
  ['x/', 'x/', true],
  ['x/', 'x', false],
  ['x/', 'x/y', false],
  // Backslash literal
  ['a\\b', 'a\\b', true],
  ['a\\b', 'a/b', false],
  ['a\\b', 'axb', false],
  // ? opera por code unit: el astral ocupa dos
  ['src/?.js', 'src/😀.js', false],
  ['src/?.js', 'src/é.js', true],
  // Segmento con \n dentro de un ** intermedio
  ['a/**/b', 'a/\n/b', false],
  ['a/**/b', 'a/b', true],
  ['a/**/b', 'a/x/b', true],
  // Metacaracteres de regex tratados como literales (salvo * y ?)
  ['a[1].js', 'a[1].js', true],
  ['a[1].js', 'a1.js', false],
  ['[a?].js', '[a?].js', true],
  ['[a?].js', 'a.js', false],
  ['[a?].js', '[ab].js', true],
  ['a{b}.js', 'a{b}.js', true],
  ['a{b}.js', 'ab.js', false],
  ['a$b.js', 'a$b.js', true],
  ['a$b.js', 'ab.js', false],
  ['a^b.js', 'a^b.js', true],
  ['a^b.js', 'ab.js', false],
  ['a|b.js', 'a|b.js', true],
  ['a|b.js', 'a.js', false],
  ['a(1).js', 'a(1).js', true],
  ['a(1).js', 'a1.js', false],
  ['a+1.js', 'a+1.js', true],
  ['a+1.js', 'a1.js', false],
  // Case-sensitive
  ['PUBLIC', 'PUBLIC', true],
  ['PUBLIC', 'public', false],
  // * no cruza / pero el ancla de prefijo sí acepta subrutas del directorio
  ['*.js', 'x.js', true],
  ['*.js', 'x.js/y', true],
  ['*.js', 'sub/x.js', false]
]

const CASES = [
  ['canónicos', CANONICAL],
  ['pins', PINS],
  ['límites legacy', LEGACY]
]

describe('discovery-glob: matchesGlob equivalencia por resultados', () => {
  for (const [group, cases] of CASES) {
    it(`${group}: la tabla congelada coincide`, () => {
      for (const [glob, path, expected] of cases) {
        assert.equal(
          matchesGlob(path, glob),
          expected,
          `glob=${JSON.stringify(glob)} path=${JSON.stringify(path)}`
        )
      }
    })
  }
})

describe('discovery-glob: caché del RegExp compilado', () => {
  it('compileGlob reusa la instancia por string exacto y no la comparte entre globs', () => {
    for (const glob of ['**/*.test.*', 'dist/**/x.js', 'src/?.js', '', 'a**b']) {
      assert.equal(compileGlob(glob), compileGlob(glob), `misma instancia para ${JSON.stringify(glob)}`)
    }
    assert.notEqual(compileGlob('cache-a/**'), compileGlob('cache-b/**'))
  })

  it('tras el warm-up, repetir matches no compila RegExp nuevos', () => {
    const globs = ['warm/**/*.js', 'warm/?.md', 'warm/a**b', 'warm', 'warm/**']
    for (const glob of globs) compileGlob(glob)

    const OriginalRegExp = globalThis.RegExp
    let constructions = 0
    class CountingRegExp extends OriginalRegExp {
      constructor(...args) {
        super(...args)
        constructions += 1
      }
    }

    globalThis.RegExp = CountingRegExp
    try {
      for (let i = 0; i < 20; i += 1) {
        for (const glob of globs) matchesGlob('warm/some/path.js', glob)
      }
    } finally {
      globalThis.RegExp = OriginalRegExp
    }

    assert.equal(constructions, 0, `se compilaron ${constructions} RegExp tras el warm-up`)
  })
})
