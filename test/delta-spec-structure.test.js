// Guard estructural de los delta specs de changes activos.
// El oráculo es el parser real del merge: un delta que `parseDeltaSpec` rechaza
// hace fallar la suite declarada antes del archive, sin tocar runtime.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDeltaSpec } from '../src/core/specs-merge.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function assertDeltaValid(text, label) {
  const { errors } = parseDeltaSpec(text)
  const where = label ? ` (${label})` : ''
  assert.equal(errors.length, 0, `delta spec inválido${where}: ${JSON.stringify(errors)}`)
}

function assertDeltaInvalid(text) {
  const { errors } = parseDeltaSpec(text)
  assert.ok(errors.length > 0, 'el parser debería rechazar este delta spec')
}

function withRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'ancleto-delta-guard-'))
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch (error) {
      // best effort: la limpieza no decide el resultado, pero no se traga el error
      t.diagnostic(`limpieza del árbol temporal falló: ${error?.message ?? error}`)
    }
  })
  return root
}

function writeDelta(root, rel, content = VALID_ADDED) {
  const specPath = join(root, rel)
  mkdirSync(dirname(specPath), { recursive: true })
  writeFileSync(specPath, content)
  return specPath
}

// Deltas activos: recorre `aspec/changes` y salta la entrada llamada
// exactamente `archive`. Si `aspec/changes` no existe o no se puede leer,
// propaga el error (fail-closed) en vez de devolver una lista vacía.
function collectActiveDeltas(root) {
  const changesDir = join(root, 'aspec', 'changes')
  const deltas = []
  for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive') continue
    const specsDir = join(changesDir, entry.name, 'specs')
    if (!existsSync(specsDir)) continue
    for (const capability of readdirSync(specsDir, { withFileTypes: true })) {
      if (!capability.isDirectory()) continue
      const specPath = join(specsDir, capability.name, 'spec.md')
      if (existsSync(specPath)) deltas.push(specPath)
    }
  }
  return deltas.sort()
}

// Un `spec.md` bajo un change activo solo es un delta mal ubicado si su contenido
// pretende ser un delta: el parser real lo acepta sin errores, o al menos declara un
// heading de delta (asi un delta real con errores estructurales tambien falla). Un
// archivo incidental (notas, fixture) no produce falso positivo. El oraculo es
// `parseDeltaSpec`, el mismo del merge; no se inventa otro.
const DELTA_HEADING_RE = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED) Requirements\b/m

function looksLikeDeltaSpec(text) {
  // Un archivo vacío (o sólo whitespace) nunca pretende ser un delta: `parseDeltaSpec('')`
  // devuelve `errors: []`, así que sin esta guarda un `spec.md` vacío se marcaría como mal ubicado.
  return text.trim() !== '' && (parseDeltaSpec(text).errors.length === 0 || DELTA_HEADING_RE.test(text))
}

// Guard fail-closed: cualquier `spec.md` bajo un change activo que no sea
// `specs/<capability>/spec.md` es invisible para el merge y para
// `collectActiveDeltas`, y se perdería en el archive sin aviso. Recorre cada
// entrada directa de `aspec/changes` (excluyendo `archive` por identidad del
// nombre) y devuelve las rutas no canónicas que pretenden ser un delta.
// Propaga errores de lectura (fail-closed).
function collectMisplacedActiveSpecs(root) {
  const changesDir = join(root, 'aspec', 'changes')
  const misplaced = []
  const walk = (dir, relParts) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), [...relParts, entry.name])
      } else if (entry.isFile() && entry.name === 'spec.md') {
        const canonical = relParts.length === 3 && relParts[1] === 'specs'
        if (canonical) continue
        const specPath = join(dir, entry.name)
        if (looksLikeDeltaSpec(readFileSync(specPath, 'utf8'))) misplaced.push(specPath)
      }
    }
  }
  for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive') continue
    walk(join(changesDir, entry.name), [entry.name])
  }
  return misplaced.sort()
}

const VALID_ADDED = [
  '## ADDED Requirements',
  '',
  '### Requirement: Alpha behavior',
  '',
  'The system SHALL do alpha.',
  '',
  '#### Scenario: Alpha runs',
  '',
  '- **WHEN** alpha is requested',
  '- **THEN** alpha runs'
].join('\n')

