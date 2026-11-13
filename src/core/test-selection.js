import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildImportGraph, computeAffectedSet } from './affected-set.js'
import { matchesGlob } from './discovery-glob.js'

// Plan determinista de selección de tests sobre el affected-set. El grafo de
// imports sólo ve aristas estáticas; las suites que spawnean el CLI o leen
// markdown/src como texto quedan fuera por construcción. El manifiesto cerrado
// `test/affected-tests.json` declara esos acoplamientos no-import. El gate es
// fail-closed: si el manifiesto no cubre todo el universo o el cierre tiene
// imports irresolubles, `complete` es false y el consumidor corre la suite
// completa declarada en vez de una selección parcial.
//
// Read-only: no escribe, no abre `.ancleto/memory.db` y no usa la red.

export const TEST_GLOB = 'test/*.test.js'
export const TEST_MANIFEST_PATH = 'test/affected-tests.json'

const toPosix = (p) => String(p).replace(/\\/g, '/')

// U: archivos bajo test/ que matchean el glob declarado `test/*.test.js`
// (hijos directos, no recursivo). Rutas repo-relative posix y ordenadas.
function collectTestFiles(rootDir) {
  if (!rootDir) return []
  let entries
  try {
    entries = readdirSync(join(rootDir, 'test'), { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.test.js')) out.push(`test/${entry.name}`)
  }
  return out.sort()
}

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0

function isStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isRepoRelativePosix(value) {
  return isNonEmptyString(value) &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !/^[A-Za-z]:/.test(value)
}

// Valida el esquema version 1 contra el universo U. Cualquier ruta declarada
// fuera de U invalida el manifiesto (no puede seleccionar lo que no existe).
function validateManifest(data, universe) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { status: 'invalid' }
  if (data.version !== 1) return { status: 'invalid' }
  const always = data.always === undefined ? [] : data.always
  const couplings = data.couplings === undefined ? [] : data.couplings
  if (!isStringArray(always) || !Array.isArray(couplings)) return { status: 'invalid' }
  for (const path of always) {
    if (!isRepoRelativePosix(path) || !universe.has(path)) return { status: 'invalid' }
  }
  const parsed = []
  for (const coupling of couplings) {
    if (!coupling || typeof coupling !== 'object' || Array.isArray(coupling)) return { status: 'invalid' }
    const { trigger, tests, reason } = coupling
    if (!isStringArray(trigger) || !isStringArray(tests)) return { status: 'invalid' }
    if (!isNonEmptyString(reason) || reason.trim() === '') return { status: 'invalid' }
    if (trigger.some((glob) => glob.includes('\\'))) return { status: 'invalid' }
    for (const path of tests) {
      if (!isRepoRelativePosix(path) || !universe.has(path)) return { status: 'invalid' }
    }
    parsed.push({ trigger: [...trigger], tests: [...tests], reason })
  }
  return { status: 'ok', manifest: { version: 1, always: [...always], couplings: parsed } }
}

function readManifest(rootDir, universe) {
  if (!rootDir) return { status: 'missing' }
  let raw
  try {
    raw = readFileSync(join(rootDir, TEST_MANIFEST_PATH), 'utf8')
  } catch {
    return { status: 'missing' }
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return { status: 'invalid' }
  }
  return validateManifest(data, universe)
}

// `manifest-gap`: un test de U cuyo cierre transitivo de dependencias no toca
// ningún archivo bajo src/ nunca puede entrar por la clausura del grafo; si
// tampoco está declarado en el manifiesto, el plan no puede clasificarlo.
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

export function planTestSelection(input = {}) {
  const { rootDir, seeds, graph } = input
  const universe = Array.isArray(input.testFiles)
    ? [...new Set(input.testFiles.map(toPosix))].sort()
    : collectTestFiles(rootDir)
  const universeSet = new Set(universe)

  let manifestStatus
  if (Object.hasOwn(input, 'manifest')) {
    if (input.manifest === null) manifestStatus = { status: 'missing' }
    else if (input.manifest && typeof input.manifest === 'object') {
      manifestStatus = validateManifest(input.manifest, universeSet)
    } else manifestStatus = { status: 'invalid' }
  } else {
    manifestStatus = readManifest(rootDir, universeSet)
  }

  const reasons = new Set()
  if (universe.length === 0) reasons.add('test-glob-missing')
  if (manifestStatus.status === 'missing') reasons.add('manifest-missing')
  else if (manifestStatus.status === 'invalid') reasons.add('manifest-invalid')
  const manifestOk = manifestStatus.status === 'ok'
  const declaration = manifestOk ? manifestStatus.manifest : { always: [], couplings: [] }

  let graphState = graph
  const ensureGraph = () => {
    if (!graphState) {
      graphState = rootDir
        ? buildImportGraph(rootDir)
        : { edges: new Map(), sources: new Set(), unresolved: [], externalCount: 0 }
    }
    return graphState
  }

  let affectedList = Array.isArray(input.affected) ? input.affected.map(toPosix) : null
  let unresolvedList = Array.isArray(input.unresolved) ? input.unresolved : null
  if (affectedList === null && Array.isArray(seeds) && rootDir) {
    const computed = computeAffectedSet({ rootDir, seeds })
    affectedList = computed.affected
    if (unresolvedList === null) unresolvedList = computed.unresolved
  }
  if (affectedList === null) affectedList = []
  if (manifestOk) ensureGraph()
  if (unresolvedList === null) unresolvedList = ensureGraph().unresolved

  const affectedSet = new Set(affectedList)
  const unresolvedFiles = new Set(unresolvedList.map((entry) => toPosix(entry.file)))
  const selected = new Set()

  // (1) tests de U que ya figuran en el affected-set.
  for (const test of universe) {
    if (affectedSet.has(test)) selected.add(test)
  }
  // (2) always: suites sin arista que deben correr para toda semilla.
  for (const test of declaration.always) selected.add(test)
  // (3) couplings cuyo trigger interseca el affected-set.
  for (const coupling of declaration.couplings) {
    const hit = affectedList.some((file) => coupling.trigger.some((glob) => matchesGlob(file, glob)))
    if (hit) {
      for (const test of coupling.tests) selected.add(test)
    }
  }
  // (4) tests con imports irresolubles: se seleccionan por precaución.
  for (const test of universe) {
    if (unresolvedFiles.has(test)) selected.add(test)
  }

  // (5) unresolved-in-closure: un archivo de affected con imports inconclusos
  // vuelve no confiable el cierre entero.
  if (affectedList.some((file) => unresolvedFiles.has(file))) {
    reasons.add('unresolved-in-closure')
  }

  // (6) manifest-gap: tests no declarados que el grafo nunca puede seleccionar.
  if (manifestOk) {
    const edges = ensureGraph().edges
    const declared = new Set(declaration.always)
    for (const coupling of declaration.couplings) {
      for (const test of coupling.tests) declared.add(test)
    }
    for (const test of universe) {
      if (declared.has(test)) continue
      if (!closureTouchesSrc(test, edges)) {
        reasons.add('manifest-gap')
        break
      }
    }
  }

  const selectedList = [...selected].sort()
  const excluded = universe
    .filter((test) => !selected.has(test))
    .map((file) => ({ file, reason: 'not-affected' }))
  const reasonsList = [...reasons].sort()

  return {
    complete: reasonsList.length === 0,
    reasons: reasonsList,
    selected: selectedList,
    excluded
  }
}
