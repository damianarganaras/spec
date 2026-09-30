# Tasks: add-antigravity-full-support

Convención: `- [ ]` pendiente. Cada tarea es chica y verificable. Las tareas de implementación (secciones
1-5) y las de test (sección 6) son **separables**: no mezclar código y aserciones en el mismo ítem.

## 1. Modelo de destino y adaptador de agents

- [x] 1.1 Extender `AGENT_TARGETS.antigravity` (design D1): `agents: { dir: '.agents/agents', ext: '.md' }`
  y `commands: { dir: '.agents/skills', package: 'skill-dir' }`. Mantener `skills: { dir: '.agents/skills' }`
  sin cambios.
- [x] 1.2 Agregar `antigravity` a `AGENT_ADAPTER_HOSTS` y separar la transformación: Claude/VS Code conservan
  la política de drop actual; Antigravity usa una función de adaptación propia (design D2).
- [x] 1.3 Extender la firma de `adaptFrontmatter` (y su llamada en `installAssetFiles`/`copyDirTransformed`)
  para recibir el nombre base del asset, sin duplicar el parser (design D2).
- [x] 1.4 Implementar la tabla de mapeo de `tools` de ancleto → ids de Antigravity emitiendo **sólo la columna
  (A)** confirmada en el frontmatter de subagents (design D3): `read`→`view_file`, `edit`→
  `replace_file_content` (no `edit_file`, que es del SDK), `grep`→`grep_search`, `bash`→`run_command`,
  `todowrite`→`manage_task`; sólo claves con valor `true`. **No** emitir ids de la columna (B) solo-SDK
  (`find_file`, `search_web`, `read_url_content`, `edit_file`, `list_directory`, `search_directory`,
  `create_file`, `ask_question`, `finish`, `generate_image`, `start_subagent`), (C) comunidad (`write_to_file`,
  `multi_replace_file_content`, `list_dir`, `send_message`, `call_mcp_tool`) ni (D) delegación
  (`invoke_subagent`, `start_subagent`, `define_subagent`): ninguno es un tool del frontmatter de subagents.
- [x] 1.5 El adaptador NO SHALL inferir "usa MCP" desde claves desconocidas del mapa `tools` ni emitir
  `call_mcp_tool` (prohibido): la señal de MCP se resuelve por el campo `mcpServers` (agent-level) y/o
  `.agents/mcp_config.json` de workspace (design D3/D5).
- [x] 1.6 Emitir `tools` siempre como lista (aun vacía), inyectar `name`, preservar `description`, traducir
  `mode`→`mainAgent`/`subagent` (y `mainAgent: true`/`subagent: true` cuando no haya `mode`), fijar
  `model: inherit` y eliminar `color`/`temperature`/`permission`/`tools`-mapa (design D2/D8).
- [x] 1.7 Regla dura: toda tool sin id confirmado en el frontmatter de subagents (exista o no en el SDK) —
  `write`, `glob`, `task`, `webfetch`, `websearch` y cualquier no mapeada — se omite de la lista y se avisa a
  stderr, no bloqueante, sin inventar ids (design D3/D5).
- [x] 1.8 Traducir `skill` del mapa `tools` al campo `skills: [...]` del frontmatter cuando haya skills
  conocidas y omitirlo si no; nunca emitirlo como id de `tools` (design D2, OQ2).

## 2. Commands materializados como skills

- [x] 2.1 Implementar la escritura de `commands/*.md` como `.agents/skills/<n>/SKILL.md` para Antigravity:
  frontmatter `name: <n>` + `description` de origen, body verbatim (design D4).
- [x] 2.2 Asegurar que los command-skills se emiten por el mismo dueño de instalación
  (`installAgentAssets`) y que no se registra un directorio de commands para Antigravity en
  `installedPaths` (design D4).

## 3. MCP de workspace de Antigravity

- [x] 3.1 Agregar `setupHostMcp(projectDir, agent, mcpMap)` que despacha por host (design D6).
- [x] 3.2 Implementar el conversor del `mcpMap` interno al esquema de Antigravity
  (`command`/`args`/`env`, sin `type`/`enabled`) (design D6).
- [x] 3.3 Implementar el merge no destructivo de `.agents/mcp_config.json`: preservar `mcpServers` y claves
  top-level, no pisar homónimos, y avisar+no escribir si el JSON es inválido (design D6).

## 4. `init`, wiring y documentación de uso

- [x] 4.1 Invocar `setupHostMcp` desde `initProject` con `buildDefaultMcp({})` y soportar `--no-mcp` (design
  D7).
- [x] 4.2 Confirmar/ajustar el wiring de `--agent antigravity` en `scanAgentFlag`, wizard y `--help` para
  reflejar que instala agents, commands y MCP (design D7).
- [x] 4.3 Actualizar `README.md` documentando el soporte completo de Antigravity (directorios, commands como
  skills, `.agents/mcp_config.json`, política de `model`) (design D7).

## 5. `check` y tier host-aware

- [x] 5.1 Agregar un helper único que resuelva los directorios locales de agents desde el host/manifiesto
  (no `.opencode/agents` fijo) (design D9).
- [x] 5.2 Usar el helper en `registerProject` y `projectStatus` para calcular `scoped` (design D9).
- [x] 5.3 Usar el helper en `checkTierOrphan` para contar agents locales del host y eliminar el falso
  "tier sin agentes locales" (design D9).
- [x] 5.4 Ajustar `checkCommand`/`installedExtFor` para que el conjunto esperado se derive de la **unión de
  los hosts instalados** (manifiesto), no de un único `rc.agent`, y que el de `.agents/skills` incluya el
  catálogo de skills **y** los command-skills derivados de `commands/*` (design D9).

