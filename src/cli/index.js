#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { cp, mkdir, access, writeFile, readFile, readdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { join, dirname, resolve, basename, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { createMemoryEngine, createReadonlyMemoryEngine, defaultMemoryDbPath } from '../core/memory/engine.js'
import { snapshotDatabase } from '../core/memory/snapshot.js'
import { adaptFrontmatter, parseFrontmatter, frontmatterValue } from '../core/adapters/frontmatter.js'
import { writeWorkingContext, writeWorkingContextBlock, workingContextPath, renderWorkingContextBlock, resolveMemoryProjectRoot, checkWorkingContextFreshness, refreshWorkingContextOnWrite } from '../core/memory/working-context.js'
import { materializeMachineEnv, checkMachineEnvTracked } from '../core/machine-env.js'
import { memoryDoctor } from '../core/memory/doctor.js'
import { curateMemory } from '../core/memory/curation.js'
import { serveMemoryMcp } from '../core/memory/mcp-server.js'
import { writeDiscoveryMap } from '../core/discovery.js'
import { computeAffectedSet } from '../core/affected-set.js'
import { mergeSpecText } from '../core/specs-merge.js'
import { readProjectTier, buildRepomixArgs, tierTokenBudget } from '../core/repomix-tier.js'
import { showBanner, selectOption, selectMultiple, stopBanner } from './ui.js'
import { TIERS, TIER_CHAINS, declaredModelIds, resolveTierModels, loadModelCatalog, modelIdsFromCatalog, gratisModel, isKnownGratisModel, freeTierOnPrimary } from '../core/tier-models.js'
import { catalogAgeDays, isCatalogStale, missingModelIdsInCatalog, validateCatalogSnapshot } from '../core/model-catalog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const ASSETS = ['agents', 'commands', 'skills']
const TEMPLATES = ['AGENTS.md', 'PRODUCT.md']
const AZURE_MCP_NOTICE = 'ancleto: MCP azure-devops habilitado — usa las variables de entorno AZURE_DEVOPS_ORG_URL y AZURE_DEVOPS_PAT'
// Candidatos de config MCP (mismo par, mismo orden en descubrimiento, merge y deteccion).
const PROJECT_MCP_CANDIDATES = ['opencode.json', 'opencode.jsonc']
// Nombres del fallback global de `doctor`, derivados del unico dueno del par.
const GLOBAL_MCP_CANDIDATES = PROJECT_MCP_CANDIDATES.map((candidate) => basename(candidate))

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
  ancleto install --agent <nombre>    opencode | claude | vscode | antigravity | cursor | roo | copilot | commandcode (wizard si no esta guardado)
                                   Elige el layout nativo a materializar (directorio + convencion de
                                   nombre) y el adapter de frontmatter del host. NO arbitra el
                                   descubrimiento entre hosts: si dos leen el mismo directorio, eso es
                                   efecto del host (no se deduplica ni se elige "ganador").
                                   antigravity instala skills, agents adaptados y commands como skills
                                   (.agents/*) y mergea el MCP de workspace .agents/mcp_config.json.
                                   commandcode instala skills, agents adaptados y commands en
                                   .commandcode/* y mergea el MCP de proyecto .mcp.json.
  ancleto install --profile <perfil>  general | test (perfil de test automation con Playwright; persiste en .ancletorc)
  ancleto update [--project <dir>]    Alias de install (re-instala sobre lo existente)
                                   Parado en un proyecto con .ancletorc opera sobre ese proyecto;
                                   usa --global para forzar el alcance global
  ancleto upgrade [--agent <nombre>]  Re-aplica templates (LOCKED) y skills sobre el proyecto actual
  ancleto init [--with-azure] [--agent <nombre>] [--tier <nivel>] [--lang <codigo>] [--exclude <globs>] [--no-mcp] [--profile <perfil>]
                                     Crea .ancletorc en el repositorio actual y configura el MCP del host
                                     (interactivo en TTY: banner + menu; Azure desactivado por defecto)
  ancleto discovery --check           Estado del seed (READY/STALE/PARTIAL/MISSING)
  ancleto discovery [--compress] [--include G] [--ignore G] [--token-budget N]
                                   Empaca el repo con Repomix y guarda estado
  ancleto specs check [--change <name>] [--json]
                                   Valida keywords canonicos (### Requirement:, WHEN, THEN)
                                   en aspec/specs y, con --change, en los deltas del change
  ancleto specs merge --change <slug> [--dry-run] [--json]
                                    Aplica el delta del change sobre los specs canonicos existentes
                                    (ADDED/MODIFIED/REMOVED/RENAMED por titulo exacto; fail-closed)
  ancleto affected [--cwd <dir>] [--json] <archivo...>
                                   Computa el affected-set (clausura de dependientes por el grafo
                                   de imports) sembrado por los archivos dados (read-only; reporta
                                   el conteo de specifiers externos no relativos como dato)
  ancleto stats [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>] [--json]
                                   Tokens por sesion de opencode (entrada/salida/razonamiento/cache),
                                   con rollup de subagentes y desglose por agente con --session
  ancleto stats failures [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>]
                         [--class <env|check|tool|unknown,...>] [--tool <t,...>] [--json]
                                   Fallos de tool parts de opencode clasificados en env/check/tool/unknown
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
ancleto memory doctor [--rebuild] Diagnostica .ancleto/memory.db (integridad, FTS5, unicidad,
                                     refs de nodos activos, checkpoint WAL)
                                     y reconstruye el indice FTS5 con --rebuild
  ancleto memory curate [--json] [--strict]  Curaduria read-only: refs rotas y duplicados exactos
  ancleto memory export [--out <archivo>]  Exporta nodos activos a JSON (stdout o archivo)
  ancleto memory import <archivo>          Importa nodos desde JSON (upsert por memory_key, idempotente)
  ancleto memory gc [--dry-run] [--days N] Purga superseded con antiguedad > N dias (default 30)
  ancleto memory snapshot --out <archivo.db> [--force] [--json]
                                   Copia consistente de la memoria (incluye historial; --force sobrescribe)
  ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]
                                   Supersede cada source activa hacia el target (sin crear nodos)
  ancleto memory consolidate [--dry-run] [--apply] [--json]
                                   Agrupa duplicados exactos y supersede los no canonicos
  ancleto mcp                           Servidor MCP de memoria propia (stdio) para tu IDE
                                        expone searchMemory, recordRule y recordDecision
  ancleto check                         Verifica integridad de archivos instalados vs manifiesto
  ancleto export [--tar <file>]         Empaqueta lo portable del proyecto (bundle + manifest.json sin rutas)
  ancleto import <bundle> [--repair]    Restaura el bundle regenerando el MCP local; --repair solo arregla entradas rotas
  ancleto import --repair               Repara in place la config MCP rota: command ausente/vacio o ruta absoluta inexistente; un nombre simple no es roto
  ancleto doctor                        Diagnostica el entorno (Node, node:sqlite, opencode.json)
  ancleto --help                      Esta ayuda
  ancleto --version                   Version del paquete
`

// Lista de uso de `memory`, compartida por la ayuda (STDOUT) y el error de
// subcomando desconocido (stderr) para que no derive.
const MEMORY_USAGE = [
  'ancleto memory context [--scope X] [--out file]',
  'ancleto memory list [--type X] [--scope X] [--all] [--json]',
  'ancleto memory doctor [--rebuild]',
  'ancleto memory export [--out <archivo>]',
  'ancleto memory import <archivo>',
  'ancleto memory gc [--dry-run] [--days <n>]',
  'ancleto memory snapshot --out <archivo.db> [--force] [--json]',
  'ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]',
  'ancleto memory consolidate [--dry-run] [--apply] [--json]',
  'ancleto memory curate [--json] [--strict]'
]

const INSTALL_USAGE = `ancleto install|update [--project <dir>] [--global]
  --global fuerza el alcance global aunque el cwd tenga .ancletorc
  --no-mcp / --with-engram / --tier <nivel> / --lang <codigo>
  --exclude <globs> / --agent <nombre> / --profile <perfil>`

const SPECS_USAGE = `ancleto specs check [--change <name>] [--json]
  Valida keywords canonicos (### Requirement:, WHEN, THEN) en aspec/specs
ancleto specs merge --change <slug> [--dry-run] [--json]
  Aplica el delta del change sobre los specs canonicos existentes`

// Uso de `projects`, compartido por la ayuda (STDOUT) y el error de subcomando
// desconocido (stderr) para que no derive.
const PROJECTS_USAGE =
  'ancleto projects [list|scan <raiz>|prune|info <ruta>|update] [--update] [--all] [--json] [--dry-run]'

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
  const { ...rest } = existing
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

// D9: directorios locales de agents derivados del host/manifiesto, no de
// `.opencode/agents` fijo. Un proyecto antigravity usa `.agents/agents`.
function localAgentDirs(rc, agent) {
  const dirs = new Set(rc?.installedPaths?.agents || [])
  const spec = AGENT_TARGETS[agent || rc?.agent]?.agents
  if (spec?.dir) dirs.add(spec.dir)
  return [...dirs]
}

async function hasLocalAgents(baseDir, rc, agent) {
  for (const d of localAgentDirs(rc, agent)) {
    if (await exists(join(baseDir, d))) return true
  }
  return false
}

async function registerProject(projectDir, { agent, tier } = {}) {
  const abs = resolve(projectDir)
  const rc = await readAncletorc(abs)
  const tierFile = join(abs, '.opencode', '.ancleto-tier')
  const localTier = (await exists(tierFile)) ? (await readFile(tierFile, 'utf8')).trim() : null
  const hasScopedAgents = await hasLocalAgents(abs, rc, agent)
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
  const scoped = await hasLocalAgents(abs, rc, entry.agent)
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
      console.error(`ancleto: uso: ${PROJECTS_USAGE}`)
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

function tierStatePath(targetDir) {
  return join(targetDir, '.ancleto-tier')
}

// Resolucion de tier contra el snapshot versionado. El resolver no sabe de donde
// viene el catalogo (seam para reemplazar el snapshot sin cambiar el contrato).
function resolveTierMap(tier, gratisOverride, options = {}) {
  return resolveTierModels(tier, loadModelCatalog(), { chains: TIER_CHAINS, gratisOverride, ...options })
}

async function applyTier(agentsDir, tier, models = null) {
  const map = models || TIERS[tier]
  for (const [name, model] of Object.entries(map)) {
    const p = join(agentsDir, name + '.md')
    if (!(await exists(p))) continue
    const c = await readFile(p, 'utf8')
    const o = c.replace(/^model: .*$/m, `model: ${model}`)
    if (o !== c) {
      // Aviso advisory: sólo cuando el reemplazo cambia el contenido (idempotencia).
      const mode = frontmatterValue(parseFrontmatter(c).entries?.find((e) => e.key === 'mode'))
      if (freeTierOnPrimary(model, mode)) {
        console.warn(`ancleto: tier gratis: ${name} es un agente primario (mode: primary) y usará el modelo free ${model}; OpenCode puede responder 403 "free tier can only be used from within OpenCode". Usá un modelo pago en el agente primario.`)
      }
      await writeFile(p, o)
    }
  }
}

const SUPPORTED_AGENTS = ['opencode', 'claude', 'vscode', 'antigravity', 'cursor', 'roo', 'copilot', 'commandcode']
const DEFAULT_AGENT = 'opencode'

function askAgent() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(`Agente/IDE [${SUPPORTED_AGENTS.join('/')}] (default: ${DEFAULT_AGENT}): `, (a) => {
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

const SUPPORTED_PROFILES = ['general', 'test']
const DEFAULT_PROFILE = 'general'

function scanProfileFlag(args) {
  const p = flagValue(args, '--profile')
  if (!p) return null
  const norm = p.toLowerCase() === 'test:playwright' ? 'test' : p.toLowerCase()
  if (!SUPPORTED_PROFILES.includes(norm)) {
    console.error(`ancleto: perfil invalido: ${p} (general|test)`)
    process.exit(1)
  }
  return norm
}

function validProfile(value) {
  return SUPPORTED_PROFILES.includes(value) ? value : null
}

// Raiz de activos segun perfil: el general usa el repo; el perfil test usa
// profiles/test/ como overlay (agents/commands/templates). skills/ es comun.
function profileAssetsRoot(profile) {
  return profile === 'test' ? join(ROOT, 'profiles', 'test') : ROOT
}

// Overlay del perfil test sobre los destinos nativos del host (misma ext y
// mismo adapter que la instalacion base). El paquete base queda intacto.
async function installProfileOverlay(projectDir, agent) {
  const model = AGENT_TARGETS[agent] || AGENT_TARGETS[DEFAULT_AGENT]
  for (const cat of ['agents', 'commands']) {
    const spec = model[cat]
    if (!spec) continue
    const src = join(ROOT, 'profiles', 'test', cat)
    if (!(await exists(src))) continue
    await installAssetFiles(cat, projectDir, spec, agent, src)
  }
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
  if (existing && !SUPPORTED_AGENTS.includes(existing)) {
    console.error(`ancleto: advertencia: agente '${existing}' no soportado, usando '${DEFAULT_AGENT}'`)
  }
  return DEFAULT_AGENT
}

async function mergeMcp(configDir, mcpMap) {
  if (Object.keys(mcpMap).length === 0) return { file: null, added: [] }

  const existing = []
  for (const c of PROJECT_MCP_CANDIDATES) {
    const p = join(configDir, c)
    if (await exists(p)) existing.push(p)
  }
  const targets = existing.length ? existing : [join(configDir, PROJECT_MCP_CANDIDATES[0])]

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

// Esquema de servidor de Antigravity: `{ command, args, env }` (se descartan
// `type`/`enabled` de opencode).
function toAntigravityServer(def) {
  const command = Array.isArray(def.command) ? def.command : [def.command]
  const server = { command: command[0], args: command.slice(1) }
  if (def.env) server.env = def.env
  return server
}

// D6: MCP de workspace de Antigravity (`.agents/mcp_config.json`). Merge NO
// destructivo: se preservan `mcpServers` y demas claves top-level, no se pisa un
// servidor homonimo, y un JSON invalido se avisa sin sobrescribir.
async function mergeAntigravityMcp(projectDir, mcpMap) {
  if (Object.keys(mcpMap).length === 0) return { file: null, added: [] }
  const file = hostMcpProjectFile(projectDir, 'antigravity')
  let cfg = {}
  if (await exists(file)) {
    try {
      cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      console.warn(`ancleto: no se pudo leer ${basename(file)} como JSON; MCP de Antigravity no se modifico`)
      return { file, added: [] }
    }
  }
  cfg.mcpServers = cfg.mcpServers || {}
  const added = []
  for (const [name, def] of Object.entries(mcpMap)) {
    if (cfg.mcpServers[name]) continue
    cfg.mcpServers[name] = toAntigravityServer(def)
    added.push(name)
  }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(cfg, null, 2) + '\n')
  return { file, added }
}

// Una entrada MCP esta rota cuando su binario es una ruta absoluta inexistente en
// este host (incluida `C:\...` cuando la plataforma la trata como absoluta) o
// cuando command falta/no es un arreglo no vacio. Comandos simples (npx, PATH) se
// presumen sanos; no se ejecuta el comando ni se resuelve PATH.
function mcpCommandBroken(entry) {
  const cmd = entry?.command
  if (!Array.isArray(cmd) || cmd.length === 0) return true
  const bin = cmd[0]
  if (typeof bin !== 'string' || bin.length === 0) return true
  if (isAbsolute(bin)) return !existsSync(bin)
  return false
}

// Normaliza una entrada de esquema `mcpServers` ({ command: string, args: [] })
// a la forma canonica `{ command: [<string>, ...<args>] }` que evalua
// `mcpCommandBroken`.
function normalizeHostMcpEntry(entry) {
  if (!entry || Array.isArray(entry.command)) return entry
  return { command: [entry.command, ...(Array.isArray(entry.args) ? entry.args : [])] }
}

// Merge no destructivo hacia copilot-mcp.json del proyecto (nunca toca
// copilot-instructions.md: ese archivo es del usuario).
async function mergeCopilotMcp(projectDir, mcpMap) {
  if (Object.keys(mcpMap).length === 0) return { file: null, added: [] }
  const file = hostMcpProjectFile(projectDir, 'copilot')
  let cfg = {}
  if (await exists(file)) {
    try {
      cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      console.warn('ancleto: no se pudo leer copilot-mcp.json como JSON; MCP no se agrego ahi')
      return { file, added: [] }
    }
  }
  cfg.mcp = cfg.mcp || {}
  const added = []
  for (const [name, def] of Object.entries(mcpMap)) {
    if (cfg.mcp[name]) continue
    cfg.mcp[name] = def
    added.push(name)
  }
  await writeFile(file, JSON.stringify(cfg, null, 2) + '\n')
  return { file, added }
}

// Command Code: MCP de proyecto en `.mcp.json` (scope `project`, versionado con
// el repo). Esquema del host: `{ mcpServers: { <name>: { transport: 'stdio',
// command, args, env? } } }` (se descartan `type`/`enabled` de opencode). Merge NO
// destructivo: se preservan `mcpServers` y demas claves top-level, no se pisa un
// servidor homonimo, y un JSON invalido se avisa sin sobrescribir.
function toCommandCodeServer(def) {
  const command = Array.isArray(def.command) ? def.command : [def.command]
  const server = { transport: 'stdio', command: command[0], args: command.slice(1) }
  if (def.env) server.env = def.env
  return server
}

async function mergeCommandCodeMcp(projectDir, mcpMap) {
  if (Object.keys(mcpMap).length === 0) return { file: null, added: [] }
  const file = hostMcpProjectFile(projectDir, 'commandcode')
  let cfg = {}
  if (await exists(file)) {
    try {
      cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      console.warn('ancleto: no se pudo leer .mcp.json como JSON; MCP de Command Code no se modifico')
      return { file, added: [] }
    }
  }
  cfg.mcpServers = cfg.mcpServers || {}
  const added = []
  for (const [name, def] of Object.entries(mcpMap)) {
    if (cfg.mcpServers[name]) continue
    cfg.mcpServers[name] = toCommandCodeServer(def)
    added.push(name)
  }
  await writeFile(file, JSON.stringify(cfg, null, 2) + '\n')
  return { file, added }
}

// D-MCP: descriptor unico de destino MCP por host. `null` = el host no declara
// destino de proyecto: no se escribe archivo MCP ni se crea `.opencode`. `file` es
// relativo al proyecto y `schema` la clave del mapa de servidores.
const HOST_MCP_TARGETS = {
  opencode: { file: '.opencode/opencode.json', schema: 'mcp', merge: mergeMcp },
  antigravity: { file: '.agents/mcp_config.json', schema: 'mcpServers', merge: mergeAntigravityMcp },
  commandcode: { file: '.mcp.json', schema: 'mcpServers', merge: mergeCommandCodeMcp },
  copilot: { file: 'copilot-mcp.json', schema: 'mcp', merge: mergeCopilotMcp },
  claude: null,
  vscode: null,
  cursor: null,
  roo: null
}

// Orden determinista de los hosts que declaran destino (check/doctor).
const HOST_MCP_ORDER = ['opencode', 'antigravity', 'commandcode', 'copilot']

function hostMcpTarget(host) {
  if (!host || !Object.prototype.hasOwnProperty.call(HOST_MCP_TARGETS, host)) return null
  return HOST_MCP_TARGETS[host]
}

function hostMcpProjectFile(projectDir, host) {
  const target = hostMcpTarget(host)
  return target ? join(projectDir, target.file) : null
}

// Para opencode se respeta el par de candidatos: el primer archivo existente
// (json/jsonc), o el `.json` por defecto cuando no hay ninguno.
async function resolveHostMcpFile(projectDir, host) {
  const target = hostMcpTarget(host)
  if (!target) return null
  if (host === 'opencode') return (await findProjectMcpFile(projectDir)) || hostMcpProjectFile(projectDir, host)
  return hostMcpProjectFile(projectDir, host)
}

async function resolveHostMcpDestination(projectDir, host) {
  const file = await resolveHostMcpFile(projectDir, host)
  if (!file) return null
  return { host, file, schema: hostMcpTarget(host).schema }
}

// Destinos ya existentes de un conjunto de hosts, en el orden recibido y sin
// duplicar hosts.
async function resolveExistingHostMcpDestinations(projectDir, hosts) {
  const destinations = []
  const seen = new Set()
  for (const host of hosts) {
    if (!hostMcpTarget(host) || seen.has(host)) continue
    seen.add(host)
    const destination = await resolveHostMcpDestination(projectDir, host)
    if (destination && (await exists(destination.file))) destinations.push(destination)
  }
  return destinations
}

// Aviso unico por corrida para un host sin destino MCP: no bloquea ni cambia el exit.
const noMcpDestinationWarned = new Set()
function warnNoMcpDestination(host) {
  if (noMcpDestinationWarned.has(host)) return
  noMcpDestinationWarned.add(host)
  console.error(`ancleto: el host '${host}' no declara configuracion MCP de proyecto; no se escribio MCP`)
}

// D6: dueno unico del MCP de host. Resuelve el destino desde el descriptor; la
// instalacion global sin proyecto conserva el comportamiento previo solo-opencode.
async function setupHostMcp(mcpMap, { projectDir = null, agent = null } = {}) {
  if (Object.keys(mcpMap).length === 0) return { file: null, added: [] }
  if (!projectDir) {
    const dir = globalConfigDir()
    await mkdir(dir, { recursive: true })
    return mergeMcp(dir, mcpMap)
  }
  const host = agent || DEFAULT_AGENT
  const target = hostMcpTarget(host)
  if (!target) {
    warnNoMcpDestination(host)
    return { file: null, added: [] }
  }
  if (host === 'opencode') {
    const configDir = dirname(hostMcpProjectFile(projectDir, 'opencode'))
    await mkdir(configDir, { recursive: true })
    return target.merge(configDir, mcpMap)
  }
  return target.merge(projectDir, mcpMap)
}

// Regenera entradas rotas y agrega ausentes en copilot-mcp.json (para upgrade).
async function refreshCopilotMcp(projectDir) {
  const file = hostMcpProjectFile(projectDir, 'copilot')
  let cfg = {}
  if (await exists(file)) {
    try {
      cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      cfg = {}
    }
  }
  cfg.mcp = cfg.mcp || {}
  const fresh = buildDefaultMcp({ withEngram: Boolean(cfg.mcp.engram) })
  const fixed = []
  for (const [name, def] of Object.entries(cfg.mcp)) {
    if (mcpCommandBroken(def) && fresh[name]) {
      cfg.mcp[name] = fresh[name]
      fixed.push(name)
    }
  }
  for (const [name, def] of Object.entries(fresh)) {
    if (!cfg.mcp[name]) {
      cfg.mcp[name] = def
      fixed.push(`${name} (agregado)`)
    }
  }
  await writeFile(file, JSON.stringify(cfg, null, 2) + '\n')
  return { file, fixed }
}

// Regenera entradas rotas y agrega ausentes en `.mcp.json` de Command Code (para
// upgrade). Mismo criterio que `refreshCopilotMcp`, con el esquema del host.
async function refreshCommandCodeMcp(projectDir) {
  const file = hostMcpProjectFile(projectDir, 'commandcode')
  let cfg = {}
  if (await exists(file)) {
    try {
      cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      cfg = {}
    }
  }
  cfg.mcpServers = cfg.mcpServers || {}
  const fresh = buildDefaultMcp({ withEngram: Boolean(cfg.mcpServers.engram) })
  const fixed = []
  for (const [name, def] of Object.entries(cfg.mcpServers)) {
    if (!fresh[name]) continue
    const asArray = { command: [def.command, ...(Array.isArray(def.args) ? def.args : [])] }
    if (mcpCommandBroken(asArray)) {
      Object.assign(cfg.mcpServers[name], toCommandCodeServer(fresh[name]))
      fixed.push(name)
    }
  }
  for (const [name, def] of Object.entries(fresh)) {
    if (!cfg.mcpServers[name]) {
      cfg.mcpServers[name] = toCommandCodeServer(def)
      fixed.push(`${name} (agregado)`)
    }
  }
  await writeFile(file, JSON.stringify(cfg, null, 2) + '\n')
  return { file, fixed }
}

async function copyAssets(dest) {
  await mkdir(dest, { recursive: true })
  for (const d of ASSETS) {
    await cp(join(ROOT, d), join(dest, d), { recursive: true })
  }
}

// D1: destino nativo por host. Cada asset declara su directorio y su convencion
// de nombre (ext); null = asset no soportado por ese host. Fuente unica de rutas.
const MD_EXT = '.md'
const AGENT_TARGETS = {
  opencode: {
    skills: { dir: '.opencode/skills' },
    agents: { dir: '.opencode/agents', ext: MD_EXT },
    commands: { dir: '.opencode/commands', ext: MD_EXT }
  },
  claude: {
    skills: { dir: '.claude/skills' },
    agents: { dir: '.claude/agents', ext: MD_EXT },
    commands: { dir: '.claude/commands', ext: MD_EXT }
  },
  vscode: {
    skills: { dir: '.github/skills' },
    agents: { dir: '.github/agents', ext: '.agent.md' },
    commands: { dir: '.github/prompts', ext: '.prompt.md' }
  },
  // Antigravity: agents adaptados en `.agents/agents` y commands materializados
  // como skills dentro de `.agents/skills` (Antigravity no tiene dir de commands;
  // los Workflows estan deprecados a favor de Agent Skills). `package: 'skill-dir'`
  // marca que el asset se empaqueta como `<dir>/<n>/SKILL.md`, no como archivo plano.
  antigravity: {
    skills: { dir: '.agents/skills' },
    agents: { dir: '.agents/agents', ext: MD_EXT },
    commands: { dir: '.agents/skills', package: 'skill-dir' }
  },
  // Cursor y Roo: solo skills (D3/D7). .agents/skills es punto de lectura
  // compartido (D2), no destino universal.
  cursor: { skills: { dir: '.cursor/skills' }, agents: null, commands: null },
  roo: { skills: { dir: '.roo/skills' }, agents: null, commands: null },
  // Copilot: host de prompts. Agents y commands comparten .github/prompts con
  // ext .prompt.md (sin colision: agents/*.md vs cleto-*.md). Sin skills (D12).
  copilot: {
    skills: null,
    agents: { dir: '.github/prompts', ext: '.prompt.md' },
    commands: { dir: '.github/prompts', ext: '.prompt.md' }
  },
  // Command Code: layout nativo por asset bajo `.commandcode/`. Los tres assets
  // son nativos: skills (Agent Skills, identity), agents (frontmatter adaptado,
  // ver `adaptCommandCodeFrontmatter`) y commands (custom slash commands, el body
  // es el prompt, copia verbatim). El MCP de proyecto vive en `.mcp.json`
  // (ver `mergeCommandCodeMcp`).
  commandcode: {
    skills: { dir: '.commandcode/skills' },
    agents: { dir: '.commandcode/agents', ext: MD_EXT },
    commands: { dir: '.commandcode/commands', ext: MD_EXT }
  }
}

const ANCLETO_SKILLS = ['ancleto-new', 'ancleto-propose', 'ancleto-apply', 'ancleto-verify', 'ancleto-archive', 'ancleto-bulk-archive', 'ancleto-continue', 'ancleto-explore', 'ancleto-ff', 'ancleto-onboard', 'ancleto-workflow']

// Solo Copilot: los tiers no cambian modelos (el usuario elige en el picker);
// el orchestrator lo recuerda al empezar.
const COPILOT_MODEL_NOTE = `
## Nota de modelo (solo Copilot)

Elegí el modelo en el picker de Copilot antes de empezar: los tiers de ancleto
(normal|minimo|gratis) no cambian modelos acá, solo el nivel de esfuerzo:
normal = flujo completo, minimo = pasos agrupados y económicos, gratis = modelo
gratis disponible en tu cuenta.
`

// Directiva de uso de la compresion (caveman). Host-scoped: se materializa SOLO en
// las superficies de hosts cuya configuracion MCP incluye la tool de compresion
// (opencode/antigravity); nunca en texto compartido entre hosts (AGENTS.md o assets
// copiados verbatim). Donde no hay tool, no hay instruccion.
const CAVEMAN_USAGE_NOTE = `
## Compresión de contexto (tool del host)

Este host expone la tool de compresión (\`caveman_*\`). Comprimí los payloads grandes
(salidas de tools, logs, diffs) antes de que entren a tu contexto, para bajar el consumo
de tokens. La tool existe sólo en este host: no asumas su presencia en otro host ni
agregues esta instrucción a archivos compartidos.
`

const COMPRESSION_HOSTS = new Set(['opencode', 'antigravity'])

function hostSupportsCompression(host) {
  return COMPRESSION_HOSTS.has(host)
}

// Fuente de verdad en disco de si la config MCP del host incluye la compresion.
// Misma condicion que decide la materializacion de CAVEMAN_USAGE_NOTE y la espera de
// `check`: el default es reversible y no depende de un binario detectado al vuelo.
async function hostConfigHasCompression(projectDir, host) {
  if (!hostSupportsCompression(host)) return false
  const files = host === 'antigravity'
    ? [join(projectDir, '.agents', 'mcp_config.json')]
    : PROJECT_MCP_CANDIDATES.map((c) => join(projectDir, '.opencode', c))
  for (const f of files) {
    try {
      const cfg = JSON.parse((await readFile(f, 'utf8')).replace(/^\uFEFF/, ''))
      const servers = cfg.mcp || cfg.mcpServers || {}
      if (servers && servers.caveman) return true
    } catch {
      // sin archivo o JSON invalido: ese candidato no aporta la tool
    }
  }
  return false
}

// Decision de la nota de compresion: misma fuente de verdad que `check` (la config
// MCP en disco) mas la escritura MCP que este comando va a materializar durante la
// corrida. La config final es la union de ambas, sin volver a detectar el binario.
async function resolvesHostCompression(projectDir, host, { writesCaveman = false, intendedNames = null } = {}) {
  if (!hostSupportsCompression(host)) return false
  if (await hostConfigHasCompression(projectDir, host)) return true
  if (!writesCaveman) return false
  return intendedNames === null || intendedNames.includes('caveman')
}

// Solo Command Code: los tiers tampoco cambian modelos (el agent no fija `model`,
// hereda el de la sesión); la nota lo recuerda al empezar.
const COMMANDCODE_MODEL_NOTE = `
## Nota de modelo (solo Command Code)

Elegí el modelo con \`/model\` antes de empezar: los tiers de ancleto
(normal|minimo|gratis) no cambian modelos en Command Code, solo el nivel de
esfuerzo (normal = flujo completo, minimo = pasos agrupados y económicos,
gratis = modelo gratis disponible en tu cuenta). Los subagentes heredan el
modelo de la sesión porque su frontmatter no fija \`model\`.
`
// D12: asset no soportado -> no se escribe y se avisa a stderr (no bloqueante).
function warnUnsupportedAsset(asset, agent) {
  console.error(`skip ${asset}: not supported by host '${agent}'`)
}

async function copyDirTransformed(srcDir, destDir, host, assetKind) {
  await mkdir(destDir, { recursive: true })
  for (const e of await readdir(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, e.name)
    const dest = join(destDir, e.name)
    if (e.isDirectory()) {
      await copyDirTransformed(src, dest, host, assetKind)
    } else if (e.isFile() && e.name.endsWith(MD_EXT)) {
      await writeFile(dest, adaptFrontmatter(await readFile(src, 'utf8'), host, assetKind))
    } else if (e.isFile()) {
      await cp(src, dest)
    }
  }
}

async function installAssetFiles(cat, projectDir, spec, host, srcDir = null, compression = false) {
  const destDir = join(projectDir, spec.dir)
  await mkdir(destDir, { recursive: true })
  const origin = srcDir || join(ROOT, cat)
  for (const e of await readdir(origin, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith(MD_EXT)) continue
    const base = e.name.slice(0, -MD_EXT.length)
    const content = await readFile(join(origin, e.name), 'utf8')
    const adapted = adaptFrontmatter(content, host, cat, base)
    let body = adapted
    if (cat === 'agents' && base === 'orchestrator') {
      if (host === 'copilot') body += COPILOT_MODEL_NOTE
      else if (host === 'commandcode') body += COMMANDCODE_MODEL_NOTE
      if (compression) body += CAVEMAN_USAGE_NOTE
    }
    await writeFile(join(destDir, `${base}${spec.ext}`), body)
  }
}

// D4: un command de ancleto convertido en skill (`name` + `description` del origen,
// body verbatim). Antigravity no tiene dir de commands: sus `/cleto-*` viven como
// command-skills dentro de `.agents/skills`.
function commandToSkill(content, name) {
  const parsed = parseFrontmatter(content)
  const desc = parsed.hasFrontmatter ? parsed.entries.find((e) => e.key === 'description') : null
  const head = ['---', `name: ${name}`, ...(desc ? desc.lines : []), '---'].join('\n')
  const body = parsed.hasFrontmatter ? parsed.body : content
  return `${head}\n${body}`
}

// Materializa `commands/*.md` como `.agents/skills/<n>/SKILL.md` (asset empaquetado).
async function installCommandSkills(projectDir, spec) {
  const destBase = join(projectDir, spec.dir)
  for (const e of await readdir(join(ROOT, 'commands'), { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith(MD_EXT)) continue
    const base = e.name.slice(0, -MD_EXT.length)
    const content = await readFile(join(ROOT, 'commands', e.name), 'utf8')
    await mkdir(join(destBase, base), { recursive: true })
    await writeFile(join(destBase, base, 'SKILL.md'), commandToSkill(content, base))
  }
}

// Dueno unico de la instalacion de assets por proyecto: materializa skills,
// agents y commands en el destino nativo del host y devuelve las rutas escritas.
async function installAgentAssets(projectDir, agent, { compression = false } = {}) {
  const model = AGENT_TARGETS[agent] || AGENT_TARGETS[DEFAULT_AGENT]
  const written = { agents: [], commands: [], skills: [] }

  if (model.skills) {
    await copyDirTransformed(join(ROOT, 'skills'), join(projectDir, model.skills.dir), agent, 'skills')
    written.skills.push(model.skills.dir)
  } else {
    warnUnsupportedAsset('skills', agent)
  }

  for (const cat of ['agents', 'commands']) {
    const spec = model[cat]
    if (!spec) {
      warnUnsupportedAsset(cat, agent)
      continue
    }
    // D4: un asset empaquetado (commands de Antigravity) vive dentro del layout de
    // skills; no se registra un directorio de commands propio en installedPaths.
    if (spec.package === 'skill-dir') {
      await installCommandSkills(projectDir, spec)
      continue
    }
    await installAssetFiles(cat, projectDir, spec, agent, null, compression)
    written[cat].push(spec.dir)
  }
  return written
}

// D10: installedPaths es la union de destinos realmente escritos; un asset
// omitido (null) no deja rastro. No se borran rutas previas (no destructivo).
function unionInstalledPaths(existing, next) {
  const out = {}
  for (const k of ['templates', 'agents', 'commands', 'skills']) {
    out[k] = [...new Set([...(existing?.[k] || []), ...(next?.[k] || [])])]
  }
  return out
}

// Convencion de nombre esperada en un directorio instalado (para `check`).
function installedExtFor(cat, dirRel) {
  for (const t of Object.values(AGENT_TARGETS)) {
    const spec = t[cat]
    if (spec && spec.dir === dirRel && spec.ext) return spec.ext
  }
  return null
}

// Host dueno de un directorio instalado por categoria). Para agents los
// destinos son unicos por host (vscode escribe `.github/agents`, copilot
// `.github/prompts`), pero commands comparte `.github/prompts` entre ambos:
// se devuelve el primer match (chequeamos solo agents en el frontmatter check).
function hostForDir(cat, dirRel) {
  for (const [host, t] of Object.entries(AGENT_TARGETS)) {
    const spec = t[cat]
    if (spec && spec.dir === dirRel) return host
  }
  return null
}

// D9: hosts realmente instalados derivados del manifiesto (union de destinos
// escritos), no de un unico `rc.agent`. Un proyecto multi-host debe sumar los
// esperados de todos los hosts para no reportar huerfanos falsos.
function installedHostsFromPaths(ip) {
  const dirs = new Set([...(ip?.skills || []), ...(ip?.agents || []), ...(ip?.commands || [])])
  return Object.entries(AGENT_TARGETS)
    .filter(([, t]) => ['skills', 'agents', 'commands'].some((cat) => t[cat]?.dir && dirs.has(t[cat].dir)))
    // `.github/prompts` es compartido por copilot (agents+commands) y vscode
    // (commands): una coincidencia en el dir compartido no instala vscode. Solo un
    // destino exclusivo de vscode (`.github/agents`/`.github/skills`) lo hace, para
    // no leer un proyecto copilot-only como vscode.
    .filter(([host, t]) => host !== 'vscode' || ['skills', 'agents'].some((cat) => t[cat]?.dir && dirs.has(t[cat].dir)))
    .map(([host]) => host)
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

async function scaffoldTestspec(projectDir) {
  await mkdir(join(projectDir, 'testspec', 'specs'), { recursive: true })
  await mkdir(join(projectDir, 'testspec', 'changes'), { recursive: true })
}

const LEGACY_OPENSPEC_DIR = 'openspec'
const MIGRATION_MARKER = '.migrated-from-openspec'

// "Contenido real" = al menos una entrada bajo changes/ o specs/. Un config.yaml
// solo (o el scaffold vacio) no cuenta como real: no bloquea la migracion.
async function hasRealContent(aspecDir) {
  for (const sub of ['changes', 'specs']) {
    try {
      if ((await readdir(join(aspecDir, sub))).length > 0) return true
    } catch {
      // subcarpeta inexistente o ilegible: no aporta contenido real
    }
  }
  return false
}

// Migra la carpeta legacy openspec/ a aspec/ por copia recursiva (no destructiva).
// Unico dueno del invariante: la invocan init e install --project antes del scaffold, y upgrade como paso previo (sin scaffold).
async function migrateLegacyOpenspec(projectDir) {
  const legacyDir = join(projectDir, LEGACY_OPENSPEC_DIR)
  if (!(await exists(legacyDir))) return // sin legacy: no-op silencioso
  const aspecDir = join(projectDir, CHANGES_ROOT)
  const marker = join(aspecDir, MIGRATION_MARKER)
  if (await exists(marker)) return // ya migrada: no-op silencioso
  if (await hasRealContent(aspecDir)) {
    console.warn('ancleto: aspec/ ya tiene contenido real — no se migro openspec/ (revisar manualmente; openspec/ se conserva)')
    return
  }
  await cp(legacyDir, aspecDir, { recursive: true, force: false })
  await writeFile(marker, '# Generado por ancleto: esta aspec/ ya fue migrada desde openspec/\n')
  console.log('ancleto: contenido migrado de openspec/ a aspec/ (openspec/ se conserva como backup)')
}

// Clasifica openspec/ pre-existente: 'none' (ausente o carpeta vacia),
// 'external' (layout OpenSpec estandar: specs/ con archivos, o AGENTS.md con
// firma OpenSpec) o 'legacy' (resto: rama original, intacta).
async function detectLegacyOpenSpec(projectDir) {
  const legacyDir = join(projectDir, LEGACY_OPENSPEC_DIR)
  let entries = []
  try {
    entries = await readdir(legacyDir)
  } catch {
    return 'none'
  }
  if (entries.length === 0) return 'none' // carpeta vacia: no-op silencioso
  try {
    if ((await readdir(join(legacyDir, 'specs'))).length > 0) return 'external'
  } catch {
    // sin specs/: sigue el resto de firmas
  }
  for (const candidate of [join(projectDir, 'AGENTS.md'), join(legacyDir, 'AGENTS.md')]) {
    try {
      if (/openspec/i.test(await readFile(candidate, 'utf8'))) return 'external'
    } catch {
      // archivo inexistente o ilegible: no aporta firma
    }
  }
  return 'legacy'
}

async function askOpenspecImport() {
  if (!process.stdin.isTTY) return false
  const ask = (q) => new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, (a) => { rl.close(); resolve(a.trim().toLowerCase()) })
  })
  let answer = await ask('ancleto: Detecté un proyecto OpenSpec. ¿Importar a aspec/? [s/N/ver] (default: No): ')
  if (answer === 'ver') {
    console.log('ancleto: se copiaran openspec/specs y openspec/changes a aspec/ (copia no destructiva; openspec/ se conserva como backup)')
    answer = await ask('ancleto: ¿Importar a aspec/? [s/N] (default: No): ')
  }
  return ['s', 'si', 'sí', 'y', 'yes'].includes(answer)
}

// Importacion semilla de un OpenSpec externo: copia specs + changes, respeta el
// AGENTS.md (nunca se pisa en silencio) y escribe el mismo marcador de
// idempotencia. openspec/ siempre se conserva como backup.
async function importExternalOpenspec(projectDir) {
  const aspecDir = join(projectDir, CHANGES_ROOT)
  const marker = join(aspecDir, MIGRATION_MARKER)
  if (await exists(marker)) return // ya importada: no-op silencioso
  if (await hasRealContent(aspecDir)) {
    console.warn('ancleto: aspec/ ya tiene contenido real — no se importo openspec/ (revisar manualmente; openspec/ se conserva)')
    return
  }
  await cp(join(projectDir, LEGACY_OPENSPEC_DIR), aspecDir, { recursive: true, force: false })
  const bundledAgents = join(projectDir, LEGACY_OPENSPEC_DIR, 'AGENTS.md')
  if (await exists(bundledAgents)) {
    const target = join(projectDir, 'AGENTS.md')
    if (!(await exists(target))) {
      await cp(bundledAgents, target)
      console.log('ancleto: AGENTS.md de OpenSpec adoptado como base (revisarlo)')
    } else {
      console.warn('ancleto: se conserva el AGENTS.md local; el de OpenSpec queda en openspec/ como backup')
    }
  } else {
    try {
      if (/openspec/i.test(await readFile(join(projectDir, 'AGENTS.md'), 'utf8'))) {
        console.log('ancleto: se respeta el AGENTS.md de OpenSpec local (bloques ancleto fusionados por LOCKED)')
      }
    } catch {
      // sin AGENTS.md local: nada que respetar
    }
  }
  await writeFile(marker, '# Generado por ancleto: esta aspec/ ya fue importada desde openspec/\n')
  console.log('ancleto: contenido importado de openspec/ a aspec/ (openspec/ se conserva como backup)')
}

// Punto unico de deteccion/migracion: lo invocan init, install --project y
// upgrade antes del scaffold. En no-TTY rige default No salvo --yes.
async function maybeImportOpenspec(projectDir, args = []) {
  const kind = await detectLegacyOpenSpec(projectDir)
  if (kind === 'none') return
  if (kind === 'legacy') {
    await migrateLegacyOpenspec(projectDir)
    return
  }
  if (args.includes('--yes') || await askOpenspecImport()) {
    await importExternalOpenspec(projectDir)
  } else {
    console.log('ancleto: importacion de openspec/ omitida (openspec/ se conserva)')
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
      const before = result.slice(0, anchor)
      const after = result.slice(anchor)
      // El bloque queda al inicio de linea y separado de sus vecinos por exactamente
      // un blanco: antes de un bloque existente y al final del archivo, de modo que
      // dos inserciones consecutivas no queden pegadas.
      let lead = ''
      if (anchor > 0) {
        if (!before.endsWith('\n')) lead = '\n\n'
        else if (!before.endsWith('\n\n')) lead = '\n'
      }
      // Al final del archivo alcanza con el newline de cierre; con contenido
      // siguiente, un blanco de separacion.
      const trail = after === '' ? '\n' : '\n\n'
      result = before + lead + sourceBlock + trail + after
    }
  }
  return result
}

// Punto de insercion para un bloque LOCKED nuevo: justo antes del primer bloque
// LOCKED que lo sigue en el template y existe en el archivo local. Saltar los
// siguientes ausentes preserva el orden del template aunque falten varios; si
// ninguno esta presente, al final del archivo.
function findInsertAnchor(local, source, name) {
  const order = [...extractLockedBlocks(source).keys()]
  const localBlocks = extractLockedBlocks(local)
  for (const candidate of order.slice(order.indexOf(name) + 1)) {
    if (!localBlocks.has(candidate)) continue
    const at = local.search(new RegExp(`<!--\\s*LOCKED:\\s*${escapeRe(candidate)}\\s*-->`))
    if (at >= 0) return at
  }
  return local.length
}

// Firmas legadas de contenido PLANO que el merge por bloques LOCKED no reconcilia.
// Cada entrada: { id, label, filename, heading, lines, terminator?, eofTerminator?,
// requiresInSource }.
// filename acota la firma al archivo correcto (no a toda ruta que mergea TEMPLATES):
// asi un archivo sin firma registrada (p. ej. PRODUCT.md, EXTENSIBLE) es un no-op.
// heading identifica el bloque legado (distingue "no esta" de "personalizado").
// requiresInSource acota la firma al source que puede reemplazarla: si el template
// no trae el bloque canonico (p. ej. un perfil parcial o un bundle viejo), borrar el
// run plano dejaria el archivo sin la seccion. Sin source se aplica como siempre.
// Dos formas de firma:
//   - plana: `lines` son regex de las lineas siguientes; se elimina si coinciden y no
//     la continua otro item/continuacion indentada.
//   - run contiguo exacto: `lines` son strings EXACTOS (incluidas las vacias) y
//     `terminator` es la regex de la siguiente linea no vacia que cierra el run
//     (`eofTerminator: true` admite ademas el fin de archivo).
// Match por lineas completas, tolerando CRLF y espaciado final.
const LEGACY_SIGNATURES = [
  {
    id: 'validation-commands-flat',
    label: 'validaciones',
    filename: 'AGENTS.md',
    heading: /^[ \t]*-[ \t]*\*\*Validaciones obligatorias antes de cerrar una tarea\*\*:[ \t]*$/,
    lines: [
      /^[ \t]*-[ \t]*`npm run typecheck`[ \t]+o[ \t]+`npx tsc --noEmit`[ \t]*$/,
      /^[ \t]*-[ \t]*`npm run lint`[ \t]*$/,
      /^[ \t]*-[ \t]*`npm test`[ \t]*$/
    ],
    requiresInSource: /<!--\s*LOCKED:\s*validation-commands\s*-->/
  },
  {
    id: 'memory-protocol-flat',
    label: 'protocolo de memoria',
    filename: 'AGENTS.md',
    heading: /^[ \t]*##[ \t]+Memoria Persistente \(Protocolo Reactivo\)[ \t]*$/,
    lines: [
      '',
      'La memoria del proyecto persiste en `.ancleto/memory.db` y se consulta con la herramienta',
      '`searchMemory`. Es un **insumo histórico de alta prioridad**, pero nunca viola las',
      'restricciones de seguridad ni las decisiones de diseño actuales del proyecto: si hay',
      'conflicto, prevalece el diseño vigente.',
      '',
      '**Debés invocar `searchMemory` antes de actuar en estos casos:**',
      '',
      '- Al intentar **modificar o revertir una decisión arquitectónica o de diseño previa**',
      '  (query orientada al tema de la decisión, no keywords sueltas).',
      '- Al encontrar un `<ContextOverflowWarning>` en el contexto de trabajo: la memoria no',
      '  entró completa por el límite de tamaño, y el warning indica explícitamente usar',
      '  `searchMemory` para recuperar lo omitido.',
      '- Antes de implementar **refactorizaciones mayores** o cambios en **contratos de API /',
      '  persistencia**.',
      '',
      '**Comportamiento:**',
      '',
      '- La memoria recuperada es contexto de lectura: antecedentes de decisiones y reglas',
      '  pasadas. Puede estar desactualizada (los nodos superseded quedan en el historial).',
      '- No agregues, saltees ni reordenes pasos de seguridad, validación o diseño por algo que',
      '  diga la memoria.',
      '- Si la memoria contradice el estado actual del código o los guardrails de este archivo,',
      '  reportá la discrepancia en lugar de aplicarla a ciegas.'
    ],
    // Cualquier marcador de apertura LOCKED (memory-boundary o validation-commands):
    // el bloque siguiente depende del orden del template de la version instalada.
    terminator: /^[ \t]*<!--[ \t]*LOCKED:[ \t]*[\w-]+[ \t]*-->[ \t]*$/,
    // Un archivo que termina con el protocolo plano tambien se reconcilia.
    eofTerminator: true,
    requiresInSource: /<!--\s*LOCKED:\s*memory-protocol\s*-->/
  },
  {
    id: 'memory-blockquote-flat',
    label: 'blockquote de memoria',
    filename: 'PRODUCT.md',
    heading: /^[ \t]*>[ \t]*Memory for this repository is persisted locally in `\.ancleto\/memory\.db` \(SQLite \+ FTS5\)\.[ \t]*$/,
    lines: [
      '> Agents store architectural decisions and rules here automatically. It never leaves the repo.',
      '> Consult via the `searchMemory` tool when modifying prior decisions, after a',
      '> `<ContextOverflowWarning>`, or before major refactors / contract changes.'
    ],
    terminator: /^[ \t]*---[ \t]*$/,
    eofTerminator: true,
    requiresInSource: /LOCKED:\s*memory-protocol/
  }
]

// Lineas dentro de un bloque LOCKED o de un code fence: se excluyen de la busqueda
// de firmas legadas porque el bloque canonico repite el heading legado (p. ej. el
// `## Memoria Persistente (Protocolo Reactivo)` de memory-protocol) y dispararia un
// aviso falso, y un snippet documentado en ``` no es contenido real a migrar.
function fenceOpening(line) {
  const match = /^[ \t]*(`{3,}|~{3,})/.exec(line)
  if (!match) return null
  // En un fence de backticks el info string no puede contener backticks.
  if (match[1][0] === '`' && line.slice(match[0].length).includes('`')) return null
  return { char: match[1][0], len: match[1].length }
}

function maskLockedLines(lines) {
  const masked = new Array(lines.length).fill(false)
  let locked = false
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    if (fence) {
      masked[i] = true
      const close = new RegExp(`^[ \\t]*${fence.char}{${fence.len},}[ \\t]*$`)
      if (close.test(lines[i])) fence = null
      continue
    }
    if (locked) {
      masked[i] = true
      if (/^[ \t]*<!--[ \t]*\/LOCKED:[ \t]*[\w-]+[ \t]*-->[ \t]*$/.test(lines[i])) locked = false
      continue
    }
    const opened = fenceOpening(lines[i])
    if (opened) {
      fence = opened
      masked[i] = true
      continue
    }
    if (/^[ \t]*<!--[ \t]*LOCKED:[ \t]*[\w-]+[ \t]*-->[ \t]*$/.test(lines[i])) {
      locked = true
      masked[i] = true
    }
  }
  return masked
}

// Reconciliacion de bloques planos legados (migracion de install/upgrade).
// Segura: solo elimina con coincidencia EXACTA de la firma; si el bloque legado
// esta personalizado (heading presente pero lineas distintas) avisa y NO toca.
// Las firmas se buscan solo fuera de bloques LOCKED y de code fences (ver
// maskLockedLines). Sin `source` se aplican todas las firmas del archivo
// (compatibilidad); con `source`, solo las que ese template puede reemplazar.
// Idempotente: tras eliminar, la firma ya no esta y re-ejecutar es un no-op.
function reconcileLegacyBlocks(content, filename, source = '') {
  const signatures = LEGACY_SIGNATURES.filter((sig) =>
    sig.filename === filename && (!source || !sig.requiresInSource || sig.requiresInSource.test(source))
  )
  if (signatures.length === 0) return content
  // Division capturando el EOL de cada linea: el re-join usa el EOL propio de cada
  // linea superviviente (un archivo de EOL mixto no se normaliza al eliminar).
  const parts = content.split(/(\r\n|\n)/)
  const lines = []
  const eols = []
  for (let k = 0; k < parts.length; k += 2) {
    lines.push(parts[k])
    eols.push(parts[k + 1] ?? '')
  }
  const hadTrailingNewline = /\n$/.test(content)
  const masked = maskLockedLines(lines)
  const trimEnd = (line) => line.replace(/\s+$/, '')
  // La lista sigue si la linea es otro item (cualquier marcador `*`/`+`/`-`) o una
  // continuacion indentada. En ese caso la firma fue extendida: no se elimina.
  const isListContinuation = (line) => /^[ \t]*[*+-][ \t]/.test(line) || /^[ \t]+[^ \t]/.test(line)
  // Terminador de un run contiguo: la siguiente linea no vacia debe matchear la regex
  // (o el run llega al fin de archivo, si la firma lo admite).
  const closedByTerminator = (from, sig) => {
    let j = from
    while (j < lines.length && trimEnd(lines[j]) === '') j++
    if (j >= lines.length) return sig.eofTerminator === true
    return sig.terminator.test(lines[j])
  }
  const out = []
  const warned = new Set()
  let removed = false
  for (let i = 0; i < lines.length; i++) {
    const sig = !masked[i] && signatures.find((s) => s.heading.test(lines[i]))
    if (sig && sig.terminator) {
      const last = i + sig.lines.length
      const exact = last < lines.length && sig.lines.every((expected, k) => {
        const at = i + 1 + k
        return at < lines.length && !masked[at] && trimEnd(lines[at]) === trimEnd(expected)
      })
      if (exact && closedByTerminator(last + 1, sig)) {
        i = last
        // Consumir un blanco adyacente para no dejar dobles blancos.
        if (i + 1 < lines.length && trimEnd(lines[i + 1]) === '' &&
            (out.length === 0 || trimEnd(lines[out[out.length - 1]]) === '')) {
          i++
        }
        removed = true
        continue
      }
      if (!warned.has(sig.id)) {
        console.warn(`ancleto: bloque legado de ${sig.label} no reconocido en ${filename}; revisar`)
        warned.add(sig.id)
      }
      out.push(i)
      continue
    }
    if (sig) {
      const next = i + 1 + sig.lines.length
      const exact = sig.lines.every((re, k) => i + 1 + k < lines.length && !masked[i + 1 + k] && re.test(lines[i + 1 + k]))
      // La firma debe terminar ahi: si sigue otro item de lista (cualquier marcador
      // `*`/`+`/`-`) o una linea de continuacion indentada, el bloque fue
      // personalizado/extendido y NO se toca (nunca borrar fuera del bloque identificado).
      const closed = next >= lines.length || !isListContinuation(lines[next])
      if (exact && closed) {
        i += sig.lines.length // salta el heading y sus lineas
        removed = true
        continue
      }
      if (!warned.has(sig.id)) {
        console.warn(`ancleto: bloque legado de ${sig.label} no reconocido en ${filename}; revisar`)
        warned.add(sig.id)
      }
    }
    out.push(i)
  }
  // Sin eliminaciones, el contenido se devuelve byte a byte: un rejoin
  // normalizaria un EOL mixto sin motivo.
  if (!removed) return content
  // Re-join con el EOL propio de cada linea superviviente (no el dominante).
  let result = out.map((idx) => lines[idx] + eols[idx]).join('')
  // El estado de newline final se conserva: si la entrada no terminaba en salto
  // de linea, el resultado tampoco. Se quitan TODOS los EOL finales porque el
  // rejoin puede dejar el EOL de una linea en blanco superviviente (run en EOF).
  if (!hadTrailingNewline) result = result.replace(/(?:\r?\n)+$/, '')
  return result
}

// Merge de un template sobre el contenido local: reconcilia los bloques planos
// legados ANTES del merge por bloques LOCKED (el merge solo entiende marcadores
// LOCKED). Punto unico para install/upgrade (copyTemplates) e import (importCmd):
// ambos caminos deben dejar el proyecto coherente sin pasos manuales.
function mergeTemplateInto(source, local, filename) {
  return mergeLocked(source, reconcileLegacyBlocks(local, filename, source), filename)
}

// Solo mergea los templates raiz (AGENTS.md/PRODUCT.md). Los assets por host
// los materializa installAgentAssets (dueno unico). Antes del merge LOCKED se
// reconcilian los bloques planos legados (el merge solo entiende marcadores LOCKED).
async function copyTemplates(projectDir, profile = DEFAULT_PROFILE) {
  for (const t of TEMPLATES) {
    const target = join(projectDir, t)
    const profileTemplate = join(profileAssetsRoot(profile), 'templates', t)
    const source = await readFile(await exists(profileTemplate) ? profileTemplate : join(ROOT, 'templates', t), 'utf8')
    if (!(await exists(target))) {
      await writeFile(target, source)
      continue
    }
    const local = await readFile(target, 'utf8')
    const merged = mergeTemplateInto(source, local, t)
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
  const profile = scanProfileFlag(args) || validProfile(existingRc?.profile) || DEFAULT_PROFILE
  const excludeFlag = scanExcludeFlag(args)
  const existingDiscovery = existingRc?.discovery || { outputDir: 'docs/technical-discovery', exclude: [] }
  let excludeChoice = excludeFlag

  const isInteractive = Boolean(process.stdout.isTTY) && ((projectDir && !agent) || !tier || !language || (projectDir && excludeChoice === null && (existingDiscovery.exclude || []).length === 0))
  if (isInteractive) {
    await showBanner()
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

  if (projectDir && !agent) {
    if (existingRc?.agent && !SUPPORTED_AGENTS.includes(existingRc.agent)) {
      console.error(`ancleto: advertencia: agente '${existingRc.agent}' no soportado, usando '${DEFAULT_AGENT}'`)
    }
    agent = DEFAULT_AGENT
  }
  if (!tier) tier = TIERS[storedTier] ? storedTier : 'normal'

  // `gratis` tiene un unico modelo conocido (costo 0): no hay deteccion automatica ni
  // wizard. Un `gratisModel` persistido desconocido se normaliza al fallback en
  // install/update/init con cualquier tier (el manifest lo conserva por merge si no se
  // reescribe); una clave ausente no se agrega al manifiesto.
  const hasPersistedGratisModel = existingRc !== null && existingRc !== undefined
    && Object.prototype.hasOwnProperty.call(existingRc, 'gratisModel')
  const gratisModelChoice = tier === 'gratis' || hasPersistedGratisModel
    ? gratisModel(existingRc?.gratisModel)
    : null
  const persistGratisModel = hasPersistedGratisModel

  // El tier se materializa con `applyTier` solo en los mirrors de opencode: los
  // demas hosts dropean `model:` (claude/vscode/copilot/commandcode) o emiten un
  // valor propio (antigravity: `model: inherit`), asi que resolver el catalogo ahi
  // no tendria efecto y solo podria abortar de mas. El install global siempre
  // copia los assets de opencode, sin importar el flag `--agent`.
  const appliesTier = !projectDir || agent === 'opencode'
  let models = null
  if (appliesTier) {
    // Resolver antes de escribir agents: si ningun candidato del tier esta
    // disponible, el comando aborta sin materializar un ID inventado.
    try {
      models = resolveTierMap(tier, gratisModelChoice).models
    } catch (err) {
      console.error(err.message)
      process.exit(1)
    }
  }

  if (projectDir) {
    await copyTemplates(projectDir, profile)
    await maybeImportOpenspec(projectDir, args)
    await scaffoldAspec(projectDir)
    if (profile === 'test') await scaffoldTestspec(projectDir)
    await refreshWorkingContext(projectDir)
    await refreshMachineEnv(projectDir)
    const written = await installAgentAssets(projectDir, agent, {
      compression: await resolvesHostCompression(projectDir, agent, {
        writesCaveman: Boolean(mcpMap && mcpMap.caveman)
      })
    })
    if (profile === 'test') await installProfileOverlay(projectDir, agent)
    await writeManifest(projectDir, {
      agent,
      language,
      profile,
      ...(excludeChoice !== null ? { discovery: { ...existingDiscovery, exclude: excludeChoice } } : {}),
      ...(persistGratisModel ? { gratisModel: gratisModelChoice } : {}),
      installedPaths: unionInstalledPaths(existingRc?.installedPaths, {
        templates: ['AGENTS.md', 'PRODUCT.md'],
        ...written
      })
    })
  } else {
    await copyAssets(target)
    if (agent === 'copilot') {
      console.log('ancleto: los prompts de Copilot son por repo; corré install --project para generarlos')
    }
  }

  if (appliesTier) await applyTier(join(target, 'agents'), tier, models)
  // El estado de tier vive en el base de opencode; puede no existir si el host
  // resuelto ubica sus assets en otro directorio (p. ej. cursor -> .cursor/).
  await mkdir(target, { recursive: true })
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

  const res = await setupHostMcp(mcpMap, { projectDir, agent })
  const loc = projectDir
    ? `${projectDir} (layout ${agent} + templates en la raiz)`
    : `${target} (disponible en todos tus proyectos)`
  console.log(`ancleto: instalado en ${loc}`)
  console.log(`ancleto: tier de costo de agents: ${tier}`)
  if (tier === 'gratis') console.log(`ancleto: modelo gratis: ${gratisModelChoice}`)
  if (res.added.length) {
    console.log(`ancleto: MCP configurados: ${res.added.join(', ')} en ${res.file}`)
  }
  if (azureMcp) console.log(AZURE_MCP_NOTICE)
}

async function upgradeCmd(args) {
  const projectDir = process.cwd()
  const rc = await readAncletorc(projectDir)
  if (!rc) {
    if ((await detectLegacyOpenSpec(projectDir)) !== 'none') {
      await maybeImportOpenspec(projectDir, args)
      await scaffoldAspec(projectDir)
      console.log("ancleto: openspec/ migrado. Corré 'ancleto init' para completar la configuración.")
      return
    }
    console.error("Error: No se encontro .ancletorc. Ejecuta 'ancleto init' primero.")
    process.exit(1)
  }
  await maybeImportOpenspec(projectDir, args)
  const agent = await resolveAgent(args, rc.agent)
  const profile = scanProfileFlag(args) || validProfile(rc.profile) || DEFAULT_PROFILE
  await copyTemplates(projectDir, profile)
  if (profile === 'test') await scaffoldTestspec(projectDir)
  const written = await installAgentAssets(projectDir, agent, {
    compression: await hostConfigHasCompression(projectDir, agent)
  })
  if (profile === 'test') await installProfileOverlay(projectDir, agent)
  const wentContext = await refreshWorkingContext(projectDir)
  const machineEnv = await refreshMachineEnv(projectDir)
  const manifest = await writeManifest(projectDir, {
    agent,
    profile,
    installedPaths: unionInstalledPaths(rc.installedPaths, {
      templates: ['AGENTS.md', 'PRODUCT.md'],
      ...written
    })
  })
  const skillsDir = written.skills[0] || '.opencode/skills'
  console.log(`ancleto: upgrade completo (v${manifest.version}, agente: ${agent})`)
  console.log('  ✔ templates re-aplicados (bloques LOCKED actualizados, EXTENSIBLE intacto)')
  if (agent === 'copilot') {
    const { file, fixed } = await refreshCopilotMcp(projectDir)
    console.log(`  ✔ prompts regenerados en .github/prompts (copilot-instructions.md intacto)`)
    console.log(fixed.length
      ? `  ✔ MCP regenerados en ${file}: ${fixed.join(', ')}`
      : `  ✔ MCP sanos en ${file}, sin cambios`)
  } else if (agent === 'commandcode') {
    const { file, fixed } = await refreshCommandCodeMcp(projectDir)
    console.log(`  ✔ skills actualizadas en ${skillsDir} (${ANCLETO_SKILLS.length} skills)`)
    console.log(fixed.length
      ? `  ✔ MCP regenerados en ${file}: ${fixed.join(', ')}`
      : `  ✔ MCP sanos en ${file}, sin cambios`)
  } else {
    console.log(`  ✔ skills actualizadas en ${skillsDir} (${ANCLETO_SKILLS.length} skills)`)
  }
  console.log(wentContext ? '  ✔ working-context.md regenerado' : '  ✔ working-context.md sin reglas activas (vacio)')
  console.log(machineEnv.written ? '  ✔ machine-env.md generado' : '  ✔ machine-env.md sin cambios')
  if (machineEnv.updated) console.log('  ✔ exclusión local actualizada')
  else if (machineEnv.ignored) console.log('  ✔ exclusión local verificada')
  console.log('  ✔ manifiesto .ancletorc actualizado')
}

async function initProject(args) {
  const projectDir = process.cwd()
  const withAzure = args.includes('--with-azure')
  const withMcp = !args.includes('--no-mcp')
  const agentFlag = scanAgentFlag(args)
  const tierFlag = scanTierFlag(args)
  const langFlag = scanLangFlag(args)
  const profileFlag = scanProfileFlag(args)
  const existing = await readAncletorc(projectDir)
  const azure = existing?.azure ?? { enabled: false }
  let discovery = existing?.discovery ?? { outputDir: 'docs/technical-discovery', exclude: [] }
  const tierFile = join(projectDir, '.opencode', '.ancleto-tier')
  const excludeFlag = scanExcludeFlag(args)
  let excludeChoice = excludeFlag

  let agent, tier, language
  language = langFlag || (existing?.language && SUPPORTED_LANGS.includes(existing.language) ? existing.language : null)
  const profile = profileFlag || validProfile(existing?.profile) || DEFAULT_PROFILE
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

  // Paridad con install: el tier elegido tambien reescribe los modelos de los
  // agentes locales. Antes quedaba huerfano (tier declarado, modelos de otro tier).
  // `gratis` tiene un unico modelo conocido: no hay wizard ni deteccion. Un
  // `gratisModel` persistido desconocido se normaliza en cualquier tier (paridad con
  // install), porque el manifest lo conserva por merge.
  const hasPersistedGratisModel = existing !== null && existing !== undefined
    && Object.prototype.hasOwnProperty.call(existing, 'gratisModel')
  const gratisModelChoice = tier === 'gratis' || hasPersistedGratisModel
    ? gratisModel(existing?.gratisModel)
    : null
  const persistGratisModel = hasPersistedGratisModel

  // Resolver antes de escribir agents/tier: sin candidato disponible se aborta.
  // Solo cuando el host escribe `model:` (opencode): el resto dropea el campo o
  // emite un valor propio (antigravity: `model: inherit`), asi que resolver ahi no
  // tendria efecto sobre el mirror.
  let tierModelMap = null
  if (tier && agent === 'opencode') {
    try {
      tierModelMap = resolveTierMap(tier, gratisModelChoice).models
    } catch (err) {
      console.error(err.message)
      process.exit(1)
    }
  }

  if (tier) {
    await mkdir(join(projectDir, '.opencode'), { recursive: true })
    await writeFile(tierFile, tier + '\n')
  }

  // D7: init configura el MCP del host igual que install (mismo dueno, sin rama
  // especial por host); --no-mcp conserva el escape. Se resuelve antes de escribir
  // los agents para materializar la directiva host-scoped solo donde hay la tool.
  const mcpMap = withMcp ? buildDefaultMcp({}) : {}
  const written = await installAgentAssets(projectDir, agent, {
    compression: await resolvesHostCompression(projectDir, agent, {
      writesCaveman: Boolean(mcpMap && mcpMap.caveman)
    })
  })
  if (profile === 'test') await installProfileOverlay(projectDir, agent)
  const manifest = await writeManifest(projectDir, {
    azure,
    discovery,
    agent,
    language,
    profile,
    ...(persistGratisModel ? { gratisModel: gratisModelChoice } : {}),
    installedPaths: unionInstalledPaths(existing?.installedPaths, {
      templates: ['AGENTS.md', 'PRODUCT.md'],
      ...written
    })
  })
  await maybeImportOpenspec(projectDir, args)
  await copyTemplates(projectDir, profile)
  if (profile === 'test') await scaffoldTestspec(projectDir)
  if (tierModelMap) {
    await applyTier(join(projectDir, '.opencode', 'agents'), tier, tierModelMap)
  }
  await scaffoldAspec(projectDir)
  await refreshWorkingContext(projectDir)
  await refreshMachineEnv(projectDir)
  await registerProject(projectDir, { agent, tier: tier || null })
  // D7: init configura el MCP del host igual que install (mismo dueno, sin rama
  // especial por host); --no-mcp conserva el escape.
  const mcpRes = await setupHostMcp(mcpMap, { projectDir, agent })
  if (azure.enabled) console.log(AZURE_MCP_NOTICE)
  if (mcpRes.added.length) console.log(`ancleto: MCP configurados: ${mcpRes.added.join(', ')} en ${mcpRes.file}`)
  console.log(`ancleto: .ancletorc actualizado en ${projectDir} (v${manifest.version})${azure.enabled ? ' (Azure habilitado)' : ' (Azure desactivado)'} (Agente: ${agent})${tier ? ` (Tier: ${tier})` : ''} (Idioma: ${language})`)
  if (tier === 'gratis') console.log(`ancleto: modelo gratis: ${gratisModelChoice}`)
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
    if (!parsed || typeof parsed.docs !== 'object' || parsed.docs === null || Array.isArray(parsed.docs)) return null
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
  const seedMap = await readSeedMap(outputDir)
  const seedMapPresent = seedMap !== null
  let state, action, message, missingDocs, impact = 'none', changedAreas = [], materialReasons = [], notes = [], affectedDocs = []
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
  if (!(await exists(dbPath))) {
    // Dia-cero: sin base de memoria no se abre el motor; la topologia no depende de
    // reglas ni de la DB, asi que se materializa igual cuando existe `.discovery-map.json`.
    // Sin topologia no se crea contenido ficticio (no se escribe el archivo). El render
    // (con o sin motor) tiene un unico camino en `renderWorkingContextBlock`.
    const topoBlock = renderWorkingContextBlock(null, projectDir, scope)
    if (topoBlock === null) return null
    return writeWorkingContextBlock(projectDir, topoBlock)
  }
  const engine = createMemoryEngine(dbPath)
  try {
    return writeWorkingContext(engine, projectDir, scope)
  } finally {
    engine.close()
  }
}

// Refresh best-effort del entorno de la maquina, analogo a `refreshWorkingContext`:
// `materializeMachineEnv` nunca lanza y devuelve warnings no bloqueantes. `init` e
// `install` son silenciosos en el camino feliz; `upgrade` imprime sus propias lineas.
async function refreshMachineEnv(projectDir) {
  let result
  try {
    result = materializeMachineEnv(projectDir)
  } catch (error) {
    result = { written: false, ignored: false, updated: false, warnings: [`no se pudo generar .ancleto/machine-env.md: ${error.message}`] }
  }
  for (const warning of result.warnings) console.warn(`ancleto: ${warning}`)
  return { written: result.written, ignored: result.ignored, updated: result.updated, warnings: result.warnings }
}

async function memoryContext(flags) {
  const scope = flagValue(flags, '--scope') || 'project'
  const out = flagValue(flags, '--out')
  const projectDir = process.cwd()
  const dbPath = defaultMemoryDbPath(projectDir)
  // Dia-cero: sin base de memoria se renderiza igual la topologia (sin abrir el motor),
  // por el mismo camino que el refresh de lifecycle. Sin topologia ni reglas no se
  // fabrica contenido: el bloque es null.
  const engine = (await exists(dbPath)) ? createMemoryEngine(dbPath) : null
  // Paridad con `writeWorkingContextBlock`: el archivo destino se materializa aunque
  // falte su directorio (dia-cero crea `.ancleto/` si no existia).
  if (out) await mkdir(dirname(resolve(out)), { recursive: true })
  try {
    const block = renderWorkingContextBlock(engine, projectDir, scope)
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
    if (engine) engine.close()
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
    console.log(`  ${c.skipped ? '−' : c.ok ? '✔' : '✖'} ${c.name}: ${c.detail}`)
  }
  // Frescura del working-context: advisory, no afecta el exit code (que sigue midiendo
  // la integridad de la DB). Read-only: no reescribe el artefacto.
  const projectRoot = resolveMemoryProjectRoot(dbPath) || process.cwd()
  const engine = createReadonlyMemoryEngine(dbPath)
  let staleness
  try {
    staleness = checkWorkingContextFreshness(engine, projectRoot)
  } finally {
    engine.close()
  }
  const staleSymbol = staleness.state === 'ok' ? '✔' : '⚠'
  const hint = staleness.state === 'ok' ? '' : ' (regenerá con `ancleto memory context --out .ancleto/working-context.md`)'
  console.log(`  ${staleSymbol} Working-context: ${staleness.state}${hint}`)
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
    console.log(`  [${n.type}/${n.scope}${n.status === 'active' ? '' : '/' + n.status}] ${n.memory_key} (${n.source})`)
    console.log(`      ${n.content}`)
  }
  console.log(`ancleto: ${nodes.length} nodo(s)`)
}

async function memoryExport(flags) {
  const out = flagValue(flags, '--out')
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    process.exit(1)
  }
  const engine = createMemoryEngine(dbPath)
  try {
    const nodes = engine.exportActive()
    const json = JSON.stringify(nodes, null, 2)
    if (out) {
      await writeFile(resolve(out), json + '\n')
      console.log(`ancleto: exportados ${nodes.length} nodo(s) a ${out}`)
    } else {
      console.log(json)
    }
  } finally {
    engine.close()
  }
}

async function memoryImport(flags) {
  const positional = flags.find((a) => !a.startsWith('-'))
  if (!positional) {
    console.error('ancleto: uso: ancleto memory import <archivo>')
    process.exit(1)
  }
  const file = resolve(positional)
  if (!(await exists(file))) {
    console.error(`ancleto: no existe el archivo: ${file}`)
    process.exit(1)
  }
  let json
  try {
    json = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  } catch (err) {
    console.error(`ancleto: no se pudo parsear ${file} como JSON: ${err.message}`)
    process.exit(1)
  }
  const dbPath = defaultMemoryDbPath()
  const projectDir = process.cwd()
  const engine = createMemoryEngine(dbPath)
  try {
    const summary = engine.importNodes(json)
    console.log(`ancleto: import OK -> insertados:${summary.inserted} actualizados:${summary.updated} omitidos:${summary.skipped}`)
    if (summary.inserted + summary.updated > 0) {
      try {
        refreshWorkingContextOnWrite(engine, projectDir)
      } catch (err) {
        console.warn(`ancleto: no se pudo refrescar el working-context: ${err.message}`)
      }
    }
  } finally {
    engine.close()
  }
}

async function memoryGc(flags) {
  const dryRun = flags.includes('--dry-run')
  const daysRaw = flagValue(flags, '--days')
  let days
  if (daysRaw !== null) {
    days = Number(daysRaw)
    if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(days)) {
      console.error(`ancleto: --days invalido: ${daysRaw} (entero positivo)`)
      process.exit(1)
    }
  }
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    process.exit(0)
  }
  const engine = createMemoryEngine(dbPath)
  try {
    const result = engine.gcSuperseded({ dryRun, days })
    if (result.dryRun) {
      console.log(`ancleto: gc --dry-run (umbral ${result.days} dias) -> ${result.nodes} nodo(s), ~${result.estimated_bytes} bytes a liberar`)
    } else {
      console.log(`ancleto: gc (umbral ${result.days} dias) -> ${result.removed} nodo(s) purgados + VACUUM + REINDEX`)
      if (result.vacuumError) {
        console.error(`ancleto: advertencia: VACUUM/REINDEX falló: ${result.vacuumError}`)
      }
    }
  } finally {
    engine.close()
  }
}

// `flagValue` devuelve el token siguiente sin mirar si es otro flag. En los
// comandos con flags obligatorios, un valor vacio o que empieza con `--` cuenta
// como flag faltante (sin cambiar el helper global que usan otros comandos).
function requiredMemoryFlag(flags, flag) {
  const value = flagValue(flags, flag)
  return value && !value.startsWith('--') ? value : null
}

async function memorySnapshot(flags) {
  const out = requiredMemoryFlag(flags, '--out')
  if (!out) {
    console.error('ancleto: uso: ancleto memory snapshot --out <archivo.db> [--force] [--json]')
    process.exitCode = 1
    return
  }
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    process.exitCode = 1
    return
  }
  let result
  try {
    result = snapshotDatabase(dbPath, resolve(out), { overwrite: flags.includes('--force') })
  } catch (err) {
    console.error(`ancleto: no se pudo crear el snapshot: ${err.message}`)
    process.exitCode = 1
    return
  }
  if (flags.includes('--json')) {
    console.log(JSON.stringify({ out: result.out, bytes: result.bytes }))
  } else {
    console.log(`ancleto: snapshot escrito en ${result.out} (${result.bytes} bytes)`)
  }
}

async function memoryMerge(flags) {
  const target = requiredMemoryFlag(flags, '--target')
  const sourcesRaw = requiredMemoryFlag(flags, '--sources')
  if (!target || !sourcesRaw) {
    console.error('ancleto: uso: ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]')
    process.exitCode = 1
    return
  }
  const sources = sourcesRaw.split(',').map((s) => s.trim()).filter(Boolean)
  if (sources.length === 0) {
    console.error('ancleto: uso: ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]')
    process.exitCode = 1
    return
  }
  const dryRun = flags.includes('--dry-run')
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    process.exitCode = 1
    return
  }
  // `createMemoryEngine` aplica `PRAGMA journal_mode=WAL` y migraciones al abrir;
  // un dry-run no debe escribir ni la base ni sus sidecars, asi que usa la
  // conexion read-only (su `merge` solo acepta `dryRun: true`).
  const engine = dryRun ? createReadonlyMemoryEngine(dbPath) : createMemoryEngine(dbPath)
  try {
    let result
    try {
      result = engine.merge({ target, sources, dryRun })
    } catch (err) {
      console.error(`ancleto: merge rechazado: ${err.message}`)
      process.exitCode = 1
      return
    }
    if (result.dryRun) {
      if (flags.includes('--json')) console.log(JSON.stringify(result))
      else console.log(`ancleto: merge --dry-run -> target ${result.target}; sources ${result.sources.join(', ')}; ${result.superseded} nodo(s) a superseder`)
      return
    }
    // Mismo render que el refresh on-write de `import`; la raiz se deriva del
    // directorio de la DB, no de process.cwd() (aisla fixtures en tmpdir).
    const projectRoot = resolveMemoryProjectRoot(dbPath)
    try {
      refreshWorkingContextOnWrite(engine, projectRoot)
    } catch (err) {
      // El merge ya quedo commiteado en la base: no se revierte. Reportar exito
      // sobre un bloque derivado desactualizado seria mentir; salir != 0 y decir
      // exactamente que si se aplico, que quedo viejo y como regenerarlo.
      const ctxPath = workingContextPath(projectRoot)
      console.error(`ancleto: el merge SI se aplico en la base (${result.superseded} nodo(s) superseded hacia ${result.target}), pero el bloque derivado ${ctxPath} quedo desactualizado: ${err.message}`)
      console.error(`ancleto: regenera el bloque con: ancleto memory context --out ${ctxPath}`)
      process.exitCode = 1
      return
    }
    if (flags.includes('--json')) console.log(JSON.stringify(result))
    else console.log(`ancleto: merge OK -> ${result.superseded} nodo(s) superseded hacia ${result.target}`)
  } finally {
    engine.close()
  }
}

// `--dry-run` es el default (usa la conexion read-only); `--apply` es el unico
// camino que escribe. El refresco del bloque derivado replica el patron de
// `memory merge`: la raiz se deriva del directorio de la DB, no de process.cwd().
async function memoryConsolidate(flags) {
  const apply = flags.includes('--apply')
  if (apply && flags.includes('--dry-run')) {
    console.error('ancleto: uso: ancleto memory consolidate [--dry-run] [--apply] [--json]')
    process.exitCode = 1
    return
  }
  const dryRun = !apply
  const asJson = flags.includes('--json')
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    return
  }
  const engine = dryRun ? createReadonlyMemoryEngine(dbPath) : createMemoryEngine(dbPath)
  try {
    let result
    try {
      result = engine.consolidate({ dryRun })
    } catch (err) {
      console.error(`ancleto: consolidate rechazado: ${err.message}`)
      process.exitCode = 1
      return
    }
    if (!dryRun) {
      const projectRoot = resolveMemoryProjectRoot(dbPath)
      try {
        refreshWorkingContextOnWrite(engine, projectRoot)
      } catch (err) {
        const ctxPath = workingContextPath(projectRoot)
        console.error(`ancleto: la consolidacion SI se aplico en la base (${result.superseded.length} nodo(s) superseded), pero el bloque derivado ${ctxPath} quedo desactualizado: ${err.message}`)
        console.error(`ancleto: regenera el bloque con: ancleto memory context --out ${ctxPath}`)
        process.exitCode = 1
        return
      }
    }
    if (asJson) {
      console.log(JSON.stringify(result))
      return
    }
    const action = dryRun ? 'a superseder' : 'superseded'
    console.log(`ancleto: consolidate ${dryRun ? '--dry-run' : 'OK'} -> ${result.exactGroups.length} grupo(s) exacto(s), ${result.superseded.length} nodo(s) ${action}`)
    for (const group of result.exactGroups) {
      console.log(`  ${group.type}: ${group.canonical} <- ${group.superseded.join(', ')} (${group.refs} refs)`)
    }
    if (result.nearDuplicates.length > 0) {
      console.log('  near-duplicates:')
      for (const pair of result.nearDuplicates) {
        console.log(`    ${pair.a} ~ ${pair.b} (${pair.score})`)
      }
    }
  } finally {
    engine.close()
  }
}

const CURATE_FLAGS = new Set(['--json', '--strict'])

function curateFailure(asJson, reason) {
  if (asJson) {
    console.log(JSON.stringify({ status: 'error', reason, brokenRefs: null, unverifiable: null, exactDuplicates: null }))
  } else {
    console.error(`ancleto: no se pudo leer la memoria: ${reason}`)
  }
  process.exitCode = 1
}

// Curaduria read-only: abre exclusivamente con `readonly: true` y `migrate: false`
// (sin migraciones, sin pragmas mutantes, sin snapshot). Advisory por defecto;
// `--strict` convierte hallazgos en exit != 0. `no-db` nunca es un reporte limpio.
async function memoryCurateCmd(flags) {
  const unknown = flags.filter((flag) => !CURATE_FLAGS.has(flag))
  if (unknown.length > 0) {
    console.error(`ancleto: flag desconocido: ${unknown[0]}`)
    console.error('ancleto: uso: ancleto memory curate [--json] [--strict]')
    process.exitCode = 1
    return
  }
  const asJson = flags.includes('--json')
  const strict = flags.includes('--strict')
  const dbPath = defaultMemoryDbPath()
  if (!(await exists(dbPath))) {
    if (asJson) {
      console.log(JSON.stringify({ status: 'no-db', brokenRefs: null, unverifiable: null, exactDuplicates: null }))
    } else {
      console.error(`ancleto: no hay memoria en este repo (${dbPath})`)
    }
    process.exitCode = 1
    return
  }
  let engine
  try {
    engine = createReadonlyMemoryEngine(dbPath)
  } catch (err) {
    curateFailure(asJson, err.message)
    return
  }
  let report
  try {
    report = curateMemory(engine, { projectRoot: resolveMemoryProjectRoot(dbPath) })
  } catch (err) {
    curateFailure(asJson, err.message)
    return
  } finally {
    engine.close()
  }
  if (asJson) {
    console.log(JSON.stringify(report))
  } else {
    console.log(`ancleto: curate -> ${report.brokenRefs.length} ref(s) rota(s), ${report.unverifiable.length} no verificable(s), ${report.exactDuplicates.length} grupo(s) exacto(s)`)
    for (const item of report.brokenRefs) {
      console.log(`  [rota] ${item.memory_key} -> ${item.ref} (${item.reason})`)
    }
    for (const item of report.unverifiable) {
      console.log(`  [no verificable] ${item.memory_key} -> ${item.ref}`)
    }
    for (const group of report.exactDuplicates) {
      console.log(`  [duplicado exacto] ${group.canonical} <- ${group.superseded.join(', ')}`)
    }
  }
  // Advisory por defecto: solo `--strict` convierte los hallazgos en falla.
  // `unverifiable` no afecta el codigo de salida en ningun modo.
  if (strict && (report.brokenRefs.length > 0 || report.exactDuplicates.length > 0)) {
    process.exitCode = 1
  }
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
  if (sub === 'export') {
    await memoryExport(flags)
    return
  }
  if (sub === 'import') {
    await memoryImport(flags)
    return
  }
  if (sub === 'gc') {
    await memoryGc(flags)
    return
  }
  if (sub === 'snapshot') {
    await memorySnapshot(flags)
    return
  }
  if (sub === 'merge') {
    await memoryMerge(flags)
    return
  }
  if (sub === 'consolidate') {
    await memoryConsolidate(flags)
    return
  }
  if (sub === 'curate') {
    await memoryCurateCmd(flags)
    return
  }
  console.error(`ancleto: subcomando de memory desconocido: ${sub || '(ninguno)'}`)
  for (const line of MEMORY_USAGE) console.error(`ancleto: uso: ${line}`)
  process.exit(1)
}

// Declaraciones `model:` de las fuentes versionadas del paquete (`agents/*.md` y
// `profiles/*/agents/*.md`). Sólo lectura local: no ejecuta procesos ni usa red.
async function declaredAgentModels(rootDir) {
  const declarations = []
  const collect = async (dirRel) => {
    let files
    try {
      files = (await readdir(join(rootDir, dirRel))).filter((file) => file.endsWith('.md'))
    } catch {
      return
    }
    for (const file of files) {
      // `check` es advisory: un `.md` ilegible no debe abortar la verificación; se
      // omite el archivo y el resto del conjunto declarado sigue evaluándose.
      let content
      try {
        content = await readFile(join(rootDir, dirRel, file), 'utf8')
      } catch {
        continue
      }
      const model = content.match(/^model:\s*(.+)$/m)?.[1]?.trim()
      if (model) declarations.push({ id: model, source: `${dirRel}/${file}` })
    }
  }
  await collect('agents')
  let profiles = []
  try {
    profiles = (await readdir(join(rootDir, 'profiles'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    profiles = []
  }
  for (const profile of profiles) await collect(`profiles/${profile}/agents`)
  return declarations
}

async function checkCommand() {
  const cwd = process.cwd()
  const rc = await readAncletorc(cwd)
  if (!rc || !rc.installedPaths) {
    console.error('ancleto: no hay .ancletorc con installedPaths (corre ancleto init y ancleto install --project)')
    process.exit(1)
  }
  const ip = rc.installedPaths
  // D9: la union de hosts instalados se lee del manifiesto, no de un unico `rc.agent`.
  const installedHosts = installedHostsFromPaths(ip)
  // Catálogo cargado una sola vez por ejecución: alimenta el aviso de antigüedad y la
  // derivación de deriva de `checkAgentsFrontmatter`. Si es ilegible, `check` sigue
  // funcionando con el fallback actual (catálogo no verificable).
  let modelCatalog = null
  if (installedHosts.includes('opencode')) {
    try {
      const loaded = loadModelCatalog()
      // Un JSON parseable pero con forma inválida (`{}`, `{providers:{}}`, un array,
      // un string) no es un catálogo verificable: se descarta para no derivar deriva
      // falsa por modelo. Queda el mismo camino que cuando la carga lanza.
      modelCatalog = validateCatalogSnapshot(loaded).ok ? loaded : null
    } catch {
      modelCatalog = null
    }
  }
  // Aviso advisory único por ejecución: sólo con catálogo válido, y distinguible del
  // warning de deriva por `model:` del mirror (no altera contadores ni exit code).
  const declaredMissing = modelCatalog
    ? missingModelIdsInCatalog(
      modelCatalog,
      declaredModelIds({ agentModels: await declaredAgentModels(ROOT) })
    )
    : []
  let missing = 0
  let orphans = 0
  const agentWarnings = []

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
      // La convencion de nombre del host (p. ej. vscode: .agent.md/.prompt.md)
      // se deriva del mismo modelo de destino; en skills no cambia el nombre.
      const ext = installedExtFor(cat, dirRel)
      let expected = (await readdir(join(ROOT, cat))).sort().map((f) => (ext ? f.replace(/\.md$/, ext) : f))
      // D9: los command-skills de Antigravity viven dentro de `.agents/skills`; el
      // conjunto esperado de ese dir suma el catalogo de skills y los commands de
      // cualquier host instalado que empaquete commands ahi (union, no rc.agent).
      const packagesCommandsHere = cat === 'skills' && installedHosts.some((h) => {
        const cs = AGENT_TARGETS[h].commands
        return cs?.package === 'skill-dir' && cs.dir === dirRel
      })
      if (packagesCommandsHere) {
        const cmds = (await readdir(join(ROOT, 'commands'))).filter((f) => f.endsWith(MD_EXT)).map((f) => f.slice(0, -MD_EXT.length))
        expected = [...new Set([...expected, ...cmds])].sort()
      }
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
      // T3 (delta `frontmatter-adapters`): validacion no bloqueante del frontmatter
      // de agents contra el adaptador. Solo aplica a `cat === 'agents'` y a archivos
      // esperados (los huérfanos ya quedan avisados). Reporta como warning (⚠), no como
      // faltante (✖): el exit code NO se ve alterado por divergencias (solo por faltantes).
      if (cat === 'agents') {
        agentWarnings.push(...await checkAgentsFrontmatter(cwd, dirRel, actual, expected, ext, modelCatalog))
      }
      if (missingFiles.length === 0 && orphanFiles.length === 0) {
        console.log(`  ✔ ${dirRel} (${actual.length} archivos)`)
      }
    }
  }

  const warnings = await checkTierOrphan(cwd)
  // Deriva de versión del manifiesto: advisory único, no bloqueante. `upgrade` es el
  // único remediador; `check` no repara ni altera el exit code.
  const cliVersion = await packageVersion()
  if (typeof rc.version === 'string' && rc.version && rc.version !== cliVersion) {
    warnings.push(`.ancletorc registra v${rc.version} y el CLI es v${cliVersion}; corré 'ancleto upgrade' para regenerar los artefactos locales`)
  }
  warnings.push(...agentWarnings)
  if (checkMachineEnvTracked(cwd)) {
    warnings.push('.ancleto/machine-env.md (trackeado en git; deberia ser un artefacto local — corre `git rm --cached .ancleto/machine-env.md`)')
  }
  // Aviso informativo único por ejecución: no es TTL ni altera la resolución ni el exit code.
  if (modelCatalog && isCatalogStale(modelCatalog.generated_at, new Date())) {
    const age = catalogAgeDays(modelCatalog.generated_at, new Date())
    warnings.push(`catálogo de modelos con ${age} días de antigüedad (${modelCatalog.generated_at}); considerá refrescarlo desde el repositorio fuente`)
  }
  if (declaredMissing.length > 0) {
    const list = declaredMissing.map((item) => `${item.id} (${item.source || 'sin origen'})`).join(', ')
    warnings.push(`IDs declarados ausentes del catálogo de modelos: ${list}; refrescá el catálogo desde el repositorio fuente`)
  }
  // Salud MCP: advisory, host-aware. Se inspecciona el destino de cada host
  // instalado que declare uno; nunca la config global ni hosts sin destino. No
  // altera `missing`/`orphans`, el exit code ni escribe archivos.
  const mcpDestinations = await resolveExistingHostMcpDestinations(
    cwd,
    HOST_MCP_ORDER.filter((host) => installedHosts.includes(host))
  )
  for (const destination of mcpDestinations) {
    let cfg
    try {
      cfg = JSON.parse((await readFile(destination.file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      warnings.push(`${relative(cwd, destination.file).replace(/\\/g, '/')} no es JSON valido; no se inspeccionaron las entradas MCP`)
      continue
    }
    const mcpMap = cfg?.[destination.schema]
    if (!mcpMap || typeof mcpMap !== 'object' || Array.isArray(mcpMap)) continue
    for (const [name, def] of Object.entries(mcpMap)) {
      const entry = destination.schema === 'mcpServers' ? normalizeHostMcpEntry(def) : def
      if (!mcpCommandBroken(entry)) continue
      const first = Array.isArray(entry?.command) ? entry.command[0] : undefined
      const bin = typeof first === 'string' && first.length > 0 ? first : 'command ausente'
      warnings.push(`MCP '${name}' tiene un comando roto (${bin})`)
    }
  }

  console.log(`ancleto: check -> ${missing} faltantes, ${orphans} huerfanos`)
  for (const w of warnings) console.log(`  ⚠ ${w}`)
  process.exit(missing > 0 ? 1 : 0)
}

// T3 (delta `frontmatter-adapters`): para cada `.md` de un directorio de agents
// instalado, compara el contenido contra la adaptacion de la canónica versionada
// (`adaptFrontmatter(source, host, 'agents', name)`), conservando las notas de host
// por orchestrator. Para opencode tambien calcula el estado esperado del tier
// configurado (misma sustitucion de `model:` que `applyTier`): un mirror que coincide
// con el tier no es divergencia, pero la diferencia de modelo se anuncia una vez por
// directorio para que nunca quede silenciosa.
// Reporta divergencia y aviso de tier como warnings (no bloqueantes). No compara
// archivos huérfanos (ya quedan avisados arriba) ni archivos sin origen comparable.
async function checkAgentsFrontmatter(cwd, dirRel, actual, expected, fileExt, modelCatalog = null) {
  const advisories = []
  const host = hostForDir('agents', dirRel)
  if (!host) return advisories
  const rc = await readAncletorc(cwd)
  const profile = validProfile(rc?.profile) || DEFAULT_PROFILE
  // Overlay del perfil: para `test`, installProfileOverlay reemplaza tester/reviewer
  // desde `profiles/test/agents/<n>.md` despues de instalar los agentes base, asi que
  // esa fuente es la esperada para el cuerpo (y para el modelo tras `upgrade`). El
  // resto sigue comparandose contra `agents/`. El estado del tier se calcula sobre la
  // fuente que corresponda a cada agente.
  const profileAgentsDir = join(profileAssetsRoot(profile), 'agents')
  // Estados de tier aplicados por install en opencode (model: <x> -> tier). Para
  // `minimo` el conjunto de aceptacion son TODOS los candidatos estaticos de la
  // cadena, con el resuelto-ahora en primer lugar: un mirror escrito cuando el
  // catalogo tenia otro candidato sigue siendo valido. Para el resto de los tiers el
  // unico estado es el resuelto-ahora. `gratis` resuelve con el unico gratis conocido;
  // un `gratisModel` desconocido se ignora aca tambien.
  let tier = null
  let tierCandidates = {}
  let tierResolved = {}
  let tierUnresolved = []
  let catalogUnavailable = false
  if (host === 'opencode') {
    const tierFile = join(cwd, '.opencode', '.ancleto-tier')
    if (await exists(tierFile)) {
      const rawTier = (await readFile(tierFile, 'utf8')).trim()
      if (TIERS[rawTier]) {
        tier = rawTier
        const persisted = isKnownGratisModel(rc?.gratisModel) ? rc.gratisModel : null
        try {
          if (!modelCatalog) throw new Error('catálogo no legible')
          const resolved = resolveTierModels(tier, modelCatalog, {
            chains: TIER_CHAINS,
            gratisOverride: persisted,
            allowUnresolved: true
          })
          tierCandidates = resolved.candidates
          tierResolved = resolved.models
          tierUnresolved = resolved.unresolved
        } catch {
          // El snapshot puede faltar, ser ilegible o venir de un
          // `ANCLETO_MODEL_CATALOG` invalido. `check` no aborta: acepta los
          // candidatos estaticos de la cadena contra un catalogo vacio y avisa que
          // no pudo verificar. install/init/import siguen fallando con error.
          catalogUnavailable = true
          const fallback = resolveTierModels(tier, { providers: {} }, {
            chains: TIER_CHAINS,
            gratisOverride: persisted,
            allowUnresolved: true
          })
          tierCandidates = fallback.candidates
          tierResolved = fallback.models
          // "Ilegible" no es lo mismo que "sin candidato resoluble": ese aviso
          // queda a cargo del caso con catalogo valido y vacio.
          tierUnresolved = []
        }
      }
    }
  }
  // Deriva: sólo con catálogo legible y host que escribe `model:` de verdad. Un host
  // que elimina el campo o emite `model: inherit` no se evalúa.
  const installedCatalogIds = host === 'opencode' && modelCatalog
    ? modelIdsFromCatalog(modelCatalog)
    : null
  const compression = await hostConfigHasCompression(cwd, host)
  const adapt = (source, name) => {
    let adapted = adaptFrontmatter(source, host, 'agents', name)
    if (name === 'orchestrator') {
      if (host === 'copilot') adapted += COPILOT_MODEL_NOTE
      else if (host === 'commandcode') adapted += COMMANDCODE_MODEL_NOTE
    }
    if (name === 'orchestrator' && compression) adapted += CAVEMAN_USAGE_NOTE
    return adapted
  }
  const nameFromFile = (f) => fileExt ? f.slice(0, -fileExt.length) : f.replace(/\.md$/, '')
  let tierDiff = 0
  for (const f of actual) {
    if (!expected.includes(f)) continue
    const name = nameFromFile(f)
    const canonicalPath = join(ROOT, 'agents', `${name}.md`)
    const profilePath = join(profileAgentsDir, `${name}.md`)
    const desdePerfil = profilePath !== canonicalPath && (await exists(profilePath))
    const srcPath = desdePerfil ? profilePath : canonicalPath
    if (!(await exists(srcPath))) continue
    const source = await readFile(srcPath, 'utf8')
    // Estado esperado: el adaptador aplicado a la fuente que corresponde (canónica u
    // overlay del perfil), sin tier.
    const esperado = adapt(source, name)
    // Estados del tier (solo opencode): simula la sustitucion de `model:` que hace
    // applyTier sobre el campo antes de adaptar. install/init corren applyTier despues
    // del overlay del perfil, asi que el tier es dueno de `model:` en TODOS los agentes
    // instalados, overlay incluido (--tier gratis debe seguir siendo cost-safe). El
    // perfil es dueno del cuerpo y del modelo en `upgrade`, que no aplica tier: por eso
    // el overlay vuelve a su fuente byte a byte despues de upgrade.
    const conTier = (model) => adapt(source.replace(/^model: .*$/m, `model: ${model}`), name)
    const candidatos = tierCandidates[name] || []
    const conTierEstados = candidatos.map(conTier)
    const instalado = await readFile(join(cwd, dirRel, f), 'utf8')
    const installedModel = instalado.match(/^model: (.+)$/m)?.[1]?.trim()
    // Aviso no bloqueante de deriva: un `model:` del mirror que no figura en el
    // snapshot legible sugiere refrescar el catálogo. No toca el exit code ni el
    // conjunto de aceptación del oráculo.
    if (installedCatalogIds) {
      if (installedModel && installedModel !== 'inherit' && !installedCatalogIds.has(installedModel)) {
        console.log(`  ⚠ ${dirRel}/${f} (model '${installedModel}' ausente del catálogo de modelos; refrescalo desde el repositorio fuente)`)
      }
    }
    // Aviso advisory: modelo gratis sobre un agente primario. Se deriva sólo del
    // `mode:` del frontmatter instalado, nunca del nombre ni de la posición en `TIERS`.
    const installedMode = frontmatterValue(parseFrontmatter(instalado).entries?.find((e) => e.key === 'mode'))
    if (freeTierOnPrimary(installedModel, installedMode)) {
      advisories.push(`${dirRel}/${f} (modelo free ${installedModel} sobre un agente primario: puede responder 403 en OpenCode)`)
    }
    // El aviso de tier cuenta si el mirror difiere del resuelto-ahora (el proximo
    // install/update reescribiria `model:`) o si el resuelto-ahora difiere de la
    // fuente esperada (el tier aplica otro modelo). Ambas direcciones quedan visibles.
    const resolvedNow = tierResolved[name]
    if (resolvedNow) {
      const resueltoEstado = conTier(resolvedNow)
      if (resueltoEstado !== esperado || instalado !== resueltoEstado) tierDiff++
    }
    if (instalado !== esperado && !conTierEstados.includes(instalado)) {
      console.log(`  ⚠ ${dirRel}/${f} (frontmatter diverge del adaptador para host '${host}')`)
    }
  }
  if (tierDiff > 0) {
    console.log(`  ⚠ ${dirRel} (tier '${tier}' aplica un modelo distinto al de su fuente en ${tierDiff} ${tierDiff === 1 ? 'agente' : 'agentes'}; install/update reescribirá model:)`)
  }
  if (catalogUnavailable) {
    console.log(`  ⚠ ${dirRel} (no se pudo verificar el catálogo de modelos; se aceptan los candidatos estáticos del tier '${tier}')`)
  }
  const ext = fileExt || '.md'
  if (tierUnresolved.some((name) => actual.includes(name + ext))) {
    console.log(`  ⚠ ${dirRel} (tier '${tier}': el catálogo no tiene ningún candidato resoluble; install/update abortará hasta refrescar el catálogo)`)
  }
  return advisories
}

// Avisa si hay un tier del proyecto sin agentes locales donde aplicarlo:
// el tier solo se aplica a los agentes instalados en el proyecto, no a los globales.
async function checkTierOrphan(cwd) {
  const warnings = []
  const tierFile = join(cwd, '.opencode', '.ancleto-tier')
  if (!(await exists(tierFile))) return warnings
  const tier = (await readFile(tierFile, 'utf8')).trim()
  if (!TIERS[tier]) return warnings
  // D9: se cuentan los agents locales del host realmente instalados, no
  // `.opencode/agents` fijo (un proyecto antigravity usa `.agents/agents`).
  const rc = await readAncletorc(cwd)
  // Sin superficie de agentes locales el tier queda dormido, no huérfano: no hay
  // donde aplicarlo ni nada que instalar en el proyecto.
  const dirs = localAgentDirs(rc)
  if (dirs.length === 0) return warnings
  let count = 0
  for (const d of dirs) {
    const p = join(cwd, d)
    if (await exists(p)) count += (await readdir(p)).filter((f) => f.endsWith(MD_EXT)).length
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

// Resuelve el change por slug: activo en aspec/changes/<slug>/ o archivado en
// aspec/changes/<YYYY-MM-DD>-<slug>/. Fail-closed (exit 2) ante 0 o ≥2 coincidencias.
const CHANGE_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

// Slug seguro para resolver rutas: sin traversal (`..`, `/`, `\`, NUL) y con forma canónica.
function isValidChangeSlug(slug) {
  return typeof slug === 'string'
    && !slug.includes('..')
    && !slug.includes('/')
    && !slug.includes('\\')
    && !slug.includes('\0')
    && CHANGE_SLUG_RE.test(slug)
}

// Identidad de path (absoluta y normalizada; case-insensitive en Windows).
function samePath(a, b) {
  const ra = resolve(a)
  const rb = resolve(b)
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb
}

async function resolveChangeDir(cwd, slug) {
  const changesDir = join(cwd, CHANGES_ROOT, 'changes')
  const archiveDir = join(changesDir, 'archive')
  const matches = []
  const active = join(changesDir, slug)
  // El contenedor de archives nunca es un change: ni como directorio activo ni
  // por el glob de archives.
  if (!samePath(active, archiveDir)) {
    try {
      if ((await stat(active)).isDirectory()) matches.push(active)
    } catch {}
  }
  if (await exists(archiveDir)) {
    const archivedName = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegExp(slug)}$`)
    for (const entry of await readdir(archiveDir, { withFileTypes: true })) {
      const candidate = join(archiveDir, entry.name)
      if (samePath(candidate, archiveDir)) continue
      if (entry.isDirectory() && archivedName.test(entry.name)) matches.push(candidate)
    }
  }
  return matches
}

// Capabilities presentes en el delta del change (<changeDir>/specs/<capability>/spec.md).
async function collectDeltaCapabilities(changeDir) {
  const specsDir = join(changeDir, 'specs')
  const capabilities = []
  if (!(await exists(specsDir))) return capabilities
  for (const entry of await readdir(specsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const deltaPath = join(specsDir, entry.name, 'spec.md')
    if (await exists(deltaPath)) capabilities.push({ capability: entry.name, deltaPath })
  }
  capabilities.sort((a, b) => a.capability.localeCompare(b.capability))
  return capabilities
}

async function specsMergeCommand(args) {
  const cwd = process.cwd()
  const asJson = args.includes('--json')
  const dryRun = args.includes('--dry-run')
  const ci = args.indexOf('--change')
  const slug = ci >= 0 ? args[ci + 1] : null
  if (!slug || slug.startsWith('-')) {
    console.error('ancleto: uso: ancleto specs merge --change <slug> [--dry-run] [--json]')
    process.exit(1)
  }
  if (!isValidChangeSlug(slug)) {
    console.error(`ancleto: specs merge: slug invalido "${slug}"`)
    process.exit(2)
  }

  // El contenedor `aspec/changes/archive` no es un change. La detección es por
  // identidad de path contra el contenedor, no por el slug ni por `proposal.md`.
  const changesDir = join(cwd, CHANGES_ROOT, 'changes')
  const archiveContainer = join(changesDir, 'archive')
  if (samePath(join(changesDir, slug), archiveContainer)) {
    const containerRel = relative(cwd, archiveContainer).replace(/\\/g, '/')
    const reason = `el contenedor "${containerRel}" no es un change (slug: "${slug}")`
    if (asJson) {
      console.log(JSON.stringify({
        ok: false,
        change: slug,
        dryRun,
        capabilities: [],
        operations: [],
        changed: false,
        errors: [{ capability: null, requirement: null, reason }]
      }, null, 2))
    } else {
      console.error(`ancleto: specs merge: ${reason}`)
    }
    process.exit(2)
  }

  const matches = await resolveChangeDir(cwd, slug)
  if (matches.length !== 1) {
    const reason = matches.length === 0
      ? `no existe el change "${slug}"`
      : `change ambiguo "${slug}": ${matches.length} coincidencias`
    console.error(`ancleto: specs merge: ${reason}`)
    process.exit(2)
  }
  const changeDir = matches[0]

  // Fase 1: computar todos los planes antes de escribir nada.
  const plans = []
  const errors = []
  try {
    for (const { capability, deltaPath } of await collectDeltaCapabilities(changeDir)) {
      const target = join(cwd, CHANGES_ROOT, 'specs', capability, 'spec.md')
      if (!(await exists(target))) {
        errors.push({ capability, requirement: null, reason: 'canonical spec not found' })
        continue
      }
      const merged = mergeSpecText(await readFile(deltaPath, 'utf8'), await readFile(target, 'utf8'))
      for (const error of merged.errors) errors.push({ capability, ...error })
      plans.push({ capability, target, output: merged.output, operations: merged.operations, changed: merged.changed })
    }
  } catch (error) {
    console.error(`ancleto: specs merge: ${error.message}`)
    process.exit(1)
  }

  const report = {
    change: slug,
    dryRun,
    capabilities: plans.map((plan) => ({ capability: plan.capability, operations: plan.operations, changed: plan.changed })),
    operations: plans.flatMap((plan) => plan.operations),
    changed: plans.some((plan) => plan.changed),
    errors
  }

  if (errors.length > 0) {
    if (asJson) console.log(JSON.stringify({ ok: false, ...report }, null, 2))
    else {
      for (const error of errors) {
        const where = error.capability || '?'
        const req = error.requirement ? ` «${error.requirement}»` : ''
        console.error(`ancleto: specs merge: ${where}${req}: ${error.reason}`)
      }
      console.error('ancleto: specs merge: conflicto fail-closed; no se escribio ningun spec')
    }
    process.exit(2)
  }

  // Fase 2: escribir solo si no hubo errores y no es --dry-run.
  if (!dryRun) {
    try {
      for (const plan of plans) {
        if (plan.changed) await writeFile(plan.target, plan.output)
      }
    } catch (error) {
      console.error(`ancleto: specs merge: ${error.message}`)
      process.exit(1)
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: true, ...report }, null, 2))
    return
  }
  if (plans.length === 0) {
    console.log('ancleto: specs merge: el change no tiene deltas de specs')
    return
  }
  for (const plan of plans) {
    const ops = plan.operations.map((op) => op.type).join(', ') || 'sin operaciones'
    console.log(`  ${dryRun ? '(dry-run) ' : ''}${plan.capability}: ${ops}${plan.changed ? '' : ' (sin cambios)'}`)
  }
  const written = dryRun ? 0 : plans.filter((plan) => plan.changed).length
  console.log(dryRun
    ? `ancleto: specs merge: ${plans.length} capability(es); ningun archivo escrito (--dry-run)`
    : `ancleto: specs merge: ${written} de ${plans.length} spec(s) canonicos actualizados`)
}

async function specsCommand(args) {
  if (args[0] === 'merge') {
    await specsMergeCommand(args.slice(1))
    return
  }
  await specsCheckCommand(args)
}

// Read-only: computa el affected-set (dependientes incluidos) sin escribir nada.
async function affectedCommand(args) {
  const asJson = args.includes('--json')
  const ci = args.indexOf('--cwd')
  if (ci >= 0 && ci + 1 >= args.length) {
    console.error('ancleto: uso: ancleto affected [--cwd <dir>] [--json] <archivo...>')
    process.exit(1)
  }
  const cwd = ci >= 0 ? resolve(args[ci + 1]) : process.cwd()
  const seeds = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--json') continue
    if (a === '--cwd') {
      i += 1
      continue
    }
    seeds.push(a)
  }
  if (seeds.length === 0) {
    console.error('ancleto: uso: ancleto affected [--cwd <dir>] [--json] <archivo...>')
    process.exit(1)
  }
  const { seeds: normalizedSeeds, affected, unresolved, externalCount } = computeAffectedSet({
    rootDir: cwd,
    seeds
  })
  if (asJson) {
    console.log(JSON.stringify({ seeds: normalizedSeeds, affected, unresolved, externalCount }, null, 2))
    return
  }
  for (const f of affected) console.log(f)
  // Dato informativo (no warning ni error): cuantos specifiers no relativos se
  // trataron como externos. Va a stderr para no ensuciar la lista de stdout y
  // se omite cuando el conteo es 0 (el campo `externalCount` sigue en --json).
  if (externalCount > 0) {
    console.error(`ancleto: affected: ${externalCount} specifier(s) externos (no relativos; dato informativo)`)
  }
  if (unresolved.length > 0) {
    console.error(`ancleto: affected: ${unresolved.length} import(s) no resueltos (inconclusos)`)
    for (const u of unresolved) console.error(`  ? ${u.file}: ${u.specifier}`)
  }
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

// --- ancleto stats failures -------------------------------------------------
// Reporte de fallos de tool parts. Todo es solo lectura sobre la base de opencode.
// El set de herramientas de shell es unico para SQL y JS (portabilidad Windows/Linux).
const SHELL_TOOLS = new Set(['bash', 'shell', 'powershell', 'pwsh', 'cmd'])
const SHELL_TOOLS_SQL = [...SHELL_TOOLS].map((t) => `'${t}'`).join(', ')
const FAILURE_CLASS_NAMES = ['env', 'check', 'tool', 'unknown']
const FAILURE_CLASS_RANK = { env: 0, check: 1, tool: 2, unknown: 3 }

function failuresUsage() {
  return 'ancleto: uso: ancleto stats failures [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>] [--class <c,...>] [--tool <t,...>] [--json]'
}

function failuresUsageError(message) {
  console.error(`ancleto: ${message}`)
  console.error(failuresUsage())
  process.exit(1)
}

function parseFailuresArgs(args) {
  const opts = { all: false, since: null, sinceRaw: null, limit: 10, sessionId: null, classes: null, tools: null, json: false }
  const list = (value, flag) => {
    const parts = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length === 0) failuresUsageError(`${flag} requiere al menos un valor`)
    return [...new Set(parts)]
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--all') { opts.all = true; continue }
    if (a === '--json') { opts.json = true; continue }
    if (a === '--since') {
      const v = args[++i]
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) failuresUsageError('--since requiere formato YYYY-MM-DD')
      const [y, m, d] = v.split('-').map(Number)
      const t = Date.UTC(y, m - 1, d)
      const dt = new Date(t)
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
        failuresUsageError(`--since requiere una fecha valida: ${v}`)
      }
      opts.sinceRaw = v
      opts.since = t
      continue
    }
    if (a === '--limit') {
      const v = args[++i]
      if (!/^\d+$/.test(String(v ?? ''))) failuresUsageError('--limit requiere un entero >= 1')
      const n = Number(v)
      if (n < 1) failuresUsageError('--limit requiere un entero >= 1')
      opts.limit = n
      continue
    }
    if (a === '--session') {
      const v = args[++i]
      if (!v || v.startsWith('--')) failuresUsageError('--session requiere un id')
      opts.sessionId = v
      continue
    }
    if (a === '--class') {
      const classes = list(args[++i], '--class')
      for (const c of classes) {
        if (!FAILURE_CLASS_NAMES.includes(c)) failuresUsageError(`--class invalida: ${c} (validas: ${FAILURE_CLASS_NAMES.join(', ')})`)
      }
      opts.classes = classes
      continue
    }
    if (a === '--tool') {
      opts.tools = list(args[++i], '--tool')
      continue
    }
    failuresUsageError(`opcion desconocida: ${a}`)
  }
  return opts
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Elimina ANSI/OSC y caracteres de control, preservando \t \n \r para poder
// colapsarlos a un espacio (asi \r\n y \n caen en el mismo grupo).
function stripControl(value) {
  return String(value ?? '')
    .replace(/\u001B\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
}

function truncate(value, max) {
  const s = String(value ?? '')
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}

// Orden: control -> home -> unidades -> raices POSIX -> secretos -> whitespace.
function maskSensitive(value) {
  let s = stripControl(value)
  if (!s) return ''
  const home = homedir()
  if (home) {
    const variants = new Set([home, home.replace(/\\/g, '/'), home.replace(/\//g, '\\')])
    const flags = process.platform === 'win32' ? 'gi' : 'g'
    for (const v of variants) {
      if (v) s = s.replace(new RegExp(escapeRegExp(v), flags), '<home>')
    }
  }
  // Unidad absoluta de Windows sin comerse el esquema de una URL (https://...).
  s = s.replace(/(^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s"']*/g, '$1<path>')
  s = s.replace(/\/home\/[^/\s"']+/g, '/home/<user>')
  s = s.replace(/\/Users\/[^/\s"']+/g, '/Users/<user>')
  s = s.replace(/\b((?:Proxy-)?Authorization\s*:\s*)(\S+)\s+\S+/gi, '$1$2 ***')
  // Solo al inicio del comando/esqueleto: `deploy Basic configuration` es un
  // comando normal y no debe enmascararse. La forma con `:` puede ir en
  // cualquier posicion (`curl Bearer:<token>`).
  s = s.replace(/^(Basic|Bearer)\s+\S+/gi, '$1 ***')
  s = s.replace(/\b(Basic|Bearer):\S+/gi, '$1 ***')
  // `Bearer`/`ApiKey` no son palabras normales de comando: se enmascaran en
  // cualquier posicion. `Basic` solo con token que parezca credencial (digito),
  // para no tocar `deploy Basic configuration`.
  s = s.replace(/\b(Bearer)\s+\S+/gi, '$1 ***')
  s = s.replace(/\b(ApiKey)\s+\S+/gi, '$1 ***')
  s = s.replace(/\b(Basic)\s+(?=\S*\d)\S+/gi, '$1 ***')
  s = s.replace(/\b(?:ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)/g, '***')
  s = s.replace(/(--(?:token|password|apikey|secret))(?:\s*=\s*|\s+)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1=***')
  s = s.replace(/([A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD)[A-Z0-9_]*)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s&;|]+)/gi, '$1=***')
  return s.replace(/\s+/g, ' ').trim()
}

function maskPath(value) {
  const s = String(value ?? '').replace(/\\/g, '/')
  if (!s) return ''
  return truncate(maskSensitive(s), 60)
}

function stripWrapper(raw) {
  const s = String(raw ?? '').trim()
  const m = /^\s*&\s+['"]([^'"]+)['"]\s+shrink\s+--\s+([\s\S]+)$/.exec(s)
  if (m) return { wrapped: true, inner: m[2].trim() }
  return { wrapped: false, inner: s }
}

// Esqueleto estructural: wrapper -> prefijo de entorno -> basename del ejecutable
// (sin ruta ni extension) + hasta 3 tokens estructurales. Se corta en el primer
// token que no cumpla el patron (flags, `=`, `/`, `\`, `@`, `$`, comillas, `2>&1`).
// El esqueleto es la garantia de privacidad; el masking por token es la segunda capa.
const ENV_PREFIX_TOKEN = /^[A-Za-z_][A-Za-z0-9_]*=/
const STRUCTURAL_TOKEN = /^[A-Za-z][A-Za-z0-9:_.-]*$/
const EXE_EXTENSION = /\.(?:exe|cmd|bat|ps1|sh)$/i

function skeletonCommand(raw) {
  const { wrapped, inner } = stripWrapper(raw)
  const tokens = String(inner ?? '').trim().split(/\s+/).filter(Boolean)
  let envPrefix = false
  while (tokens.length > 0 && ENV_PREFIX_TOKEN.test(tokens[0])) {
    tokens.shift()
    envPrefix = true
  }
  let skeleton = ''
  if (tokens.length > 0) {
    const exe = (tokens.shift().split(/[\\/]/).pop() || '').replace(EXE_EXTENSION, '')
    if (exe) {
      const parts = [maskSensitive(exe)]
      let added = 0
      for (const token of tokens) {
        if (added >= 3 || !STRUCTURAL_TOKEN.test(token)) break
        parts.push(maskSensitive(token))
        added++
      }
      // Masking cross-token: reglas como `Basic|Bearer <token>` o
      // `Authorization: <esquema> <token>` abarcan varios tokens, asi que el
      // masking por token solo no las alcanza. Se aplica al string unido; el
      // resultado se usa tanto como `command` como clave de grupo.
      skeleton = maskSensitive(parts.join(' '))
    }
  }
  const text = `${envPrefix ? '(env-prefix) ' : ''}${skeleton}`.trim()
  return { wrapped, command: text ? truncate(text, 160) : null }
}

function failureBucketsQuery({ dirs, sessionIds, since, classes, tools }) {
  const params = []
  let scopePredicate = '1=1'
  if (sessionIds && sessionIds.length > 0) {
    scopePredicate = `p.session_id IN (${sessionIds.map(() => '?').join(',')})`
    params.push(...sessionIds)
  } else if (dirs) {
    if (dirs.length === 0) {
      scopePredicate = '1=0'
    } else {
      scopePredicate = `s.directory IN (${dirs.map(() => '?').join(',')})`
      params.push(...dirs)
    }
  }
  let sincePredicate = '1=1'
  if (since !== null && since !== undefined) {
    sincePredicate = 'p.time_created >= ?'
    params.push(since)
  }
  let classMatch = '1=1'
  if (classes && classes.length > 0) {
    classMatch = `failure_class IN (${classes.map(() => '?').join(',')})`
  }
  let toolMatch = '1=1'
  if (tools && tools.length > 0) {
    toolMatch = `tool IN (${tools.map(() => '?').join(',')})`
  }
  // Los parametros de --class/--tool van despues de scope/since (una sola query,
  // con el flag de match calculado en SQL para conservar universe vs matched).
  if (classes && classes.length > 0) params.push(...classes)
  if (tools && tools.length > 0) params.push(...tools)

  // output/state.error solo aparecen dentro del CASE de clasificacion; nunca se proyectan.
  const envText = "lower(coalesce(json_extract(p.data,'$.state.output'),'') || char(10) || coalesce(json_extract(p.data,'$.state.error'),''))"
  const envSignals = [
    'is not recognized',
    'no se reconoce como nombre',
    'command not found',
    'missing script',
    'cannot find module',
    'parsererror',
    'unexpected token',
    'reservado para uso futuro',
    'enoent'
  ]
  const envPredicate = envSignals.map((p) => `${envText} LIKE '%${p}%'`).join('\n          OR ')

  const sql = `
WITH fallos AS (
  SELECT
    s.directory AS project_dir,
    s.id AS session_id,
    p.time_created AS at,
    json_extract(p.data,'$.tool') AS tool,
    CASE
      WHEN coalesce(json_extract(p.data,'$.tool'),'') NOT IN (${SHELL_TOOLS_SQL}) THEN 'tool'
      WHEN CAST(json_extract(p.data,'$.state.metadata.exit') AS INTEGER) IN (127,9009) THEN 'env'
      WHEN ${envPredicate}
        THEN 'env'
      WHEN json_extract(p.data,'$.state.metadata.exit') IS NOT NULL
       AND CAST(json_extract(p.data,'$.state.metadata.exit') AS INTEGER) <> 0 THEN 'check'
      ELSE 'unknown'
    END AS failure_class,
    CASE WHEN json_extract(p.data,'$.tool') IN (${SHELL_TOOLS_SQL})
         THEN json_extract(p.data,'$.state.input.command') END AS cmd
  FROM part p
  JOIN session s ON s.id = p.session_id
  WHERE json_extract(p.data,'$.type') = 'tool'
    AND ( json_extract(p.data,'$.state.status') = 'error'
       OR ( json_extract(p.data,'$.state.metadata.exit') IS NOT NULL
        AND json_extract(p.data,'$.state.metadata.exit') <> 0 ) )
    AND (${scopePredicate})
    AND (${sincePredicate})
)
SELECT project_dir, session_id, tool, failure_class, cmd,
       COUNT(*) AS parts,
       MIN(at) AS first_seen,
       MAX(at) AS last_seen,
       CASE WHEN (${classMatch}) AND (${toolMatch}) THEN 1 ELSE 0 END AS matched
FROM fallos
GROUP BY project_dir, session_id, tool, failure_class, cmd`
  return { sql, params }
}

function queryFailureBuckets(db, options) {
  const { sql, params } = failureBucketsQuery(options)
  return db.prepare(sql).all(...params)
}

function compareFailureGroups(a, b) {
  return (FAILURE_CLASS_RANK[a.class] ?? 9) - (FAILURE_CLASS_RANK[b.class] ?? 9) ||
    b.parts - a.parts ||
    b.sessions - a.sessions ||
    String(a.tool).localeCompare(String(b.tool)) ||
    String(a.project).localeCompare(String(b.project)) ||
    String(a.command ?? '').localeCompare(String(b.command ?? '')) ||
    Number(a.wrapped) - Number(b.wrapped) ||
    String(a.projectKey).localeCompare(String(b.projectKey))
}

function aggregateFailures(buckets) {
  const groups = new Map()
  for (const b of buckets) {
    const toolRaw = b.tool ?? null
    const isShell = toolRaw !== null && SHELL_TOOLS.has(toolRaw)
    let wrapped = false
    let command = null
    if (isShell) {
      const skeleton = skeletonCommand(b.cmd)
      wrapped = skeleton.wrapped
      command = skeleton.command
    }
    const key = `${normPath(b.project_dir)}\u0000${toolRaw ?? ''}\u0000${b.failure_class}\u0000${wrapped ? 'w' : 'r'}\u0000${command ?? ''}`
    let g = groups.get(key)
    if (!g) {
      g = {
        projectKey: normPath(b.project_dir),
        project: maskPath(b.project_dir) || '(sin proyecto)',
        tool: truncate(maskSensitive(toolRaw ?? '(desconocido)'), 40),
        class: b.failure_class,
        wrapped,
        command,
        matched: Boolean(b.matched),
        parts: 0,
        sessions: 0,
        max_per_session: 0,
        first_seen: null,
        last_seen: null,
        session_refs: [],
        perSession: new Map()
      }
      groups.set(key, g)
    }
    const parts = Number(b.parts) || 0
    g.parts += parts
    const first = b.first_seen === null || b.first_seen === undefined ? null : Number(b.first_seen)
    const last = b.last_seen === null || b.last_seen === undefined ? null : Number(b.last_seen)
    if (first !== null && (g.first_seen === null || first < g.first_seen)) g.first_seen = first
    if (last !== null && (g.last_seen === null || last > g.last_seen)) g.last_seen = last
    const perSession = g.perSession.get(b.session_id) || { parts: 0 }
    perSession.parts += parts
    g.perSession.set(b.session_id, perSession)
  }
  const result = [...groups.values()]
  for (const g of result) {
    g.sessions = g.perSession.size
    let max = 0
    for (const v of g.perSession.values()) if (v.parts > max) max = v.parts
    g.max_per_session = max
    g.session_refs = [...g.perSession.entries()]
      .map(([id, v]) => ({ id, parts: v.parts }))
      .sort((a, b) => b.parts - a.parts || String(a.id).localeCompare(String(b.id)))
      .map(({ id }) => ({ id }))
    delete g.perSession
  }
  result.sort(compareFailureGroups)
  return result
}

function summarizeFailureGroups(groups) {
  const byClass = {}
  const sessionSets = {}
  for (const c of FAILURE_CLASS_NAMES) {
    byClass[c] = { parts: 0, groups: 0, sessions: 0 }
    sessionSets[c] = new Set()
  }
  const allSessions = new Set()
  let parts = 0
  for (const g of groups) {
    parts += g.parts
    const summary = byClass[g.class]
    if (summary) {
      summary.parts += g.parts
      summary.groups += 1
      for (const ref of g.session_refs) sessionSets[g.class].add(ref.id)
    }
    for (const ref of g.session_refs) allSessions.add(ref.id)
  }
  for (const c of FAILURE_CLASS_NAMES) byClass[c].sessions = sessionSets[c].size
  return { parts, groups: groups.length, sessions: allSessions.size, by_class: byClass }
}

function summarizeFailureClass(groups) {
  const ids = new Set()
  let parts = 0
  for (const g of groups) {
    parts += g.parts
    for (const ref of g.session_refs) ids.add(ref.id)
  }
  return { parts, groups: groups.length, sessions: ids.size }
}

function renderFailureClassTable(lines, cls, groups, limit) {
  const summary = summarizeFailureClass(groups)
  if (summary.groups === 0) {
    lines.push(`${cls}: sin fallos`)
    return
  }
  lines.push(`${cls} — ${summary.parts} fallos · ${summary.groups} grupos · ${summary.sessions} sesiones`)
  lines.push('')
  lines.push(`  ${'proyecto'.padEnd(32)} ${'tool'.padEnd(6)} ${'fallos'.padStart(6)} ${'ses'.padStart(4)} ${'max'.padStart(4)}  ${'primera'.padEnd(17)} ${'ultima'.padEnd(17)} comando`)
  for (const g of groups.slice(0, limit)) {
    const command = g.command ? `${g.wrapped ? '(wrapped) ' : ''}${g.command}` : '-'
    lines.push(`  ${g.project.padEnd(32)} ${g.tool.padEnd(6)} ${String(g.parts).padStart(6)} ${String(g.sessions).padStart(4)} ${String(g.max_per_session).padStart(4)}  ${fmtDate(g.first_seen).padEnd(17)} ${fmtDate(g.last_seen).padEnd(17)} ${command}`)
  }
  if (groups.length > limit) lines.push(`  (${limit} de ${groups.length} grupos)`)
}

function renderFailuresText(report) {
  const lines = []
  const scopeLabel = report.scope === 'all'
    ? 'todas las sesiones'
    : report.scope === 'session'
      ? `sesion ${report.session}`
      : (report.project || '(sin proyecto)')
  const sinceLabel = report.since ? ` — desde ${report.since}` : ''
  lines.push(`ancleto: stats failures (opencode) — ${scopeLabel}${sinceLabel}`)
  const u = report.universe
  const by = u.by_class
  lines.push(`universo: ${u.parts} fallos · ${u.groups} grupos · ${u.sessions} sesiones · env ${by.env.parts} · check ${by.check.parts} · tool ${by.tool.parts} · unknown ${by.unknown.parts}`)
  if (u.groups === 0) {
    lines.push('')
    lines.push('ancleto: no hay fallos en el alcance consultado')
    if (report.scope === 'directory') lines.push('ancleto: proba --all para ver todas las sesiones de la maquina')
    return lines.join('\n')
  }
  if (report.requestedClasses && report.requestedClasses.length > 0) {
    for (const cls of FAILURE_CLASS_NAMES) {
      if (!report.requestedClasses.includes(cls)) continue
      lines.push('')
      renderFailureClassTable(lines, cls, report.allGroups.filter((g) => g.class === cls), report.limit)
    }
    return lines.join('\n')
  }
  lines.push('')
  renderFailureClassTable(lines, 'env', report.allGroups.filter((g) => g.class === 'env'), report.limit)
  lines.push('')
  for (const cls of ['check', 'tool', 'unknown']) {
    const summary = summarizeFailureClass(report.allGroups.filter((g) => g.class === cls))
    lines.push(summary.groups === 0
      ? `${cls}: sin fallos`
      : `${cls}: ${summary.parts} fallos · ${summary.groups} grupos · ${summary.sessions} sesiones`)
  }
  return lines.join('\n')
}

function failuresReportJson(report) {
  const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString())
  return {
    ok: true,
    scope: report.scope,
    project: report.scope === 'all' ? null : report.project,
    session: report.session,
    since: report.since,
    filters: report.filters,
    universe: report.universe,
    matched: report.matched,
    shown: report.shown,
    groups: report.groups.map((g) => ({
      project: g.project,
      tool: g.tool,
      class: g.class,
      wrapped: g.wrapped,
      command: g.command,
      parts: g.parts,
      sessions: g.sessions,
      max_per_session: g.max_per_session,
      first_seen: iso(g.first_seen),
      last_seen: iso(g.last_seen),
      session_refs: g.session_refs.map((r) => ({ id: r.id }))
    }))
  }
}

async function statsFailuresCommand(args) {
  const opts = parseFailuresArgs(args)
  const dbPath = opencodeDbPath()
  if (!(await exists(dbPath))) {
    console.error(`ancleto: no se encontro la base de sesiones de opencode en ${dbPath}`)
    console.error('ancleto: podes apuntar ANCLETO_OPENCODE_DB a la base o a una copia')
    process.exitCode = 1
    return
  }
  let db = null
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    db.exec('PRAGMA query_only = ON')
  } catch (err) {
    const message = String(err?.message || err)
    console.error(`ancleto: no se pudo abrir la base de opencode en solo lectura: ${message}`)
    if (/SQLITE_READONLY_RECOVERY|SQLITE_CANTOPEN|unable to open|readonly|read-only/i.test(message)) {
      console.error('ancleto: si la base esta en WAL con recuperacion pendiente, abri opencode una vez o apunta ANCLETO_OPENCODE_DB a una copia')
    }
    try { db?.close() } catch { /* ignore */ }
    process.exitCode = 1
    return
  }
  let report = null
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name))
    if (!tables.has('part') || !tables.has('session')) {
      const missing = !tables.has('part') ? 'part' : 'session'
      console.error(`ancleto: la base de opencode no tiene la tabla ${missing}; el reporte de fallos requiere la base de opencode con tool parts`)
      process.exitCode = 1
      return
    }
    const sessions = db.prepare('SELECT id, parent_id, directory FROM session').all()
    const tree = buildSessionTree(sessions)

    let scope
    let dirs = null
    let sessionIds = null
    let project = null
    if (opts.sessionId) {
      const root = tree.byId.get(opts.sessionId)
      if (!root) {
        console.error(`ancleto: no existe la sesion "${opts.sessionId}"`)
        process.exitCode = 1
        return
      }
      scope = 'session'
      sessionIds = tree.subtreeIds(opts.sessionId)
      project = maskPath(root.directory)
    } else if (opts.all) {
      scope = 'all'
    } else {
      scope = 'directory'
      const cwdN = normPath(process.cwd())
      const included = new Set()
      for (const s of sessions) {
        if (!s.directory) continue
        const dn = normPath(s.directory)
        if (dn === '' || dn === cwdN || dn.startsWith(`${cwdN}/`) || cwdN.startsWith(`${dn}/`)) included.add(s.directory)
      }
      dirs = [...included]
      project = maskPath(process.cwd())
    }

    const allGroups = aggregateFailures(queryFailureBuckets(db, { dirs, sessionIds, since: opts.since, classes: opts.classes, tools: opts.tools }))
    const universe = summarizeFailureGroups(allGroups)
    const matchedGroups = allGroups.filter((g) => g.matched)
    const matched = { parts: matchedGroups.reduce((n, g) => n + g.parts, 0), groups: matchedGroups.length }
    const shownGroups = matchedGroups.slice(0, opts.limit)

    report = {
      scope,
      project,
      session: opts.sessionId,
      since: opts.sinceRaw,
      filters: { class: opts.classes, tool: opts.tools },
      universe,
      matched,
      shown: shownGroups.length,
      groups: shownGroups,
      allGroups: matchedGroups,
      limit: opts.limit,
      requestedClasses: opts.classes
    }
  } catch (err) {
    console.error(`ancleto: no se pudo leer los fallos de la base de sesiones: ${err.message}`)
    process.exitCode = 1
    return
  } finally {
    // Cerrar antes de renderizar: el render usa solo datos en memoria.
    try { db.close() } catch { /* ignore */ }
  }
  if (opts.json) console.log(JSON.stringify(failuresReportJson(report), null, 2))
  else console.log(renderFailuresText(report))
}

