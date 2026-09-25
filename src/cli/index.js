#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { cp, mkdir, access, writeFile, readFile, readdir, rename } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { join, dirname, resolve, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { createMemoryEngine, createReadonlyMemoryEngine, defaultMemoryDbPath } from '../core/memory/engine.js'
import { memoryDoctor } from '../core/memory/doctor.js'
import { serveMemoryMcp } from '../core/memory/mcp-server.js'
import { writeDiscoveryMap } from '../core/discovery.js'
import { readProjectTier, buildRepomixArgs, tierTokenBudget } from '../core/repomix-tier.js'
import { showBanner, selectOption, selectMultiple, stopBanner } from './ui.js'
import { tierModels, gratisModel, envGratisModel, isKnownGratisModel, MUSE_SPARK_MODEL, GRATIS_FALLBACK_MODEL } from '../core/tier-models.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const ASSETS = ['agents', 'commands', 'skills']
const TEMPLATES = ['AGENTS.md', 'PRODUCT.md']
const AZURE_MCP_NOTICE = 'ancleto: MCP azure-devops habilitado — usa las variables de entorno AZURE_DEVOPS_ORG_URL y AZURE_DEVOPS_PAT'

const HELP = `ancleto - orquestador SDD liviano con subagentes optimizados para costo/tokens
(alias: aspec)

Uso:
  ancleto install [--project <dir>]   Instala agents/commands/skills en opencode
                                   (global por defecto, o en .opencode/ del proyecto)
                                   Configura el MCP de memoria propia + caveman por defecto
  ancleto install --no-mcp           Igual que install pero sin tocar config MCP
  ancleto install --with-engram      Ademas configura el MCP externo engram (memoria opcional)
  ancleto install --tier <nivel>     normal | minimo | gratis (wizard interactivo en TTY)
  ancleto install --lang <codigo>    auto | es | en | pt (idioma de los artifacts; auto = idioma de la conversacion)
  ancleto install --exclude <globs>  Paths excluidos del discovery, coma-separados (ej: "**/*.png,docs")
  ancleto install --agent <nombre>    opencode | vscode | antigravity | cursor | roo (wizard si no esta guardado)
  ancleto update [--project <dir>]    Alias de install (re-instala sobre lo existente)
                                   Parado en un proyecto con .ancletorc opera sobre ese proyecto;
                                   usa --global para forzar el alcance global
  ancleto upgrade [--agent <nombre>]  Re-aplica templates (LOCKED) y skills sobre el proyecto actual
  ancleto init [--with-azure] [--agent <nombre>] [--tier <nivel>] [--lang <codigo>] [--exclude <globs>]
                                     Crea .ancletorc en el repositorio actual
                                     (interactivo en TTY: banner + menu; Azure desactivado por defecto)
  ancleto discovery --check           Estado del seed (READY/STALE/PARTIAL/MISSING)
  ancleto discovery [--compress] [--include G] [--ignore G] [--token-budget N]
                                   Empaca el repo con Repomix y guarda estado
  ancleto specs check [--change <name>] [--json]
                                   Valida keywords canonicos (### Requirement:, WHEN, THEN)
                                   en aspec/specs y, con --change, en los deltas del change
  ancleto stats [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>] [--json]
                                   Tokens por sesion de opencode (entrada/salida/razonamiento/cache),
                                   con rollup de subagentes y desglose por agente con --session
  ancleto projects [list] [--json] Lista los proyectos que usan ancleto (version, tier, origen, ruta)
  ancleto projects scan <raiz> [--dry-run] [--json]
                                   Descubre y registra proyectos ancleto bajo una raiz
  ancleto projects prune [--dry-run] [--json]
                                   Quita del registro los proyectos borrados o movidos
  ancleto projects info [ruta] [--json]
                                   Estado de un proyecto (version, memoria, seed, changes activos)
  ancleto projects update [--all] [--json]
                                   Actualiza los proyectos desactualizados (selector interactivo;
                                   --all sin preguntar); equivalente a "cd <ruta> && ancleto update"
  ancleto list --projects [--json]  Alias de "ancleto projects list"
  ancleto memory context [--scope X] [--out file]
                                   Imprime/escribe el bloque <ProjectMemoryRules> (reglas activas)
  ancleto memory list [--type X] [--scope X] [--all] [--json]
                                    Lista los nodos de memoria (read-only, no toca la DB)
  ancleto memory doctor [--rebuild] Diagnostica .ancleto/memory.db (integridad, FTS5, unicidad)
                                    y reconstruye el indice FTS5 con --rebuild
  ancleto mcp                           Servidor MCP de memoria propia (stdio) para tu IDE
                                        expone searchMemory, recordRule y recordDecision
  ancleto check                         Verifica integridad de archivos instalados vs manifiesto
  ancleto doctor                        Diagnostica el entorno (Node, node:sqlite, opencode.json)
  ancleto --help                      Esta ayuda
  ancleto --version                   Version del paquete
`

async function exists(p) {
  try { await access(p); return true } catch { return false }
}

async function packageVersion() {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  return pkg.version
}

async function readAncletorc(projectDir) {
  const rc = join(projectDir, '.ancletorc')
  if (!(await exists(rc))) return null
  try {
    return JSON.parse((await readFile(rc, 'utf8')).replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

async function writeManifest(projectDir, extra = {}) {
  const existing = (await readAncletorc(projectDir)) || {}
  const { version: _legacy, ...rest } = existing
  const manifest = {
    ...rest,
    schemaVersion: 1,
    version: await packageVersion(),
    installedAt: new Date().toISOString(),
    installedPaths: rest.installedPaths || { templates: [], agents: [], commands: [], skills: [] },
    ...extra
  }
  await writeFile(join(projectDir, '.ancletorc'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

function globalConfigDir() {
  return process.env.XDG_CONFIG_HOME
    ? join(process.env.XDG_CONFIG_HOME, 'opencode')
    : join(homedir(), '.config', 'opencode')
}

// Registro global de proyectos que usan ancleto (no depende de opencode).
function projectsRegistryPath() {
  if (process.env.ANCLETO_PROJECTS_FILE) return process.env.ANCLETO_PROJECTS_FILE
  const base = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'ancleto') : join(homedir(), '.config', 'ancleto')
  return join(base, 'projects.json')
}

function normKey(p) {
  return normPath(resolve(p))
}

async function readProjectsRegistry() {
  const file = projectsRegistryPath()
  if (!(await exists(file))) return { schemaVersion: 1, projects: {} }
  try {
    const data = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    return { schemaVersion: 1, projects: data.projects || {} }
  } catch (err) {
    console.warn(`ancleto: registro de proyectos ilegible (${file}): ${err.message}`)
    return { schemaVersion: 1, projects: {} }
  }
}

async function writeProjectsRegistry(reg) {
  const file = projectsRegistryPath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(reg, null, 2) + '\n')
  return file
}

async function registerProject(projectDir, { agent, tier } = {}) {
  const abs = resolve(projectDir)
  const rc = await readAncletorc(abs)
  const tierFile = join(abs, '.opencode', '.ancleto-tier')
  const localTier = (await exists(tierFile)) ? (await readFile(tierFile, 'utf8')).trim() : null
  const hasScopedAgents = await exists(join(abs, '.opencode', 'agents'))
  const entry = {
    path: abs.replace(/\\/g, '/'),
    version: await packageVersion(),
    agent: agent || rc?.agent || 'opencode',
    tier: tier || localTier || null,
    scoped: hasScopedAgents,
    registeredAt: new Date().toISOString()
  }
  const reg = await readProjectsRegistry()
  const key = normKey(abs)
  entry.registeredAt = reg.projects[key]?.registeredAt || entry.registeredAt
  entry.lastSeen = new Date().toISOString()
  reg.projects[key] = entry
  await writeProjectsRegistry(reg)
}

async function unregisterProject(projectDir) {
  const reg = await readProjectsRegistry()
  const key = normKey(projectDir)
  if (!reg.projects[key]) return false
  delete reg.projects[key]
  await writeProjectsRegistry(reg)
  return true
}

// Color helpers (respetan NO_COLOR y TTY).
const useColor = () => process.stdout.isTTY && !process.env.NO_COLOR
function paint(code, s) {
  return useColor() ? `\x1b[${code}m${s}\x1b[0m` : String(s)
}
const c = {
  dim: (s) => paint('2', s),
  bold: (s) => paint('1', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
  red: (s) => paint('31', s),
  cyan: (s) => paint('36', s)
}
const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '')
function padVisible(s, width) {
  const len = stripAnsi(s).length
  return s + ' '.repeat(Math.max(0, width - len))
}

// Descubre proyectos ancleto bajo una raiz (busca .ancletorc, con profundidad acotada).
async function discoverProjectsUnder(root, maxDepth = 3) {
  const found = []
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'vendor'])
  async function walk(dir, depth) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((e) => e.isFile() && (e.name === '.ancletorc' || e.name === '.ancletorc'))) found.push(dir)
    if (depth >= maxDepth) return
    for (const e of entries) {
      if (!e.isDirectory() || skip.has(e.name) || e.name.startsWith('.')) continue
      await walk(join(dir, e.name), depth + 1)
    }
  }
  await walk(resolve(root), 0)
  return found
}

// Lee el estado real de un proyecto registrado (o descubre que ya no existe).
async function projectStatus(entry) {
  const abs = entry.path
  if (!(await exists(abs))) return { ...entry, exists: false }
  const rc = await readAncletorc(abs)
  if (!rc) return { ...entry, exists: false, reason: 'sin .ancletorc' }
  const tierFile = join(abs, '.opencode', '.ancleto-tier')
  const tier = (await exists(tierFile)) ? (await readFile(tierFile, 'utf8')).trim() : null
  const scoped = await exists(join(abs, '.opencode', 'agents'))
  return {
    ...entry,
    exists: true,
    path: abs.replace(/\\/g, '/'),
    version: rc.version || entry.version || null,
    agent: rc.agent || entry.agent || null,
    tier,
    scoped
  }
}