## 6. Tests (standalone)

- [x] 6.1 Reemplazar el test `test/cli.test.js` **5.2** (hoy afirma que Antigravity no crea `.agents/agents`
  ni `.agents/commands` y emite los avisos de skip) por el nuevo comportamiento (design D10).
- [x] 6.2 Test de ruteo: `init --agent antigravity` escribe skills en `.agents/skills`, agents en
  `.agents/agents` y no crea `.agents/commands`; el manifiesto registra skills y agents.
- [x] 6.3 Test del adaptador: un agent instalado para Antigravity tiene `name`, `description` preservado,
  `tools` como lista de ids del mapa verificado D3 (sin mapa opencode, sin ids no verificados), `model: inherit`
  y sin `mode`/`color`/`temperature`/`permission`.
- [x] 6.4 Test de la regla dura: un agent con tools sin id confirmado en frontmatter (`write`, `glob`, `task`,
  `webfetch`, `websearch`) las omite y emite aviso a stderr, con exit 0; un `glob: true`/`webfetch: true` NO
  emite `find_file`/`read_url_content` (solo-SDK); un `task: true` NO emite `invoke_subagent`/`start_subagent`/
  `define_subagent` (delegación); `memory-keeper` NO incluye `call_mcp_tool` (MCP no es tool); un agent con
  `skill: true` NO emite un id de tool para `skill` (design D3/D5, OQ2).
- [x] 6.5 Test de commands→skills: existe `.agents/skills/cleto-new/SKILL.md` con `name: cleto-new` y
  `installedPaths.commands` vacío para Antigravity.
- [x] 6.6 Test de MCP de workspace: `init --agent antigravity` crea `.agents/mcp_config.json` con
  `ancleto-memory`; un `mcpServers` preexistente no se pisa; `--no-mcp` no lo crea.
- [x] 6.7 Test de `check`/tier: tras `init --agent antigravity`, `ancleto check` reporta `0 faltantes` y
  `0 huerfanos`; no emite "tier ... sin agentes locales"; el proyecto figura `scoped`.
- [x] 6.8 Test de no-regresión: `opencode` conserva `.opencode/*` y su MCP en `opencode.json`; `claude` y
  `vscode` siguen sin adaptar Antigravity y sin generar `.mcp.json`/`.vscode/mcp.json`.
- [x] 6.9 Test de mapeo de id correcto: un agent con `grep: true` instalado para Antigravity declara
  `grep_search` y NO `search_directory` (design D3, OQ1).
- [x] 6.10 Test multi-host: un proyecto con Antigravity y otro host instalados (manifiesto con ambos) reporta
  `0 huerfanos`; `check` no deriva los esperados de un único `rc.agent` (design D9).

## 7. Verificación final

- [x] 7.1 Correr la suite completa: `node --test test/*.test.js` y confirmar 0 fallos.
- [x] 7.2 Verificar que todo spec delta usa keywords canónicos
  (`ancleto specs check --change add-antigravity-full-support`).
- [ ] 7.3 Registrar en memoria la decisión que supersede `cli.host-mcp-config-out-of-scope` para Antigravity
  y la política de `model: inherit` / mapeo de tools (design D6/D8). Incluir la supersesión del nodo
  `antigravity-agent-frontmatter-mapping` para reflejar el mapa **sólo con ids verificados**
  (`view_file`/`replace_file_content`/`grep_search`/`run_command`/`manage_task`), `skill`→campo `skills` (no
  tool), MCP por `mcpServers`/workspace (no tool id), la **prohibición** de `call_mcp_tool`, la omisión con
  aviso de `write`/`glob`/`task`/web y `mainAgent`/`subagent` default `true`/`true`.

## 8. Trazabilidad requirement ↔ task/test

| Requirement (delta) | Tasks | Tests |
|---|---|---|
| `skill-frontmatter-adapters` · Adaptador de hosts cuyo formato difiere (MODIFIED) | 1.2, 1.3 | 6.3, 6.8 |
| `skill-frontmatter-adapters` · Adaptación de frontmatter para `antigravity` (ADDED) | 1.3, 1.4, 1.5, 1.6, 1.8 | 6.3, 6.4, 6.9 |
| `skill-frontmatter-adapters` · Política ante tools sin id verificado (ADDED) | 1.7 | 6.4 |
| `agent-install-routing` · Cobertura de soporte por host (MODIFIED) | 1.1, 2.1, 2.2 | 6.2, 6.8 |
| `agent-install-routing` · Aviso no bloqueante por asset no soportado (MODIFIED) | 1.1 | 6.1, 6.8 |
| `agent-install-routing` · MCP de host fuera de alcance, con excepción (MODIFIED) | 3.1, 3.2, 3.3, 4.1 | 6.6, 6.8 |
| `antigravity-support` · Alta y persistencia de `antigravity` | 4.2 | 6.2, 6.7 |
| `antigravity-support` · Directorios y manifiesto | 1.1 | 6.2 |
| `antigravity-support` · Materialización de `commands` como skills | 2.1, 2.2 | 6.5 |
| `antigravity-support` · El soporte requiere el adaptador | 1.2 | 6.3 |
| `antigravity-support` · Política de `model` | 1.6 | 6.3 |
| `antigravity-support` · Configuración MCP de workspace | 3.1, 3.2, 3.3, 4.1 | 6.6 |
| `antigravity-support` · Instalación completa desde `init` | 4.1, 4.2 | 6.2, 6.6 |
| `antigravity-support` · `check` y tier sin acoplamiento a `.opencode/*` | 5.1, 5.2, 5.3, 5.4 | 6.7, 6.10 |
