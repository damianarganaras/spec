import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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

// Render desde el engine vivo con la raiz explicita (topologia + salida) y escritura
// sincrona del archivo: paridad con `block + '\n'` y `''` cuando el bloque es null.
// Retorna el path escrito o null si no hay bloque/raiz.
export function writeWorkingContext(engine, projectRoot, scope = 'project') {
  if (!projectRoot) return null
  const block = engine.buildWorkingContext(scope, undefined, projectRoot)
  const out = workingContextPath(projectRoot)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, block === null ? '' : block + '\n')
  return block === null ? null : out
}
