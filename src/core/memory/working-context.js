import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { formatTopologyBlock } from './engine.js'
import { readTopologySummary } from '../discovery.js'

// Invariante "memoria activa -> working-context.md": render desde el engine vivo
// (una sola conexion, sin reabrir la DB) y persistencia del artefacto derivado.

export function workingContextPath(projectRoot) {
  return join(projectRoot, '.ancleto', 'working-context.md')
}

// Trigger del refresh sobre el resultado completo de `recordNode` `{ node, superseded }`:
// (a) contribucion directa: el nodo entrante es rule + project (alimenta el bloque);
// (b) efecto por supersesion: `memory_key` es identidad transversal (supersede sin filtrar
//     type/scope), asi que cualquier supersesion pudo retirar del bloque una rule de scope project.
// El over-refresh (supersesion que no altera el bloque) es intencional: el engine solo expone
// `{ node, superseded }` y el unico consumidor lee el archivo una vez por sesion.
export function shouldRefreshWorkingContext(result) {
  return !!result && ((result.node.type === 'rule' && result.node.scope === 'project') || result.superseded > 0)
}

// Deriva la raiz del proyecto desde la ubicacion de la DB (no desde el cwd del proceso).
// Prioriza el primer ancestro con `.ancletorc`; si no hay, usa el candidato derivado de
// `dbPath` mientras exista el layout `.ancleto/`; si no, no hay raiz (refresh best-effort).
export function resolveMemoryProjectRoot(dbPath) {
  if (!dbPath) return null
  const candidate = dirname(dirname(dbPath))
  for (let dir = candidate; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.ancletorc'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
  }
  if (existsSync(join(candidate, '.ancleto'))) return candidate
  return null
}

// Escritura sincrona del bloque ya renderizado (mismo layout y salto final que
// `writeWorkingContext`). Unico dueno del artefacto derivado; la composicion del
// bloque vive en quien lo produce (engine vivo o topologia dia-cero).
export function writeWorkingContextBlock(projectRoot, block) {
  if (!projectRoot) return null
  const out = workingContextPath(projectRoot)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, block === null ? '' : block + '\n')
  return block === null ? null : out
}

// Render del bloque del working-context: desde el engine vivo si se provee, o
// dia-cero (solo topologia) sin abrir el motor. Unico camino de render, compartido
// por el refresh de lifecycle y `memory context`; cada consumidor decide el destino.
export function renderWorkingContextBlock(engine, projectRoot, scope = 'project') {
  if (engine) return engine.buildWorkingContext(scope, undefined, projectRoot)
  return formatTopologyBlock(readTopologySummary(projectRoot))
}

// Render con la raiz explicita (topologia + reglas) y escritura sincrona del archivo:
// paridad con `block + '\n'` y `''` cuando el bloque es null. Retorna el path escrito
// o null si no hay bloque/raiz.
export function writeWorkingContext(engine, projectRoot, scope = 'project') {
  if (!projectRoot) return null
  const block = renderWorkingContextBlock(engine, projectRoot, scope)
  return writeWorkingContextBlock(projectRoot, block)
}

// Comparacion tolerante para decidir frescura/reescritura: normaliza CRLF, espacios
// finales por linea y el salto final (o ausencia de contenido). No persigue diferencias
// semanticas, solo variaciones triviales de render.
function normalizeBlock(text) {
  return (text === null ? '' : String(text))
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

function readWorkingContextFile(projectRoot) {
  const out = workingContextPath(projectRoot)
  return existsSync(out) ? readFileSync(out, 'utf8') : null
}

// Estado de frescura del artefacto derivado respecto de la memoria activa (read-only).
// - `ausente`: hay un bloque que inyectar pero el archivo no existe.
// - `desactualizado`: el archivo existe y difiere del bloque esperado.
// - `ok`: coincide, o no hay nada que inyectar y el archivo esta vacio/ausente.
export function checkWorkingContextFreshness(engine, projectRoot, scope = 'project') {
  if (!projectRoot) return { state: 'ausente', expected: null, actual: null }
  const expected = renderWorkingContextBlock(engine, projectRoot, scope)
  const actual = readWorkingContextFile(projectRoot)
  if (actual === null) {
    return { state: expected === null ? 'ok' : 'ausente', expected, actual }
  }
  const canonical = expected === null ? '' : expected + '\n'
  const state = normalizeBlock(actual) === normalizeBlock(canonical) ? 'ok' : 'desactualizado'
  return { state, expected, actual }
}

// Refresh compare-based para superficies de escritura que ya tienen un engine abierto
// (p. ej. `ancleto memory import`): reescribe el artefacto solo si el bloque renderizado
// difiere del contenido en disco. Evita reescrituras (y la creacion de un archivo vacio)
// cuando la escritura no altero el bloque. Devuelve el path escrito o null si no cambio.
export function refreshWorkingContextOnWrite(engine, projectRoot, scope = 'project') {
  if (!projectRoot) return null
  const expected = renderWorkingContextBlock(engine, projectRoot, scope)
  const actual = readWorkingContextFile(projectRoot)
  const canonical = expected === null ? '' : expected + '\n'
  if (actual === null && expected === null) return null
  if (actual !== null && normalizeBlock(actual) === normalizeBlock(canonical)) return null
  return writeWorkingContextBlock(projectRoot, expected)
}
