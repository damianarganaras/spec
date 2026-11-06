import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  utimesSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCanonicalSpec, parseDeltaSpec, mergeSpecText } from '../src/core/specs-merge.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CLI = join(TEST_DIR, '..', 'src', 'cli', 'index.js')
const OLD = new Date('2000-01-01T00:00:00Z')

function run(args, cwd, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-specs-merge-'))
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

function writeSpec(dir, rel, content) {
  const p = join(dir, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
  return p
}

const specRel = (capability) => join('aspec', 'specs', capability, 'spec.md')
const deltaRel = (slug, capability) => join('aspec', 'changes', slug, 'specs', capability, 'spec.md')

function requirement(title, body) {
  return `### Requirement: ${title}\n\n${body}`
}

function canon(capability, ...blocks) {
  return `# Spec: ${capability}\n\n## Purpose\n\nPurpose for ${capability}.\n\n## Requirements\n\n${blocks.join('\n\n')}\n`
}

const toCrlf = (text) => text.replace(/\n/g, '\r\n')

function setOldMtime(dir, rel) {
  const p = join(dir, rel)
  utimesSync(p, OLD, OLD)
  return statSync(p).mtimeMs
}

function mtimeOf(dir, rel) {
  return statSync(join(dir, rel)).mtimeMs
}

function snapshot(dir) {
  const out = {}
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else out[relative(dir, p).replace(/\\/g, '/')] = readFileSync(p, 'utf8')
    }
  }
  walk(dir)
  return out
}

// Ejecuta un merge que debe fallar fail-closed y verifica exit 2 + cero escrituras
// (contenido y mtime inalterados) sobre el spec canÃ³nico indicado.
function expectFailClosed(dir, rel, slug, reasonPattern) {
  const before = readFileSync(join(dir, rel), 'utf8')
  const stamp = setOldMtime(dir, rel)
  const r = run(['specs', 'merge', '--change', slug, '--json'], dir)
  assert.equal(r.status, 2, `stderr: ${r.stderr}`)
  const json = JSON.parse(r.stdout)
  assert.equal(json.ok, false)
  assert.ok(json.errors.some((e) => reasonPattern.test(e.reason)), `errors: ${JSON.stringify(json.errors)}`)
  assert.equal(readFileSync(join(dir, rel), 'utf8'), before)
  assert.equal(mtimeOf(dir, rel), stamp)
  return json
}

