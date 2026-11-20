// Collector único de declaraciones versionadas de modelo.
//
// Es el borde de E/S que comparten el guard de tests y la pre-validación de
// `scripts/refresh-model-catalog.mjs`: lee `agents/*.md`, `profiles/*/agents/*.md`
// (línea `model:`) y `opencode.json` (`agent.<nombre>.model`) bajo `rootDir`.
//
// Sólo lectura local: NO ejecuta procesos, NO hace red y NO lee `.opencode/**` ni
// `.ancletorc` (son mirrors/estado local, no fuentes versionadas). El cálculo del
// conjunto declarado y la exclusión de `inherit` viven en `declaredModelIds`
// (`tier-models.js`); este módulo no deduplica ni filtra `inherit`.
//
// Falla cerrado: una fuente requerida ilegible o un `opencode.json` inválido aborta
// con un mensaje que nombra la fuente, en lugar de asumir cero declaraciones.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MODEL_LINE = /^model:[ \t]*(.+)$/m

function readFileOrThrow(path, label) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`no se pudo leer ${label} para las declaraciones de modelo: ${error.message}`)
  }
}

function collectAgentDir(rootDir, dirRel, entries) {
  const dir = join(rootDir, dirRel)
  let names
  try {
    names = readdirSync(dir)
  } catch (error) {
    throw new Error(`no se pudo leer ${dirRel}/ para las declaraciones de modelo: ${error.message}`)
  }
  const files = names.filter((name) => name.endsWith('.md')).sort()
  for (const file of files) {
    const relPath = `${dirRel}/${file}`
    const content = readFileOrThrow(join(dir, file), relPath)
    const model = content.match(MODEL_LINE)?.[1]?.trim()
    if (model) entries.push({ id: model, source: relPath })
  }
}

function collectOpencode(rootDir, entries) {
  const content = readFileOrThrow(join(rootDir, 'opencode.json'), 'opencode.json')
  let config
  try {
    config = JSON.parse(content)
  } catch (error) {
    throw new Error(`opencode.json inválido para las declaraciones de modelo: ${error.message}`)
  }
  const agent = config?.agent
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) return
  for (const name of Object.keys(agent).sort()) {
    const model = agent[name]?.model
    if (typeof model !== 'string') continue
    const id = model.trim()
    if (id === '') continue
    entries.push({ id, source: `opencode.json#agent.${name}.model` })
  }
}

// Devuelve `[{ id, source }]` en orden determinista: agentes, perfiles (por nombre) y
// `opencode.json` (por nombre de agente). Conserva `inherit`: lo excluye
// `declaredModelIds`.
export function readModelDeclarations({ rootDir = ROOT } = {}) {
  const entries = []
  collectAgentDir(rootDir, 'agents', entries)
  let profileEntries
  try {
    profileEntries = readdirSync(join(rootDir, 'profiles'), { withFileTypes: true })
  } catch (error) {
    throw new Error(`no se pudo leer profiles/ para las declaraciones de modelo: ${error.message}`)
  }
  const profiles = profileEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const profile of profiles) {
    collectAgentDir(rootDir, `profiles/${profile}/agents`, entries)
  }
  collectOpencode(rootDir, entries)
  return entries
}
