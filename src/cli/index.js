#!/usr/bin/env node
import { cp, mkdir, access, writeFile, readFile, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { createMemoryEngine, defaultMemoryDbPath } from '../core/memory/engine.js'
import { memoryDoctor } from '../core/memory/doctor.js'

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
                                   Configura los MCP engram + caveman por defecto
  ancleto install --no-mcp           Igual que install pero sin tocar config MCP
  ancleto install --tier <nivel>     normal | minimo | gratis (pregunta en la 1ra config)
  ancleto install --agent <nombre>    opencode | vscode | antigravity | cursor | roo (pregunta si no esta guardado)
  ancleto update [--project <dir>]    Alias de install (re-instala sobre lo existente)
  ancleto init [--with-azure] [--agent <nombre>]
                                    Crea .ancletorc en el repositorio actual
                                    (Azure desactivado por defecto, agente: opencode)
  ancleto discovery --check           Estado del seed (READY/STALE/PARTIAL/MISSING)
  ancleto discovery [--compress] [--include G] [--ignore G] [--token-budget N]
                                   Empaca el repo con Repomix y guarda estado
  ancleto memory context [--scope X] [--out file]
                                   Imprime/escribe el bloque <ProjectMemoryRules> (reglas activas)
  ancleto memory doctor [--rebuild] Diagnostica .ancleto/memory.db (integridad, FTS5, unicidad)
                                    y reconstruye el indice FTS5 con --rebuild
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

function resolveBin(name, fallbacks = []) {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const r = spawnSync(probe, [name], { encoding: 'utf8' })
  if (r.status === 0 && r.stdout) {
    const first = r.stdout.split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !/^informacion:/i.test(s))
    if (first) return first
  }
  for (const fb of fallbacks) {
    if (fb) return fb
  }
  return null
}

function buildDefaultMcp() {
  const mcp = {}

  const engramBin = resolveBin('engram', [join(homedir(), 'go', 'bin', 'engram.exe')])
  if (engramBin) {
    mcp.engram = { type: 'local', enabled: true, command: [engramBin, 'mcp', '--tools=agent'] }
  } else {
    console.warn('ancleto: no se encontro engram (memoria) en PATH; se omitio su MCP')
  }

  const cavemanBin = resolveBin('caveman-mcp', [
    join(homedir(), '.caveman', 'bin', 'caveman-mcp.exe')
  ])
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
    tester: 'opencode-go/deepseek-v4-flash',
    'spec-writer': 'opencode-go/qwen3.7-plus',
    reviewer: 'opencode-go/qwen3.6-plus',
    'technical-discovery': 'opencode-go/deepseek-v4-flash',
    'technical-seed-writer': 'opencode-go/minimax-m3',
    'memory-keeper': 'opencode-go/deepseek-v4-flash',
    'context-resolver': 'opencode-go/deepseek-v4-flash',
    documenter: 'opencode-go/deepseek-v4-flash'
  },
  minimo: {
    orchestrator: 'opencode-go/deepseek-v4-flash',
    coder: 'opencode-go/minimax-m2.7',
    tester: 'opencode-go/deepseek-v4-flash',
    'spec-writer': 'opencode-go/qwen3.6-plus',
    reviewer: 'opencode-go/deepseek-v4-flash',
    'technical-discovery': 'opencode-go/deepseek-v4-flash',
    'technical-seed-writer': 'opencode-go/minimax-m2.7',
    'memory-keeper': 'opencode-go/deepseek-v4-flash',
    'context-resolver': 'opencode-go/deepseek-v4-flash',
    documenter: 'opencode-go/deepseek-v4-flash'
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

async function applyTier(agentsDir, tier) {
  const map = TIERS[tier]
  for (const [name, model] of Object.entries(map)) {
    const p = join(agentsDir, name + '.md')
    if (!(await exists(p))) continue
    const c = await readFile(p, 'utf8')
    const o = c.replace(/^model: .*$/m, `model: ${model}`)
    if (o !== c) await writeFile(p, o)
  }
}

function askTier() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question('Tier de costo de los agents [normal/minimo/gratis] (default: normal): ', (a) => {
      rl.close()
      const t = a.trim().toLowerCase()
      resolve(TIERS[t] ? t : 'normal')
    })
  })
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