async function projectsList(reg, { asJson, currentVersion }) {
  const rows = await Promise.all(Object.values(reg.projects).map(projectStatus))
  rows.sort((a, b) => String(a.path).localeCompare(String(b.path)))
  if (asJson) {
    console.log(JSON.stringify({ ok: true, cliVersion: currentVersion, registry: projectsRegistryPath(), count: rows.length, projects: rows }, null, 2))
    return rows
  }
  if (rows.length === 0) {
    console.log('ancleto: no hay proyectos registrados todavia')
    console.log(c.dim('  registra uno con: ancleto install --project <ruta>  ·  o descubre con: ancleto projects scan <raiz>'))
    return rows
  }
  const live = rows.filter((r) => r.exists)
  console.log(`${c.bold('ancleto: proyectos')} ${c.dim(`(${live.length} activos de ${rows.length} registrados · CLI v${currentVersion})`)}`)
  console.log('')
  const header = ['', padVisible('PROYECTO', 22), padVisible('VERSIÓN', 10), padVisible('ORIGEN', 10), padVisible('TIER', 9), padVisible('AGENTE', 10), 'RUTA']
  console.log(c.dim(`  ${header.join(' ')}`))
  for (const r of rows) {
    const name = r.path.split('/').filter(Boolean).pop() || r.path
    if (!r.exists) {
      console.log(`  ${c.red('✖')} ${padVisible(c.red(name.slice(0, 21)), 22)} ${padVisible(c.dim('—'), 10)} ${padVisible(c.red('muerto'), 10)} ${padVisible('—', 9)} ${padVisible('—', 10)} ${c.dim(r.path)}`)
      continue
    }
    const outdated = r.version && currentVersion && r.version !== currentVersion
    const marker = r.scoped ? c.green('●') : c.yellow('○')
    const ver = outdated ? c.red(r.version) : c.green(r.version || '—')
    const origin = r.scoped ? c.green('scoped') : c.yellow('global')
    console.log(`  ${marker} ${padVisible(c.bold(name.slice(0, 21)), 22)} ${padVisible(ver, 10)} ${padVisible(origin, 10)} ${padVisible(r.tier || c.dim('—'), 9)} ${padVisible(r.agent || '—', 10)} ${r.path}`)
  }
  console.log('')
  console.log(c.dim('  ● instalación por proyecto   ○ usa agentes globales   versión en rojo = desactualizada'))
  return rows
}

async function projectsScan(root, { asJson, dryRun }) {
  if (!root) {
    console.error('ancleto: uso: ancleto projects scan <raiz> [--dry-run] [--json]')
    process.exit(1)
  }
  if (!(await exists(root))) {
    console.error(`ancleto: no existe la raiz "${root}"`)
    process.exit(1)
  }
  const found = await discoverProjectsUnder(root)
  const reg = await readProjectsRegistry()
  const added = []
  const known = []
  for (const dir of found) {
    const key = normKey(dir)
    if (reg.projects[key]) {
      known.push(dir)
      continue
    }
    added.push(dir)
    if (!dryRun) await registerProject(dir)
  }
  if (asJson) {
    console.log(JSON.stringify({ ok: true, root: resolve(root), found: found.length, added: added.map((p) => p.replace(/\\/g, '/')), known: known.map((p) => p.replace(/\\/g, '/')), dryRun: !!dryRun }, null, 2))
    return
  }
  console.log(`${c.bold('ancleto: scan')} ${c.dim(resolve(root).replace(/\\/g, '/'))}`)
  console.log(`  ${c.dim('encontrados:')} ${found.length} proyectos con .ancletorc`)
  for (const p of added) console.log(`  ${dryRun ? c.yellow('·') : c.green('+')} ${p.replace(/\\/g, '/')}`)
  for (const p of known) console.log(`  ${c.dim('=')} ${c.dim(p.replace(/\\/g, '/'))}`)
  if (dryRun) console.log(c.dim('\n  --dry-run: no se registro nada'))
  else console.log(c.dim(`\n  registrados: ${added.length} nuevos`))
}

async function projectsPrune({ asJson, dryRun }) {
  const reg = await readProjectsRegistry()
  const removed = []
  for (const [key, entry] of Object.entries(reg.projects)) {
    const st = await projectStatus(entry)
    if (!st.exists) {
      removed.push({ key, path: entry.path, reason: st.reason || 'ruta inexistente' })
      if (!dryRun) delete reg.projects[key]
    }
  }
  if (!dryRun && removed.length) await writeProjectsRegistry(reg)
  if (asJson) {
    console.log(JSON.stringify({ ok: true, pruned: removed.length, removed, dryRun: !!dryRun }, null, 2))
    return
  }
  if (removed.length === 0) {
    console.log(c.dim('ancleto: no hay entradas muertas en el registro'))
    return
  }
  console.log(`${c.bold('ancleto: prune')}${dryRun ? ` ${c.dim('(dry-run)')}` : ''}`)
  for (const r of removed) console.log(`  ${dryRun ? c.yellow('·') : c.red('−')} ${r.path} ${c.dim(`(${r.reason})`)}`)
  console.log(dryRun ? c.dim(`\n  --dry-run: se quitarian ${removed.length}`) : c.dim(`\n  removidos: ${removed.length}`))
}

async function projectsInfo(target, { asJson, currentVersion }) {
  const abs = resolve(target || process.cwd())
  const rc = await readAncletorc(abs)
  if (!rc) {
    console.error(`ancleto: "${abs}" no parece un proyecto ancleto (sin .ancletorc)`)
    process.exit(1)
  }
  const st = await projectStatus({ path: abs, ...rc })
  const hasMemory = await exists(join(abs, '.ancleto', 'memory.db'))
  const hasSeedIndex = await exists(join(abs, rc.discovery?.outputDir || 'docs/technical-discovery', 'index.md'))
  const hasWorkingContext = await exists(join(abs, '.ancleto', 'working-context.md'))
  const activeChangesDir = join(abs, CHANGES_ROOT, 'changes')
  let activeChanges = 0
  if (await exists(activeChangesDir)) {
    const entries = await readdir(activeChangesDir, { withFileTypes: true })
    activeChanges = entries.filter((e) => e.isDirectory() && e.name !== 'archive').length
  }
  const info = {
    path: abs.replace(/\\/g, '/'),
    version: st.version,
    outdated: st.version && currentVersion ? st.version !== currentVersion : false,
    agent: st.agent,
    tier: st.tier,
    scoped: st.scoped,
    azureEnabled: !!rc.azure?.enabled,
    memoryDb: hasMemory,
    technicalSeed: hasSeedIndex,
    workingContext: hasWorkingContext,
    activeChanges
  }
  if (asJson) {
    console.log(JSON.stringify({ ok: true, cliVersion: currentVersion, ...info }, null, 2))
    return
  }
  console.log(`${c.bold((abs.split(/[\\/]/).filter(Boolean).pop() || abs))} ${c.dim(info.path)}`)
  console.log('')
  console.log(`  versión      ${info.outdated ? c.red(`${info.version} → ${currentVersion} disponible`) : c.green(info.version || '—')}`)
  console.log(`  instalación  ${info.scoped ? c.green('por proyecto (scoped)') : c.yellow('agentes globales')}`)
  console.log(`  tier / agente ${info.tier || c.dim('—')} / ${info.agent || '—'}`)
  console.log(`  Azure DevOps ${info.azureEnabled ? c.green('habilitado') : c.dim('deshabilitado')}`)
  console.log(`  memoria      ${info.memoryDb ? c.green('sí (.ancleto/memory.db)') : c.dim('no')}`)
  console.log(`  seed técnico ${info.technicalSeed ? c.green('generado') : c.dim('sin generar')}`)
  console.log(`  changes      ${info.activeChanges > 0 ? c.cyan(`${info.activeChanges} activo(s)`) : c.dim('ninguno')}`)
  if (info.outdated) console.log(c.dim(`\n  actualizá con: cd "${info.path}" && ancleto update`))
}

// Actualiza proyectos desde el registro. Spawnea `ancleto update` por proyecto
// (proceso aislado: un fallo no contamina a los demas y la salida queda por proyecto).
async function projectsUpdate(reg, { asJson, all }) {
  const currentVersion = await packageVersion()
  const rows = await Promise.all(Object.values(reg.projects).map(projectStatus))
  const dead = rows.filter((r) => !r.exists)
  const outdated = rows.filter((r) => r.exists && r.version && r.version !== currentVersion)
  const hintDead = () => {
    if (dead.length) console.log(c.dim(`  (${dead.length} entrada(s) muerta(s) en el registro: corre \`ancleto projects prune\`)`))
  }

  if (outdated.length === 0) {
    if (asJson) console.log(JSON.stringify({ ok: true, cliVersion: currentVersion, updated: [], dead: dead.map((r) => r.path), reason: 'nada desactualizado' }, null, 2))
    else {
      console.log(c.green('ancleto: todos los proyectos activos estan al dia'))
      hintDead()
    }
    return
  }

  let targets
  if (all) {
    targets = outdated
  } else if (!process.stdout.isTTY) {
    if (asJson) console.log(JSON.stringify({ ok: true, cliVersion: currentVersion, outdated: outdated.map((r) => ({ path: r.path, version: r.version })), dead: dead.map((r) => r.path), action: 'usa --all para actualizar sin interaccion' }, null, 2))
    else {
      console.log(`${c.bold('ancleto: proyectos desactualizados')} ${c.dim(`(${outdated.length})`)}`)
      for (const r of outdated) console.log(`  ${c.red(r.version)} → ${c.green(currentVersion)}  ${r.path}`)
      console.log(c.dim('\n  sin TTY no puedo preguntar: corre `ancleto projects update --all` para actualizarlos todos'))
      hintDead()
    }
    return
  } else {
    if (dead.length) {
      console.log(c.dim(`ancleto: ${dead.length} entrada(s) muerta(s) en el registro (ignoradas; limpialas con \`ancleto projects prune\`)`))
    }
    const labels = outdated.map((r) => `${padVisible(r.path.split('/').filter(Boolean).pop() || r.path, 22)} ${c.red(r.version)} → ${c.green(currentVersion)}  ${c.dim(r.path)}`)
    const { cancelled, indices } = await selectMultiple(`Proyectos a actualizar (${outdated.length} desactualizados)`, labels, outdated.map((_, i) => i))
    if (cancelled || indices.length === 0) {
      console.log(c.dim('ancleto: nada seleccionado, no se actualizo ningun proyecto'))
      return
    }
    targets = indices.map((i) => outdated[i])
  }

  const selfCli = fileURLToPath(import.meta.url)
  const results = []
  console.log('')
  for (const r of targets) {
    process.stdout.write(`  ${c.cyan('→')} ${r.path} ... `)
    const res = spawnSync(process.execPath, [selfCli, 'update'], { cwd: r.path, encoding: 'utf8', env: process.env })
    const okRun = res.status === 0
    const out = `${res.stdout || ''}${res.stderr || ''}`.trim()
    console.log(okRun ? c.green('ok') : c.red('fallo'))
    results.push({ path: r.path, from: r.version, to: okRun ? currentVersion : null, ok: okRun, output: out.split('\n').slice(-3).join('\n') })
    if (!okRun) console.log(c.dim(`    ${out.split('\n').slice(-1)[0] || 'sin salida'}`))
  }
  const okCount = results.filter((x) => x.ok).length
  console.log('')
  console.log(`ancleto: ${okCount}/${results.length} proyectos actualizados a v${currentVersion}`)
  if (asJson) console.log(JSON.stringify({ ok: okCount === results.length, cliVersion: currentVersion, updated: results }, null, 2))
}

