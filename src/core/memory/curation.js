import { resolveNodeRefs } from './engine.js'

// Curaduria read-only: compone las primitivas del engine y no duplica SQL, parser,
// resolvedor ni la normalizacion de duplicados exactos. No abre, cierra, migra,
// snapshotea ni escribe la base: recibe un engine ya abierto y la raiz del repo.

function compareKeys(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

// `commit:` y `workitem:` no tienen resolvedor local: se reportan aparte y nunca
// como rotas. La clasificacion la decide `verifiable` del resolver, no una lista
// de kinds duplicada aca.

// Display de una ref que no resolvio: el resolvedor no expone la forma
// normalizada de una ref rota. Solo dos transformaciones de display: separadores
// `\` -> `/` y quitar el sufijo `:line`. No se normaliza ni se colapsan `.`/`..`:
// se muestra el texto declarado en forma POSIX. Resolver sigue siendo exclusivo
// de `resolveNodeRefs`.
function renderBrokenRef(ref) {
  if (ref.kind !== 'path') return ref.raw
  const value = String(ref.raw).slice('path:'.length).replace(/:\d+$/, '')
  return `path:${value.replace(/\\/g, '/')}`
}

export function curateMemory(engine, { projectRoot = null } = {}) {
  if (!engine || typeof engine.listNodes !== 'function' || typeof engine.consolidate !== 'function') {
    throw new Error('curateMemory: se requiere un engine de memoria ya abierto')
  }

  // Orden total: memory_key ascendente sin localeCompare. El orden de la consulta
  // (`listNodes`) no participa.
  const nodes = engine.listNodes({ status: 'active' })
    .map((node) => ({ memory_key: String(node.memory_key), content: String(node.content ?? '') }))
    .sort((a, b) => compareKeys(a.memory_key, b.memory_key))

  // Los duplicados exactos comparten `content`: cada bloque se resuelve una sola
  // vez por corrida (memoizacion por content, no por nodo).
  const resolvedByContent = new Map()
  const brokenRefs = []
  const unverifiable = []

  for (const node of nodes) {
    let resolved = resolvedByContent.get(node.content)
    if (!resolved) {
      resolved = resolveNodeRefs({ content: node.content, projectRoot })
      resolvedByContent.set(node.content, resolved)
    }
    // Bloque repetido o ref invalida: la entrada usa la linea ofensora como ref,
    // omite `kind` y conserva el motivo gramatical del diagnostico vigente.
    if (resolved.blocks) {
      brokenRefs.push({ memory_key: node.memory_key, ref: 'refs:', reason: 'inválido (gramática)' })
      continue
    }
    if (resolved.error) {
      brokenRefs.push({ memory_key: node.memory_key, ref: resolved.error, reason: 'inválido (gramática)' })
      continue
    }
    for (const ref of resolved.refs) {
      if (ref.verifiable === false) {
        unverifiable.push({ memory_key: node.memory_key, kind: ref.kind, ref: ref.raw, reason: 'no verificable' })
        continue
      }
      // Sin raiz de proyecto la ref tambien se reporta: no se descarta en silencio.
      if (ref.ok) continue
      brokenRefs.push({
        memory_key: node.memory_key,
        kind: ref.kind,
        ref: renderBrokenRef(ref),
        reason: ref.reason
      })
    }
  }

  // La definicion de duplicado exacto, la cadena de canonico y su orden son las
  // de `consolidate({ dryRun: true })`: no se reimplementan. El dry-run no escribe.
  // La curaduria no reporta near-duplicates: se omite el escaneo O(n^2).
  const { exactGroups } = engine.consolidate({ dryRun: true, includeNearDuplicates: false })
  const exactDuplicates = exactGroups.map((group) => ({
    canonical: group.canonical,
    // Nodos NO canonicos del grupo; el canonico se reporta aparte en `canonical`.
    // Un grupo exacto siempre tiene al menos uno: `consolidate` exige >= 2 nodos.
    superseded: [...group.superseded]
  }))

  return { status: 'ok', brokenRefs, unverifiable, exactDuplicates }
}
