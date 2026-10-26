import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { release } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Invariante "entorno de la maquina -> machine-env.md": unico dueno de la deteccion,
// el render, la escritura y la exclusion local del clon. Ni el ciclo de vida ni `check`
// reimplementan formato, comparacion o resolucion de rutas de git.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ARTIFACT_REL = '.ancleto/machine-env.md'
const TOOL_ORDER = ['rg', 'node', 'npm', 'git', 'python']
const POSIX_SHELLS = new Set(['bash', 'zsh', 'sh', 'dash'])

export function machineEnvPath(projectRoot) {
  return join(projectRoot, '.ancleto', 'machine-env.md')
}

function readAncletoVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

function runGit(cwd, args) {
  try {
    const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
    return {
      ok: !res.error && res.status === 0,
      status: res.status,
      stdout: res.stdout || '',
      error: res.error || null
    }
  } catch (error) {
    return { ok: false, status: null, stdout: '', error }
  }
}

// Shell del proceso que ejecuta `init`, no el de la tool de bash del runtime. Ante
// ausencia o contradiccion se declara `unknown`; nunca se sondea un shell ejecutandolo.
// `ComSpec` no se lee: siempre existe en Windows y no distingue el shell en ejecucion.
function detectShell({ platform, env }) {
  if (platform === 'win32') {
    const msystem = env.MSYSTEM || ''
    if (/MINGW|MSYS|UCRT|CLANG/i.test(msystem)) return { shell: 'bash', source: 'MSYSTEM' }
    if (env.CYGWIN) return { shell: 'bash', source: 'CYGWIN' }
    const psm = env.PSModulePath || ''
    const powerShell7 = /PowerShell[\\/]7/i.test(psm)
    const legacy = /WindowsPowerShell/i.test(psm)
    if (powerShell7) return { shell: 'PowerShell 7', source: 'PSModulePath' }
    if (env.PROMPT) return { shell: 'cmd', source: 'PROMPT' }
    const shellName = env.SHELL ? basename(env.SHELL) : ''
    const posixShell = POSIX_SHELLS.has(shellName)
    if (posixShell && legacy) return { shell: 'unknown', source: 'unknown' }
    if (posixShell) return { shell: shellName, source: 'SHELL' }
    if (legacy) return { shell: 'Windows PowerShell 5.1', source: 'PSModulePath' }
    return { shell: 'unknown', source: 'unknown' }
  }
  if (env.WSL_DISTRO_NAME) return { shell: 'bash/WSL', source: 'WSL_DISTRO_NAME' }
  if (env.WSL_INTEROP) return { shell: 'bash/WSL', source: 'WSL_INTEROP' }
  const shellName = env.SHELL ? basename(env.SHELL) : ''
  if (POSIX_SHELLS.has(shellName)) return { shell: shellName, source: 'SHELL' }
  return { shell: 'unknown', source: 'unknown' }
}

// Fin de linea: primero el atributo git del path del artefacto, despues la configuracion
// de git y, si no hay repo/configuracion, la convencion de plataforma. La fuente declara
// el criterio que decidio.
function detectEol({ platform, cwd }) {
  const platformDefault = platform === 'win32' ? 'crlf' : 'lf'
  const repo = runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (!repo.ok || repo.stdout.trim() !== 'true') return { eol: platformDefault, source: 'platform-default' }
  const attr = runGit(cwd, ['check-attr', 'eol', '--', ARTIFACT_REL])
  if (attr.ok) {
    const match = /:\s*eol:\s*(\S+)/.exec(attr.stdout)
    const attrValue = match ? match[1].toLowerCase() : ''
    if (attrValue === 'lf' || attrValue === 'crlf') return { eol: attrValue, source: 'gitattributes' }
  }
  const coreEol = runGit(cwd, ['config', '--get', 'core.eol'])
  const eolValue = coreEol.ok ? coreEol.stdout.trim().toLowerCase() : ''
  if (eolValue === 'crlf' || eolValue === 'lf') return { eol: eolValue, source: 'core.eol' }
  const autocrlf = runGit(cwd, ['config', '--get', 'core.autocrlf'])
  const autocrlfValue = autocrlf.ok ? autocrlf.stdout.trim().toLowerCase() : ''
  if (autocrlfValue === 'true') return { eol: 'crlf', source: 'core.autocrlf' }
  if (autocrlfValue === 'input' || autocrlfValue === 'false') return { eol: 'lf', source: 'core.autocrlf' }
  return { eol: platformDefault, source: 'platform-default' }
}