async function projectsCommand(args) {
  const sub = args.find((a) => !a.startsWith('-')) || 'list'
  const flags = args.filter((a) => a.startsWith('-'))
  const asJson = flags.includes('--json')
  const dryRun = flags.includes('--dry-run')
  const all = flags.includes('--all')
  const currentVersion = await packageVersion()
  switch (sub) {
    case 'list': {
      const reg = await readProjectsRegistry()
      await projectsList(reg, { asJson, currentVersion })
      if (flags.includes('--update')) await projectsUpdate(reg, { asJson, all })
      break
    }
    case 'scan': {
      const idx = args.indexOf('scan')
      const root = args[idx + 1] && !args[idx + 1].startsWith('-') ? args[idx + 1] : null
      await projectsScan(root, { asJson, dryRun })
      break
    }
    case 'prune': {
      await projectsPrune({ asJson, dryRun })
      break
    }
    case 'info': {
      const idx = args.indexOf('info')
      const target = args[idx + 1] && !args[idx + 1].startsWith('-') ? args[idx + 1] : null
      await projectsInfo(target, { asJson, currentVersion })
      break
    }
    case 'update': {
      await projectsUpdate(await readProjectsRegistry(), { asJson, all })
      break
    }
    default:
      console.error(`ancleto: subcomando desconocido: projects ${sub}`)
      console.error('ancleto: uso: ancleto projects [list|scan <raiz>|prune|info <ruta>|update] [--update] [--all] [--json] [--dry-run]')
      process.exit(1)
  }
}


function binName(base) {
  return process.platform === 'win32' ? `${base}.exe` : base
}

function resolveBin(name, fallbacks = []) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const r = spawnSync(probe, [name], { encoding: 'utf8' })
  if (r.status === 0 && r.stdout) {
    for (const line of r.stdout.split(/\r?\n/)) {
      const candidate = line.trim()
      if (candidate && !/^informacion:/i.test(candidate)) return candidate
    }
  }
  for (const fb of fallbacks) {
    if (fb && existsSync(fb)) return fb
  }
  return null
}

function resolveSelfCommand() {
  return [process.execPath, join(__dirname, 'index.js'), 'mcp']
}

function buildDefaultMcp({ withEngram = false } = {}) {
  const mcp = {}

  // Memoria propia del framework: SQLite (.ancleto/memory.db) expuesta como tools MCP
  mcp['ancleto-memory'] = { type: 'local', enabled: true, command: resolveSelfCommand() }

  if (withEngram) {
    const engramFallbacks = [
      join(homedir(), 'go', 'bin', binName('engram')),
      join(homedir(), '.local', 'bin', binName('engram'))
    ]
    const engramBin = resolveBin('engram', engramFallbacks)
    if (engramBin) {
      mcp.engram = { type: 'local', enabled: true, command: [engramBin, 'mcp', '--tools=agent'] }
    } else {
      console.warn('ancleto: no se encontro engram en PATH; se omitio su MCP')
    }
  }

  const cavemanFallbacks = [
    join(homedir(), '.caveman', 'bin', binName('caveman-mcp'))
  ]
  const cavemanBin = resolveBin('caveman-mcp', cavemanFallbacks)
  if (cavemanBin) {
    mcp.caveman = { type: 'local', enabled: true, command: [cavemanBin] }
  } else {
    console.warn('ancleto: no se encontro caveman-mcp (compresion) en PATH; se omitio su MCP')
  }

  return mcp
}

const TIERS = {
  normal: {
    orchestrator: 'opencode-go/qwen3.7-plus',
    coder: 'opencode-go/minimax-m3',
    tester: 'opencode-go/deepseek-v4.1-flash',
    'spec-writer': 'opencode-go/qwen3.7-plus',
    reviewer: 'opencode-go/qwen3.6-plus',
    'technical-discovery': 'opencode-go/deepseek-v4.1-flash',
    'technical-seed-writer': 'opencode-go/minimax-m3',
    'memory-keeper': 'opencode-go/deepseek-v4.1-flash',
    'context-resolver': 'opencode-go/deepseek-v4.1-flash',
    documenter: 'opencode-go/deepseek-v4.1-flash'
  },
  minimo: {
    orchestrator: 'opencode-go/deepseek-v4.1-flash',
    coder: 'opencode-go/deepseek-v4.1-flash',
    tester: 'opencode-go/deepseek-v4.1-flash',
    'spec-writer': 'opencode-go/deepseek-v4.1-flash',
    reviewer: 'opencode-go/deepseek-v4.1-flash',
    'technical-discovery': 'opencode-go/deepseek-v4.1-flash',
    'technical-seed-writer': 'opencode-go/deepseek-v4.1-flash',
    'memory-keeper': 'opencode-go/deepseek-v4.1-flash',
    'context-resolver': 'opencode-go/deepseek-v4.1-flash',
    documenter: 'opencode-go/deepseek-v4.1-flash'
  },
  gratis: {
    orchestrator: 'opencode/big-pickle',
    coder: 'opencode/big-pickle',
    tester: 'opencode/big-pickle',
    'spec-writer': 'opencode/big-pickle',
    reviewer: 'opencode/big-pickle',
    'technical-discovery': 'opencode/big-pickle',
    'technical-seed-writer': 'opencode/big-pickle',
    'memory-keeper': 'opencode/big-pickle',
    'context-resolver': 'opencode/big-pickle',
    documenter: 'opencode/big-pickle'
  }
}

function tierStatePath(targetDir) {
  return join(targetDir, '.ancleto-tier')
}

async function applyTier(agentsDir, tier, models = null) {
  const map = models || TIERS[tier]
  for (const [name, model] of Object.entries(map)) {
    const p = join(agentsDir, name + '.md')
    if (!(await exists(p))) continue
    const c = await readFile(p, 'utf8')
    const o = c.replace(/^model: .*$/m, `model: ${model}`)
    if (o !== c) await writeFile(p, o)
  }
}

const SUPPORTED_AGENTS = ['opencode', 'vscode', 'antigravity', 'cursor', 'roo']
const DEFAULT_AGENT = 'opencode'

function askAgent() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question('Agente/IDE [opencode/vscode/antigravity/cursor/roo] (default: opencode): ', (a) => {
      rl.close()
      const t = a.trim().toLowerCase()
      resolve(SUPPORTED_AGENTS.includes(t) ? t : DEFAULT_AGENT)
    })
  })
}

function scanAgentFlag(args) {
  const name = flagValue(args, '--agent')
  if (!name) return null
  if (!SUPPORTED_AGENTS.includes(name)) {
    console.error(`ancleto: agente invalido: ${name} (${SUPPORTED_AGENTS.join('/')})`)
    process.exit(1)
  }
  return name
}

function scanTierFlag(args) {
  const t = flagValue(args, '--tier')
  if (!t) return null
  if (!TIERS[t]) {
    console.error(`ancleto: tier invalido: ${t} (normal|minimo|gratis)`)
    process.exit(1)
  }
  return t
}

const SUPPORTED_LANGS = ['auto', 'es', 'en', 'pt']

function scanLangFlag(args) {
  const l = flagValue(args, '--lang')
  if (!l) return null
  if (!SUPPORTED_LANGS.includes(l)) {
    console.error(`ancleto: idioma invalido: ${l} (${SUPPORTED_LANGS.join('|')})`)
    process.exit(1)
  }
  return l
}

function langLabel(code) {
  return { auto: 'automatico (idioma de la conversacion)', es: 'espanol', en: 'ingles', pt: 'portugues' }[code] || code
}

