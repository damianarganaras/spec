import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { TOPOLOGY_IGNORED_DIRS } from './discovery.js'

// Mecanismo del affected-set: clausura transitiva de DEPENDIENTES sobre el grafo
// de imports del proyecto, sembrada por los archivos tocados. Zero-dep y
// determinista (mismo estado + misma semilla => mismo conjunto).
//
// Cobertura: formas estáticas de `import`, `import ... from`, `export ... from`
// y las llamadas `import(...)` / `require(...)` cuyo argumento es un literal
// puro (string o template sin expresiones), sobre .js/.mjs/.cjs/.ts/.tsx.
// Alcance escaneado: sólo las formas de llamada `import(` / `require(`. Otras
// formas de invocar un import/require dinámico (`require?.(…)`, `(require)(…)`,
// el acceso computed `obj['require'](…)`) NO se escanean ni se reportan: se
// delegan al mecanismo declarado por el proyecto. El acceso por miembro
// `obj.require(…)` sí se matchea léxicamente (`\brequire\b` sin lookbehind):
// sobre-inclusión conservadora, en la dirección segura, nunca un hueco.
// Acotación por diseño, no un hueco.
// Clasificación conservadora por ARGUMENTO, no por contenido de la llamada:
// sólo una llamada con literal puro —tras espacios y comentarios— seguido de
// `)` se trata como estática; cualquier otro argumento (expresión pelada,
// `'./x' + y`, template con `${}`, paréntesis, etc.) se reporta como inconcluso
// (`unresolved`), nunca en silencio. Los especificadores NO relativos (paquetes,
// builtins, alias de paths) son externos al grafo y no se resuelven; se cuentan
// como dato (`externalCount`) para hacer visible la frontera, sin tratarlos como
// warning ni error. Los relativos que no resuelven también se reportan como
// inconclusos.

export const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx']

// Formas estáticas con specifier literal inline (no son llamadas): el argumento
// de las llamadas `import(...)` / `require(...)` se clasifica aparte.
const SPECIFIER_PATTERNS = [
  /\bimport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g
]

// Únicas palabras de llamada escaneadas: `import` y `require`. El hueco entre la
// palabra y el `(` se recorre con skipTrivia (espacios + comentarios), de modo que
// `require/*c*/('x')` e `import/*c*/('x')` también entran al clasificador. No son
// llamadas —y se ignoran— `import.meta`, el `import` estático y `require.resolve(`,
// porque tras la palabra (saltando trivia) el próximo carácter significativo no es `(`.
const CALL_FORMS = [
  { re: /\bimport\b/g, kind: 'import' },
  { re: /\brequire\b/g, kind: 'require' }
]

const toPosix = (p) => String(p).replace(/\\/g, '/')

export function isSourceFile(name) {
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

// Recorre rootDir juntando archivos fuente, respetando los ignores del proyecto
// (los mismos que usa el discovery map).
export function collectSourceFiles(rootDir, ignored = TOPOLOGY_IGNORED_DIRS) {
  const ignoredSet = new Set(ignored)
  const out = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (ignoredSet.has(e.name)) continue
        walk(join(dir, e.name))
      } else if (e.isFile() && isSourceFile(e.name)) {
        out.push(join(dir, e.name))
      }
    }
  }
  walk(rootDir)
  out.sort()
  return out
}

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'

// Avanza sobre espacios y comentarios (`/* */` y `//`). Devuelve el índice del
// próximo carácter significativo, o null si un comentario de bloque no cierra.
function skipTrivia(content, i) {
  let j = i
  while (j < content.length) {
    const c = content[j]
    if (isSpace(c)) {
      j += 1
      continue
    }
    if (c === '/' && content[j + 1] === '*') {
      const end = content.indexOf('*/', j + 2)
      if (end === -1) return null
      j = end + 2
      continue
    }
    if (c === '/' && content[j + 1] === '/') {
      const end = content.indexOf('\n', j + 2)
      j = end === -1 ? content.length : end + 1
      continue
    }
    break
  }
  return j
}

// Lee un string literal de comilla simple o doble desde su apertura; null si no
// cierra.
function readQuoted(content, i, quote) {
  let value = ''
  let j = i + 1
  while (j < content.length) {
    const c = content[j]
    if (c === '\\') {
      value += content[j + 1] ?? ''
      j += 2
      continue
    }
    if (c === quote) return { value, next: j + 1 }
    value += c
    j += 1
  }
  return null
}

// Lee un template literal; null si no cierra o si contiene una expresión `${}`.
function readTemplate(content, i) {
  let value = ''
  let j = i + 1
  while (j < content.length) {
    const c = content[j]
    if (c === '\\') {
      value += content[j + 1] ?? ''
      j += 2
      continue
    }
    if (c === '`') return { value, next: j + 1 }
    if (c === '$' && content[j + 1] === '{') return null
    value += c
    j += 1
  }
  return null
}