describe('specs merge â€” ADDED, MODIFIED, REMOVED y RENAMED', () => {
  it('ADDED agrega el requirement al final de ## Requirements', () => {
    withDir((dir) => {
      const before = canon('alpha', requirement('Existing', 'Existing body.'))
      writeSpec(dir, specRel('alpha'), before)
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')

      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, true)
      assert.equal(json.change, 'ch')
      assert.equal(json.dryRun, false)
      assert.equal(json.changed, true)
      assert.deepEqual(json.errors, [])
      assert.deepEqual(json.capabilities, [
        { capability: 'alpha', operations: [{ type: 'ADDED', requirement: 'New' }], changed: true }
      ])

      const after = readFileSync(join(dir, specRel('alpha')), 'utf8')
      assert.equal(after, `${before}\n### Requirement: New\n\nNew body.\n`)
    })
  })

  it('MODIFIED reescribe el cuerpo y los escenarios y preserva los no mencionados', () => {
    withDir((dir) => {
      const oldA = `### Requirement: A\n\nOld A body.\n\n#### Scenario: Old A\n\n- **WHEN** old\n- **THEN** old`
      const base = canon('beta', oldA, requirement('B', 'B stays.'))
      writeSpec(dir, specRel('beta'), base)
      writeSpec(
        dir,
        deltaRel('ch', 'beta'),
        '## MODIFIED Requirements\n\n### Requirement: A\n\nNew A body.\n\n#### Scenario: New A\n\n- **WHEN** new\n- **THEN** new\n'
      )

      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)

      const after = readFileSync(join(dir, specRel('beta')), 'utf8')
      assert.match(after, /### Requirement: A\n\nNew A body\./)
      assert.match(after, /#### Scenario: New A/)
      assert.doesNotMatch(after, /Old A body/)
      assert.doesNotMatch(after, /Old A/)
      assert.match(after, /### Requirement: B\n\nB stays\./)
    })
  })

  it('REMOVED elimina el bloque y es no-op cuando el requirement ya no existe', () => {
    withDir((dir) => {
      const base = canon('gamma', requirement('Keep', 'Keep body.'), requirement('Drop', 'Drop body.'))
      writeSpec(dir, specRel('gamma'), base)
      writeSpec(dir, deltaRel('ch', 'gamma'), '## REMOVED Requirements\n\n### Requirement: Drop\n')

      const first = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = readFileSync(join(dir, specRel('gamma')), 'utf8')
      assert.doesNotMatch(afterFirst, /### Requirement: Drop/)
      assert.match(afterFirst, /Keep body\./)
      assert.equal(afterFirst, canon('gamma', requirement('Keep', 'Keep body.')))

      const stamp = setOldMtime(dir, specRel('gamma'))
      const second = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      assert.equal(JSON.parse(second.stdout).changed, false)
      assert.equal(readFileSync(join(dir, specRel('gamma')), 'utf8'), afterFirst)
      assert.equal(mtimeOf(dir, specRel('gamma')), stamp)
    })
  })

  it('RENAMED renombra FROMâ†’TO y es no-op cuando el tÃ­tulo nuevo ya existe', () => {
    withDir((dir) => {
      const base = canon('delta', requirement('Old', 'Old body.'), requirement('Other', 'Other body.'))
      writeSpec(dir, specRel('delta'), base)
      writeSpec(
        dir,
        deltaRel('ch', 'delta'),
        '## RENAMED Requirements\n\n- FROM: `### Requirement: Old`\n- TO: `### Requirement: New`\n'
      )

      const first = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = readFileSync(join(dir, specRel('delta')), 'utf8')
      assert.match(afterFirst, /### Requirement: New/)
      assert.doesNotMatch(afterFirst, /### Requirement: Old/)
      assert.match(afterFirst, /Old body\./)
      assert.match(afterFirst, /### Requirement: Other/)

      const stamp = setOldMtime(dir, specRel('delta'))
      const second = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      assert.equal(JSON.parse(second.stdout).changed, false)
      assert.equal(readFileSync(join(dir, specRel('delta')), 'utf8'), afterFirst)
      assert.equal(mtimeOf(dir, specRel('delta')), stamp)
    })
  })

  it('ADDED idÃ©ntico es no-op y no escribe', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('epsilon'), canon('epsilon', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'epsilon'), '## ADDED Requirements\n\n### Requirement: A\n\nA body.\n')

      const before = readFileSync(join(dir, specRel('epsilon')), 'utf8')
      const stamp = setOldMtime(dir, specRel('epsilon'))
      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, true)
      assert.equal(json.changed, false)
      assert.deepEqual(json.capabilities, [
        { capability: 'epsilon', operations: [{ type: 'ADDED', requirement: 'A' }], changed: false }
      ])
      assert.equal(readFileSync(join(dir, specRel('epsilon')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('epsilon')), stamp)
    })
  })

  it('plan vacÃ­o no escribe y conserva el mtime', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('zeta'), canon('zeta', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'zeta'), '## REMOVED Requirements\n\n### Requirement: Gone\n')

      const before = readFileSync(join(dir, specRel('zeta')), 'utf8')
      const stamp = setOldMtime(dir, specRel('zeta'))
      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      assert.equal(JSON.parse(r.stdout).changed, false)
      assert.equal(readFileSync(join(dir, specRel('zeta')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('zeta')), stamp)
    })
  })
})

describe('specs merge â€” fail-closed con exit 2 y cero escrituras', () => {
  it('ADDED de un tÃ­tulo existente con contenido distinto falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement: A\n\nDifferent body.\n')
      const json = expectFailClosed(dir, specRel('alpha'), 'ch', /different content/)
      assert.equal(json.errors[0].requirement, 'A')
    })
  })

  it('MODIFIED con 0 coincidencias falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## MODIFIED Requirements\n\n### Requirement: Missing\n\nBody.\n')
      const json = expectFailClosed(dir, specRel('alpha'), 'ch', /not found/)
      assert.equal(json.errors[0].requirement, 'Missing')
    })
  })

  it('MODIFIED con 2 o mÃ¡s coincidencias falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('Dup', 'One.'), requirement('Dup', 'Two.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## MODIFIED Requirements\n\n### Requirement: Dup\n\nNew.\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /2\+ requirements/)
    })
  })

  it('MODIFIED sin cuerpo falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## MODIFIED Requirements\n\n### Requirement: A\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /block without body/)
    })
  })

  it('RENAMED con ambos tÃ­tulos presentes falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.'), requirement('B', 'B body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '## RENAMED Requirements\n\n- FROM: `### Requirement: A`\n- TO: `### Requirement: B`\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /both old and new/)
    })
  })

  it('RENAMED con ninguno de los tÃ­tulos presente falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('C', 'C body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '## RENAMED Requirements\n\n- FROM: `### Requirement: A`\n- TO: `### Requirement: B`\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /neither old nor new/)
    })
  })

  it('RENAMED sin FROM falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## RENAMED Requirements\n\n- TO: `### Requirement: B`\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /missing FROM/)
    })
  })

  it('RENAMED sin TO falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## RENAMED Requirements\n\n- FROM: `### Requirement: A`\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /missing TO/)
    })
  })

  it('delta malformado falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\nthis is not a requirement block\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformed delta block/)
    })
  })

  it('encabezado de secciÃ³n mal escrito (## ADDED Requirement) falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirement\n\n### Requirement: New\n\nNew body.\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
    })
  })

  it('un ### Requirement: suelto antes de cualquier sección falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '### Requirement: Orphan\n\nOrphan body.\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
    })
  })

  it('un requirement con tÃ­tulo vacÃ­o falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement:\n\nNew body.\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformed delta block/)
    })
  })

  it('un par - FROM / - TO invÃ¡lido (FROM sin TO) falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '## RENAMED Requirements\n\n- FROM: `### Requirement: A`\n- FROM: `### Requirement: B`\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /missing TO/)
    })
  })

  it('una secciÃ³n vÃ¡lida seguida de un encabezado ## desconocido falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n\n## BOGUS Requirements\n\n### Requirement: B\n\nB body.\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
    })
  })

  it('capability sin spec canÃ³nico falla y no la crea', () => {
    withDir((dir) => {
      const base = canon('alpha', requirement('A', 'A body.'))
      writeSpec(dir, specRel('alpha'), base)
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')
      writeSpec(dir, deltaRel('ch', 'ghost'), '## ADDED Requirements\n\n### Requirement: G\n\nG body.\n')

      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, false)
      assert.ok(json.errors.some((e) => e.capability === 'ghost' && /canonical spec not found/.test(e.reason)))
      assert.equal(existsSync(join(dir, specRel('ghost'))), false)
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), base)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
      assert.deepEqual(readdirSync(join(dir, 'aspec', 'specs')).sort(), ['alpha'])
    })
  })
})

