// Modulo puro de adaptacion de frontmatter (D2/D3/D4/D5/D8). Dueno unico de la
// transformacion del frontmatter: ningun otro punto del CLI SHALL transformarlo.
// Sin E/S, sin dependencias externas, sin estado global.
//
// Contrato publico: `adaptFrontmatter(content, host, assetKind, name)` retorna
// el contenido completo (frontmatter adaptado + body verbatim). `parseFrontmatter`
// y `serializeFrontmatter` se re-exportan para que `commandToSkill` en el CLI los
// pueda usar sin redefinirlos.

export const AGENT_ADAPTER_DROP = new Set(['mode', 'color', 'temperature', 'permission', 'model', 'tools'])

// Hosts conocidos por el modulo. Cualquier host fuera de este conjunto cae en la
// rama `unknown` (no aborta; emite aviso a stderr y retorna el contenido sin
// cambios).
const KNOWN_HOSTS = new Set(['opencode', 'claude', 'vscode', 'antigravity', 'cursor', 'roo', 'copilot', 'commandcode'])

// Hosts para los que existe una transformacion documentada de agents
// (distinta de identidad). Cursor y Roo viven fuera: no hay formato de frontmatter
// propio, así que la adaptación es passthrough con aviso.
const TRANSFORM_AGENTS = new Set(['claude', 'vscode', 'antigravity', 'copilot', 'commandcode'])

// Tabla unica (fijada contra la tabla oficial de frontmatter de Custom
// Subagents) de ids de Antigravity. Conjunto CERRADO: solo se emiten estos ids.
// Los ids solo-SDK (`find_file`, `edit_file`, `search_web`, `read_url_content`,
// ...), los de comunidad (`write_to_file`, `call_mcp_tool`,
// `multi_replace_file_content`, ...) y los de delegacion (`invoke_subagent`,
// `start_subagent`, `define_subagent`) NO se emiten: no estan confirmados en el
// frontmatter y un id inexistente cuelga el subagent (Known Issue). Una clave no
// listada aqui se omite con aviso a stderr, nunca en silencio.
export const ANTIGRAVITY_TOOL_MAP = {
  read: 'view_file',
  edit: 'replace_file_content',
  grep: 'grep_search',
  bash: 'run_command',
  todowrite: 'manage_task'
}

// Tabla unica (fijada contra la documentacion oficial de Command Code) de ids de
// tools. Conjunto CERRADO: solo se emiten estos ids. Toda clave del mapa `tools`
// de opencode sin id aqui se omite con aviso a stderr (nunca en silencio).
export const COMMANDCODE_TOOL_MAP = {
  read: 'read_file',
  write: 'write_file',
  edit: 'edit_file',
  bash: 'shell_command',
  grep: 'grep',
  glob: 'glob',
  webfetch: 'web_fetch',
  websearch: 'web_search',
  todowrite: 'todo_write'
}

// Tools de la memoria propia del framework. Command Code expone los servers MCP
// con la convencion documentada `mcp__<server>__<tool>`; `ancleto-memory` es el
// server que registra `buildDefaultMcp`. Estas claves del mapa `tools` de opencode
// son sus tools, asi que se emiten con el nombre MCP completo.
export const COMMANDCODE_MCP_TOOL_MAP = {
  searchMemory: 'mcp__ancleto-memory__searchMemory',
  recordRule: 'mcp__ancleto-memory__recordRule',
  recordDecision: 'mcp__ancleto-memory__recordDecision'
}

// Parser propio sin dependencias. Cada entrada conserva su clave y sus lineas
// crudas (incluye block scalars y mapas anidados), preservando orden.
export function parseFrontmatter(content) {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)(\r?\n?)([\s\S]*)$/.exec(content)
  if (!m) return { hasFrontmatter: false, content }
  const entries = []
  for (const line of m[2].split(/\r?\n/)) {
    if (/^[A-Za-z0-9_-]+:/.test(line)) {
      entries.push({ key: line.slice(0, line.indexOf(':')), lines: [line] })
    } else if (entries.length) {
      entries[entries.length - 1].lines.push(line)
    } else {
      entries.push({ key: null, lines: [line] })
    }
  }
  return { hasFrontmatter: true, open: m[1], entries, close: m[3], nl: m[4], body: m[5] }
}