const VALID_MODIFIED = [
  '## MODIFIED Requirements',
  '',
  '### Requirement: Beta behavior',
  '',
  'The system SHALL do beta better.',
  '',
  '#### Scenario: Beta runs',
  '',
  '- **WHEN** beta is requested',
  '- **THEN** beta runs'
].join('\n')

const VALID_PREAMBLE = ['# Delta: alpha', '', VALID_ADDED].join('\n')

// Cada malformación medida contra `parseDeltaSpec`: todas producen errors > 0.
const INVALID_DELTAS = [
  [
    'prosa suelta dentro de la sección',
    [
      '## ADDED Requirements',
      '',
      'Prosa suelta fuera de cualquier requirement.',
      '',
      '### Requirement: Alpha behavior',
      '',
      'The system SHALL do alpha.'
    ].join('\n')
  ],
  [
    '### Requirement: sin título',
    ['## ADDED Requirements', '', '### Requirement:', '', 'The system SHALL do alpha.'].join('\n')
  ],
  [
    'sección desconocida',
    ['## BOGUS Requirements', '', '### Requirement: Alpha behavior', '', 'The system SHALL do alpha.'].join('\n')
  ],
  [
    'ADDED en singular',
    ['## ADDED Requirement', '', '### Requirement: Alpha behavior', '', 'The system SHALL do alpha.'].join('\n')
  ],
  [
    '### Requirement: indentado',
    ['## ADDED Requirements', '', ' ### Requirement: Alpha behavior', '', 'The system SHALL do alpha.'].join('\n')
  ]
]

test('acepta deltas canónicos con ADDED, MODIFIED y preámbulo H1', () => {
  assertDeltaValid(VALID_ADDED)
  assertDeltaValid(VALID_MODIFIED)
  assertDeltaValid(VALID_PREAMBLE)
  // Un segundo H1 dentro del cuerpo de una sección NO es malformación: el
  // parser lo acepta (errors === 0), así que no se usa como caso inválido.
  assertDeltaValid(
    VALID_ADDED.replace('- **THEN** alpha runs', '- **THEN** alpha runs\n\n# Segundo H1 dentro del cuerpo')
  )
})

test('rechaza las malformaciones estructurales medidas con el parser', () => {
  for (const [, text] of INVALID_DELTAS) {
    assertDeltaInvalid(text)
  }
})

test('la mutación de un delta válido pasa a inválido', () => {
  assertDeltaValid(VALID_ADDED)

  const brokenHeading = VALID_ADDED.replace('## ADDED Requirements', '## ADDED Requirement')
  assert.notEqual(brokenHeading, VALID_ADDED)
  assertDeltaInvalid(brokenHeading)

  const indented = VALID_ADDED.replace('### Requirement: Alpha behavior', ' ### Requirement: Alpha behavior')
  assert.notEqual(indented, VALID_ADDED)
  assertDeltaInvalid(indented)
})

test('collectActiveDeltas tolera cero changes activos', (t) => {
  const root = withRoot(t)
  mkdirSync(join(root, 'aspec', 'changes'), { recursive: true })
  assert.deepEqual(collectActiveDeltas(root), [])
})

test('collectActiveDeltas recorre un change con varias capabilities y luego N changes', (t) => {
  const root = withRoot(t)
  const first = writeDelta(root, join('aspec', 'changes', 'change-one', 'specs', 'cap-one', 'spec.md'))
  const second = writeDelta(root, join('aspec', 'changes', 'change-one', 'specs', 'cap-two', 'spec.md'))
  assert.deepEqual(collectActiveDeltas(root), [first, second].sort())

  const third = writeDelta(root, join('aspec', 'changes', 'change-two', 'specs', 'cap-three', 'spec.md'))
  assert.deepEqual(collectActiveDeltas(root), [first, second, third].sort())
})