describe('specs merge â€” idempotencia, dry-run y atomicidad', () => {
  it('dos corridas producen byte a byte el mismo resultado y la segunda no escribe', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('Existing', 'Existing body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')

      const first = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = readFileSync(join(dir, specRel('alpha')), 'utf8')

      const stamp = setOldMtime(dir, specRel('alpha'))
      const second = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      const afterSecond = readFileSync(join(dir, specRel('alpha')), 'utf8')
      assert.equal(afterSecond, afterFirst)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('--dry-run reporta el plan, emite JSON vÃ¡lido y no escribe', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('Existing', 'Existing body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')

      const before = readFileSync(join(dir, specRel('alpha')), 'utf8')
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'ch', '--dry-run', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, true)
      assert.equal(json.dryRun, true)
      assert.equal(json.changed, true)
      assert.deepEqual(json.operations, [{ type: 'ADDED', requirement: 'New' }])
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('--dry-run con condiciÃ³n fail-closed sale 2 y no escribe', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## MODIFIED Requirements\n\n### Requirement: Missing\n\nBody.\n')

      const before = readFileSync(join(dir, specRel('alpha')), 'utf8')
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'ch', '--dry-run', '--json'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, false)
      assert.equal(json.dryRun, true)
      assert.ok(json.errors.length > 0)
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('un fallo en una capability no escribe ninguna de las restantes', () => {
    withDir((dir) => {
      const baseAlpha = canon('alpha', requirement('A', 'A body.'))
      const baseBeta = canon('beta', requirement('B', 'B body.'))
      writeSpec(dir, specRel('alpha'), baseAlpha)
      writeSpec(dir, specRel('beta'), baseBeta)
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '## MODIFIED Requirements\n\n### Requirement: A\n\nNew A body.\n'
      )
      writeSpec(dir, deltaRel('ch', 'beta'), '## MODIFIED Requirements\n\n### Requirement: Missing\n\nBody.\n')

      const stampAlpha = setOldMtime(dir, specRel('alpha'))
      const stampBeta = setOldMtime(dir, specRel('beta'))
      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, false)
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), baseAlpha)
      assert.equal(readFileSync(join(dir, specRel('beta')), 'utf8'), baseBeta)
      assert.equal(mtimeOf(dir, specRel('alpha')), stampAlpha)
      assert.equal(mtimeOf(dir, specRel('beta')), stampBeta)
    })
  })
})

