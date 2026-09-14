#!/usr/bin/env node
import { cp, mkdir, access, writeFile, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

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
  ancleto update [--project <dir>]    Alias de install (re-instala sobre lo existente)
  ancleto init                        Crea .ancletorc en el repositorio actual
  ancleto discovery --check           Estado del technical seed (no implementado aun)
  ancleto discovery --compress        Genera el pack del repo (no implementado aun)
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

async function mergeMcp(configDir, mcpMap) {
  if (Object.keys(mcpMap).length === 0) return { file: null, added: [] }

  const existing = []
  for (const c of ['opencode.json', 'opencode.jsonc']) {
    const p = join(configDir, c)
    if (await exists(p)) existing.push(p)
  }
  if (existing.length === 0) existing.push(join(configDir, 'opencode.json'))

  const seen = new Set()
  const added = []
  for (const file of existing) {
    let cfg = {}
    try {
      cfg = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
    } catch {
      console.warn(`ancleto: no se pudo leer ${basename(file)} como JSON; MCP no se agrego ahi`)
      continue
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
  return { file: existing.join(', '), added: [...new Set(added)] }
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

  if (project) {
    const dir = resolve(project)
    if (!(await exists(dir))) {
      console.error(`ancleto: el directorio no existe: ${dir}`)
      process.exit(1)
    }
    await copyTemplates(dir)
    const res = await mergeMcp(join(dir, '.opencode'), mcpMap)
    console.log(`ancleto: instalado en ${dir} (.opencode/ + templates en la raiz)`)
    if (res.added.length) {
      console.log(`ancleto: MCP configurados: ${res.added.join(', ')} en ${res.file}`)
    }
  } else {
    const target = globalConfigDir()
    await copyAssets(target)
    const res = await mergeMcp(target, mcpMap)
    console.log(`ancleto: instalado en ${target} (disponible en todos tus proyectos)`)
    if (res.added.length) {
      console.log(`ancleto: MCP configurados: ${res.added.join(', ')} en ${res.file}`)
    }
  }
}

async function initProject() {
  const rc = join(process.cwd(), '.ancletorc')
  if (await exists(rc)) {
    console.log('ancleto: .ancletorc ya existe, no se toca')
    return
  }
  const content = JSON.stringify({
    version: 1,
    discovery: {
      outputDir: 'docs/technical-discovery',
      exclude: []
    }
  }, null, 2)
  await writeFile(rc, content + '\n')
  console.log(`ancleto: .ancletorc creado en ${process.cwd()}`)
}

function discovery() {
  console.error('ancleto: discovery todavia no esta implementado (motor de repomix pendiente).')
  process.exit(1)
}

const [cmd, ...rest] = process.argv.slice(2)

switch (cmd) {
  case 'install':
  case 'update':
    await install(rest)
    break
  case 'init':
    await initProject()
    break
  case 'discovery':
    discovery()
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