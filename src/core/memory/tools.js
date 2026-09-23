import { createMemoryEngine } from './engine.js'

const KEY_DESCRIPTION = 'Clave conceptual estable (ej. "api-error-format"). Reusala para actualizar: la nueva version supersede automaticamente la anterior.'

const SCOPE_SCHEMA = {
  type: 'string',
  enum: ['project', 'feature', 'task'],
  description: 'Ambito: project (default, entra en <ProjectMemoryRules>), feature o task para algo mas acotado.'
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
  return {
    searchMemory: (args) => engine.searchMemory(args),
    recordRule: (args) => engine.recordNode({ ...args, type: 'rule' }, { ...runtimeContext, source: runtimeContext.source || 'tool:recordRule' }),
    recordDecision: (args) => engine.recordNode({ ...args, type: 'decision' }, { ...runtimeContext, source: runtimeContext.source || 'tool:recordDecision' })
  }
}

export function createMemoryToolkit(dbPath, runtimeContext) {
  const engine = createMemoryEngine(dbPath)
  return { engine, tools: memoryTools, handlers: createMemoryToolHandlers(engine, runtimeContext) }
}