describe('specs merge â€” alcance acotado y resoluciÃ³n del change', () => {
  it('no escribe fuera de aspec/specs/<capability>/spec.md', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')
      writeSpec(dir, join('aspec', 'changes', 'ch', 'proposal.md'), 'proposal sentinel\n')
      writeSpec(dir, 'package.json', '{"name":"sentinel"}\n')
      writeSpec(dir, join('.ancleto', 'memory.db'), 'sentinel-memory\n')

      const before = snapshot(dir)
      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)

      const after = snapshot(dir)
      assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort())
      const changed = Object.keys(after)
        .filter((key) => before[key] !== after[key])
        .sort()
      assert.deepEqual(changed, ['aspec/specs/alpha/spec.md'])
      assert.equal(after['aspec/changes/ch/specs/alpha/spec.md'], before['aspec/changes/ch/specs/alpha/spec.md'])
      assert.equal(after['aspec/changes/ch/proposal.md'], before['aspec/changes/ch/proposal.md'])
      assert.equal(after['package.json'], before['package.json'])
      assert.equal(after['.ancleto/memory.db'], before['.ancleto/memory.db'])
      assert.equal(existsSync(join(dir, specRel('beta'))), false)
    })
  })

  it('resuelve un change archivado en archive/*-<slug>', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        join('aspec', 'changes', 'archive', '2020-11-01-legacy', 'specs', 'alpha', 'spec.md'),
        '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )

      const r = run(['specs', 'merge', '--change', 'legacy', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      assert.match(readFileSync(join(dir, specRel('alpha')), 'utf8'), /### Requirement: New/)
    })
  })

  it('no confunde archive/2020-b-a con el slug "a" (exit 2 y cero escrituras)', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        join('aspec', 'changes', 'archive', '2020-b-a', 'specs', 'alpha', 'spec.md'),
        '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )

      const before = readFileSync(join(dir, specRel('alpha')), 'utf8')
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'a'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      assert.match(r.stderr, /no existe el change "a"/)
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('un archive con fecha exacta 2020-01-02-<slug> coincide con el slug', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        join('aspec', 'changes', 'archive', '2020-01-02-a', 'specs', 'alpha', 'spec.md'),
        '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )

      const r = run(['specs', 'merge', '--change', 'a', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      assert.match(readFileSync(join(dir, specRel('alpha')), 'utf8'), /### Requirement: New/)
    })
  })

  it('0 coincidencias de change falla con exit 2', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      const r = run(['specs', 'merge', '--change', 'nope'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      assert.match(r.stderr, /no existe el change/)
    })
  })

  it('2 o mÃ¡s coincidencias de change fallan con exit 2', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      const delta = '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      writeSpec(dir, deltaRel('dup', 'alpha'), delta)
      writeSpec(dir, join('aspec', 'changes', 'archive', '2020-01-02-dup', 'specs', 'alpha', 'spec.md'), delta)

      const r = run(['specs', 'merge', '--change', 'dup'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      assert.match(r.stderr, /ambiguo/)
    })
  })

  it('specs check y specs sin argumentos conservan su comportamiento', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))

      const check = run(['specs', 'check', '--json'], dir)
      assert.equal(check.status, 0, `stderr: ${check.stderr}`)
      const checkJson = JSON.parse(check.stdout)
      assert.equal(checkJson.ok, true)
      assert.equal(checkJson.scanned, 1)

      const bare = run(['specs', '--json'], dir)
      assert.equal(bare.status, 0, `stderr: ${bare.stderr}`)
      assert.deepEqual(JSON.parse(bare.stdout), checkJson)
    })
  })
})