async function resolveAgent(args, existing) {
  const ai = args.indexOf('--agent')
  if (ai >= 0) {
    const name = args[ai + 1]
    if (!SUPPORTED_AGENTS.includes(name)) {
      console.error(`ancleto: agente invalido: ${name} (${SUPPORTED_AGENTS.join('/')})`)
      process.exit(1)
    }
    return name
  }
  if (existing && SUPPORTED_AGENTS.includes(existing)) return existing
  if (process.stdin.isTTY) return askAgent()
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

const OPENSPEC_SKILLS = ['openspec-new', 'openspec-propose', 'openspec-apply', 'openspec-verify', 'openspec-archive', 'openspec-bulk-archive', 'openspec-continue', 'openspec-explore', 'openspec-ff', 'openspec-onboard', 'openspec-workflow']

async function installAgentSkills(projectDir, agent) {
  const dir = AGENT_SKILLS_DIR[agent] || AGENT_SKILLS_DIR.opencode
  const dest = join(projectDir, dir)
  await mkdir(dest, { recursive: true })
  for (const name of OPENSPEC_SKILLS) {
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

const DEFAULT_OPENSPEC_CONFIG = `# OpenSpec project configuration
# Generado por @ancleto/spec (G5) — editalo libremente, no se sobrescribe en reinstalaciones.
schema: spec-driven-development
`

async function scaffoldOpenSpec(projectDir) {
  const changesDir = join(projectDir, 'openspec', 'changes')
  await mkdir(changesDir, { recursive: true })
  const configPath = join(projectDir, 'openspec', 'config.yaml')
  if (!(await exists(configPath))) {
    await writeFile(configPath, DEFAULT_OPENSPEC_CONFIG)
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
  let mcpMap = withMcp ? buildDefaultMcp() : {}

  const ti = args.indexOf('--tier')
  let tier = ti >= 0 ? args[ti + 1] : null
  if (tier && !TIERS[tier]) {
    console.error(`ancleto: tier invalido: ${tier} (normal|minimo|gratis)`)
    process.exit(1)
  }

  if (project) {
    const dir = resolve(project)
    if (!(await exists(dir))) {
      console.error(`ancleto: el directorio no existe: ${dir}`)
      process.exit(1)
    }
  }

  const target = project ? join(resolve(project), '.opencode') : globalConfigDir()

  if (project) {
    await copyTemplates(resolve(project))
    await scaffoldOpenSpec(resolve(project))
    const existingRc = await readAncletorc(resolve(project))
    const agent = await resolveAgent(args, existingRc?.agent)
    const agentSkillsDir = await installAgentSkills(resolve(project), agent)
    await writeManifest(resolve(project), {
      agent,
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

  if (!tier) {
    const stored = (await exists(tierStatePath(target)))
      ? (await readFile(tierStatePath(target), 'utf8')).trim()
      : null
    tier = TIERS[stored] ? stored : await askTier()
  }
  await applyTier(join(target, 'agents'), tier)
  await writeFile(tierStatePath(target), tier + '\n')

  let azureMcp = false
  if (project && withMcp) {
    const rc = await readAncletorc(resolve(project))
    if (rc?.azure?.enabled) {
      mcpMap['azure-devops'] = { type: 'local', enabled: true, command: ['npx', '-y', '@davstack/mcp-azure-devops'] }
      azureMcp = true
    }
  }

  const res = await mergeMcp(target, mcpMap)
  const loc = project
    ? `${resolve(project)} (.opencode/ + templates en la raiz)`
    : `${target} (disponible en todos tus proyectos)`
  console.log(`ancleto: instalado en ${loc}`)
  console.log(`ancleto: tier de costo de agents: ${tier}`)
  if (res.added.length) {
    console.log(`ancleto: MCP configurados: ${res.added.join(', ')} en ${res.file}`)
  }
  if (azureMcp) console.log(AZURE_MCP_NOTICE)
}

async function initProject(args) {
  const withAzure = args.includes('--with-azure')
  const projectDir = process.cwd()
  const existing = await readAncletorc(projectDir)
  const azure = existing?.azure ?? { enabled: false }
  if (withAzure) azure.enabled = true
  const discovery = existing?.discovery ?? { outputDir: 'docs/technical-discovery', exclude: [] }
  const agent = await resolveAgent(args, existing?.agent)
  const manifest = await writeManifest(projectDir, { azure, discovery, agent })
  await scaffoldOpenSpec(projectDir)
  if (azure.enabled) console.log(AZURE_MCP_NOTICE)
  console.log(`ancleto: .ancletorc actualizado en ${projectDir} (v${manifest.version})${azure.enabled ? ' (Azure habilitado)' : ' (Azure desactivado)'} (Agente: ${agent})`)
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
  const args = []
  if (!local) args.push('-y', 'repomix@1.18.0')
  args.push('--output', tmpFile)
  const inc = flagValue(flags, '--include')
  if (inc) args.push('--include', inc)
  const extraIgnore = flagValue(flags, '--ignore')
  const { exclude } = await loadDiscoveryConfig()
  const ignore = [...exclude, ...(extraIgnore ? extraIgnore.split(',') : [])].filter(Boolean)
  if (ignore.length) args.push('--ignore', ignore.join(','))
  if (flags.includes('--compress')) args.push('--compress')
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
  const tmpFile = join(tmpdir(), `ancleto-pack-${Date.now()}.txt`)
  await runRepomix(flags, tmpFile)
  let content = ''
  try { content = await readFile(tmpFile, 'utf8') } catch {}
  const tokens = Math.round(content.length / 4)
  const budget = flagValue(flags, '--token-budget')
  if (budget && tokens > Number(budget)) {
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

async function memoryCmd(args) {
  const [sub, ...flags] = args
  if (sub === 'context') {
    await memoryContext(flags)
    return
  }
  if (sub === 'doctor') {
    await memoryDoctorCmd(flags)
    return
  }
  console.error(`ancleto: subcomando de memory desconocido: ${sub || '(ninguno)'}`)
  console.error('ancleto: uso: ancleto memory context [--scope X] [--out file]')
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

  console.log(`ancleto: check -> ${missing} faltantes, ${orphans} huerfanos`)
  process.exit(missing > 0 ? 1 : 0)
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