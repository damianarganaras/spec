import { createMemoryEngine } from './engine.js'
import { shouldRefreshWorkingContext, writeWorkingContext } from './working-context.js'

const KEY_DESCRIPTION = 'Clave conceptual estable (ej. "api-error-format"). Reusala para actualizar: la nueva version supersede automaticamente la anterior.'

const SCOPE_SCHEMA = {
  type: 'string',
  enum: ['project', 'feature', 'task'],
  description: 'Ambito: project (default; las reglas con scope project entran en <ProjectMemoryRules>, las decisiones se recuperan reactivamente con searchMemory), feature o task para algo mas acotado.'
}

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Consulta lexica para buscar en la memoria del proyecto.' },
    type: { type: 'string', enum: ['rule', 'decision'], description: 'Filtra por tipo de nodo.' },
    limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximo de resultados (default 10).' }
  },
  required: ['query'],
  additionalProperties: false
}

const RECORD_RULE_SCHEMA = {
  type: 'object',
  properties: {
    memory_key: { type: 'string', description: KEY_DESCRIPTION },
    content: { type: 'string', description: 'Texto de la regla.' },
    justification: { type: 'string', description: 'Por que existe esta regla.' },
    scope: SCOPE_SCHEMA
  },
  required: ['memory_key', 'content'],
  additionalProperties: false
}

const RECORD_DECISION_SCHEMA = {
  type: 'object',
  properties: {
    memory_key: { type: 'string', description: KEY_DESCRIPTION },
    content: { type: 'string', description: 'La decision tomada.' },
    justification: { type: 'string', description: 'Justificacion de la decision.' },
    scope: SCOPE_SCHEMA
  },
  required: ['memory_key', 'content'],
  additionalProperties: false
}

export const memoryTools = [
  {
    name: 'searchMemory',
    description: 'Busca en la memoria del proyecto (BM25). Devuelve reglas y decisiones activas. Acepta lenguaje natural: intenta terminos exactos y, si no hay coincidencia, reintenta por prefijos.',
    inputSchema: SEARCH_SCHEMA
  },
  {
    name: 'recordRule',
    description: 'Registra una regla del proyecto. Si la clave ya existe, la nueva version la supersede.',
    inputSchema: RECORD_RULE_SCHEMA
  },
  {
    name: 'recordDecision',
    description: 'Registra una decision con su justificacion. Si la clave ya existe, la nueva version la supersede.',
    inputSchema: RECORD_DECISION_SCHEMA
  }
]

export function createMemoryToolHandlers(engine, runtimeContext = {}) {
  function record(args, type, defaultSource) {
    const result = engine.recordNode({ ...args, type }, { ...runtimeContext, source: runtimeContext.source || defaultSource })
    if (runtimeContext.projectRoot && shouldRefreshWorkingContext(result)) {
      try {
        writeWorkingContext(engine, runtimeContext.projectRoot)
      } catch (err) {
        // stderr: stdout es el canal JSON-RPC del server MCP.
        console.warn(`ancleto: no se pudo refrescar el working-context: ${err.message}`)
      }
    }
    return result
  }

  return {
    searchMemory: (args) => engine.searchMemory(args),
    recordRule: (args) => record(args, 'rule', 'tool:recordRule'),
    recordDecision: (args) => record(args, 'decision', 'tool:recordDecision')
  }
}

export function createMemoryToolkit(dbPath, runtimeContext) {
  const engine = createMemoryEngine(dbPath)
  return { engine, tools: memoryTools, handlers: createMemoryToolHandlers(engine, runtimeContext) }
}