const EXCLUDE_PRESETS = [
  { key: 'tests', label: 'tests (*.test.*, *.spec.*, __tests__)', recommended: true, globs: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'] },
  { key: 'assets', label: 'assets pesados (*.png, *.jpg, *.svg, *.ico, public/)', recommended: true, globs: ['**/*.png', '**/*.jpg', '**/*.svg', '**/*.ico', 'public'] },
  { key: 'docs', label: 'documentacion (docs/)', recommended: false, globs: ['docs'] },
  { key: 'data', label: 'migraciones y seeds', recommended: false, globs: ['**/migrations/**', '**/seeds/**'] },
  { key: 'lockfiles', label: 'lockfiles (package-lock, yarn.lock, pnpm-lock)', recommended: true, globs: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'] }
]

function parseExcludeFlag(value) {
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// null = flag ausente; [] = limpiar exclusiones; [...] = globs.
function scanExcludeFlag(args) {
  const i = args.indexOf('--exclude')
  if (i < 0) return null
  const next = args[i + 1]
  if (!next || next.startsWith('--')) return []
  return parseExcludeFlag(next)
}

// Une los grupos elegidos con los globs propios del proyecto (los que no son de un preset).
function applyExcludePresets(existing, keys) {
  const presetGlobs = new Set(EXCLUDE_PRESETS.flatMap((p) => p.globs))
  const custom = (existing || []).filter((g) => !presetGlobs.has(g))
  const chosen = EXCLUDE_PRESETS.filter((p) => keys.includes(p.key)).flatMap((p) => p.globs)
  return [...custom, ...chosen]
}

async function askExcludePresets(existing) {
  const presetGlobs = new Set(EXCLUDE_PRESETS.flatMap((p) => p.globs))
  const hasPreset = (existing || []).some((g) => presetGlobs.has(g))
  const preselected = EXCLUDE_PRESETS.map((p, i) => (hasPreset ? (p.globs.some((g) => (existing || []).includes(g)) ? i : -1) : p.recommended ? i : -1)).filter((i) => i >= 0)
  const { cancelled, indices } = await selectMultiple('Que excluir del discovery (ademas de node_modules, dist, build)', EXCLUDE_PRESETS.map((p) => p.label), preselected)
  if (cancelled) return existing || []
  return applyExcludePresets(existing, indices.map((i) => EXCLUDE_PRESETS[i].key))
}

async function resolveAgent(args, existing, allowAsk = Boolean(process.stdin.isTTY)) {
  const flag = scanAgentFlag(args)
  if (flag) return flag
  if (existing && SUPPORTED_AGENTS.includes(existing)) return existing
  if (allowAsk) return askAgent()
  return DEFAULT_AGENT
}

async function mergeMcp(configDir, mcpMap) {
  if (Object.keys(mcpMap).length === 0) return { file: null, added: [] }

  const existing = []
  for (const c of ['opencode.json', 'opencode.jsonc']) {
    const p = join(configDir, c)
    if (await exists(p)) existing.push(p)
  }
  const targets = existing.length ? existing : [join(configDir, 'opencode.json')]

  const seen = new Set()
  const added = []
  for (const file of targets) {
    let cfg = {}
    if (await exists(file)) {
      try {
        cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
      } catch {
        console.warn(`ancleto: no se pudo leer ${basename(file)} como JSON; MCP no se agrego ahi`)
        continue
      }
    }
    cfg.mcp = cfg.mcp || {}
    for (const [name, def] of Object.entries(mcpMap)) {
      if (seen.has(name)) continue
      if (cfg.mcp[name]) { seen.add(name); continue }
      cfg.mcp[name] = def
      seen.add(name)
      added.push(name)
    }
    await writeFile(file, JSON.stringify(cfg, null, 2) + '\n')
  }
  return { file: targets.join(', '), added: [...new Set(added)] }
}

async function copyAssets(dest) {
  await mkdir(dest, { recursive: true })
  for (const d of ASSETS) {
    await cp(join(ROOT, d), join(dest, d), { recursive: true })
  }
}

const AGENT_SKILLS_DIR = {
  opencode: '.opencode/skills',
  vscode: '.vscode/skills',
  antigravity: '.antigravity/skills',
  cursor: '.cursor/skills',
  roo: '.roo/skills'
}

const ANCLETO_SKILLS = ['ancleto-new', 'ancleto-propose', 'ancleto-apply', 'ancleto-verify', 'ancleto-archive', 'ancleto-bulk-archive', 'ancleto-continue', 'ancleto-explore', 'ancleto-ff', 'ancleto-onboard', 'ancleto-workflow']

async function installAgentSkills(projectDir, agent) {
  const dir = AGENT_SKILLS_DIR[agent] || AGENT_SKILLS_DIR.opencode
  const dest = join(projectDir, dir)
  await mkdir(dest, { recursive: true })
  for (const name of ANCLETO_SKILLS) {
    const src = join(ROOT, 'skills', name)
    if (!(await exists(src))) {
      console.warn(`ancleto: skill no encontrada en el paquete: ${name}`)
      continue
    }
    await cp(src, join(dest, name), { recursive: true })
  }
  if (dir !== AGENT_SKILLS_DIR.opencode) {
    await cp(join(ROOT, 'skills'), dest, { recursive: true })
  }
  return dir.replace(/\\/g, '/')
}

const CHANGES_ROOT = 'aspec'

const DEFAULT_ASPEC_CONFIG = `# aspec project configuration
# Generado por @ancleto/spec (G5) - editalo libremente, no se sobrescribe en reinstalaciones.
schema: spec-driven-development
`

async function scaffoldAspec(projectDir) {
  const changesDir = join(projectDir, CHANGES_ROOT, 'changes')
  await mkdir(changesDir, { recursive: true })
  const configPath = join(projectDir, CHANGES_ROOT, 'config.yaml')
  if (!(await exists(configPath))) {
    await writeFile(configPath, DEFAULT_ASPEC_CONFIG)
  }
}

function extractLockedBlocks(content) {
  const blocks = new Map()
  const re = /<!--\s*LOCKED:\s*([\w-]+)\s*-->([\s\S]*?)<!--\s*\/LOCKED:\s*\1\s*-->/g
  let m
  while ((m = re.exec(content)) !== null) {
    blocks.set(m[1], m[0])
  }
  return blocks
}

function replaceLockedBlock(local, name, sourceBlock) {
  const re = new RegExp(`<!--\\s*LOCKED:\\s*${escapeRe(name)}\\s*-->[\\s\\S]*?<!--\\s*\\/LOCKED:\\s*${escapeRe(name)}\\s*-->`)
  if (!re.test(local)) return null
  return local.replace(re, sourceBlock)
}

function mergeLocked(source, local, filename) {
  const blocks = extractLockedBlocks(source)
  let result = local
  for (const [name, sourceBlock] of blocks) {
    const replaced = replaceLockedBlock(result, name, sourceBlock)
    if (replaced !== null) {
      result = replaced
      continue
    }
    // Si el nombre del bloque aparece igual en el archivo (p. ej. tag de cierre faltante),
    // esta mal formado: se avisa y NO se toca, para no duplicar contenido.
    const nameSeen = new RegExp(`<!--\\s*LOCKED:\\s*${escapeRe(name)}\\s*-->`).test(result)
    if (nameSeen) {
      console.warn(`ancleto: no se pudo actualizar el bloque LOCKED "${name}" en ${filename} (tags ausentes o mal formados)`)
      continue
    }
    // El bloque es nuevo (feature agregada al template): se inserta sin tocar el resto.
    const anchor = findInsertAnchor(result, source, name)
    if (anchor === null) {
      console.warn(`ancleto: no se pudo insertar el bloque LOCKED "${name}" en ${filename}`)
    } else {
      result = result.slice(0, anchor) + sourceBlock + '\n\n' + result.slice(anchor)
    }
  }
  return result
}

// Punto de insercion para un bloque LOCKED nuevo: justo antes del bloque LOCKED
// que lo sigue en el template, o al final del archivo si es el ultimo.
function findInsertAnchor(local, source, name) {
  const order = [...extractLockedBlocks(source).keys()]
  const nextInSource = order[order.indexOf(name) + 1]
  if (nextInSource && extractLockedBlocks(local).has(nextInSource)) {
    const at = local.search(new RegExp(`<!--\\s*LOCKED:\\s*${escapeRe(nextInSource)}\\s*-->`))
    if (at >= 0) return at
  }
  return local.length
}

async function copyTemplates(projectDir) {
  const dest = join(projectDir, '.opencode')
  await copyAssets(dest)
  for (const t of TEMPLATES) {
    const target = join(projectDir, t)
    const source = await readFile(join(ROOT, 'templates', t), 'utf8')
    if (!(await exists(target))) {
      await writeFile(target, source)
      continue
    }
    const local = await readFile(target, 'utf8')
    const merged = mergeLocked(source, local, t)
    if (merged !== local) {
      await writeFile(target, merged)
    }
  }
}

async function install(args) {
  const pi = args.indexOf('--project')
  const explicitProject = pi >= 0 ? args[pi + 1] : null
  const withMcp = !args.includes('--no-mcp')
  let mcpMap = withMcp ? buildDefaultMcp({ withEngram: args.includes('--with-engram') }) : {}

  const agentFlag = scanAgentFlag(args)
  let tier = scanTierFlag(args)

  let projectDir
  if (explicitProject) {
    projectDir = resolve(explicitProject)
    if (!(await exists(projectDir))) {
      console.error(`ancleto: el directorio no existe: ${projectDir}`)
      process.exit(1)
    }
  } else if (!args.includes('--global') && (await exists(join(process.cwd(), '.ancletorc')))) {
    // Estar parado en un proyecto ancleto implica operar sobre ese proyecto.
    // `--global` fuerza el alcance global cuando el repo tambien tiene .ancletorc.
    projectDir = process.cwd()
  } else {
    projectDir = null
  }

  const target = projectDir ? join(projectDir, '.opencode') : globalConfigDir()
  const existingRc = projectDir ? await readAncletorc(projectDir) : null
  const storedTier = (await exists(tierStatePath(target)))
    ? (await readFile(tierStatePath(target), 'utf8')).trim()
    : null

  let agent = agentFlag || (existingRc?.agent && SUPPORTED_AGENTS.includes(existingRc.agent) ? existingRc.agent : null)
  let language = scanLangFlag(args) || (existingRc?.language && SUPPORTED_LANGS.includes(existingRc.language) ? existingRc.language : null)
  const excludeFlag = scanExcludeFlag(args)
  const existingDiscovery = existingRc?.discovery || { outputDir: 'docs/technical-discovery', exclude: [] }
  let excludeChoice = excludeFlag

  let bannerShown = false
  const isInteractive = Boolean(process.stdout.isTTY) && ((projectDir && !agent) || !tier || !language || (projectDir && excludeChoice === null && (existingDiscovery.exclude || []).length === 0))
  if (isInteractive) {
    await showBanner()
    bannerShown = true
    if (projectDir && !agent) {
      agent = await selectOption('Agente/IDE', SUPPORTED_AGENTS, Math.max(0, SUPPORTED_AGENTS.indexOf(DEFAULT_AGENT)))
    }
    if (!tier) {
      const current = TIERS[storedTier] ? storedTier : ''
      tier = await selectOption('Tier de costo', Object.keys(TIERS), Math.max(0, Object.keys(TIERS).indexOf(current)))
    }
    if (!language) {
      const picked = await selectOption('Idioma de los artifacts', SUPPORTED_LANGS.map(langLabel), 0)
      language = SUPPORTED_LANGS[SUPPORTED_LANGS.map(langLabel).indexOf(picked)] || 'auto'
    }
    if (projectDir && excludeChoice === null && (existingDiscovery.exclude || []).length === 0) {
      excludeChoice = await askExcludePresets(existingDiscovery.exclude || [])
    }
    stopBanner()
  }
  if (!language) language = 'auto'

  if (projectDir && !agent) agent = DEFAULT_AGENT
  if (!tier) tier = TIERS[storedTier] ? storedTier : 'normal'

  let gratisModelChoice = null
  if (tier === 'gratis') {
    const env = envGratisModel()
    const persisted = isKnownGratisModel(existingRc?.gratisModel) ? existingRc.gratisModel : null
    if (env || persisted) {
      gratisModelChoice = env || persisted
    } else if (process.stdout.isTTY) {
      if (!bannerShown) await showBanner()
      const answer = await selectOption('Muse Spark 1.3 Free disponible en tu cuenta?', ['No (usar big-pickle)', 'Si (Muse Spark)'], 0)
      if (!bannerShown) stopBanner()
      gratisModelChoice = answer.startsWith('Si') ? MUSE_SPARK_MODEL : GRATIS_FALLBACK_MODEL
    } else {
      gratisModelChoice = gratisModel()
    }
  }

  if (projectDir) {
    await copyTemplates(projectDir)
    await scaffoldAspec(projectDir)
    await refreshWorkingContext(projectDir)
    const agentSkillsDir = await installAgentSkills(projectDir, agent)
    await writeManifest(projectDir, {
      agent,
      language,
      ...(excludeChoice !== null ? { discovery: { ...existingDiscovery, exclude: excludeChoice } } : {}),
      ...(gratisModelChoice ? { gratisModel: gratisModelChoice } : {}),
      installedPaths: {
        templates: ['AGENTS.md', 'PRODUCT.md'],
        agents: ['.opencode/agents'],
        commands: ['.opencode/commands'],
        skills: [agentSkillsDir]
      }
    })
  } else {
    await copyAssets(target)
  }

  const models = tierModels(tier, TIERS, gratisModelChoice)
  await applyTier(join(target, 'agents'), tier, models)
  await writeFile(tierStatePath(target), tier + '\n')

  if (projectDir) await registerProject(projectDir, { agent, tier })

  let azureMcp = false
  if (projectDir && withMcp) {
    const rc = await readAncletorc(projectDir)
    if (rc?.azure?.enabled) {
      mcpMap['azure-devops'] = { type: 'local', enabled: true, command: ['npx', '-y', '@davstack/mcp-azure-devops'] }
      azureMcp = true
    }
  }

  const res = await mergeMcp(target, mcpMap)
  const loc = projectDir
    ? `${projectDir} (.opencode/ + templates en la raiz)`
    : `${target} (disponible en todos tus proyectos)`
  console.log(`ancleto: instalado en ${loc}`)
  console.log(`ancleto: tier de costo de agents: ${tier}`)
  if (tier === 'gratis') console.log(`ancleto: modelo gratis: ${models.orchestrator}`)
  if (res.added.length) {
    console.log(`ancleto: MCP configurados: ${res.added.join(', ')} en ${res.file}`)
  }
  if (azureMcp) console.log(AZURE_MCP_NOTICE)
}

async function upgradeCmd(args) {
  const projectDir = process.cwd()
  const rc = await readAncletorc(projectDir)
  if (!rc) {
    console.error("Error: No se encontro .ancletorc. Ejecuta 'ancleto init' primero.")
    process.exit(1)
  }
  const legacyChanges = join(projectDir, 'openspec')
  const changesRoot = join(projectDir, CHANGES_ROOT)
  if ((await exists(legacyChanges)) && !(await exists(changesRoot))) {
    await rename(legacyChanges, changesRoot)
    console.log('ancleto: changes migrados de openspec/ a aspec/')
  } else if ((await exists(legacyChanges)) && (await exists(changesRoot))) {
    console.warn('ancleto: existen openspec/ y aspec/ — no se migro nada (revisar manualmente)')
  }
  const agent = await resolveAgent(args, rc.agent)
  await copyTemplates(projectDir)
  const agentSkillsDir = await installAgentSkills(projectDir, agent)
  const wentContext = await refreshWorkingContext(projectDir)
  const manifest = await writeManifest(projectDir, {
    agent,
    installedPaths: {
      templates: ['AGENTS.md', 'PRODUCT.md'],
      agents: ['.opencode/agents'],
      commands: ['.opencode/commands'],
      skills: [agentSkillsDir]
    }
  })
  console.log(`ancleto: upgrade completo (v${manifest.version}, agente: ${agent})`)
  console.log('  ✔ templates re-aplicados (bloques LOCKED actualizados, EXTENSIBLE intacto)')
  console.log(`  ✔ skills actualizadas en ${agentSkillsDir} (${ANCLETO_SKILLS.length} skills)`)
  console.log(wentContext ? '  ✔ working-context.md regenerado' : '  ✔ working-context.md sin reglas activas (vacio)')
  console.log('  ✔ manifiesto .ancletorc actualizado')
}

async function initProject(args) {
  const projectDir = process.cwd()
  const withAzure = args.includes('--with-azure')
  const agentFlag = scanAgentFlag(args)
  const tierFlag = scanTierFlag(args)
  const langFlag = scanLangFlag(args)
  const existing = await readAncletorc(projectDir)
  const azure = existing?.azure ?? { enabled: false }
  let discovery = existing?.discovery ?? { outputDir: 'docs/technical-discovery', exclude: [] }
  const tierFile = join(projectDir, '.opencode', '.ancleto-tier')
  const excludeFlag = scanExcludeFlag(args)
  let excludeChoice = excludeFlag

  let agent, tier, language
  language = langFlag || (existing?.language && SUPPORTED_LANGS.includes(existing.language) ? existing.language : null)
  const isInteractive = Boolean(process.stdout.isTTY) && (!agentFlag || !tierFlag || !language || (excludeChoice === null && (discovery.exclude || []).length === 0))
  if (isInteractive) {
    await showBanner()
    const agentIdx = Math.max(0, SUPPORTED_AGENTS.indexOf(existing?.agent))
    const storedTier = (await exists(tierFile)) ? (await readFile(tierFile, 'utf8')).trim() : null
    const tierIdx = Math.max(0, Object.keys(TIERS).indexOf(TIERS[storedTier] ? storedTier : ''))
    agent = agentFlag || await selectOption('Agente/IDE', SUPPORTED_AGENTS, agentIdx)
    tier = tierFlag || await selectOption('Tier de costo', Object.keys(TIERS), tierIdx)
    if (!language) {
      const picked = await selectOption('Idioma de los artifacts', SUPPORTED_LANGS.map(langLabel), 0)
      language = SUPPORTED_LANGS[SUPPORTED_LANGS.map(langLabel).indexOf(picked)] || 'auto'
    }
    if (excludeChoice === null && (discovery.exclude || []).length === 0) {
      excludeChoice = await askExcludePresets(discovery.exclude || [])
    }
    if (withAzure) {
      azure.enabled = true
    } else {
      azure.enabled = (await selectOption('Habilitar Azure DevOps', ['No', 'Si'], azure.enabled ? 1 : 0)) === 'Si'
    }
    stopBanner()
  } else {
    agent = await resolveAgent(args, existing?.agent, false)
    tier = tierFlag
    if (!tier) {
      // Paridad con install: sin flag se respeta el tier guardado. Sin esto un
      // re-init pelado re-copiaba los agents de origen y perdia los modelos aplicados.
      const stored = (await exists(tierFile)) ? (await readFile(tierFile, 'utf8')).trim() : null
      if (stored && TIERS[stored]) tier = stored
    }
    if (!language) language = 'auto'
    if (withAzure) azure.enabled = true
  }
  if (excludeChoice !== null) discovery = { ...discovery, exclude: excludeChoice }

  if (tier) {
    await mkdir(join(projectDir, '.opencode'), { recursive: true })
    await writeFile(tierFile, tier + '\n')
  }

  // Paridad con install: el tier elegido tambien reescribe los modelos de los
  // agentes locales. Antes quedaba huerfano (tier declarado, modelos de otro tier).
  let gratisModelChoice = null
  if (tier === 'gratis') {
    const persisted = isKnownGratisModel(existing?.gratisModel) ? existing.gratisModel : null
    gratisModelChoice = persisted || gratisModel()
  }
  const manifest = await writeManifest(projectDir, {
    azure,
    discovery,
    agent,
    language,
    ...(gratisModelChoice ? { gratisModel: gratisModelChoice } : {})
  })
  await copyTemplates(projectDir)
  if (tier) {
    await applyTier(join(projectDir, '.opencode', 'agents'), tier, tierModels(tier, TIERS, gratisModelChoice))
  }
  await scaffoldAspec(projectDir)
  await refreshWorkingContext(projectDir)
  await registerProject(projectDir, { agent, tier: tier || null })
  if (azure.enabled) console.log(AZURE_MCP_NOTICE)
  console.log(`ancleto: .ancletorc actualizado en ${projectDir} (v${manifest.version})${azure.enabled ? ' (Azure habilitado)' : ' (Azure desactivado)'} (Agente: ${agent})${tier ? ` (Tier: ${tier})` : ''} (Idioma: ${language})`)
}

const DEFAULT_IGNORES = ['node_modules', '.git', 'dist']
const EXPECTED_DOCS = ['index.md', 'overview.md', 'setup.md', 'inventory.md', 'integrations.md', 'decisions.md', 'unknowns.md', 'units/_map.md']

async function loadDiscoveryConfig() {
  const rc = join(process.cwd(), '.ancletorc')
  const defaults = { outputDir: 'docs/technical-discovery', exclude: [] }
  if (!(await exists(rc))) return defaults
  try {
    const cfg = JSON.parse((await readFile(rc, 'utf8')).replace(/^\uFEFF/, ''))
    const d = cfg.discovery || {}
    return {
      outputDir: d.outputDir || defaults.outputDir,
      exclude: Array.isArray(d.exclude) ? d.exclude : []
    }
  } catch {
    return defaults
  }
}

function escapeRe(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

function matchesGlob(rel, glob) {
  if (glob.includes('**')) {
    return new RegExp('^' + glob.split('**').map(escapeRe).join('.*') + '$').test(rel)
  }
  return new RegExp('^' + glob.split('*').map(escapeRe).join('[^/]*') + '(/|$)').test(rel)
}

function isIgnored(rel, exclude) {
  if (rel.split('/').some((seg) => DEFAULT_IGNORES.includes(seg))) return true
  return exclude.some((g) => matchesGlob(rel, g))
}

async function walk(dir, rel, exclude, out, outputDir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name
    if (relPath === outputDir) continue
    if (e.isDirectory()) {
      if (isIgnored(relPath, exclude)) continue
      await walk(join(dir, e.name), relPath, exclude, out, outputDir)
    } else if (e.isFile()) {
      if (isIgnored(relPath, exclude)) continue
      out.push(relPath)
    }
  }
}

async function computeSources() {
  const { outputDir, exclude } = await loadDiscoveryConfig()
  const sources = []
  await walk(process.cwd(), '', exclude, sources, outputDir)
  return sources.sort()
}

async function hashSources(sources) {
  const h = createHash('sha256')
  const fileHashes = {}
  for (const rel of sources) {
    try {
      const content = await readFile(join(process.cwd(), rel))
      fileHashes[rel] = createHash('sha256').update(content).digest('hex').slice(0, 16)
      h.update(rel)
      h.update('\0')
      h.update(String(content.length))
      h.update('\0')
      h.update(content)
      h.update('\n')
    } catch {}
  }
  return { hash: h.digest('hex'), fileHashes }
}

// Archivos cuyo cambio altera la arquitectura (configs de runtime, entry points).
const MATERIAL_FILE_RES = [
  /^package\.json$/,
  /^tsconfig(\..+)?\.json$/,
  /^jsconfig\.json$/,
  /^(vite|webpack|rollup|next|nuxt|astro|svelte|tailwind)\.config\.[cm]?[jt]s$/,
  /^docker-compose\.ya?ml$/,
  /^Dockerfile$/,
  /^index\.html$/,
  /^src\/(main|index)\.[cm]?[jt]sx?$/
]

function isMaterialFile(rel) {
  return MATERIAL_FILE_RES.some((re) => re.test(rel))
}

// Area = directorio de primer nivel; los archivos raiz son su propia area.
function areaOf(rel) {
  const i = rel.indexOf('/')
  return i === -1 ? rel : rel.slice(0, i)
}

function computeImpact(stored, sources, fileHashes) {
  const storedList = new Set(stored.sources || [])
  const currentList = new Set(sources)
  const storedFiles = stored.fileHashes || null
  const changedAreas = new Set()
  const materialReasons = []
  const notes = []

  for (const rel of sources) {
    if (!storedList.has(rel)) {
      changedAreas.add(areaOf(rel))
      if (isMaterialFile(rel)) materialReasons.push(`archivo material nuevo: ${rel}`)
    }
  }
  for (const rel of storedList) {
    if (!currentList.has(rel)) {
      changedAreas.add(areaOf(rel))
      if (isMaterialFile(rel)) materialReasons.push(`archivo material eliminado: ${rel}`)
    }
  }
  if (storedFiles) {
    for (const rel of sources) {
      if (storedFiles[rel] && storedFiles[rel] !== fileHashes[rel]) {
        changedAreas.add(areaOf(rel))
        if (isMaterialFile(rel)) materialReasons.push(`archivo material modificado: ${rel}`)
      }
    }
  }

  const storedAreas = new Set([...storedList].map(areaOf))
  const currentAreas = new Set(sources.map(areaOf))
  for (const a of currentAreas) if (!storedAreas.has(a)) materialReasons.push(`area raiz nueva: ${a}`)
  for (const a of storedAreas) if (!currentAreas.has(a)) materialReasons.push(`area raiz eliminada: ${a}`)

  if (!storedFiles && changedAreas.size === 0) {
    notes.push('estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area')
  }

  const impact = materialReasons.length ? 'material' : changedAreas.size || notes.length ? 'minor' : 'none'
  return { impact, changedAreas: [...changedAreas].sort(), materialReasons, notes }
}

// seed-map.json lo escribe la skill al generar: cada documento → areas de
// primer nivel (o archivos raiz) de las que saco evidencia. Misma convencion que areaOf.
async function readSeedMap(outputDir) {
  try {
    const raw = await readFile(join(outputDir, 'seed-map.json'), 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (!parsed || typeof parsed.docs !== 'object' || parsed.docs === null) return null
    return parsed.docs
  } catch {
    return null
  }
}

function affectedDocsFor(seedMap, changedAreas) {
  if (!seedMap || !changedAreas.length) return []
  const out = new Set()
  for (const [doc, areas] of Object.entries(seedMap)) {
    if (Array.isArray(areas) && areas.some((a) => changedAreas.includes(a))) out.add(doc)
  }
  return [...out].sort()
}

function statePath(outputDir) {
  return join(outputDir, '.discovery-state.json')
}

async function presentDocs(outputDir) {
  const present = []
  for (const d of EXPECTED_DOCS) {
    if (await exists(join(outputDir, d))) present.push(d)
  }
  return present
}

function flagValue(args, flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

async function checkDiscovery() {
  const config = await loadDiscoveryConfig()
  const { outputDir } = config
  const tier = readProjectTier(process.cwd())
  const present = await presentDocs(outputDir)
  let state, action, message, missingDocs, impact = 'none', changedAreas = [], materialReasons = [], notes = [], affectedDocs = [], seedMapPresent = false
  if (present.length === 0) {
    state = 'MISSING'
    action = 'generate'
    message = 'No technical seed documents found.'
    missingDocs = EXPECTED_DOCS
  } else if (present.length < EXPECTED_DOCS.length) {
    state = 'PARTIAL'
    action = 'complete'
    missingDocs = EXPECTED_DOCS.filter((d) => !present.includes(d))
    message = `Faltan ${missingDocs.length} documentos del seed.`
  } else {
    const sources = await computeSources()
    const { hash, fileHashes } = await hashSources(sources)
    let stored = null
    const sp = statePath(outputDir)
    if (await exists(sp)) {
      try {
        stored = JSON.parse((await readFile(sp, 'utf8')).replace(/^\uFEFF/, ''))
      } catch {}
    }
    if (!stored?.hash) {
      state = 'STALE'
      impact = 'material'
      action = 'regenerate'
      message = 'Seed completo pero sin estado registrado — frescura desconocida.'
    } else if (stored.hash === hash) {
      state = 'READY'
      action = 'continue'
      message = 'El seed esta al dia.'
    } else {
      const diff = computeImpact(stored, sources, fileHashes)
      impact = diff.impact
      changedAreas = diff.changedAreas
      materialReasons = diff.materialReasons
      notes = diff.notes
      const seedMap = await readSeedMap(outputDir)
      seedMapPresent = seedMap !== null
      affectedDocs = affectedDocsFor(seedMap, changedAreas)
      state = 'STALE'
      if (impact === 'material') {
        action = 'regenerate'
        message = 'El repositorio cambio en areas materiales (config/entry points/estructura).'
      } else {
        action = 'continue'
        message = 'Cambios menores desde el ultimo pack; el seed sigue siendo util.'
      }
    }
    missingDocs = []
  }
  console.log(JSON.stringify({
    schemaVersion: 2,
    state,
    impact,
    recommendedAction: action,
    message,
    missingDocs,
    changedAreas,
    materialReasons,
    notes,
    affectedDocs,
    seedMapPresent,
    config: {
      outputDir,
      exclude: config.exclude,
      tier
    }
  }, null, 2))
}

async function runRepomix(flags, tmpFile) {
  const local = await resolveBin('repomix')
  const tier = readProjectTier(process.cwd())
  const { exclude } = await loadDiscoveryConfig()
  const args = []
  if (!local) args.push('-y', 'repomix@1.18.0')
  args.push('--output', tmpFile, ...buildRepomixArgs(flags, tier, exclude))
  const cmd = local || 'npx'
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: process.cwd(), shell: true })
  if (r.error) {
    console.error(`ancleto: no se pudo ejecutar repomix: ${r.error.message}`)
    process.exit(1)
  }
  if (r.status !== 0) {
    console.error(`ancleto: repomix fallo (exit ${r.status}):`)
    console.error((r.stderr || r.stdout || '').trim())
    process.exit(1)
  }
  return r
}

async function packDiscovery(flags) {
  const { outputDir } = await loadDiscoveryConfig()
  try { writeDiscoveryMap(process.cwd()) } catch {}
  const tmpFile = join(tmpdir(), `ancleto-pack-${Date.now()}.txt`)
  await runRepomix(flags, tmpFile)
  let content = ''
  try { content = await readFile(tmpFile, 'utf8') } catch {}
  const tokens = Math.round(content.length / 4)
  const explicit = flagValue(flags, '--token-budget')
  const budget = explicit ? Number(explicit) : tierTokenBudget(readProjectTier(process.cwd()))
  if (budget && tokens > budget) {
    console.error(`ancleto: el pack supera el token-budget (${tokens} > ${budget})`)
    process.exit(1)
  }
  const sources = await computeSources()
  const { hash, fileHashes } = await hashSources(sources)
  await mkdir(outputDir, { recursive: true })
  await writeFile(statePath(outputDir), JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    sources,
    fileHashes,
    hash,
    packTokens: tokens
  }, null, 2) + '\n')
  console.log(`ancleto: pack generado (${sources.length} archivos, ~${tokens} tokens)`)
  console.log(`ancleto: estado guardado en ${statePath(outputDir)}`)
  console.log(`ancleto: el seed lo genera la skill ancleto-technical-discovery a partir del pack`)
}

async function discovery(flags) {
  if (flags.includes('--check')) {
    await checkDiscovery()
    return
  }
  if (flags.includes('--help') || flags.includes('-h')) {
    console.log(`ancleto discovery [--compress] [--include G] [--ignore G] [--token-budget N]
  Genera el pack Repomix del repo y guarda el estado del seed.

  --check           Estado del seed en JSON (READY/STALE/PARTIAL/MISSING) + config
  --compress        Pack comprimido (tree-sitter)
  --include <glob>  Incluir solo paths que matcheen
  --ignore <glob>   Excluir paths (ademas de los de .ancletorc)
  --token-budget N  Presupuesto de tokens del tier

  El seed en si lo genera la skill ancleto-technical-discovery a partir del pack.`)
    return
  }
  await packDiscovery(flags)
}

async function refreshWorkingContext(projectDir, scope = 'project') {
  const dbPath = defaultMemoryDbPath(projectDir)
  if (!(await exists(dbPath))) return null
  const engine = createMemoryEngine(dbPath)
  let block
  try {
    block = engine.buildWorkingContext(scope)
  } finally {
    engine.close()
  }
  const out = join(projectDir, '.ancleto', 'working-context.md')
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, block === null ? '' : block + '\n')
  return block === null ? null : out
}