// Clasifica el argumento de una llamada cuyo `(` está en openParen. Devuelve el
// specifier si —tras espacios y comentarios— el argumento es un string o
// template sin expresión seguido de `)`; null en cualquier otro caso (argumento
// no literal), de modo que el caso se reporte como inconcluso.
function staticCallSpecifier(content, openParen) {
  const start = skipTrivia(content, openParen + 1)
  if (start === null || start >= content.length) return null
  const quote = content[start]
  let literal = null
  if (quote === "'" || quote === '"') literal = readQuoted(content, start, quote)
  else if (quote === '`') literal = readTemplate(content, start)
  if (literal === null) return null
  const closing = skipTrivia(content, literal.next)
  if (closing === null || content[closing] !== ')') return null
  return literal.value
}

// Devuelve los especificadores estáticos hallados (import/export … from,
// `import '…'` y las llamadas `import(...)` / `require(...)` con literal puro) y
// el conteo de llamadas con argumento no literal, por forma.
export function extractSpecifiers(content) {
  const specifiers = []
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0
    let m
    while ((m = pattern.exec(content)) !== null) {
      specifiers.push(m[1])
    }
  }
  let dynamicUnresolved = 0
  let dynamicRequireUnresolved = 0
  for (const { re, kind } of CALL_FORMS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(content)) !== null) {
      // Cierra el hueco palabra→`(` saltando espacios y comentarios: una palabra
      // `import`/`require` sólo es una llamada si el próximo carácter significativo
      // es `(`; si no (`.`, `{`, `'`, EOF…), no es una llamada y se ignora.
      const openParen = skipTrivia(content, m.index + m[0].length)
      if (openParen === null || content[openParen] !== '(') continue
      const specifier = staticCallSpecifier(content, openParen)
      if (specifier !== null) {
        specifiers.push(specifier)
      } else if (kind === 'import') {
        dynamicUnresolved += 1
      } else {
        dynamicRequireUnresolved += 1
      }
    }
  }
  return { specifiers, dynamicUnresolved, dynamicRequireUnresolved }
}

function resolveRelative(fromFile, spec, fileSet) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null
  const base = join(dirname(fromFile), spec)
  const candidates = [base]
  for (const ext of SOURCE_EXTENSIONS) candidates.push(base + ext)
  for (const ext of SOURCE_EXTENSIONS) candidates.push(join(base, 'index' + ext))
  for (const c of candidates) {
    if (fileSet.has(c)) return c
  }
  return null
}

// Grafo de imports: aristas src -> deps (relativas, posix) y lista de casos
// inconclusos. `sources` son los nodos del grafo.
export function buildImportGraph(rootDir, ignored = TOPOLOGY_IGNORED_DIRS) {
  const files = collectSourceFiles(rootDir, ignored)
  const fileSet = new Set(files)
  const edges = new Map()
  const unresolved = []
  let externalCount = 0
  for (const abs of files) {
    const rel = toPosix(relative(rootDir, abs))
    const deps = new Set()
    let content
    try {
      content = readFileSync(abs, 'utf8')
    } catch {
      edges.set(rel, deps)
      continue
    }
    const { specifiers, dynamicUnresolved, dynamicRequireUnresolved } = extractSpecifiers(content)
    for (const spec of specifiers) {
      const resolved = resolveRelative(abs, spec, fileSet)
      if (resolved) deps.add(toPosix(relative(rootDir, resolved)))
      else if (spec.startsWith('./') || spec.startsWith('../')) {
        unresolved.push({ file: rel, specifier: spec })
      } else {
        // No relativo no resuelto => externo (paquete/builtin/alias): fuera del
        // grafo. Se cuenta como dato, no se resuelve ni se reporta inconcluso.
        externalCount += 1
      }
    }
    if (dynamicUnresolved > 0) {
      unresolved.push({ file: rel, specifier: 'import(<dynamic>)' })
    }
    if (dynamicRequireUnresolved > 0) {
      unresolved.push({ file: rel, specifier: 'require(<dynamic>)' })
    }
    edges.set(rel, deps)
  }
  return { edges, sources: new Set(edges.keys()), unresolved, externalCount }
}

function normalizeSeed(rootDir, seed) {
  return toPosix(relative(rootDir, resolve(rootDir, seed)))
}

// affected-set = semilla + clausura transitiva de dependientes. Incluye siempre
// los archivos sembrados, aunque no sean nodos del grafo (p. ej. un cambio que
// sólo toca documentación).
export function computeAffectedSet({ rootDir, seeds, ignored = TOPOLOGY_IGNORED_DIRS }) {
  const { edges, unresolved, externalCount } = buildImportGraph(rootDir, ignored)
  const dependents = new Map()
  for (const [file, deps] of edges) {
    for (const dep of deps) {
      if (!dependents.has(dep)) dependents.set(dep, new Set())
      dependents.get(dep).add(file)
    }
  }
  const seedSet = new Set(seeds.map((s) => normalizeSeed(rootDir, s)))
  const affected = new Set(seedSet)
  const queue = [...seedSet]
  while (queue.length > 0) {
    const cur = queue.shift()
    for (const dep of dependents.get(cur) || []) {
      if (!affected.has(dep)) {
        affected.add(dep)
        queue.push(dep)
      }
    }
  }
  unresolved.sort((a, b) => a.file.localeCompare(b.file) || a.specifier.localeCompare(b.specifier))
  return {
    seeds: [...seedSet].sort(),
    affected: [...affected].sort(),
    unresolved,
    externalCount
  }
}
