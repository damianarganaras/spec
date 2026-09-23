import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTopologyMap, TOPOLOGY_IGNORED_DIRS } from '../src/core/discovery.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CLI = join(TEST_DIR, '..', 'src', 'cli', 'index.js')

function run(args, cwd, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-topo-'))
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

function seedFixture(dir) {
  writeFileSync(join(dir, 'README.md'), '# x\n')
  writeFileSync(join(dir, 'package.json'), '{}\n')
  mkdirSync(join(dir, 'src', 'sub'), { recursive: true })
  writeFileSync(join(dir, 'src', 'a.js'), '1\n')
  writeFileSync(join(dir, 'src', 'sub', 'b.js'), '2\n')
  mkdirSync(join(dir, 'docs'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'guide.md'), 'g\n')
  for (const d of ['node_modules/dep', '.git', '.ancleto', 'dist', 'build', 'coverage']) {
    mkdirSync(join(dir, d), { recursive: true })
    writeFileSync(join(dir, d, 'junk.txt'), 'x\n')
  }
}

describe('Discovery topología (D1)', () => {
  it('buildTopologyMap genera la estructura correcta y respeta los ignores', () => {
    withDir((dir) => {
      seedFixture(dir)
      const map = buildTopologyMap(dir)
      assert.ok(!Number.isNaN(Date.parse(map.last_updated)))
      assert.equal(map.total_files, 5)
      assert.deepEqual(map.tree_summary, { src: 2, docs: 1 })
      assert.deepEqual(map.root_files, ['README.md', 'package.json'])
      for (const ignored of TOPOLOGY_IGNORED_DIRS) {
        assert.ok(!(ignored in map.tree_summary), ignored)
      }
    })
  })

  it('ancleto discovery --check NO modifica .discovery-map.json (read-only)', () => {
    withDir((dir) => {
      seedFixture(dir)
      const mapPath = join(dir, '.discovery-map.json')
      const pinned = '{\n  "pinned": true\n}\n'
      writeFileSync(mapPath, pinned)
      const before = readFileSync(mapPath, 'utf8')

      const r = run(['discovery', '--check'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(mapPath, 'utf8'), before, 'el mapa no debe cambiar con --check')
      assert.equal(readFileSync(mapPath, 'utf8'), pinned)
      assert.doesNotMatch(r.stdout, /discovery-map/)
    })
  })

  it('ancleto discovery --check NO crea el mapa si no existe', () => {
    withDir((dir) => {
      seedFixture(dir)
      const mapPath = join(dir, '.discovery-map.json')
      assert.equal(existsSync(mapPath), false, 'precondicion: sin mapa')
      const r = run(['discovery', '--check'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(mapPath), false, '--check no debe crear archivos')
    })
  })
})
