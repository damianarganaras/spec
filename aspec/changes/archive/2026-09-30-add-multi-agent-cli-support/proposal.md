# Proposal: Modelo de instalación multi-agente y transformaciones por host (`@ancleto/spec`)

## Problem

El encuadre original ("¿cómo agregamos más agentes?") quedó **superado**. Una segunda
investigación contra documentación oficial eliminó varias suposiciones y movió la pregunta real a:

> ¿Cuál es el modelo de instalación **portable** de Ancleto y qué **transformaciones** necesita cada
> host?

Estado confirmado en `src/cli/index.js`:

- `AGENT_SKILLS_DIR` (`:735-741`) mapea **sólo skills** y con **rutas incorrectas**: `.vscode/skills`
  y `.antigravity/skills` no son los directorios que esos hosts leen.
- `installAgentSkills` (`:745-761`) copia el árbol completo **sólo** si el agente no es `opencode`
  (asimetría).
- `copyAssets` (`:728-733`) / `copyTemplates` (`:867-883`) copian **todos** los assets a `.opencode/`
  fijo; el manifiesto hardcodea `.opencode/agents` y `.opencode/commands` (`:976-978`, `:1029-1031`).
- El frontmatter se copia **verbatim**; los agents de opencode usan `mode`, `model`, `color`,
  `temperature`, `tools` (mapa) y `permission` (ver `agents/*.md`), que **no** son portables a Claude.
- MCP sólo se mergea en `opencode.json` (`mergeMcp`, `:693-726`).

### Suposiciones anteriores que este change **supersede**

1. La tabla `AGENT_DIRS` con `.antigravity/skills` y `.vscode/skills` → **incorrecta** (rutas reales:
   `.agents/skills` para Antigravity; `.github/skills` + `.agents/skills` + `.claude/skills` para
   VS Code/Copilot). El ruteo **corrige rutas existentes**, no sólo agrega bases.
2. **A1 (adapters de frontmatter) deja de ser opcional**: es condición del soporte real de Claude
   (conflicto `tools` mapa→lista y `model` provider/model→alias).
3. **MCP es explícitamente OOS**: este change **no modifica ni genera** configuración MCP específica
   de host. Se retracta la generación de `.mcp.json` para Claude del diseño anterior.
4. **`.github` NO es un agente independiente**: es parte del modelo de VS Code/Copilot (ruteo de
   `vscode`).
5. **Windsurf queda OOS.** Cursor/Roo **agents/commands** OOS donde no están verificados.

## Evidencia verificada (insumo — no se re-investiga)

| Host | skills | agents | commands | MCP |
|---|---|---|---|---|
| **opencode** (nativo) | `.opencode/skills/<n>/SKILL.md` | `.opencode/agents/<n>.md` (frontmatter nativo: `description/mode/model/tools[mapa]/permission`) | `.opencode/commands/<n>.md` (`description`) | `opencode.json` |
| **claude** | `.claude/skills/<n>/SKILL.md` (estándar Agent Skills + `allowed-tools`) | `.claude/agents/<n>.md` — `tools`=**lista** textual (`Read, Grep, Glob`), `model`=**alias** (`sonnet\|opus\|haiku\|inherit`), sin `mode/color/temperature/tools-mapa` | `.claude/commands/<n>.md` (`description`) | `.mcp.json` (`mcpServers` → `{command,args,env}`) |
| **vscode / Copilot** | `.github/skills/`, `.agents/skills/`, `.claude/skills/` | `.github/agents/*.agent.md` (o `.claude/agents/`) | `.github/prompts/*.prompt.md`; instructions `.github/instructions/*.instructions.md` | `.vscode/mcp.json` |
| **antigravity** | `<root>/.agents/skills/<n>/SKILL.md` (workspace; global `~/.gemini/...`) | (no documentado) | el CLI compila `.md` a slash commands | `mcp_config.json` |
| **cursor** | `.cursor/skills/<n>/SKILL.md` (también lee `.agents/skills`, `.claude/skills`) | (sin directorio documentado) | `.cursor/commands/*.md` legacy (Cursor los migra a skills) | — |
| **roo** (fuente 3rd-party) | `.roo/skills/` | **modes** en `.roomodes` YAML/JSON (`slug/name/roleDefinition/groups`), no `.md` por archivo | — | — |

Dato de interoperabilidad (evidencia, **no** decisión): **`.agents/skills/`** es leído por opencode,
Cursor, VS Code/Copilot y Antigravity → punto de convergencia de skills. Claude lee `.claude/skills`;
Roo, `.roo/skills`. **Ningún directorio único cubre a los seis hosts.**

## Proposed change