function isExecutableFile(filePath, platform) {
  try {
    if (!statSync(filePath).isFile()) return false
    if (platform !== 'win32') accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

// Disponibilidad por busqueda en PATH (con PATHEXT en Windows): no se ejecutan binarios
// ni se piden versiones. El valor de PATH nunca se renderiza.
function findExecutable(name, { pathValue, pathext, platform }) {
  if (!pathValue) return false
  const separator = platform === 'win32' ? ';' : ':'
  const dirs = pathValue.split(separator).map((dir) => dir.replace(/^"|"$/g, '')).filter(Boolean)
  const exts = platform === 'win32'
    ? ['', ...(pathext || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean).map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))]
    : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      if (isExecutableFile(join(dir, name + ext), platform)) return true
    }
  }
  return false
}

function fallbackFor(name, platform) {
  switch (name) {
    case 'rg':
      return platform === 'win32' ? 'Select-String' : 'grep -R'
    case 'node':
      return 'nodejs o el binario absoluto del runtime'
    case 'npm':
      return 'pnpm o yarn si existen'
    case 'git':
      return 'ninguno (reportar)'
    case 'python':
      return platform === 'win32' ? 'py' : 'python3'
    default:
      return 'ninguno'
  }
}

// `overrides` es solo una costura de test (snapshot de plataforma, entorno y PATH); en
// produccion se omite y se lee el proceso. No es configuracion publica ni se expone en CLI.
export function detectMachineFacts(overrides = {}) {
  const platform = overrides.platform || process.platform
  const env = overrides.env || process.env
  const osRelease = overrides.osRelease ?? release()
  const arch = overrides.arch || process.arch
  const cwd = overrides.cwd || process.cwd()
  const pathValue = overrides.path ?? env.PATH ?? env.Path ?? ''
  const pathext = overrides.pathext ?? env.PATHEXT ?? ''
  const shell = detectShell({ platform, env })
  const eol = detectEol({ platform, cwd })
  const tools = TOOL_ORDER.map((name) => {
    const available = findExecutable(name, { pathValue, pathext, platform })
    return { name, available, fallback: available ? null : fallbackFor(name, platform) }
  })
  return {
    platform,
    osRelease: String(osRelease),
    arch,
    shell: shell.shell,
    shell_source: shell.source,
    eol: eol.eol,
    eol_source: eol.source,
    tools,
    ancletoVersion: readAncletoVersion()
  }
}