describe('specs merge â€” mÃ³dulo puro sin CLI ni fs', () => {
  it('parseCanonicalSpec extrae tÃ­tulos, bloques y cuerpos', () => {
    const parsed = parseCanonicalSpec(canon('alpha', requirement('A', 'A body.'), requirement('B', 'B body.')))
    assert.equal(parsed.hasRequirementsSection, true)
    assert.deepEqual(parsed.requirements.map((r) => r.title), ['A', 'B'])
    assert.deepEqual(parsed.requirements[0].block, ['### Requirement: A', '', 'A body.'])
    assert.equal(parsed.requirements[0].body, 'A body.')
    assert.equal(parsed.requirements[1].body, 'B body.')
  })

  it('parseDeltaSpec parsea los cuatro tipos de bloque en orden canÃ³nico', () => {
    const delta = [
      '## ADDED Requirements',
      '',
      '### Requirement: Added',
      '',
      'Added body.',
      '',
      '## MODIFIED Requirements',
      '',
      '### Requirement: Modified',
      '',
      'Modified body.',
      '',
      '## REMOVED Requirements',
      '',
      '### Requirement: Removed',
      '',
      '## RENAMED Requirements',
      '',
      '- FROM: `### Requirement: Old`',
      '- TO: `### Requirement: New`',
      ''
    ].join('\n')
    const parsed = parseDeltaSpec(delta)
    assert.deepEqual(parsed.errors, [])
    assert.deepEqual(parsed.operations.map((op) => op.type), ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED'])
    const added = parsed.operations.find((op) => op.type === 'ADDED')
    assert.equal(added.title, 'Added')
    assert.deepEqual(added.block, ['### Requirement: Added', '', 'Added body.'])
    const removed = parsed.operations.find((op) => op.type === 'REMOVED')
    assert.deepEqual(removed.block, ['### Requirement: Removed'])
    const renamed = parsed.operations.find((op) => op.type === 'RENAMED')
    assert.equal(renamed.from, 'Old')
    assert.equal(renamed.to, 'New')
  })

  it('un delta malformado devuelve errores estructurados y mergeSpecText no cambia la salida', () => {
    const canonical = canon('alpha', requirement('A', 'A body.'))
    const malformed = parseDeltaSpec('## ADDED Requirement\n\n### Requirement: X\n\nBody.\n')
    assert.equal(malformed.operations.length, 0)
    assert.ok(malformed.errors.length >= 1)
    assert.ok(malformed.errors.every((e) => typeof e.reason === 'string' && e.reason.length > 0))
    assert.match(malformed.errors[0].reason, /malformado/)

    const merged = mergeSpecText('## ADDED Requirement\n\n### Requirement: X\n\nBody.\n', canonical)
    assert.equal(merged.changed, false)
    assert.equal(merged.output, canonical)
    assert.ok(merged.errors.length >= 1)
  })
})

describe('specs merge â€” preservaciÃ³n de fin de lÃ­nea (M1)', () => {
  it('un canÃ³nico CRLF conserva CRLF y los bytes no mencionados en dos corridas idÃ©nticas', () => {
    withDir((dir) => {
      const base = toCrlf(canon('windows', requirement('Existing', 'Existing body.')))
      writeSpec(dir, specRel('windows'), base)
      writeSpec(dir, deltaRel('ch', 'windows'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')

      const first = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = readFileSync(join(dir, specRel('windows')), 'utf8')
      assert.ok(afterFirst.includes('\r\n'))
      assert.equal(afterFirst.replace(/\r\n/g, '').includes('\n'), false)
      assert.ok(afterFirst.startsWith(base))
      assert.match(afterFirst, /### Requirement: New\r\n\r\nNew body\.\r\n$/)

      const stamp = setOldMtime(dir, specRel('windows'))
      const second = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      assert.equal(JSON.parse(second.stdout).changed, false)
      assert.equal(readFileSync(join(dir, specRel('windows')), 'utf8'), afterFirst)
      assert.equal(mtimeOf(dir, specRel('windows')), stamp)
    })
  })

  it('un canÃ³nico LF permanece en LF y la segunda corrida es byte a byte idÃ©ntica', () => {
    withDir((dir) => {
      const base = canon('posix', requirement('Existing', 'Existing body.'))
      writeSpec(dir, specRel('posix'), base)
      writeSpec(dir, deltaRel('ch', 'posix'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')

      const first = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = readFileSync(join(dir, specRel('posix')), 'utf8')
      assert.equal(afterFirst.includes('\r\n'), false)
      assert.ok(afterFirst.startsWith(base))

      const stamp = setOldMtime(dir, specRel('posix'))
      const second = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      assert.equal(JSON.parse(second.stdout).changed, false)
      assert.equal(readFileSync(join(dir, specRel('posix')), 'utf8'), afterFirst)
      assert.equal(mtimeOf(dir, specRel('posix')), stamp)
    })
  })
})

describe('specs merge â€” inserciÃ³n ADDED con secciones posteriores (m2)', () => {
  it('inserta el requirement dentro de ## Requirements aunque no sea la Ãºltima secciÃ³n', () => {
    withDir((dir) => {
      const base = [
        '# Spec: eta',
        '',
        '## Purpose',
        '',
        'Purpose for eta.',
        '',
        '## Requirements',
        '',
        '### Requirement: A',
        '',
        'A body.',
        '',
        '## Notes',
        '',
        'Keep notes.',
        ''
      ].join('\n')
      writeSpec(dir, specRel('eta'), base)
      writeSpec(dir, deltaRel('ch', 'eta'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')

      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const after = readFileSync(join(dir, specRel('eta')), 'utf8')
      assert.match(after, /### Requirement: A\n\nA body\./)
      assert.match(after, /## Notes\n\nKeep notes\./)
      assert.ok(after.indexOf('### Requirement: New') < after.indexOf('## Notes'))
      assert.ok(after.indexOf('### Requirement: New') > after.indexOf('### Requirement: A'))
    })
  })
})

describe('specs merge - H1 preamble opcional del delta (R2)', () => {
  for (const preamble of ['# Delta: x', '# Spec delta: x']) {
    it(`ignora el preamble H1 "${preamble}" y aplica ADDED`, () => {
      withDir((dir) => {
        const before = canon('alpha', requirement('Existing', 'Existing body.'))
        writeSpec(dir, specRel('alpha'), before)
        writeSpec(
          dir,
          deltaRel('ch', 'alpha'),
          `${preamble}\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n`
        )

        const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
        assert.equal(r.status, 0, `stderr: ${r.stderr}`)
        assert.equal(JSON.parse(r.stdout).changed, true)
        assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), `${before}\n### Requirement: New\n\nNew body.\n`)
      })
    })
  }

  it('un preamble H1 seguido de contenido no vacio antes de una seccion falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '# Delta: x\n\njunk antes de la seccion\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
    })
  })

  it('un preamble H1 seguido de ## ADDED Requirement (mal escrito) falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '# Delta: x\n\n## ADDED Requirement\n\n### Requirement: New\n\nNew body.\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
    })
  })

  it('un ### Requirement: suelto tras el preamble H1 y antes de una seccion falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '# Delta: x\n\n### Requirement: Orphan\n\nOrphan body.\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
    })
  })
})