async function statsCommand(args) {
  if (args[0] === 'failures') {
    await statsFailuresCommand(args.slice(1))
    return
  }
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

const EXPORT_FORMAT = 'ancleto-export/1'

// Unica regla de descubrimiento de la config MCP del proyecto: primer archivo
// existente entre `.opencode/opencode.json` y `.opencode/opencode.jsonc`. Devuelve
// null cuando no existe ninguno.
async function findProjectMcpFile(projectDir) {
  for (const c of PROJECT_MCP_CANDIDATES) {
    const p = join(projectDir, '.opencode', c)
    if (await exists(p)) return p
  }
  return null
}

async function readProjectMcp(projectDir) {
  const found = await findProjectMcpFile(projectDir)
  if (!found) return { file: join(projectDir, '.opencode', 'opencode.json'), cfg: {} }
  try {
    return { file: found, cfg: JSON.parse((await readFile(found, 'utf8')).replace(/^\uFEFF/, '')) }
  } catch (error) {
    return { file: found, cfg: {}, error }
  }
}

// Intencion MCP del bundle: el destino que declara el descriptor para el host
// activo, o la lectura legacy de `.opencode` cuando el host no declara destino.
async function readHostMcpIntent(projectDir, host) {
  const toEntries = (cfg) => (cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? Object.entries(cfg) : [])
    .map(([name, def]) => ({ name, type: def?.type || 'local', enabled: def?.enabled !== false }))
  const destination = await resolveHostMcpDestination(projectDir, host)
  if (!destination) {
    const { file, cfg, error } = await readProjectMcp(projectDir)
    return { entries: toEntries(cfg?.mcp), file, error: error || null }
  }
  const { file, schema } = destination
  if (!(await exists(file))) return { entries: [], file, error: null }
  try {
    const cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    return { entries: toEntries(cfg?.[schema]), file, error: null }
  } catch (error) {
    return { entries: [], file, error }
  }
}

// Repara entradas rotas y agrega ausentes en el destino MCP del host activo (solo
// las de intendedNames cuando se indica; con null solo repara las existentes).
// Nunca toca las sanas. Un destino no parseable se avisa nombrando el archivo y se
// reemplaza por la configuracion nueva (decision M2), sin abortar.
async function repairProjectMcp(projectDir, destination, fresh, intendedNames = null) {
  const { host, file, schema } = destination
  const toServer = (def) => {
    if (host === 'antigravity') return toAntigravityServer(def)
    if (host === 'commandcode') return toCommandCodeServer(def)
    return def
  }
  let cfg = {}
  let error = null
  if (await exists(file)) {
    try {
      cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch (err) {
      error = err
    }
  }
  if (error) {
    console.error(`ancleto: no se pudo leer ${relative(projectDir, file).replace(/\\/g, '/')} como JSON; se reemplaza por la configuracion MCP nueva`)
  }
  // Escribe solo si hubo error de parseo, si la estructura requiere normalizacion
  // (raiz no-objeto o valor de esquema presente no-objeto) o si hay entradas
  // reparadas/agregadas. Un destino sano no se reescribe y una clave de esquema
  // ausente no se agrega solo para normalizar.
  const notObject = (v) => v === null || typeof v !== 'object' || Array.isArray(v)
  const parsed = error ? undefined : cfg
  const normalized = parsed !== undefined
    && (notObject(parsed) || (Object.hasOwn(parsed, schema) && notObject(parsed[schema])))
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {}
  const current = cfg[schema]
  cfg[schema] = current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  const fixed = []
  for (const [name, def] of Object.entries(cfg[schema])) {
    const entry = schema === 'mcpServers' ? normalizeHostMcpEntry(def) : def
    if (mcpCommandBroken(entry) && fresh[name]) {
      cfg[schema][name] = toServer(fresh[name])
      fixed.push(name)
    }
  }
  if (intendedNames) {
    for (const name of intendedNames) {
      if (!cfg[schema][name] && fresh[name]) {
        cfg[schema][name] = toServer(fresh[name])
        fixed.push(`${name} (agregado)`)
      }
    }
  }
  if (error || normalized || fixed.length > 0) {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(cfg, null, 2) + '\n')
  }
  return { file, fixed }
}

async function exportCmd(args) {
  const projectDir = process.cwd()
  const rc = await readAncletorc(projectDir)
  if (!rc) {
    console.error("Error: No se encontro .ancletorc. Ejecuta 'ancleto init' primero.")
    process.exit(1)
  }
  const host = SUPPORTED_AGENTS.includes(rc.agent) ? rc.agent : DEFAULT_AGENT
  const { entries: mcpIntent, file: mcpFile, error: mcpError } = await readHostMcpIntent(projectDir, host)
  if (mcpError) {
    console.error(`${relative(projectDir, mcpFile).replace(/\\/g, '/')} no es JSON valido; el manifiesto exporta intencion MCP vacia`)
  }
  const tierFile = join(projectDir, '.opencode', '.ancleto-tier')
  const tier = (await exists(tierFile)) ? (await readFile(tierFile, 'utf8')).trim() : null
  const manifest = {
    format: EXPORT_FORMAT,
    ancletoVersion: await packageVersion(),
    exportedAt: new Date().toISOString(),
    agent: rc.agent || null,
    tier,
    language: rc.language || 'auto',
    profile: rc.profile || 'general',
    ...(rc.gratisModel ? { gratisModel: rc.gratisModel } : {}),
    flags: { azure: Boolean(rc.azure?.enabled), engram: mcpIntent.some((m) => m.name === 'engram') },
    mcp: mcpIntent
  }
  const serialized = JSON.stringify(manifest)
  if (serialized.includes(projectDir) || /[A-Za-z]:\\/.test(serialized) || serialized.includes(homedir())) {
    console.error('ancleto: el manifiesto contiene rutas absolutas; export abortado')
    process.exit(1)
  }
  const tarIdx = args.indexOf('--tar')
  if (tarIdx >= 0 && !args[tarIdx + 1]) {
    console.error('ancleto: --tar requiere un archivo destino')
    process.exit(1)
  }
  const tarFile = tarIdx >= 0 ? resolve(args[tarIdx + 1]) : null
  const outDir = tarFile ? await mkdtemp(join(tmpdir(), 'ancleto-export-')) : join(projectDir, 'ancleto-export')
  await mkdir(outDir, { recursive: true })
  // Allowlist portable: nunca se copian opencode.json (rutas absolutas),
  // .ancleto-tier, memory.db, service.json ni la config global.
  if (await exists(join(projectDir, '.ancletorc'))) await cp(join(projectDir, '.ancletorc'), join(outDir, '.ancletorc'))
  for (const t of TEMPLATES) {
    if (await exists(join(projectDir, t))) await cp(join(projectDir, t), join(outDir, t))
  }
  if (await exists(join(projectDir, 'aspec'))) await cp(join(projectDir, 'aspec'), join(outDir, 'aspec'), { recursive: true })
  for (const d of ASSETS) {
    const src = join(projectDir, '.opencode', d)
    if (await exists(src)) await cp(src, join(outDir, '.opencode', d), { recursive: true })
  }
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  if (tarFile) {
    const r = spawnSync('tar', ['czf', tarFile, '-C', outDir, '.'], { encoding: 'utf8' })
    if (r.status !== 0) {
      console.error(`ancleto: no se pudo crear el tarball (${(r.stderr || '').trim() || 'tar no disponible'})`)
      process.exit(1)
    }
    await rm(outDir, { recursive: true, force: true })
    console.log(`ancleto: exportado a ${tarFile}`)
  } else {
    console.log(`ancleto: exportado a ${join(projectDir, 'ancleto-export')}`)
  }
  console.log(`ancleto: manifiesto v${manifest.ancletoVersion} con ${mcpIntent.length} MCP (solo intencion, sin rutas)`)
}

async function importCmd(args) {
  const projectDir = process.cwd()
  const repairOnly = args.includes('--repair')
  const bundleArg = args.find((a) => !a.startsWith('-'))
  if (!repairOnly && !bundleArg) {
    console.error('ancleto: uso: ancleto import <bundle> [--repair] | ancleto import --repair')
    process.exit(1)
  }
  let manifest = null
  // `repairProjectMcp` materializa el MCP default del proyecto y su resultado tambien
  // decide, junto con la config en disco, si este import escribe la nota de compresion.
  // Se resuelve una sola vez antes de instalar los assets y se reutiliza en el repair.
  let freshProjectMcp = null
  let intendedMcpNames = null
  // Host activo de la corrida: el del bundle cuando existe; si no, el configurado.
  let importAgent = null
  if (bundleArg) {
    const resolved = resolve(bundleArg)
    if (!existsSync(resolved)) {
      console.error(`ancleto: bundle no encontrado: ${bundleArg}`)
      process.exit(1)
    }
    let bundleDir = resolved
    if (/\.tgz$|\.tar\.gz$/.test(resolved)) {
      bundleDir = await mkdtemp(join(tmpdir(), 'ancleto-import-'))
      const r = spawnSync('tar', ['xzf', resolved, '-C', bundleDir], { encoding: 'utf8' })
      if (r.status !== 0) {
        console.error('ancleto: no se pudo extraer el bundle')
        process.exit(1)
      }
    }
    try {
      manifest = JSON.parse(await readFile(join(bundleDir, 'manifest.json'), 'utf8'))
    } catch {
      console.error('ancleto: bundle invalido (sin manifest.json)')
      process.exit(1)
    }
    if (manifest.format !== EXPORT_FORMAT) {
      console.error(`ancleto: formato de bundle no soportado: ${manifest.format}`)
      process.exit(1)
    }
    // `manifest.mcp` se consume despues del primer write (nombres intencionados del MCP):
    // un valor no-array reventaria ahi y dejaria el import a medio aplicar.
    if (manifest.mcp !== undefined && !Array.isArray(manifest.mcp)) {
      console.error('ancleto: bundle invalido (manifest.mcp no es un arreglo)')
      process.exit(1)
    }
    // Los elementos se consumen como `m.name` despues del primer write: una entrada
    // sin `name` string no vacio reventaria ahi y dejaria el import a medio aplicar.
    if (Array.isArray(manifest.mcp) && manifest.mcp.some((m) => (
      !m || typeof m !== 'object' || typeof m.name !== 'string' || m.name === ''
    ))) {
      console.error('ancleto: bundle invalido (manifest.mcp con entradas invalidas)')
      process.exit(1)
    }
    // Bundle previo a la intencion MCP host-aware: su configuracion MCP no viajo
    // en el bundle. Aviso informativo (no bloqueante, no altera lo escrito).
    if (manifest.mcp === undefined) {
      console.warn('ancleto: aviso: el bundle no declara intención MCP (formato previo); no se aplicará configuración MCP desde el bundle')
    }
    const localVersion = await packageVersion()
    if (manifest.ancletoVersion && manifest.ancletoVersion !== localVersion) {
      console.warn(`ancleto: el bundle es de v${manifest.ancletoVersion} y el CLI es v${localVersion} (se continua igual)`)
    }
    // Lectura y resolucion ANTES del primer write: un fallo del catalogo no debe
    // dejar un import a medio aplicar (manifiesto, templates o assets ya escritos).
    const bundleRc = await readAncletorc(bundleDir)
    const existingRc = await readAncletorc(projectDir)
    const rcAgent = bundleRc?.agent ? bundleRc.agent : existingRc?.agent
    const agent = (rcAgent && SUPPORTED_AGENTS.includes(rcAgent)) ? rcAgent : DEFAULT_AGENT
    importAgent = agent
    const importProfile = validProfile(bundleRc?.profile ? bundleRc.profile : existingRc?.profile) || DEFAULT_PROFILE
    // Un `gratisModel` legacy/desconocido se normaliza al unico gratis conocido. La
    // clave se persiste solo si el bundle la declaraba: una clave ausente no se agrega.
    const hasBundleGratisModel = bundleRc !== null && bundleRc !== undefined
      && Object.prototype.hasOwnProperty.call(bundleRc, 'gratisModel')
    const bundleGratisModel = gratisModel(manifest.gratisModel)
    // El tier se aplica solo en los mirrors de opencode, el unico host que escribe
    // `model:`; en el resto no se resuelve ni se aborta.
    let tierModelMap = null
    if (manifest.tier && TIERS[manifest.tier] && agent === 'opencode') {
      try {
        tierModelMap = resolveTierMap(manifest.tier, bundleGratisModel).models
      } catch (err) {
        console.error(err.message)
        process.exit(1)
      }
    }
    if (await exists(join(bundleDir, 'aspec'))) {
      await cp(join(bundleDir, 'aspec'), join(projectDir, 'aspec'), { recursive: true, force: false })
    }
    const writtenTemplates = []
    for (const t of TEMPLATES) {
      const src = join(bundleDir, t)
      if (!(await exists(src))) continue
      writtenTemplates.push(t)
      const target = join(projectDir, t)
      const content = await readFile(src, 'utf8')
      if (!(await exists(target))) {
        await writeFile(target, content)
        continue
      }
      const current = await readFile(target, 'utf8')
      const merged = mergeTemplateInto(content, current, t)
      if (merged !== current) await writeFile(target, merged)
    }
    const copiedAssets = { agents: [], commands: [], skills: [] }
    // Solo `opencode` materializa los assets desde `.opencode`; el resto de los
    // hosts los recibe exclusivamente via `installAgentAssets` mas abajo.
    if (agent === 'opencode') {
      for (const d of ASSETS) {
        const src = join(bundleDir, '.opencode', d)
        if (!(await exists(src))) continue
        await cp(src, join(projectDir, '.opencode', d), { recursive: true, force: false })
        copiedAssets[d].push(`.opencode/${d}`)
      }
    }
    freshProjectMcp = buildDefaultMcp({ withEngram: manifest?.flags?.engram === true })
    intendedMcpNames = (manifest.mcp ?? []).map((m) => m.name)
    const written = await installAgentAssets(projectDir, agent, {
      // La config final es la de disco (hostConfigHasCompression) mas el MCP que el
      // repair de este import escribira en el destino del host activo.
      compression: await resolvesHostCompression(projectDir, agent, {
        writesCaveman: Boolean(freshProjectMcp && freshProjectMcp.caveman),
        intendedNames: intendedMcpNames
      })
    })
    if (importProfile === 'test') await installProfileOverlay(projectDir, agent)
    if (tierModelMap) {
      await applyTier(join(projectDir, '.opencode', 'agents'), manifest.tier, tierModelMap)
      // Paridad con init: `.opencode/.ancleto-tier` es lo que `check` lee para el
      // oraculo del tier; sin escribirlo un import sobre un proyecto inicializado
      // dejaba el tier viejo y producia divergencias falsas.
      await mkdir(join(projectDir, '.opencode'), { recursive: true })
      await writeFile(tierStatePath(join(projectDir, '.opencode')), manifest.tier + '\n')
    }
    // El manifiesto se escribe después de los assets que registra: `installedPaths`
    // es la unión de lo ya declarado en el destino y lo que este import escribió.
    // Nunca se copian las rutas del bundle (describen la máquina origen): los
    // `.opencode/<asset>` registrados arriba son destinos relativos del proyecto.
    if (bundleRc) {
      await writeManifest(projectDir, {
        ...(bundleRc.agent ? { agent: bundleRc.agent } : {}),
        ...(bundleRc.language ? { language: bundleRc.language } : {}),
        ...(bundleRc.profile ? { profile: bundleRc.profile } : {}),
        ...(hasBundleGratisModel ? { gratisModel: bundleGratisModel } : {}),
        ...(bundleRc.azure ? { azure: bundleRc.azure } : {}),
        ...(bundleRc.discovery ? { discovery: bundleRc.discovery } : {}),
        // inner = installedPaths del destino ∪ lo escrito por este import (templates + assets);
        // outer = eso ∪ los dirs del bundle copiados. `copiedAssets` no trae `templates`: la unión los conserva.
        installedPaths: unionInstalledPaths(
          unionInstalledPaths(existingRc?.installedPaths, {
            templates: writtenTemplates,
            ...written
          }),
          copiedAssets
        )
      })
    }
    await scaffoldAspec(projectDir)
    console.log(`ancleto: bundle aplicado (agente: ${agent}${manifest.tier ? `, tier: ${manifest.tier}` : ''})`)
  }
  // Destino MCP del host activo resuelto desde el descriptor (no `.opencode` fijo).
  const rc = await readAncletorc(projectDir)
  const activeHost = importAgent
    || (rc?.agent && SUPPORTED_AGENTS.includes(rc.agent) ? rc.agent : DEFAULT_AGENT)
  const destination = await resolveHostMcpDestination(projectDir, activeHost)
  let withEngram = manifest ? manifest.flags?.engram === true : false
  if (!manifest && destination) {
    try {
      const onDisk = JSON.parse((await readFile(destination.file, 'utf8')).replace(/^\uFEFF/, ''))
      const servers = onDisk?.[destination.schema]
      withEngram = Boolean(servers && typeof servers === 'object' && !Array.isArray(servers) && servers.engram)
    } catch {
      // sin archivo o JSON invalido: el repair lo reemplaza sin engram
    }
  }
  const fresh = freshProjectMcp ?? buildDefaultMcp({ withEngram })
  if (manifest?.flags?.azure) {
    fresh['azure-devops'] = { type: 'local', enabled: true, command: ['npx', '-y', '@davstack/mcp-azure-devops'] }
  }
  if (!destination) {
    warnNoMcpDestination(activeHost)
  } else {
    const intended = manifest ? intendedMcpNames : null
    const { file, fixed } = await repairProjectMcp(projectDir, destination, fresh, intended)
    console.log(fixed.length
      ? `ancleto: MCP regenerados en ${file}: ${fixed.join(', ')}`
      : `ancleto: MCP sanos en ${file}, sin cambios`)
  }
  await doctorCommand()
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

  // Precedencia: el destino del host activo que declare uno; luego los destinos de
  // los hosts instalados (opencode, antigravity, commandcode, copilot). Sólo si no
  // existe ninguno se valida la config global de opencode. Un archivo de proyecto
  // inválido no cae al fallback.
  const cwd = process.cwd()
  const rc = await readAncletorc(cwd)
  const activeHost = rc?.agent && SUPPORTED_AGENTS.includes(rc.agent) ? rc.agent : DEFAULT_AGENT
  const installedHosts = installedHostsFromPaths(rc?.installedPaths)
  const [projectDestination] = await resolveExistingHostMcpDestinations(cwd, [
    activeHost,
    ...HOST_MCP_ORDER.filter((host) => installedHosts.includes(host))
  ])
  let cfgFile = projectDestination?.file ?? null
  let cfgLabel = cfgFile ? relative(cwd, cfgFile).replace(/\\/g, '/') : null
  if (!cfgFile) {
    for (const c of GLOBAL_MCP_CANDIDATES) {
      const p = join(globalConfigDir(), c)
      if (await exists(p)) {
        cfgFile = p
        cfgLabel = basename(p)
        break
      }
    }
  }
  if (!cfgFile) {
    console.log('  ⚠ opencode.json no encontrado (config MCP)')
  } else {
    try {
      JSON.parse((await readFile(cfgFile, 'utf8')).replace(/^\uFEFF/, ''))
      console.log(`  ✔ ${cfgLabel} valido`)
    } catch {
      console.log(`  ✖ ${cfgLabel} JSON invalido`)
    }
  }

  process.exit(fatal ? 1 : 0)
}

const [cmd, ...rest] = process.argv.slice(2)

// Uso por subcomando para el guard central de `--help`/`-h`. Sólo cubre comandos que
// mutan estado o corren largo: `discovery` mantiene su propio handler y la ayuda global
// su propio camino; los read-only (`specs check`, `check`, `doctor`, etc.) quedan fuera.
const SUBCOMMAND_HELP = {
  install: INSTALL_USAGE,
  update: INSTALL_USAGE,
  upgrade: 'ancleto upgrade [--agent <nombre>]   Re-aplica templates (LOCKED) y skills sobre el proyecto actual',
  init: `ancleto init [--with-azure] [--agent <nombre>] [--tier <nivel>] [--lang <codigo>] [--exclude <globs>] [--no-mcp] [--profile <perfil>]
  Crea .ancletorc en el repositorio actual y configura el MCP del host`,
  memory: ['ancleto memory <subcomando> [opciones]', ...MEMORY_USAGE].join('\n'),
  import: `ancleto import <bundle> [--repair]    Restaura el bundle regenerando el MCP local
ancleto import --repair               Repara in place la config MCP rota`,
  export: 'ancleto export [--tar <file>]         Empaqueta lo portable del proyecto (bundle + manifest.json sin rutas)',
  mcp: 'ancleto mcp                           Servidor MCP de memoria propia (stdio) para tu IDE',
  specs: SPECS_USAGE,
  projects: PROJECTS_USAGE
}

const wantsHelp = rest.includes('--help') || rest.includes('-h')
// El dispatch trata cualquier primer token de `specs` distinto de `merge` como el
// camino read-only de `check`; sólo `specs` a secas y `specs merge` usan la ayuda.
const specsSub = cmd === 'specs' ? rest.find((a) => !a.startsWith('-')) : undefined
const specsGuard = cmd !== 'specs' || specsSub === undefined || specsSub === 'merge'
// `ancleto list --projects` delega en `projectsCommand`, así que el guard cubre el alias.
const usage = Object.hasOwn(SUBCOMMAND_HELP, cmd)
  ? SUBCOMMAND_HELP[cmd]
  : cmd === 'list' && rest.includes('--projects') ? PROJECTS_USAGE : null
const helpText = usage && wantsHelp && specsGuard ? usage : null

if (helpText) {
  console.log(helpText)
} else switch (cmd) {
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
    await specsCommand(rest)
    break
  case 'affected':
    await affectedCommand(rest)
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
  case 'export':
    await exportCmd(rest)
    break
  case 'import':
    await importCmd(rest)
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