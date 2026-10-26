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
// Sonda de invocabilidad: bandera de version barata y timeout acotado para que
// `init`/`upgrade` no se cuelguen. La version observada nunca se renderiza.
const TOOL_PROBE_ARGS = ['--version']
export const TOOL_PROBE_TIMEOUT_MS = 2000
// Techo acumulado de sondas por corrida: un shim patologico (el alias de la Store de
// Windows, por ejemplo) no puede estirar la deteccion mas alla de este presupuesto.
const TOOL_PROBE_BUDGET_MS = 10000
// Cada llamada a git tambien esta acotada: `detectEol` puede encadenar varias y una
// bloqueada dejaria `init` colgado.
const GIT_TIMEOUT_MS = 5000
// Tope del texto de fallo observado: el artefacto es un archivo sin secretos y una
// linea larga de stderr puede arrastrar rutas absolutas o tokens.
const FAILURE_TEXT_MAX = 200

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
    const res = spawnSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true
    })
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

// Candidatos resolubles en PATH (con PATHEXT en Windows). Gana el primer directorio de
// PATH que provee la herramienta; dentro de el se prueban las extensiones de PATHEXT antes
// que el nombre exacto, porque en Windows un archivo sin extension no es un ejecutable
// nativo (suele ser un shim POSIX) y su fallo de invocacion enmascara al candidato real.
// El valor de PATH nunca se renderiza.
function findExecutables(name, { pathValue, pathext, platform }) {
  if (!pathValue) return []
  const separator = platform === 'win32' ? ';' : ':'
  const dirs = pathValue.split(separator).map((dir) => dir.replace(/^"|"$/g, '')).filter(Boolean)
  const exts = platform === 'win32'
    ? [
      ...(pathext || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean).map((ext) => (ext.startsWith('.') ? ext : `.${ext}`)),
      ''
    ]
    : ['']
  for (const dir of dirs) {
    const candidates = []
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (isExecutableFile(candidate, platform)) candidates.push(candidate)
    }
    if (candidates.length > 0) return candidates
  }
  return []
}

// Un `.cmd`/`.bat` no se puede lanzar directo desde Node >= 18.20 (CVE-2024-27980):
// `spawnSync` sin shell devuelve EINVAL y ese error describe al runtime, no a la
// herramienta. En win32 el shim se enruta por ComSpec para que el veredicto sea de la
// tool y no de la limitacion del runtime.
function isBatchShim(candidate) {
  return /\.(cmd|bat)$/i.test(String(candidate))
}

// Comando para ComSpec: comillas dobles que encierran la ruta del shim y sus flags.
// Con `/s` cmd quita la primera y la ultima comilla y ejecuta el resto literal, de modo
// que un path con espacios queda protegido. `windowsVerbatimArguments` evita que Node
// re-escape las comillas internas al construir la linea de comandos.
function comspecCommand(candidate) {
  return `""${candidate}" ${TOOL_PROBE_ARGS.join(' ')}"`
}

// Invocacion real del candidato. Los candidatos `.cmd`/`.bat` en win32 pasan por ComSpec;
// el resto se lanza directo, sin shell.
function spawnProbe(candidate, platform) {
  const options = { encoding: 'utf8', timeout: TOOL_PROBE_TIMEOUT_MS, windowsHide: true }
  try {
    if (platform === 'win32' && isBatchShim(candidate)) {
      const comspec = process.env.ComSpec || 'cmd.exe'
      return spawnSync(comspec, ['/d', '/s', '/c', comspecCommand(candidate)], {
        ...options,
        windowsVerbatimArguments: true
      })
    }
    return spawnSync(candidate, TOOL_PROBE_ARGS, options)
  } catch (error) {
    return { error, status: null, stdout: '', stderr: '' }
  }
}