export function renderMachineEnv(facts, { generatedAt } = {}) {
  const stamp = generatedAt || new Date().toISOString()
  const lines = [
    '# Machine Environment',
    '',
    '> Artefacto derivado y local: no editar a mano.',
    '> Se regenera en `ancleto init`, `ancleto install --project` y `ancleto upgrade`.',
    '> `generated_at` es la fecha del ultimo cambio de hechos, no la de la ultima corrida.',
    '> El shell declarado proviene del proceso que ejecuta `init`, no de la tool de bash del runtime.',
    '',
    `- generated_at: ${stamp}`,
    `- ancleto: ${facts.ancletoVersion || 'unknown'}`,
    '',
    '## Platform',
    '',
    `- platform: ${facts.platform || 'unknown'}`,
    `- os_release: ${facts.osRelease || 'unknown'}`,
    `- arch: ${facts.arch || 'unknown'}`,
    '',
    '## Shell',
    '',
    `- shell: ${facts.shell || 'unknown'}`,
    `- shell_source: ${facts.shell_source || 'unknown'}`,
    '',
    '## Line endings',
    '',
    `- eol: ${facts.eol || 'unknown'}`,
    `- eol_source: ${facts.eol_source || 'unknown'}`,
    '',
    '## Tools',
    ''
  ]
  for (const tool of facts.tools || []) {
    if (tool.available) {
      lines.push(`- ${tool.name}: disponible`)
    } else {
      lines.push(`- ${tool.name}: no disponible — fallback: ${tool.fallback || 'ninguno (reportar)'}`)
    }
  }
  lines.push(
    '',
    '## Hint',
    '',
    'Este bloque orienta el shell, el fin de linea y el tooling disponible. Si un comando falla',
    'por una causa de entorno, reporta el shell declarado y el comando textual; no reintentes a',
    'ciegas con otra sintaxis. Este bloque prevalece sobre indicaciones genericas de shell en',
    'AGENTS.md, PRODUCT.md o el prompt de un agente, pero nunca sobre seguridad, autorizacion,',
    'validacion, permisos ni instrucciones explicitas del usuario.',
    ''
  )
  return lines.join('\n')
}

// Comparacion tolerante que ignora `generated_at`: si solo cambio la fecha no se reescribe
// y se conservan el `generated_at` original y el mtime.
function normalizeForCompare(text) {
  return (text === null ? '' : String(text))
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !/^- generated_at:/.test(line))
    .join('\n')
    .trim()
}

export function writeMachineEnv(projectRoot, facts) {
  const out = machineEnvPath(projectRoot)
  const next = renderMachineEnv(facts, { generatedAt: new Date().toISOString() })
  if (existsSync(out)) {
    const current = readFileSync(out, 'utf8')
    if (normalizeForCompare(current) === normalizeForCompare(next)) {
      return { written: false, path: out }
    }
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, next, 'utf8')
  return { written: true, path: out }
}

// Exclusion local del clon: nunca toca `.gitignore`. El patron es el path del artefacto
// relativo a la raiz del worktree, compuesto con `rev-parse --show-prefix`
// (`<prefix>.ancleto/machine-env.md`), porque `info/exclude` resuelve sus patrones contra
// esa raiz y no contra el project root (importante con `--project <subdir>`). El prefijo
// resuelve symlinks y worktrees vinculados; `path.relative` es lexical y produciria `..`
// cuando `--project` recibe un symlink. La decision `ignored`/`updated` se deriva de
// `check-ignore --no-index` despues de escribir, nunca de la intencion.
// git termina cada salida con un unico `\n`; se recorta solo ese salto para preservar los
// espacios iniciales y finales que forman parte del nombre del path.
function stripTrailingNewline(text) {
  return text.replace(/\r?\n$/, '')
}

function exclusionWarning(result, detail, pattern = '') {
  const label = pattern ? `${ARTIFACT_REL} (${pattern})` : ARTIFACT_REL
  result.warnings.push(`no se pudo garantizar la exclusion de ${label}: ${detail}`)
}

