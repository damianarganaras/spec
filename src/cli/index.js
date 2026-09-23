#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { cp, mkdir, access, writeFile, readFile, readdir, rename } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { createMemoryEngine, createReadonlyMemoryEngine, defaultMemoryDbPath } from '../core/memory/engine.js'
import { memoryDoctor } from '../core/memory/doctor.js'
import { serveMemoryMcp } from '../core/memory/mcp-server.js'
import { writeDiscoveryMap } from '../core/discovery.js'
import { readProjectTier, buildRepomixArgs, tierTokenBudget } from '../core/repomix-tier.js'
import { showBanner, selectOption, stopBanner } from './ui.js'
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
  ancleto install --agent <nombre>    opencode | vscode | antigravity | cursor | roo (wizard si no esta guardado)
  ancleto update [--project <dir>]    Alias de install (re-instala sobre lo existente)
  ancleto upgrade [--agent <nombre>]  Re-aplica templates (LOCKED) y skills sobre el proyecto actual
  ancleto init [--with-azure] [--agent <nombre>] [--tier <nivel>]
                                    Crea .ancletorc en el repositorio actual
                                    (interactivo en TTY: banner + menu; Azure desactivado por defecto)
  ancleto discovery --check           Estado del seed (READY/STALE/PARTIAL/MISSING)
  ancleto discovery [--compress] [--include G] [--ignore G] [--token-budget N]
                                   Empaca el repo con Repomix y guarda estado
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
    if (replaced === null) {
      console.warn(`ancleto: no se pudo actualizar el bloque LOCKED "${name}" en ${filename} (tags ausentes o mal formados)`)
    } else {
      result = replaced
    }
  }
  return result
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
  const project = pi >= 0 ? args[pi + 1] : null
  const withMcp = !args.includes('--no-mcp')
  let mcpMap = withMcp ? buildDefaultMcp({ withEngram: args.includes('--with-engram') }) : {}

  const agentFlag = scanAgentFlag(args)
  let tier = scanTierFlag(args)

  if (project) {
    const dir = resolve(project)
    if (!(await exists(dir))) {
      console.error(`ancleto: el directorio no existe: ${dir}`)
      process.exit(1)
    }
  }

  const projectDir = project ? resolve(project) : null
  const target = projectDir ? join(projectDir, '.opencode') : globalConfigDir()
  const existingRc = projectDir ? await readAncletorc(projectDir) : null
  const storedTier = (await exists(tierStatePath(target)))
    ? (await readFile(tierStatePath(target), 'utf8')).trim()
    : null

  let agent = agentFlag || (existingRc?.agent && SUPPORTED_AGENTS.includes(existingRc.agent) ? existingRc.agent : null)

  let bannerShown = false
  const isInteractive = Boolean(process.stdout.isTTY) && ((projectDir && !agent) || !tier)
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
    stopBanner()
  }

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
  const existing = await readAncletorc(projectDir)
  const azure = existing?.azure ?? { enabled: false }
  const discovery = existing?.discovery ?? { outputDir: 'docs/technical-discovery', exclude: [] }
  const tierFile = join(projectDir, '.opencode', '.ancleto-tier')

  let agent, tier
  const isInteractive = Boolean(process.stdout.isTTY) && (!agentFlag || !tierFlag)
  if (isInteractive) {
    await showBanner()
    const agentIdx = Math.max(0, SUPPORTED_AGENTS.indexOf(existing?.agent))
    const storedTier = (await exists(tierFile)) ? (await readFile(tierFile, 'utf8')).trim() : null
    const tierIdx = Math.max(0, Object.keys(TIERS).indexOf(TIERS[storedTier] ? storedTier : ''))
    agent = agentFlag || await selectOption('Agente/IDE', SUPPORTED_AGENTS, agentIdx)
    tier = tierFlag || await selectOption('Tier de costo', Object.keys(TIERS), tierIdx)
    if (withAzure) {
      azure.enabled = true
    } else {
      azure.enabled = (await selectOption('Habilitar Azure DevOps', ['No', 'Si'], azure.enabled ? 1 : 0)) === 'Si'
    }
    stopBanner()
  } else {
    agent = await resolveAgent(args, existing?.agent, false)
    tier = tierFlag
    if (withAzure) azure.enabled = true
  }

  if (tier) {
    await mkdir(join(projectDir, '.opencode'), { recursive: true })
    await writeFile(tierFile, tier + '\n')
  }

  const manifest = await writeManifest(projectDir, { azure, discovery, agent })
  await copyTemplates(projectDir)
  await scaffoldAspec(projectDir)
  await refreshWorkingContext(projectDir)
  if (azure.enabled) console.log(AZURE_MCP_NOTICE)
  console.log(`ancleto: .ancletorc actualizado en ${projectDir} (v${manifest.version})${azure.enabled ? ' (Azure habilitado)' : ' (Azure desactivado)'} (Agente: ${agent})${tier ? ` (Tier: ${tier})` : ''}`)
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
  for (const rel of sources) {
    try {
      const content = await readFile(join(process.cwd(), rel))
      h.update(rel)
      h.update('\0')
      h.update(String(content.length))
      h.update('\0')
      h.update(content)
      h.update('\n')
    } catch {}
  }
  return h.digest('hex')
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
  const { outputDir } = await loadDiscoveryConfig()
  const present = await presentDocs(outputDir)
  let state, action, message, missingDocs
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
    const hash = await hashSources(sources)
    let storedHash = null
    const sp = statePath(outputDir)
    if (await exists(sp)) {
      try {
        storedHash = JSON.parse((await readFile(sp, 'utf8')).replace(/^\uFEFF/, '')).hash
      } catch {}
    }
    if (!storedHash) {
      state = 'STALE'
      action = 'regenerate'
      message = 'Seed completo pero sin estado registrado — frescura desconocida.'
    } else if (storedHash === hash) {
      state = 'READY'
      action = 'continue'
      message = 'El seed esta al dia.'
    } else {
      state = 'STALE'
      action = 'regenerate'
      message = 'El repositorio cambio desde el ultimo pack.'
    }
    missingDocs = []
  }
  console.log(JSON.stringify({
    schemaVersion: 2,
    state,
    recommendedAction: action,
    message,
    missingDocs
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
  const hash = await hashSources(sources)
  await mkdir(outputDir, { recursive: true })
  await writeFile(statePath(outputDir), JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    sources,
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