async function memoryContext(flags) {
  const scope = flagValue(flags, '--scope') || 'project'
  const out = flagValue(flags, '--out')
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    process.exit(0)
  }
  const engine = createMemoryEngine(dbPath)
  try {
    const block = engine.buildWorkingContext(scope)
    if (block === null) {
      if (out) await writeFile(resolve(out), '')
      console.error(`ancleto: sin reglas activas para el scope "${scope}"`)
      return
    }
    if (out) {
      await writeFile(resolve(out), block + '\n')
      console.log(`ancleto: bloque <ProjectMemoryRules> escrito en ${out}`)
    } else {
      console.log(block)
    }
  } finally {
    engine.close()
  }
}

async function memoryDoctorCmd(flags) {
  const rebuild = flags.includes('--rebuild')
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    process.exit(0)
  }
  const { checks, healthy, rebuilt } = memoryDoctor(dbPath, { rebuild })
  if (rebuilt) console.log('ancleto: indice FTS5 reconstruido')
  for (const c of checks) {
    console.log(`  ${c.ok ? '✔' : '✖'} ${c.name}: ${c.detail}`)
  }
  process.exit(healthy ? 0 : 1)
}

async function memoryListCmd(flags) {
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    process.exit(0)
  }
  const type = flagValue(flags, '--type')
  const scope = flagValue(flags, '--scope')
  const status = flags.includes('--all') ? null : 'active'
  if (type && type !== 'rule' && type !== 'decision') {
    console.error(`ancleto: --type invalido: ${type} (rule|decision)`)
    process.exit(1)
  }
  if (scope && !['project', 'feature', 'task'].includes(scope)) {
    console.error(`ancleto: --scope invalido: ${scope} (project|feature|task)`)
    process.exit(1)
  }

  // read-only: el engine abre la DB sin migrar y sin escribir (no toca el WAL)
  const engine = createReadonlyMemoryEngine(dbPath)
  let nodes
  try {
    nodes = engine.listNodes({ type, scope, status })
  } catch (err) {
    console.error(`ancleto: no se pudo leer la memoria: ${err.message}`)
    process.exit(1)
  } finally {
    engine.close()
  }

  if (flags.includes('--json')) {
    console.log(JSON.stringify(nodes, null, 2))
    return
  }
  if (nodes.length === 0) {
    console.log('ancleto: sin nodos para ese filtro')
    return
  }
  for (const n of nodes) {
    console.log(`  [${n.type}/${n.scope}${n.status === 'active' ? '' : '/' + n.status}] ${n.memory_key}`)
    console.log(`      ${n.content}`)
  }
  console.log(`ancleto: ${nodes.length} nodo(s)`)
}