describe('specs merge - fail-closed adicionales (R2)', () => {
  it('un ### Requirement: indentado dentro de una seccion falla sin escribir', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n\n   ### Requirement: Indented\n\nIndented body.\n'
      )
      const json = expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
      assert.match(json.errors[0].reason, /### Requirement: Indented/)
    })
  })

  it('ADDED con 2 o mas coincidencias falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('Dup', 'One.'), requirement('Dup', 'Two.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement: Dup\n\nNew.\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /ADDED matches 2\+ requirements/)
    })
  })

  it('REMOVED con 2 o mas coincidencias falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('Dup', 'One.'), requirement('Dup', 'Two.')))
      writeSpec(dir, deltaRel('ch', 'alpha'), '## REMOVED Requirements\n\n### Requirement: Dup\n')
      expectFailClosed(dir, specRel('alpha'), 'ch', /REMOVED matches 2\+ requirements/)
    })
  })

  it('RENAMED con 2 o mas coincidencias falla', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('Old', 'One.'), requirement('Old', 'Two.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '## RENAMED Requirements\n\n- FROM: `### Requirement: Old`\n- TO: `### Requirement: New`\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /RENAMED matches 2\+ requirements/)
    })
  })
})

describe('specs merge - slug y resolucion endurecidos (R2)', () => {
  it('un slug con traversal (../../x) falla con exit 2 y no escribe', () => {
    withDir((dir) => {
      const before = canon('alpha', requirement('A', 'A body.'))
      writeSpec(dir, specRel('alpha'), before)
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', '../../x'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      assert.match(r.stderr, /slug invalido/)
      assert.ok(r.stderr.includes('../../x'))
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('un slug con separador de ruta (a/b) falla con exit 2 y no escribe', () => {
    withDir((dir) => {
      const before = canon('alpha', requirement('A', 'A body.'))
      writeSpec(dir, specRel('alpha'), before)
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'a/b'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      assert.match(r.stderr, /slug invalido/)
      assert.ok(r.stderr.includes('a/b'))
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('un path activo que es un archivo (no directorio) falla con exit 2, no exit 1', () => {
    withDir((dir) => {
      const before = canon('alpha', requirement('A', 'A body.'))
      writeSpec(dir, specRel('alpha'), before)
      writeSpec(dir, join('aspec', 'changes', 'ch'), 'no es un directorio\n')
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'ch'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      assert.match(r.stderr, /no existe el change "ch"/)
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'ch'), 'utf8'), 'no es un directorio\n')
    })
  })
})

describe('specs merge - seccion vacia y CRLF en MODIFIED/REMOVED (R2)', () => {
  it('una seccion ## MODIFIED Requirements vacia es no-op valido sin escribir', () => {
    withDir((dir) => {
      const before = canon('alpha', requirement('A', 'A body.'))
      writeSpec(dir, specRel('alpha'), before)
      writeSpec(dir, deltaRel('ch', 'alpha'), '## MODIFIED Requirements\n')
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, true)
      assert.equal(json.changed, false)
      assert.deepEqual(json.errors, [])
      assert.deepEqual(json.capabilities, [{ capability: 'alpha', operations: [], changed: false }])
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('CRLF + MODIFIED conserva CRLF, deja intacto lo no mencionado y es idempotente', () => {
    withDir((dir) => {
      const base = toCrlf(
        canon(
          'winmod',
          `### Requirement: A\n\nOld A body.\n\n#### Scenario: Old A\n\n- **WHEN** old\n- **THEN** old`,
          requirement('B', 'B stays.')
        )
      )
      writeSpec(dir, specRel('winmod'), base)
      writeSpec(
        dir,
        deltaRel('ch', 'winmod'),
        '## MODIFIED Requirements\n\n### Requirement: A\n\nNew A body.\n\n#### Scenario: New A\n\n- **WHEN** new\n- **THEN** new\n'
      )

      const first = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = readFileSync(join(dir, specRel('winmod')), 'utf8')
      assert.ok(afterFirst.includes('\r\n'))
      assert.equal(afterFirst.replace(/\r\n/g, '').includes('\n'), false)
      assert.match(afterFirst, /### Requirement: A\r\n\r\nNew A body\./)
      assert.match(afterFirst, /#### Scenario: New A\r\n/)
      assert.doesNotMatch(afterFirst, /Old A body/)
      assert.match(afterFirst, /### Requirement: B\r\n\r\nB stays\./)

      const stamp = setOldMtime(dir, specRel('winmod'))
      const second = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      assert.equal(JSON.parse(second.stdout).changed, false)
      assert.equal(readFileSync(join(dir, specRel('winmod')), 'utf8'), afterFirst)
      assert.equal(mtimeOf(dir, specRel('winmod')), stamp)
    })
  })

  it('CRLF + REMOVED conserva CRLF, deja intacto lo no mencionado y es idempotente', () => {
    withDir((dir) => {
      const base = toCrlf(canon('winrem', requirement('Keep', 'Keep body.'), requirement('Drop', 'Drop body.')))
      writeSpec(dir, specRel('winrem'), base)
      writeSpec(dir, deltaRel('ch', 'winrem'), '## REMOVED Requirements\n\n### Requirement: Drop\n')

      const first = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(first.status, 0, `stderr: ${first.stderr}`)
      const afterFirst = readFileSync(join(dir, specRel('winrem')), 'utf8')
      assert.ok(afterFirst.includes('\r\n'))
      assert.equal(afterFirst.replace(/\r\n/g, '').includes('\n'), false)
      assert.match(afterFirst, /### Requirement: Keep\r\n\r\nKeep body\./)
      assert.doesNotMatch(afterFirst, /### Requirement: Drop/)
      assert.ok(base.startsWith(afterFirst))

      const stamp = setOldMtime(dir, specRel('winrem'))
      const second = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(second.status, 0, `stderr: ${second.stderr}`)
      assert.equal(JSON.parse(second.stdout).changed, false)
      assert.equal(readFileSync(join(dir, specRel('winrem')), 'utf8'), afterFirst)
      assert.equal(mtimeOf(dir, specRel('winrem')), stamp)
    })
  })
})

describe('specs merge - las cuatro operaciones en un solo merge (R2)', () => {
  it('aplica ADDED, MODIFIED, REMOVED y RENAMED sobre requirements distintos', () => {
    withDir((dir) => {
      const base = canon(
        'combo',
        requirement('A', 'Old A body.'),
        requirement('B', 'B body.'),
        requirement('Old', 'Old body.'),
        requirement('Keep', 'Keep body.')
      )
      writeSpec(dir, specRel('combo'), base)
      writeSpec(
        dir,
        deltaRel('ch', 'combo'),
        [
          '## ADDED Requirements',
          '',
          '### Requirement: New',
          '',
          'New body.',
          '',
          '## MODIFIED Requirements',
          '',
          '### Requirement: A',
          '',
          'New A body.',
          '',
          '## REMOVED Requirements',
          '',
          '### Requirement: B',
          '',
          '## RENAMED Requirements',
          '',
          '- FROM: `### Requirement: Old`',
          '- TO: `### Requirement: Renamed`',
          ''
        ].join('\n')
      )

      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.deepEqual(
        json.capabilities[0].operations.map((op) => op.type),
        ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED']
      )

      const after = readFileSync(join(dir, specRel('combo')), 'utf8')
      assert.match(after, /### Requirement: New\n\nNew body\./)
      assert.match(after, /### Requirement: A\n\nNew A body\./)
      assert.doesNotMatch(after, /### Requirement: B\n/)
      assert.doesNotMatch(after, /### Requirement: Old\n/)
      assert.match(after, /### Requirement: Renamed\n\nOld body\./)
      assert.match(after, /### Requirement: Keep\n\nKeep body\./)
    })
  })
})

describe('specs merge - contenedor archive fail-closed (specs-merge-hardening)', () => {
  it('--change archive sale 2, cero escrituras y nombra el contenedor', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      mkdirSync(join(dir, 'aspec', 'changes', 'archive'), { recursive: true })
      const before = snapshot(dir)
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'archive', '--json'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, false)
      assert.ok(json.errors.some((e) => /contenedor/.test(e.reason) && /archive/.test(e.reason)))
      assert.deepEqual(snapshot(dir), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('--change archive con --dry-run tambien sale 2 y cero escrituras', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      mkdirSync(join(dir, 'aspec', 'changes', 'archive'), { recursive: true })
      const before = snapshot(dir)
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'archive', '--dry-run', '--json'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, false)
      assert.equal(json.dryRun, true)
      assert.ok(json.errors.some((e) => /contenedor/.test(e.reason) && /archive/.test(e.reason)))
      assert.deepEqual(snapshot(dir), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })

  it('un delta dentro del contenedor no cuenta como candidato del glob de archives', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        join('aspec', 'changes', 'archive', 'specs', 'alpha', 'spec.md'),
        '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )
      const before = snapshot(dir)
      const r = run(['specs', 'merge', '--change', 'archive', '--json'], dir)
      assert.equal(r.status, 2, `stderr: ${r.stderr}`)
      assert.deepEqual(snapshot(dir), before)
    })
  })
})

describe('specs merge - preambulo H1 estructural (specs-merge-hardening)', () => {
  it('dos H1 al inicio fallan con exit 2 y cero escrituras', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '# First: x\n\n# Second: y\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
    })
  })

  it('contenido no vacio antes de la primera seccion falla con exit 2 y cero escrituras', () => {
    withDir((dir) => {
      writeSpec(dir, specRel('alpha'), canon('alpha', requirement('A', 'A body.')))
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        'texto suelto antes de la seccion\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )
      expectFailClosed(dir, specRel('alpha'), 'ch', /malformado/)
    })
  })

  const LEGACY_H1 = [
    '# Spec: alpha (delta)',
    '# Delta Spec: alpha',
    '# Spec delta: alpha — cap',
    '# Delta: alpha — desc'
  ]
  for (const preamble of LEGACY_H1) {
    it(`acepta el H1 legacy "${preamble}"`, () => {
      withDir((dir) => {
        const before = canon('alpha', requirement('Existing', 'Existing body.'))
        writeSpec(dir, specRel('alpha'), before)
        writeSpec(
          dir,
          deltaRel('ch', 'alpha'),
          `${preamble}\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n`
        )
        const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
        assert.equal(r.status, 0, `stderr: ${r.stderr}`)
        assert.equal(JSON.parse(r.stdout).changed, true)
        assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), `${before}\n### Requirement: New\n\nNew body.\n`)
      })
    })
  }

  it('acepta un unico H1 con titulo arbitrario (sin allowlist literal)', () => {
    withDir((dir) => {
      const before = canon('alpha', requirement('Existing', 'Existing body.'))
      writeSpec(dir, specRel('alpha'), before)
      writeSpec(
        dir,
        deltaRel('ch', 'alpha'),
        '# Un titulo fuera de toda lista conocida\n\n## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
      )
      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      assert.equal(JSON.parse(r.stdout).changed, true)
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), `${before}\n### Requirement: New\n\nNew body.\n`)
    })
  })
})

describe('specs merge - espaciado ADDED exacto (specs-merge-hardening)', () => {
  it('deja exactamente una linea en blanco antes de la siguiente seccion ## ', () => {
    withDir((dir) => {
      const base = [
        '# Spec: eta',
        '',
        '## Purpose',
        '',
        'Purpose for eta.',
        '',
        '## Requirements',
        '',
        '### Requirement: A',
        '',
        'A body.',
        '',
        '## Notes',
        '',
        'Keep notes.',
        ''
      ].join('\n')
      writeSpec(dir, specRel('eta'), base)
      writeSpec(dir, deltaRel('ch', 'eta'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')

      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const expected = [
        '# Spec: eta',
        '',
        '## Purpose',
        '',
        'Purpose for eta.',
        '',
        '## Requirements',
        '',
        '### Requirement: A',
        '',
        'A body.',
        '',
        '### Requirement: New',
        '',
        'New body.',
        '',
        '## Notes',
        '',
        'Keep notes.',
        ''
      ].join('\n')
      assert.equal(readFileSync(join(dir, specRel('eta')), 'utf8'), expected)
    })
  })

  it('deja exactamente una linea en blanco antes del EOF y ninguna extra', () => {
    withDir((dir) => {
      const before = canon('alpha', requirement('Existing', 'Existing body.'))
      writeSpec(dir, specRel('alpha'), before)
      writeSpec(dir, deltaRel('ch', 'alpha'), '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n')

      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const after = readFileSync(join(dir, specRel('alpha')), 'utf8')
      assert.equal(after, `${before}\n### Requirement: New\n\nNew body.\n`)
      assert.ok(after.endsWith('New body.\n'))
      assert.equal(after.includes('New body.\n\n'), false)
    })
  })
})

describe('specs merge - RENAMED vacio es no-op (specs-merge-hardening)', () => {
  it('una seccion ## RENAMED Requirements vacia no cambia contenido ni mtime', () => {
    withDir((dir) => {
      const before = canon('alpha', requirement('A', 'A body.'))
      writeSpec(dir, specRel('alpha'), before)
      writeSpec(dir, deltaRel('ch', 'alpha'), '## RENAMED Requirements\n')
      const stamp = setOldMtime(dir, specRel('alpha'))
      const r = run(['specs', 'merge', '--change', 'ch', '--json'], dir)
      assert.equal(r.status, 0, `stderr: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      assert.equal(json.ok, true)
      assert.equal(json.changed, false)
      assert.deepEqual(json.errors, [])
      assert.deepEqual(json.capabilities, [{ capability: 'alpha', operations: [], changed: false }])
      assert.equal(readFileSync(join(dir, specRel('alpha')), 'utf8'), before)
      assert.equal(mtimeOf(dir, specRel('alpha')), stamp)
    })
  })
})