Tres recortes delimitados y separables (aprobables/diferibles por separado), más una nota de
exclusiones:

1. **`agent-install-routing` (revisado)** — modelo único de destino por host (directorio **y formato**
   por asset), corrección de rutas, manifiesto veraz y acumulativo, no-regresión. Define qué
   agents/commands están cubiertos y cuáles quedan OOS.
2. **`skill-frontmatter-adapters` (revisado, ahora obligatorio)** — transformador único con política
   preservar-por-defecto (sólo campos portables) y adaptador de agents aplicable a **todo host cuyo
   formato difiera del origen** (`claude` y `vscode`; `tools`, `model`).
3. **`claude-support` (revisado)** — alta de `claude` con adapter obligatorio; **sin** MCP.
4. **Nota OOS** — MCP específico de host, Windsurf, Cursor/Roo agents/commands, Antigravity
   agents/commands. No genera tasks de código.

Se mantiene el patrón "CLI materializa + agente lee", cero dependencias (`node:*`).

## Scope

In scope:

- `src/cli/index.js` — modelo de destino por host (dir + convención de nombre por asset), dueño único
  de instalación, manifiesto veraz, `SUPPORTED_AGENTS` + wizard + help, transformador de frontmatter
  y adaptador de Claude.
- Nuevos delta specs: `specs/agent-install-routing/`, `specs/skill-frontmatter-adapters/`,
  `specs/claude-support/` (revisados).
- Tests de CLI por recorte.

Out of scope (no-goals explícitos):

- **MCP específico de host**: no se genera ni transforma `.mcp.json`, `mcp_config.json` ni
  `.vscode/mcp.json`. No se toca la lógica MCP existente.
- **Windsurf** (`.windsurf/`): sin alta.
- **`.github` como agente independiente**: se trata dentro del ruteo de `vscode`.
- **Agents/commands de hosts sin convención verificada**: Antigravity, Cursor y Roo (skills sí).
- **Instalación global** (`--global`): sigue siendo config de opencode.
- **Migración/borrado** de rutas previas: cambio aditivo/no destructivo.
- **Rewrites de frontmatter sin evidencia** documentada del host.
- Cambios a tiers/modelos o a la estructura de `aspec/`.

## Riesgos

- **Rutas corregidas vs. instalaciones previas**: quien hoy tiene skills en `.antigravity/skills` o
  `.vscode/skills` no las verá re-ubicadas salvo re-instalación. Mitigación: no destructivo; documentar
  que la corrección aplica en la próxima instalación; el manifiesto pasa a reflejar lo real.
- **Cross-discovery entre hosts**: `.agents/skills` y `.claude/skills` son leídos por varios hosts; un
  layout instalado para un host puede ser descubierto por otro. Es efecto del host, fuera de control
  del CLI (ver design D10).
- **Nivel de evidencia por host**: Roo sólo tiene fuente 3rd-party; Cursor/Antigravity no documentan
  agents/commands → se excluyen. Mitigación: alcance por host acotado a lo verificado.
- **Adaptador de Claude**: `tools` mapa→lista y `model` alias no tienen equivalencia verificada.
  Mitigación: política omitir/heredar (design D5); nunca emitir config semánticamente incorrecta.
- **Aprobación parcial**: (2) y (3) dependen del modelo de ruteo (1). Declarado en `design.md`.

## Open Questions and Assumptions

Assumptions:

- El estándar Agent Skills (`skills/<n>/SKILL.md` + frontmatter) es común a opencode, claude y vscode;
  la adaptación de frontmatter aplica a los hosts cuyo formato de agents difiere (Claude y VS Code), no a
  las skills estándar.
- `.claude/*`, `.github/skills`, `.agents/skills`, `.cursor/skills`, `.roo/skills` son los directorios
  de skills reales de cada host según su documentación.

Open questions:

1. ¿opencode lee `.agents/skills` además de `.opencode/skills`? Si sí, ¿preferimos el directorio nativo
   o el convergente? (design D2 lo decide con la evidencia actual: nativo).
2. ¿El frontmatter de custom agents de VS Code/Copilot usa `tools` en lista como Claude? Sin evidencia
   fina: se aplica la misma política omitir/heredar.
3. ¿Roo merece `.roo/skills` con evidencia sólo 3rd-party, o se difiere hasta tener doc oficial?

## Nota sobre el contexto de origen

Contexto producido **sin Work Item asociado** (Azure DevOps deshabilitado en `.ancletorc`). Seed
técnico `READY`: `docs/technical-discovery/units/cli-install.md`. Hallazgos confirmados contra el código
real (`src/cli/index.js`, `agents/*.md`, `skills/*/SKILL.md`, `test/cli.test.js`) y documentación
oficial de cada host.