async function memoryCmd(args) {
  const [sub, ...flags] = args
  if (sub === 'context') {
    await memoryContext(flags)
    return
  }
  if (sub === 'list') {
    await memoryListCmd(flags)
    return
  }
  if (sub === 'doctor') {
    await memoryDoctorCmd(flags)
    return
  }
  console.error(`ancleto: subcomando de memory desconocido: ${sub || '(ninguno)'}`)
  console.error('ancleto: uso: ancleto memory context [--scope X] [--out file]')
  console.error('ancleto: uso: ancleto memory list [--type X] [--scope X] [--all] [--json]')
  console.error('ancleto: uso: ancleto memory doctor [--rebuild]')
  process.exit(1)
}

async function checkCommand() {
  const cwd = process.cwd()
  const rc = await readAncletorc(cwd)
  if (!rc || !rc.installedPaths) {
    console.error('ancleto: no hay .ancletorc con installedPaths (corre ancleto init y ancleto install --project)')
    process.exit(1)
  }
  const ip = rc.installedPaths
  let missing = 0
  let orphans = 0

  for (const t of ip.templates || []) {
    if (await exists(join(cwd, t))) {
      console.log(`  ✔ ${t}`)
    } else {
      console.log(`  ✖ ${t} (faltante)`)
      missing++
    }
  }

  for (const cat of ['agents', 'commands', 'skills']) {
    for (const dirRel of ip[cat] || []) {
      const destDir = join(cwd, dirRel)
      if (!(await exists(destDir))) {
        console.log(`  ✖ ${dirRel} (directorio faltante)`)
        missing++
        continue
      }
      const expected = (await readdir(join(ROOT, cat))).sort()
      const actual = (await readdir(destDir)).sort()
      const missingFiles = expected.filter((f) => !actual.includes(f))
      const orphanFiles = actual.filter((f) => !expected.includes(f))
      for (const f of missingFiles) {
        console.log(`  ✖ ${dirRel}/${f} (faltante)`)
        missing++
      }
      for (const f of orphanFiles) {
        console.log(`  ⚠ ${dirRel}/${f} (huerfano)`)
        orphans++
      }
      if (missingFiles.length === 0 && orphanFiles.length === 0) {
        console.log(`  ✔ ${dirRel} (${actual.length} archivos)`)
      }
    }
  }

  const warnings = await checkTierOrphan(cwd)

  console.log(`ancleto: check -> ${missing} faltantes, ${orphans} huerfanos`)
  for (const w of warnings) console.log(`  ⚠ ${w}`)
  process.exit(missing > 0 ? 1 : 0)
}

