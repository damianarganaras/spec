import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { modelIdsFromCatalog } from './model-catalog.js'

export const GRATIS_FALLBACK_MODEL = 'opencode/big-pickle'

// Tabla de modelos por tier: unico dueno. `src/cli/index.js` la importa desde aca.
// `TIERS` conserva la forma agente->string; para los tiers con cadena, cada valor es
// la cabeza de su cadena (ver `TIER_CHAINS`).
export const TIERS = {
  normal: {
    orchestrator: 'opencode-go/qwen3.7-plus',
    coder: 'opencode-go/minimax-m3',
    tester: 'opencode-go/deepseek-v4.1-flash',
    'spec-writer': 'opencode-go/qwen3.7-plus',
    reviewer: 'opencode-go/qwen3.8-max',
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

// Cadena de preferencia por agente para `minimo`. El primer candidato disponible en
// el catalogo verificado gana; si ninguno esta, la resolucion falla de forma explicita.
const MINIMO_CHAIN = [
  'opencode-go/deepseek-v4.1-flash',
  'opencode/deepseek-v4.1-flash-free'
]

export const TIER_CHAINS = {
  minimo: Object.fromEntries(
    Object.keys(TIERS.minimo).map((name) => [name, [...MINIMO_CHAIN]])
  )
}

const CATALOG_PATH = join(dirname(fileURLToPath(import.meta.url)), 'model-catalog.json')

// Carga el snapshot commiteado. La ruta es inyectable (`path`) o via
// `ANCLETO_MODEL_CATALOG` (seam de test/manual, mismo precedente que
// `ANCLETO_PROJECTS_FILE`). No consulta la red ni ejecuta procesos.
export function loadModelCatalog({ path } = {}) {
  return JSON.parse(readFileSync(path || process.env.ANCLETO_MODEL_CATALOG || CATALOG_PATH, 'utf8'))
}

// `modelIdsFromCatalog` vive en `model-catalog.js` (dueño del shape del snapshot) y se
// re-exporta acá para no romper la API pública ni los imports existentes.
export { modelIdsFromCatalog }

export function missingModelIds(catalog, ids) {
  const available = modelIdsFromCatalog(catalog)
  return [...ids].filter((id) => !available.has(id))
}

// Declaraciones versionadas de modelo del repositorio: todos los valores de `TIERS`,
// todos los candidatos de `TIER_CHAINS` y los `model:` de agentes/perfiles que el
// caller ya leyó (`agentModels: [{ id, source }]`). Puro: no lee archivos, no ejecuta
// procesos ni hace red. Devuelve un Map id->origen deduplicado (primera aparición) y
// excluye `inherit`.
export function declaredModelIds({ tiers = TIERS, chains = TIER_CHAINS, agentModels = [] } = {}) {
  const declared = new Map()
  const add = (id, source) => {
    if (typeof id !== 'string') return
    const value = id.trim()
    if (value === '' || value === 'inherit' || declared.has(value)) return
    declared.set(value, source)
  }
  for (const [tier, models] of Object.entries(tiers || {})) {
    for (const [agent, model] of Object.entries(models || {})) {
      add(model, `TIERS.${tier}.${agent}`)
    }
  }
  for (const [tier, chainsOfTier] of Object.entries(chains || {})) {
    for (const [agent, candidates] of Object.entries(chainsOfTier || {})) {
      const list = Array.isArray(candidates) ? candidates : []
      list.forEach((id, index) => add(id, `TIER_CHAINS.${tier}.${agent}[${index}]`))
    }
  }
  for (const entry of Array.isArray(agentModels) ? agentModels : []) {
    if (typeof entry === 'string') add(entry, 'agents')
    else add(entry?.id, entry?.source || 'agents')
  }
  return declared
}

export function isKnownGratisModel(model) {
  return model === GRATIS_FALLBACK_MODEL
}

// Invariante modelo + modo, independiente de cómo se instaló el modelo: un modelo
// gratis sobre un agente primario puede responder 403 en OpenCode. Puro: sin tier,
// sin E/S, sin red, sin procesos.
export function freeTierOnPrimary(model, mode) {
  return isKnownGratisModel(model) && String(mode).trim() === 'primary'
}

export function gratisModel(persisted = null) {
  return isKnownGratisModel(persisted) ? persisted : GRATIS_FALLBACK_MODEL
}

export function tierModels(tier, tiers, gratisOverride = null) {
  if (tier !== 'gratis') return tiers[tier]
  const model = gratisOverride || gratisModel()
  return Object.fromEntries(Object.keys(tiers.gratis).map((k) => [k, model]))
}

// Resolver puro: depende solo de `tier`, `TIERS`/`TIER_CHAINS` y el catalogo
// inyectado. Devuelve el mapa resuelto, los candidatos estaticos por agente (para el
// conjunto de aceptacion del oraculo) y los agentes sin candidato disponible.
// `allowUnresolved` lo usa `check` (no aborta); install/init/import usan el modo
// estricto y reciben el error explicito.
export function resolveTierModels(tier, catalog, {
  tiers = TIERS,
  chains = TIER_CHAINS,
  gratisOverride = null,
  allowUnresolved = false
} = {}) {
  const chain = chains[tier]
  if (!chain) {
    const models = tierModels(tier, tiers, gratisOverride)
    return {
      models,
      candidates: Object.fromEntries(Object.entries(models).map(([name, model]) => [name, [model]])),
      unresolved: []
    }
  }

  const available = modelIdsFromCatalog(catalog)
  const models = {}
  const candidates = {}
  const unresolved = []
  for (const [name, chainIds] of Object.entries(chain)) {
    candidates[name] = [...chainIds]
    const chosen = chainIds.find((id) => available.has(id))
    if (chosen) {
      models[name] = chosen
      continue
    }
    unresolved.push(name)
    if (!allowUnresolved) {
      throw new Error(
        `ancleto: no hay ningún candidato disponible para el agente '${name}' en el tier '${tier}' ` +
        `(cadena: ${chainIds.join(' -> ')}); actualizá el catálogo desde el repositorio fuente`
      )
    }
  }
  return { models, candidates, unresolved }
}