test('collectActiveDeltas excluye archive por identidad y no por prefijo', (t) => {
  const root = withRoot(t)
  const active = writeDelta(root, join('aspec', 'changes', 'active-change', 'specs', 'cap', 'spec.md'))
  // `archive-legacy` empieza con "archive" pero no es el contenedor: se incluye.
  const legacy = writeDelta(root, join('aspec', 'changes', 'archive-legacy', 'specs', 'cap', 'spec.md'))

  const invalid = INVALID_DELTAS[2][1]
  assertDeltaInvalid(invalid)
  writeDelta(root, join('aspec', 'changes', 'archive', '2026-01-01-old', 'specs', 'cap', 'spec.md'), invalid)
  writeDelta(root, join('aspec', 'changes', 'archive', 'specs', 'cap', 'spec.md'), invalid)

  const deltas = collectActiveDeltas(root)
  assert.deepEqual(deltas, [active, legacy].sort())
  for (const deltaPath of deltas) {
    assert.ok(!deltaPath.replace(/\\/g, '/').includes('/archive/'), `path archivado: ${deltaPath}`)
  }
})

test('collectActiveDeltas falla cerrado si aspec/changes no existe', (t) => {
  const root = withRoot(t)
  assert.throws(
    () => collectActiveDeltas(root),
    (error) => error.code === 'ENOENT'
  )
})

test('collectActiveDeltas falla cerrado si aspec/changes no es un directorio', (t) => {
  const root = withRoot(t)
  mkdirSync(join(root, 'aspec'), { recursive: true })
  writeFileSync(join(root, 'aspec', 'changes'), '')
  // En win32, readdirSync sobre un archivo falla con ENOTDIR (verificado empíricamente).
  assert.throws(
    () => collectActiveDeltas(root),
    (error) => error && error.code === 'ENOTDIR'
  )
})

test('collectActiveDeltas falla cerrado si un spec.md presente no puede leerse', (t) => {
  const root = withRoot(t)
  // Un directorio llamado `spec.md` existe pero no es legible como archivo.
  const specPath = join(root, 'aspec', 'changes', 'broken-change', 'specs', 'cap', 'spec.md')
  mkdirSync(specPath, { recursive: true })

  const deltas = collectActiveDeltas(root)
  assert.deepEqual(deltas, [specPath])
  // El barrido lee cada delta colectado; el fallo de lectura se propaga (fail-closed).
  // En win32, readFileSync sobre un directorio falla con EISDIR (verificado empíricamente).
  assert.throws(
    () => readFileSync(deltas[0], 'utf8'),
    (error) => error && error.code === 'EISDIR'
  )
})

test('ningún delta activo del repositorio es rechazado por el parser', () => {
  // Sin conteo ni lista exacta: cero deltas activos es un estado válido.
  for (const deltaPath of collectActiveDeltas(REPO_ROOT)) {
    assert.ok(!deltaPath.replace(/\\/g, '/').includes('/archive/'), `delta archivado en el barrido: ${deltaPath}`)
    assert.ok(existsSync(deltaPath), `delta inexistente: ${deltaPath}`)
    assertDeltaValid(readFileSync(deltaPath, 'utf8'), deltaPath)
  }
})

// El guard es falla-cerrada: un `spec.md` válido fuera de la ruta canónica es un
// artefacto que el merge nunca leería. Se verifica con el mismo oráculo que el
// contenido es un delta real (no un archivo incidental).
test('collectMisplacedActiveSpecs detecta spec.md no canónicos bajo un change activo', (t) => {
  const root = withRoot(t)
  const canonical = writeDelta(root, join('aspec', 'changes', 'ok-change', 'specs', 'cap', 'spec.md'))
  const atSpecs = writeDelta(root, join('aspec', 'changes', 'ok-change', 'specs', 'spec.md'))
  const nested = writeDelta(root, join('aspec', 'changes', 'ok-change', 'specs', 'a', 'b', 'spec.md'))
  const atChangeRoot = writeDelta(root, join('aspec', 'changes', 'ok-change', 'spec.md'))

  assert.deepEqual(collectMisplacedActiveSpecs(root), [atSpecs, nested, atChangeRoot].sort())
  assert.ok(!collectMisplacedActiveSpecs(root).includes(canonical))
  for (const specPath of [atSpecs, nested, atChangeRoot]) {
    assertDeltaValid(readFileSync(specPath, 'utf8'), specPath)
  }
})