// Avisa si hay un tier del proyecto sin agentes locales donde aplicarlo:
// el tier solo se aplica a los agentes instalados en el proyecto, no a los globales.
async function checkTierOrphan(cwd) {
  const warnings = []
  const tierFile = join(cwd, '.opencode', '.ancleto-tier')
  if (!(await exists(tierFile))) return warnings
  const tier = (await readFile(tierFile, 'utf8')).trim()
  if (!TIERS[tier]) return warnings
  const localAgents = join(cwd, '.opencode', 'agents')
  let count = 0
  if (await exists(localAgents)) {
    count = (await readdir(localAgents)).filter((f) => f.endsWith('.md')).length
  }
  if (count === 0) {
    warnings.push(`tier "${tier}" sin agentes locales donde aplicarlo — este proyecto usa los agentes globales. Corre 'ancleto install --project .' para que el tier aplique, o borra .opencode/.ancleto-tier.`)
  }
  return warnings
}

// Un spec es canonico cuando usa los keywords literales en ingles. Detecta specs
// traducidos (p. ej. "#### RF1:" + "**Dado**/**Cuando**/**Entonces**"), que rompen
// la cobertura por keywords y el merge de deltas.
function specIssues(content) {
  const missing = []
  if (!/^###\s+Requirement:/m.test(content)) missing.push('### Requirement:')
  if (/^####\s+Scenario:/m.test(content)) {
    if (!/\bWHEN\b/.test(content)) missing.push('WHEN')
    if (!/\bTHEN\b/.test(content)) missing.push('THEN')
  }
  const unexpected = []
  const re = /^####\s+(.+)$/gm
  let m
  while ((m = re.exec(content)) !== null) {
    if (!/^Scenario\b/.test(m[1])) unexpected.push(`#### ${m[1]}`)
  }
  return { missing, unexpected }
}

async function collectSpecFiles(dir) {
  const out = []
  if (!(await exists(dir))) return out
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await collectSpecFiles(p)))
    else if (e.name === 'spec.md') out.push(p)
  }
  return out
}

async function specsCheckCommand(args) {
  const cwd = process.cwd()
  const asJson = args.includes('--json')
  const ci = args.indexOf('--change')
  const change = ci >= 0 ? args[ci + 1] : null
  const files = await collectSpecFiles(join(cwd, CHANGES_ROOT, 'specs'))
  if (change) {
    const changeDir = join(cwd, CHANGES_ROOT, 'changes', change)
    if (!(await exists(changeDir))) {
      console.error(`ancleto: no existe el change "${change}" en ${CHANGES_ROOT}/changes/`)
      process.exit(1)
    }
    files.push(...(await collectSpecFiles(join(changeDir, 'specs'))))
  }
  const findings = []
  for (const f of files) {
    const { missing, unexpected } = specIssues(await readFile(f, 'utf8'))
    if (missing.length || unexpected.length) {
      findings.push({ file: relative(cwd, f).replace(/\\/g, '/'), missing, unexpected })
    }
  }
  const ok = findings.length === 0
  if (asJson) {
    console.log(JSON.stringify({ ok, scanned: files.length, nonCanonical: findings }, null, 2))
  } else if (files.length === 0) {
    console.log('ancleto: no hay specs para revisar')
  } else {
    for (const f of files) {
      const rel = relative(cwd, f).replace(/\\/g, '/')
      const found = findings.find((x) => x.file === rel)
      if (found) {
        console.log(`  ✖ ${rel} (revisar: ${[...found.missing, ...found.unexpected].join(', ')})`)
      } else {
        console.log(`  ✔ ${rel}`)
      }
    }
    console.log(ok ? `ancleto: ${files.length} spec(s) canonicos` : `ancleto: ${findings.length} de ${files.length} spec(s) sin keywords canonicos`)
  }
  process.exit(ok ? 0 : 1)
}

function opencodeDbPath() {
  return process.env.ANCLETO_OPENCODE_DB || join(homedir(), '.local', 'share', 'opencode', 'opencode.db')
}

