#!/usr/bin/env node
import { cp, mkdir, access, writeFile, readFile } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
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
  if (project) {
    const dir = resolve(project)
    if (!(await exists(dir))) {
      console.error(`ancleto: el directorio no existe: ${dir}`)
      process.exit(1)
    }
    await copyTemplates(dir)
    console.log(`ancleto: instalado en ${dir} (.opencode/ + templates en la raiz)`)
  } else {
    const target = globalConfigDir()
    await copyAssets(target)
    console.log(`ancleto: instalado en ${target} (disponible en todos tus proyectos)`)
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