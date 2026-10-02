import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../eslint.config.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const THIS_FILE = import.meta.url.split(/[\\/]/).pop()

function jsFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...jsFiles(p))
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

describe('linter standard (add-standard-linter)', () => {
  it('es un flat config con exactamente las 4 reglas y sin plugins ni ignores', () => {
    assert.ok(Array.isArray(config), 'el flat config debe exportar un array')
    const options = config.map((e) => e.languageOptions).filter(Boolean)
    assert.ok(options.some((o) => o.ecmaVersion === 'latest'), 'falta ecmaVersion: latest')
    assert.ok(options.some((o) => o.sourceType === 'module'), 'falta sourceType: module')
    assert.ok(options.some((o) => o.globals && 'process' in o.globals), 'faltan globals de Node')
    for (const entry of config) {
      assert.equal(entry.plugins, undefined, 'no debe declarar plugins')
      assert.equal(entry.ignores, undefined, 'no debe declarar ignores globales')
    }
    const rules = Object.assign({}, ...config.map((e) => e.rules || {}))
    assert.deepEqual(Object.keys(rules).sort(), ['eqeqeq', 'no-dupe-keys', 'no-undef', 'no-unused-vars'])
    assert.equal(rules['no-undef'], 'error')
    assert.equal(rules['no-dupe-keys'], 'error')
    assert.deepEqual(rules.eqeqeq, ['error', 'always'])
    assert.equal(rules['no-unused-vars'][0], 'error')
    assert.equal(rules['no-unused-vars'][1].argsIgnorePattern, '^_')
  })

  it('package.json expone lint/test y eslint+globals como devDependencies sin runtime deps', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    assert.equal(pkg.scripts.lint, 'eslint src/ test/')
    assert.equal(pkg.scripts.test, 'node --test "test/*.test.js"')
    assert.ok(pkg.devDependencies.eslint, 'eslint debe ser devDependency')
    assert.ok(pkg.devDependencies.globals, 'globals debe ser devDependency')
    assert.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'sin dependencias de runtime')
  })

  it('publish.yml corre lint despues de npm ci y antes de los tests', () => {
    const wf = readFileSync(join(ROOT, '.github', 'workflows', 'publish.yml'), 'utf8')
    const ci = wf.indexOf('npm ci')
    const lint = wf.indexOf('npm run lint')
    const test = wf.indexOf('node --test')
    assert.ok(ci >= 0 && lint >= 0 && test >= 0, 'faltan pasos en el workflow')
    assert.ok(ci < lint && lint < test, 'orden esperado: npm ci -> lint -> test')
  })

  it('sin directivas eslint-disable en src/ ni test/', () => {
    for (const dir of ['src', 'test']) {
      for (const p of jsFiles(join(ROOT, dir))) {
        if (p.endsWith(THIS_FILE)) continue
        assert.doesNotMatch(readFileSync(p, 'utf8'), /eslint-disable/, `${p} contiene eslint-disable`)
      }
    }
  })
})