function fmtTokens(n) {
  if (!n) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

function fmtCost(c) {
  return c && c < 0.01 ? `$${c.toFixed(4)}` : `$${(c || 0).toFixed(2)}`
}

function fmtDate(ms) {
  const d = new Date(ms || 0)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const normPath = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

function sessionModel(model) {
  try {
    const m = JSON.parse(model || '{}')
    return m.id ? `${m.id}${m.providerID ? ` (${m.providerID})` : ''}` : ''
  } catch {
    return ''
  }
}

function buildSessionTree(sessions) {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const children = new Map()
  for (const s of sessions) {
    if (!s.parent_id) continue
    if (!children.has(s.parent_id)) children.set(s.parent_id, [])
    children.get(s.parent_id).push(s)
  }
  const cache = new Map()
  const totalsOf = (id) => {
    if (cache.has(id)) return cache.get(id)
    const own = byId.get(id)
    const t = {
      input: own?.tokens_input || 0,
      output: own?.tokens_output || 0,
      reasoning: own?.tokens_reasoning || 0,
      cacheRead: own?.tokens_cache_read || 0,
      cacheWrite: own?.tokens_cache_write || 0,
      cost: own?.cost || 0,
      sessions: own ? 1 : 0
    }
    for (const c of children.get(id) || []) {
      const ct = totalsOf(c.id)
      t.input += ct.input
      t.output += ct.output
      t.reasoning += ct.reasoning
      t.cacheRead += ct.cacheRead
      t.cacheWrite += ct.cacheWrite
      t.cost += ct.cost
      t.sessions += ct.sessions
    }
    cache.set(id, t)
    return t
  }
  const subtreeIds = (id) => [id, ...(children.get(id) || []).flatMap((c) => subtreeIds(c.id))]
  return { byId, totalsOf, subtreeIds }
}

function sessionInfo(s, totals) {
  return {
    id: s.id,
    title: s.title || null,
    agent: s.agent || null,
    model: sessionModel(s.model) || null,
    subagentSessions: Math.max(0, totals.sessions - 1),
    timeCreated: s.time_created || null,
    timeUpdated: s.time_updated || null,
    cost: totals.cost,
    tokens: {
      input: totals.input,
      output: totals.output,
      reasoning: totals.reasoning,
      cacheRead: totals.cacheRead,
      cacheWrite: totals.cacheWrite
    }
  }
}

async function statsCommand(args) {
  const asJson = args.includes('--json')
  const all = args.includes('--all')
  const si = args.indexOf('--session')
  const sessionId = si >= 0 ? args[si + 1] : null
  const li = args.indexOf('--limit')
  const limit = li >= 0 ? Number.parseInt(args[li + 1], 10) : 10
  if (li >= 0 && (!Number.isFinite(limit) || limit < 1)) {
    console.error('ancleto: --limit requiere un entero >= 1')
    process.exit(1)
  }
  const sinceIdx = args.indexOf('--since')
  const sinceRaw = sinceIdx >= 0 ? args[sinceIdx + 1] : null
  let since = null
  if (sinceRaw) {
    const t = Date.parse(`${sinceRaw}T00:00:00`)
    if (Number.isNaN(t)) {
      console.error('ancleto: --since requiere formato YYYY-MM-DD')
      process.exit(1)
    }
    since = t
  }

  const dbPath = opencodeDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no se encontro la base de sesiones de opencode en ${dbPath}`)
    console.error('ancleto: ancleto stats solo funciona con opencode (podes apuntar ANCLETO_OPENCODE_DB a la base)')
    process.exit(1)
  }
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let allSessions
  try {
    allSessions = db.prepare('SELECT * FROM session').all()
  } catch (err) {
    console.error(`ancleto: no se pudo leer la base de sesiones: ${err.message}`)
    process.exit(1)
  }
  const tree = buildSessionTree(allSessions)
  const cwd = process.cwd()

  if (sessionId) {
    const root = tree.byId.get(sessionId)
    if (!root) {
      console.error(`ancleto: no existe la sesion "${sessionId}"`)
      process.exit(1)
    }
    const ids = tree.subtreeIds(sessionId)
    let messages = []
    try {
      messages = db.prepare(`SELECT data FROM message WHERE session_id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    } catch {
      messages = []
    }
    const byAgent = new Map()
    for (const row of messages) {
      let d
      try {
        d = JSON.parse(row.data)
      } catch {
        continue
      }
      if (d.role !== 'assistant' || !d.tokens) continue
      const key = d.agent || '(desconocido)'
      const agg = byAgent.get(key) || { agent: key, messages: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
      agg.messages++
      agg.input += d.tokens.input || 0
      agg.output += d.tokens.output || 0
      agg.reasoning += d.tokens.reasoning || 0
      agg.cacheRead += d.tokens.cache?.read || 0
      agg.cacheWrite += d.tokens.cache?.write || 0
      byAgent.set(key, agg)
    }
    const agents = [...byAgent.values()].sort((a, b) => b.input - a.input)
    const totals = tree.totalsOf(sessionId)
    db.close()
    if (asJson) {
      console.log(JSON.stringify({ ok: true, scope: 'session', session: sessionInfo(root, totals), byAgent: agents, totals }, null, 2))
      return
    }
    console.log(`ancleto: sesion ${root.id}`)
    console.log(`  titulo: ${root.title || '(sin titulo)'}`)
    console.log(`  agente: ${root.agent || '-'} · modelo: ${sessionModel(root.model) || '-'}`)
    console.log(`  creada: ${fmtDate(root.time_created)} · ultima actividad: ${fmtDate(root.time_updated)}`)
    console.log(`  sesiones incluidas: ${totals.sessions} (raiz + subagentes)`)
    console.log('')
    console.log('  agente        mensajes   entrada   salida    razon     cache-read')
    for (const a of agents) {
      console.log(`  ${String(a.agent).padEnd(13)} ${String(a.messages).padEnd(10)} ${fmtTokens(a.input).padEnd(9)} ${fmtTokens(a.output).padEnd(9)} ${fmtTokens(a.reasoning).padEnd(9)} ${fmtTokens(a.cacheRead)}`)
    }
    console.log('')
    console.log(`  totales: entrada ${fmtTokens(totals.input)} · salida ${fmtTokens(totals.output)} · razon ${fmtTokens(totals.reasoning)} · cache ${fmtTokens(totals.cacheRead)} · costo ${fmtCost(totals.cost)}`)
    return
  }

  let roots = allSessions.filter((s) => !s.parent_id)
  let scope = 'all'
  if (!all) {
    scope = 'directory'
    const cwdN = normPath(cwd)
    const inDir = (d) => {
      const dn = normPath(d)
      return dn === cwdN || dn.startsWith(`${cwdN}/`) || cwdN.startsWith(`${dn}/`)
    }
    roots = roots.filter((s) => inDir(s.directory))
  }
  if (since !== null) roots = roots.filter((s) => (s.time_created || 0) >= since)
  roots.sort((a, b) => (b.time_updated || 0) - (a.time_updated || 0))
  const shown = roots.slice(0, limit)
  const rows = shown.map((s) => ({ ...sessionInfo(s, tree.totalsOf(s.id)), directory: s.directory }))
  const totals = rows.reduce(
    (acc, r) => {
      acc.input += r.tokens.input
      acc.output += r.tokens.output
      acc.reasoning += r.tokens.reasoning
      acc.cacheRead += r.tokens.cacheRead
      acc.cacheWrite += r.tokens.cacheWrite
      acc.cost += r.cost
      return acc
    },
    { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
  )
  db.close()

  if (asJson) {
    console.log(JSON.stringify({ ok: true, scope, directory: scope === 'directory' ? cwd.replace(/\\/g, '/') : null, since: sinceRaw || null, sessions: rows, totals }, null, 2))
    return
  }
  if (rows.length === 0) {
    console.log(`ancleto: no hay sesiones${scope === 'directory' ? ' para este directorio' : ''}${sinceRaw ? ` desde ${sinceRaw}` : ''}`)
    if (scope === 'directory') console.log('ancleto: proba --all para ver todas las sesiones de la maquina')
    return
  }
  console.log(`ancleto: stats (opencode)${scope === 'directory' ? ` — ${cwd.replace(/\\/g, '/')}` : ' — todas las sesiones'}${sinceRaw ? ` — desde ${sinceRaw}` : ''}`)
  console.log('')
  console.log('  fecha              agente        entrada   salida    razon     cache     costo    titulo')
  for (const r of rows) {
    console.log(`  ${fmtDate(r.timeUpdated).padEnd(18)} ${String(r.agent || '-').padEnd(13)} ${fmtTokens(r.tokens.input).padEnd(9)} ${fmtTokens(r.tokens.output).padEnd(9)} ${fmtTokens(r.tokens.reasoning).padEnd(9)} ${fmtTokens(r.tokens.cacheRead).padEnd(9)} ${fmtCost(r.cost).padEnd(8)} ${String(r.title || '').slice(0, 42)}`)
  }
  console.log('')
  const shownLabel = roots.length > rows.length ? `${rows.length} de ${roots.length} sesiones` : rows.length === 1 ? '1 sesion' : `${rows.length} sesiones`
  console.log(`  totales (${shownLabel}): entrada ${fmtTokens(totals.input)} · salida ${fmtTokens(totals.output)} · razon ${fmtTokens(totals.reasoning)} · cache ${fmtTokens(totals.cacheRead)} · costo ${fmtCost(totals.cost)}`)
}

async function doctorCommand() {
  let fatal = false

  const nodeVersion = process.versions.node
  const nodeMajor = Number(nodeVersion.split('.')[0])
  if (nodeMajor >= 24) {
    console.log(`  ✔ Node.js ${nodeVersion} (>=24)`)
  } else {
    console.log(`  ✖ Node.js ${nodeVersion} (requiere >=24 para node:sqlite)`)
    fatal = true
  }

  try {
    await import('node:sqlite')
    console.log('  ✔ node:sqlite importable')
  } catch (err) {
    console.log(`  ✖ node:sqlite no importable: ${err.message}`)
    fatal = true
  }

  const configDir = globalConfigDir()
  let cfgFile = null
  for (const c of ['opencode.json', 'opencode.jsonc']) {
    const p = join(configDir, c)
    if (await exists(p)) {
      cfgFile = p
      break
    }
  }
  if (!cfgFile) {
    console.log('  ⚠ opencode.json no encontrado (config MCP)')
  } else {
    try {
      JSON.parse((await readFile(cfgFile, 'utf8')).replace(/^\uFEFF/, ''))
      console.log(`  ✔ ${basename(cfgFile)} valido`)
    } catch {
      console.log(`  ✖ ${basename(cfgFile)} JSON invalido`)
    }
  }

  process.exit(fatal ? 1 : 0)
}

const [cmd, ...rest] = process.argv.slice(2)

switch (cmd) {
  case 'install':
  case 'update':
    await install(rest)
    break
  case 'upgrade':
    await upgradeCmd(rest)
    break
  case 'init':
    await initProject(rest)
    break
  case 'discovery':
    await discovery(rest)
    break
  case 'memory':
    await memoryCmd(rest)
    break
  case 'check':
    await checkCommand()
    break
  case 'specs':
    await specsCheckCommand(rest)
    break
  case 'stats':
    await statsCommand(rest)
    break
  case 'projects':
    await projectsCommand(rest)
    break
  case 'list':
    // Alias conveniente: `ancleto list --projects`
    if (rest.includes('--projects')) await projectsCommand(rest.filter((a) => a !== '--projects'))
    else {
      console.error('ancleto: uso: ancleto list --projects [--json]  (o ancleto projects)')
      process.exit(1)
    }
    break
  case 'doctor':
    await doctorCommand()
    break
  case 'mcp':
    await serveMemoryMcp()
    break
  case '--version':
  case '-v':
    console.log(`ancleto ${await packageVersion()}`)
    break
  case '--help':
  case '-h':
  case undefined:
    console.log(HELP)
    break
  default:
    console.error(`ancleto: comando desconocido: ${cmd}`)
    console.log(HELP)
    process.exit(1)
}