export function ensureMachineEnvExclusion(projectRoot) {
  const result = { ignored: false, updated: false, warnings: [] }
  const root = projectRoot || process.cwd()
  const repo = runGit(root, ['rev-parse', '--is-inside-work-tree'])
  if (!repo.ok || repo.stdout.trim() !== 'true') {
    exclusionWarning(result, 'el directorio no es un repositorio git o git no esta disponible')
    return result
  }
  const topLevel = runGit(root, ['rev-parse', '--show-toplevel'])
  const repoRoot = topLevel.ok ? stripTrailingNewline(topLevel.stdout) : ''
  if (!repoRoot) {
    exclusionWarning(result, 'git no resolvio la raiz del repositorio')
    return result
  }
  const prefixRes = runGit(root, ['rev-parse', '--show-prefix'])
  if (!prefixRes.ok || prefixRes.error) {
    exclusionWarning(result, 'git no pudo resolver el prefijo del project root respecto de la raiz del repositorio')
    return result
  }
  let prefix = stripTrailingNewline(prefixRes.stdout).replace(/\\/g, '/')
  if (/[\r\n]/.test(prefix)) {
    exclusionWarning(result, 'git devolvio un prefijo con caracteres de control para el project root')
    return result
  }
  if (isAbsolute(prefix) || prefix === '..' || prefix.startsWith('../')) {
    exclusionWarning(result, `git devolvio un prefijo no relativo para el project root (${prefix || 'vacio'})`)
    return result
  }
  if (prefix && !prefix.endsWith('/')) prefix += '/'
  const pattern = `${prefix}${ARTIFACT_REL}`
  const ignoreCheck = runGit(repoRoot, ['check-ignore', '--no-index', '-q', '--', pattern])
  if (ignoreCheck.ok) {
    result.ignored = true
    return result
  }
  if (ignoreCheck.status !== 1 || ignoreCheck.error) {
    exclusionWarning(result, 'git check-ignore fallo', pattern)
    return result
  }
  const gitPath = runGit(repoRoot, ['rev-parse', '--git-path', 'info/exclude'])
  if (!gitPath.ok || !stripTrailingNewline(gitPath.stdout)) {
    exclusionWarning(result, 'git no resolvio info/exclude', pattern)
    return result
  }
  const rawPath = stripTrailingNewline(gitPath.stdout)
  const excludePath = isAbsolute(rawPath) ? rawPath : resolve(repoRoot, rawPath)
  let content = ''
  try {
    if (existsSync(excludePath)) content = readFileSync(excludePath, 'utf8')
  } catch (error) {
    exclusionWarning(result, error.message, pattern)
    return result
  }
  const already = content.split(/\r?\n/).some((line) => line.trim() === pattern)
  let wrote = false
  if (!already) {
    try {
      const newline = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
      mkdirSync(dirname(excludePath), { recursive: true })
      writeFileSync(excludePath, content + newline + pattern + '\n', 'utf8')
      wrote = true
    } catch (error) {
      exclusionWarning(result, error.message, pattern)
      return result
    }
  }
  const verify = runGit(repoRoot, ['check-ignore', '--no-index', '-q', '--', pattern])
  if (!verify.ok) {
    exclusionWarning(result, `git check-ignore no confirmo la exclusion de ${pattern}`, pattern)
    return result
  }
  result.ignored = true
  result.updated = wrote
  return result
}

// Orquestacion best-effort: nunca lanza. Los errores se devuelven como warnings no
// bloqueantes y el artefacto ya escrito se conserva.
export function materializeMachineEnv(projectRoot) {
  const result = { written: false, ignored: false, updated: false, warnings: [] }
  if (!projectRoot) {
    result.warnings.push('no se pudo generar .ancleto/machine-env.md: no hay directorio de proyecto')
    return result
  }
  try {
    const facts = detectMachineFacts({ cwd: projectRoot })
    result.written = writeMachineEnv(projectRoot, facts).written
  } catch (error) {
    result.warnings.push(`no se pudo generar .ancleto/machine-env.md: ${error.message}`)
    return result
  }
  try {
    const exclusion = ensureMachineEnvExclusion(projectRoot)
    result.ignored = exclusion.ignored
    result.updated = exclusion.updated
    result.warnings.push(...exclusion.warnings)
  } catch (error) {
    result.warnings.push(`no se pudo garantizar la exclusion de .ancleto/machine-env.md: ${error.message}`)
  }
  return result
}

// Lectura read-only para `ancleto check`: true solo si `git ls-files` muestra el artefacto
// trackeado. Sin git o sin repo devuelve false y no emite nada.
export function checkMachineEnvTracked(projectRoot) {
  if (!projectRoot) return false
  return runGit(projectRoot, ['ls-files', '--error-unmatch', '--', ARTIFACT_REL]).ok
}
