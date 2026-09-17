#!/usr/bin/env node
import { cp, mkdir, access, writeFile, readFile, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const ASSETS = ['agents', 'commands', 'skills']
const TEMPLATES = ['AGENTS.md', 'PRODUCT.md', 'CONTRIBUTING.md']

const HELP = `ancleto - orquestador SDD liviano con subagentes optimizados para costo/tokens
(alias: aspec)

Uso:
  ancleto install [--project <dir>]   Instala agents/commands/skills en opencode
                                   (global por defecto, o en .opencode/ del proyecto)
                                   Configura los MCP engram + caveman por defecto
  ancleto install --no-mcp           Igual que install pero sin tocar config MCP
  ancleto install --tier <nivel>     normal | minimo | gratis (pregunta en la 1ra config)
  ancleto update [--project <dir>]    Alias de install (re-instala sobre lo existente)
  ancleto init [--with-azure]         Crea .ancletorc en el repositorio actual
                                   (Azure desactivado por defecto)
  ancleto discovery --check           Estado del seed (READY/STALE/PARTIAL/MISSING)
  ancleto discovery [--compress] [--include G] [--ignore G] [--token-budget N]
                                   Empaca el repo con Repomix y guarda estado
  ancleto --help                      Esta ayuda
  ancleto --version                   Version del paquete
`

async function exists(p) {
  try { await access(p); return true } catch { return false }
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

async function copyTemplates(projectDir) {
  const dest = join(projectDir, '.opencode')
  await copyAssets(dest)
  for (const t of TEMPLATES) {
    const target = join(projectDir, t)
    if (await exists(target)) continue
    await writeFile(target, await readFile(join(ROOT, 'templates', t)))
  }
}

async function install(args) {
  const pi = args.indexOf('--project')
  const project = pi >= 0 ? args[pi + 1] : null
  const withMcp = !args.includes('--no-mcp')
  const mcpMap = withMcp ? buildDefaultMcp() : {}

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

  const res = await mergeMcp(target, mcpMap)
  const loc = project
    ? `${resolve(project)} (.opencode/ + templates en la raiz)`
    : `${target} (disponible en todos tus proyectos)`
  console.log(`ancleto: instalado en ${loc}`)
  console.log(`ancleto: tier de costo de agents: ${tier}`)
  if (res.added.length) {
    console.log(`ancleto: MCP configurados: ${res.added.join(', ')} en ${res.file}`)
  }
}

async function initProject(args) {
  const rc = join(process.cwd(), '.ancletorc')
  if (await exists(rc)) {
    console.log('ancleto: .ancletorc ya existe, no se toca')
    return
  }
  const withAzure = args.includes('--with-azure')
  const content = JSON.stringify({
    version: 1,
    azure: { enabled: withAzure },
    discovery: {
      outputDir: 'docs/technical-discovery',
      exclude: []
    }
  }, null, 2)
  await writeFile(rc, content + '\n')
  const azureNote = withAzure ? ' (Azure habilitado)' : ' (Azure desactivado)'
  console.log(`ancleto: .ancletorc creado en ${process.cwd()}${azureNote}`)
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
  case '--version':
  case '-v':
    console.log('ancleto 0.1.0')
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