export function serializeFrontmatter(parsed) {
  if (!parsed.hasFrontmatter) return parsed.content
  const inner = parsed.entries.flatMap((e) => e.lines).join('\n')
  return `${parsed.open}${inner}${parsed.close}${parsed.nl}${parsed.body}`
}

// Hijos directos del mapa `tools:` con su valor crudo (p. ej. `read: true`).
function parseToolFlags(entry) {
  const flags = []
  if (!entry) return flags
  let childIndent = null
  for (const line of entry.lines.slice(1)) {
    const m = /^(\s+)([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    if (childIndent === null) childIndent = m[1].length
    if (m[1].length !== childIndent) continue
    flags.push({ key: m[2], value: m[3] })
  }
  return flags
}

function frontmatterValue(entry, fallback = null) {
  if (!entry) return fallback
  const m = /^[A-Za-z0-9_-]+:\s*(.*?)\s*$/.exec(entry.lines[0] || '')
  return m ? m[1] : fallback
}

// D2/D3/D5/D8: adapta el frontmatter de un agent de opencode al de Antigravity.
// `name` (requerido por el host) se inyecta desde el nombre del archivo. `tools` se
// emite siempre como lista (el default del host es la lista vacia). Nunca se inventa
// un id: una clave sin id verificado se omite con aviso (un id inexistente cuelga el
// subagent).
function adaptAntigravityFrontmatter(content, name) {
  const parsed = parseFrontmatter(content)
  if (!parsed.hasFrontmatter) return content
  const byKey = (k) => parsed.entries.find((e) => e.key === k)
  // Claves que el adaptador gestiona: las dropeadas (AGENT_ADAPTER_DROP), las que
  // re-emite (name/tools/mainAgent/subagent/model/commandExecutionPolicy) y los campos
  // que preserva del origen (description/skills/mcpServers). Se filtran TODAS del
  // conjunto conservado para que ninguna pueda quedar duplicada, y se re-emiten una
  // sola vez en orden determinista, sin importar lo que declare la fuente.
  const managed = new Set([
    ...AGENT_ADAPTER_DROP,
    'name',
    'description',
    'mainAgent',
    'subagent',
    'commandExecutionPolicy',
    'mcpServers',
    'skills'
  ])
  // Se conservan las claves extra (no gestionadas); los campos preservados se
  // re-emiten abajo desde su primera ocurrencia en el origen.
  const kept = parsed.entries.filter((e) => e.key && !managed.has(e.key))

  const toolIds = []
  for (const { key, value } of parseToolFlags(byKey('tools'))) {
    if (value === 'false') continue
    if (key === 'skill') continue // no es tool: se cubre por `skills`/surfaceo automatico
    const id = ANTIGRAVITY_TOOL_MAP[key]
    if (id) {
      toolIds.push(id)
      continue
    }
    // Regla D3/D5. Un id fuera del frontmatter confirmado (exista o no en el
    // SDK) no se emite: un id inexistente cuelga el subagent. Se omite con aviso,
    // nunca en silencio. El uso de MCP NO se infiere desde claves desconocidas del
    // mapa `tools`: se expresa por `mcpServers`/`.agents/mcp_config.json`.
    console.error(`skip tool '${key}': no verified Antigravity id for agent '${name}'`)
  }

  const mode = frontmatterValue(byKey('mode'))
  const mainAgent = mode === 'subagent' ? 'false' : 'true'
  const subagent = mode === 'primary' ? 'false' : 'true'

  // Orden determinista: name, description, tools, mainAgent, subagent, model,
  // commandExecutionPolicy, mcpServers, skills, y luego las claves extra conservadas.
  const out = [{ key: 'name', lines: [`name: ${name}`] }]
  const description = byKey('description')
  if (description) out.push(description)
  out.push({ key: 'tools', lines: [`tools: [${toolIds.join(', ')}]`] })
  out.push({ key: 'mainAgent', lines: [`mainAgent: ${mainAgent}`] })
  out.push({ key: 'subagent', lines: [`subagent: ${subagent}`] })
  out.push({ key: 'model', lines: [`model: inherit`] })
  out.push({ key: 'commandExecutionPolicy', lines: [`commandExecutionPolicy: sandbox`] })
  const mcpServers = byKey('mcpServers')
  if (mcpServers) out.push(mcpServers)
  const skills = byKey('skills')
  if (skills) out.push(skills)
  out.push(...kept)
  parsed.entries = out
  return serializeFrontmatter(parsed)
}

// Adapta el frontmatter de un agent de opencode al de Command Code. `name` (el
// host lo requiere; default filename) se inyecta desde el nombre del archivo.
// `description` se preserva. `mode`/`color`/`temperature`/`permission` se eliminan
// y `model` se omite: Command Code hereda el modelo de sesion cuando no se declara
// (nunca se mapea un id de `opencode-go/*`). `tools` sale como lista de ids
// verificados (o `"*"` si el origen no declara tools: el default de opencode es
// "todas" y el de Command Code es "ninguna"). Una clave sin id verificado se omite
// con aviso a stderr (nunca en silencio).
function adaptCommandCodeFrontmatter(content, name) {
  const parsed = parseFrontmatter(content)
  if (!parsed.hasFrontmatter) return content
  const byKey = (k) => parsed.entries.find((e) => e.key === k)

  const managed = new Set([...AGENT_ADAPTER_DROP, 'name', 'description', 'tools'])
  const kept = parsed.entries.filter((e) => e.key && !managed.has(e.key))

  const toolsEntry = byKey('tools')
  const toolIds = []
  if (toolsEntry) {
    for (const { key, value } of parseToolFlags(toolsEntry)) {
      if (value === 'false') continue
      const id = COMMANDCODE_TOOL_MAP[key] || COMMANDCODE_MCP_TOOL_MAP[key]
      if (id) {
        toolIds.push(id)
        continue
      }
      console.error(`skip tool '${key}': no verified Command Code id for agent '${name}'`)
    }
  }

  const out = [{ key: 'name', lines: [`name: ${name}`] }]
  const description = byKey('description')
  if (description) out.push(description)
  out.push(toolsEntry ? { key: 'tools', lines: [`tools: [${toolIds.join(', ')}]`] } : { key: 'tools', lines: ['tools: "*"'] })
  out.push(...kept)
  parsed.entries = out
  return serializeFrontmatter(parsed)
}

// Elimina las claves gestionadas por el adaptador (mode/color/temperature/
// permission/model/tools) preservando el resto y el body. Para claude, vscode y
// copilot. Si no hay frontmatter, retorna el contenido sin cambios.
function dropManagedKeys(content) {
  const parsed = parseFrontmatter(content)
  if (!parsed.hasFrontmatter) return content
  parsed.entries = parsed.entries.filter((e) => !(e.key && AGENT_ADAPTER_DROP.has(e.key)))
  return serializeFrontmatter(parsed)
}

// Punto de entrada publico. Funcion pura (D2/D4): `(content, host, assetKind, name)`
// → string (contenido completo con frontmatter adaptado + body verbatim).
// Sin E/S: ni leer ni escribir archivos. Sin estado global mutable.
//
// Reglas de dispatch (preservadas del spec `skill-frontmatter-adapters` y
// extendidas por este change):
//   opencode                    → identity (passthrough)
//   antigravity + agents        → adaptAntigravityFrontmatter(content, name)
//   antigravity + (skills/cmds) → identity
//   commandcode + agents        → adaptCommandCodeFrontmatter(content, name)
//   commandcode + (skills/cmds) → identity
//   claude/vscode/copilot + ags → dropManagedKeys(content)
//   claude/vscode/copilot + sk  → identity
//   cursor/roo                  → identity + aviso stderr (sin formato documentado)
//   host desconocido            → identity + aviso stderr (no aborta)
export function adaptFrontmatter(content, host, assetKind, name) {
  if (!KNOWN_HOSTS.has(host)) {
    console.error(`unknown agent '${host}', passthrough`)
    return content
  }
  if (host === 'cursor' || host === 'roo') {
    console.error(`no documented frontmatter adaptation for host '${host}'`)
    return content
  }
  if (assetKind !== 'agents') return content
  if (!TRANSFORM_AGENTS.has(host)) return content // opencode u otro conocido sin transform
  if (host === 'antigravity') return adaptAntigravityFrontmatter(content, name)
  if (host === 'commandcode') return adaptCommandCodeFrontmatter(content, name)
  return dropManagedKeys(content)
}