// Invocabilidad real: se ejecuta el candidato con una bandera de version barata y un
// timeout acotado. Resolver en PATH no basta: un shim que no se puede lanzar es una
// herramienta bloqueada, no una herramienta disponible.
//
// Veredicto en tres estados:
//   ok           -> el candidato se ejecuto con exito
//   blocked      -> fallo real: error de spawn, exit no cero o timeout
//   inconclusive -> no hubo veredicto de la herramienta (guard de Node o presupuesto)
function probeExecutable(candidate, platform) {
  const res = spawnProbe(candidate, platform)
  if (res.error) {
    // EINVAL es la guarda de Node para shims de batch: habla del runtime, no de la
    // herramienta, asi que no habilita el veredicto `bloqueado`.
    if (res.error.code === 'EINVAL') {
      return {
        ok: false,
        blocked: false,
        inconclusive: true,
        reason: `no se pudo determinar la invocabilidad de ${candidateName(candidate)} (EINVAL)`
      }
    }
    return { ok: false, blocked: true, inconclusive: false, reason: executionFailure(candidate, res.error) }
  }
  if (res.status !== 0) {
    return {
      ok: false,
      blocked: true,
      inconclusive: false,
      reason: firstLine(res.stderr) || `no se pudo ejecutar ${candidateName(candidate)} (codigo ${res.status})`
    }
  }
  return { ok: true, blocked: false, inconclusive: false, reason: null }
}

// Fallo observado de la invocacion: primera linea de stderr si la hubo, si no el error
// de spawn (codigo + nombre del candidato, sin filtrar el path absoluto).
function executionFailure(candidate, error) {
  const code = error && error.code ? error.code : 'UNKNOWN'
  return `no se pudo ejecutar ${candidateName(candidate)} (${code})`
}

function candidateName(candidate) {
  const parts = String(candidate).split(/[\\/]/)
  return parts[parts.length - 1] || String(candidate)
}

// Primera linea de stderr acotada: sin secuencias ANSI, sin caracteres de control y con
// un tope de longitud. El artefacto es un archivo que no debe llevar secretos, y una
// linea larga de un shim puede arrastrar rutas absolutas o tokens.
function firstLine(text) {
  const raw = String(text || '').split(/\r?\n/).find((entry) => entry.trim().length > 0)
  if (!raw) return ''
  const clean = raw
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= FAILURE_TEXT_MAX) return clean
  return `${clean.slice(0, FAILURE_TEXT_MAX - 1)}…`
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

// `overrides` es solo una costura de test (snapshot de plataforma, entorno, PATH y
// presupuesto de sondas); en produccion se omite y se lee el proceso. No es configuracion
// publica ni se expone en CLI.
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
  // Presupuesto acumulado de sondas: agotado, los candidatos restantes quedan sin
  // sondear y la herramienta queda inconclusa (nunca `disponible` por omision).
  const probeDeadline = Date.now() + (overrides.probeBudgetMs ?? TOOL_PROBE_BUDGET_MS)
  const tools = TOOL_ORDER.map((name) => {
    const candidates = findExecutables(name, { pathValue, pathext, platform })
    if (candidates.length === 0) {
      return { name, available: false, fallback: fallbackFor(name, platform), blocked: false, inconclusive: false, reason: null }
    }
    let reason = null
    let inconclusiveReason = null
    for (const candidate of candidates) {
      if (Date.now() >= probeDeadline) {
        inconclusiveReason = `no se pudo sondear ${name} (presupuesto de sondas agotado)`
        break
      }
      const probe = probeExecutable(candidate, platform)
      if (probe.ok) return { name, available: true, fallback: null, blocked: false, inconclusive: false, reason: null }
      if (probe.blocked) {
        if (reason === null) reason = probe.reason
      } else if (inconclusiveReason === null) {
        inconclusiveReason = probe.reason
      }
    }
    // Resuelve en PATH pero no se puede invocar: bloqueado, con el fallo observado.
    // Sin fallo real observado (solo veredictos inconclusos) no se declara bloqueado.
    const blocked = reason !== null
    return {
      name,
      available: false,
      fallback: fallbackFor(name, platform),
      blocked,
      inconclusive: !blocked && inconclusiveReason !== null,
      reason: blocked ? reason : inconclusiveReason
    }
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
      const blocked = tool.blocked && tool.reason ? ` — bloqueado: ${tool.reason}` : ''
      lines.push(`- ${tool.name}: no disponible — fallback: ${tool.fallback || 'ninguno (reportar)'}${blocked}`)
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
