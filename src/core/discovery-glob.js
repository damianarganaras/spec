// Traduce un glob a regex por tokens, con precedencia `**/`, `/**`, `**`, `*`, `?`.
// `*` y `?` nunca cruzan `/`: las rutas relativas del discovery usan `/` aun en Windows.
// El `RegExp` compilado se cachea por string exacto de glob: los patrones son fijos
// durante la corrida y cada ruta evaluada recompilaba el mismo glob (globs x rutas).
const COMPILED_GLOBS = new Map()

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function compileGlob(glob) {
  const cached = COMPILED_GLOBS.get(glob)
  if (cached) return cached
  let re = ''
  for (let i = 0; i < glob.length;) {
    if (glob.startsWith('**/', i)) {
      re += '(?:.*/)?'
      i += 3
    } else if (glob.startsWith('/**', i)) {
      re += '(?:/.*)?'
      i += 3
    } else if (glob.startsWith('**', i)) {
      re += '.*'
      i += 2
    } else if (glob[i] === '*') {
      re += '[^/]*'
      i += 1
    } else if (glob[i] === '?') {
      re += '[^/]'
      i += 1
    } else {
      re += escapeRe(glob[i])
      i += 1
    }
  }
  const compiled = glob.includes('**') ? new RegExp(`^${re}$`) : new RegExp(`^${re}(/|$)`)
  COMPILED_GLOBS.set(glob, compiled)
  return compiled
}

export function matchesGlob(rel, glob) {
  return compileGlob(glob).test(rel)
}