test('collectMisplacedActiveSpecs acepta la ruta canónica y la ausencia de spec.md', (t) => {
  const root = withRoot(t)
  writeDelta(root, join('aspec', 'changes', 'canonical-change', 'specs', 'cap', 'spec.md'))
  mkdirSync(join(root, 'aspec', 'changes', 'empty-change'), { recursive: true })
  assert.deepEqual(collectMisplacedActiveSpecs(root), [])

  mkdirSync(join(root, 'aspec', 'changes'), { recursive: true })
  assert.deepEqual(collectMisplacedActiveSpecs(root), [])
})

test('collectMisplacedActiveSpecs excluye archive por identidad y no por prefijo', (t) => {
  const root = withRoot(t)
  // `archive-legacy` no es el contenedor: un spec.md no canónico ahí sí se reporta.
  const legacy = writeDelta(root, join('aspec', 'changes', 'archive-legacy', 'specs', 'spec.md'))
  const archived = writeDelta(root, join('aspec', 'changes', 'archive', '2026-01-01-old', 'specs', 'cap', 'spec.md'))
  const archivedFlat = writeDelta(root, join('aspec', 'changes', 'archive', 'specs', 'cap', 'spec.md'))

  const misplaced = collectMisplacedActiveSpecs(root)
  assert.deepEqual(misplaced, [legacy])
  assert.ok(!misplaced.includes(archived))
  assert.ok(!misplaced.includes(archivedFlat))
})

test('collectMisplacedActiveSpecs ignora un spec.md incidental que no parece delta', (t) => {
  const root = withRoot(t)
  writeDelta(
    root,
    join('aspec', 'changes', 'notes-change', 'specs', 'notes', 'spec.md'),
    '# Notas\n\nTexto suelto que no es un delta spec.\n'
  )
  writeDelta(root, join('aspec', 'changes', 'notes-change', 'specs', 'spec.md'), 'fixture sin headings\n')
  assert.deepEqual(collectMisplacedActiveSpecs(root), [])
})

test('collectMisplacedActiveSpecs ignora un spec.md vacío fuera de la ruta canónica', (t) => {
  const root = withRoot(t)
  // `parseDeltaSpec('')` no devuelve errores, pero un archivo vacío no pretende ser un delta.
  const empty = writeDelta(root, join('aspec', 'changes', 'empty-spec-change', 'specs', 'spec.md'), '')
  const blank = writeDelta(root, join('aspec', 'changes', 'blank-spec-change', 'spec.md'), '   \n\t\n')
  assert.deepEqual(collectMisplacedActiveSpecs(root), [])
  assert.ok(!collectMisplacedActiveSpecs(root).includes(empty))
  assert.ok(!collectMisplacedActiveSpecs(root).includes(blank))
})

test('collectMisplacedActiveSpecs marca deltas reales mal ubicados', (t) => {
  const root = withRoot(t)
  // (b) delta valido fuera de la ruta canonica.
  const atSpecs = writeDelta(root, join('aspec', 'changes', 'ok-change', 'specs', 'spec.md'), VALID_ADDED)
  // (c) heading de delta con errores estructurales: el parser lo rechaza, pero
  // pretende ser un delta y debe fallar igual.
  const broken = INVALID_DELTAS[0][1]
  assertDeltaInvalid(broken)
  assert.match(broken, /^##\s+ADDED Requirements$/m)
  const withErrors = writeDelta(root, join('aspec', 'changes', 'broken-change', 'specs', 'a', 'b', 'spec.md'), broken)

  assert.deepEqual(collectMisplacedActiveSpecs(root), [atSpecs, withErrors].sort())
})

test('collectMisplacedActiveSpecs no marca la ruta canonica ni lo archivado', (t) => {
  const root = withRoot(t)
  writeDelta(root, join('aspec', 'changes', 'canonical-change', 'specs', 'cap', 'spec.md'))
  writeDelta(root, join('aspec', 'changes', 'archive', '2026-01-01-old', 'specs', 'cap', 'spec.md'))
  writeDelta(root, join('aspec', 'changes', 'archive', 'specs', 'spec.md'))
  assert.deepEqual(collectMisplacedActiveSpecs(root), [])
})

test('ningún spec.md activo del repositorio vive fuera de specs/<capability>/spec.md', () => {
  // Estado real de hoy: verde. Un spec.md mal ubicado rompe la suite antes del archive.
  assert.deepEqual(collectMisplacedActiveSpecs(REPO_ROOT), [])
})
