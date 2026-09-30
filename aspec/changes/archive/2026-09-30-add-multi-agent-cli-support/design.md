# Design: add-multi-agent-cli-support

## Contexto

Estado confirmado contra el código (`src/cli/index.js`):

- `ASSETS = ['agents','commands','skills']` (`:22`); `AGENT_SKILLS_DIR` sólo mapea skills (`:735-741`)
  y con rutas incorrectas; `installAgentSkills` (`:745-761`) copia el árbol completo si el agente no es
  `opencode` (`:757-759`).
- `copyTemplates` (`:867-883`) copia **todos** los assets a `.opencode/` fijo; `copyAssets` (`:728-733`).
- Manifiesto: hardcode `.opencode/agents`/`.opencode/commands` en `install` (`:976-978`) y `upgrade`
  (`:1029-1031`).
- `ancleto check` recorre `installedPaths.{agents,commands,skills}`.
- `mergeMcp` (`:693-726`) escribe sólo en `opencode.json`/`opencode.jsonc`.
- Frontmatter de `agents/*.md`: `description`, `mode`, `model` (`opencode-go/*`), `color`,
  `temperature`, `tools` (mapa), `permission`. `commands/*.md`: sólo `description`.
  `skills/*/SKILL.md`: `name`, `description`, `license`, `compatibility`, `metadata`.
- Cero dependencias: parser propio con `node:*`.

Este documento **traduce la evidencia en decisiones**. No es un volcado de la matriz.

---

## D1 — Modelo de ruteo: destino **nativo por host** (directorio + formato por asset)

Se reemplaza `AGENT_SKILLS_DIR` por un **modelo único de destino por host** que declara, por cada asset,
su **directorio** y su **convención de nombre**; `null` = asset no soportado para ese host.

| Host | base | skills | agents | commands |
|---|---|---|---|---|
| `opencode` | `.opencode` | `.opencode/skills/<n>/SKILL.md` | `.opencode/agents/<n>.md` | `.opencode/commands/<n>.md` |
| `claude` | `.claude` | `.claude/skills/<n>/SKILL.md` | `.claude/agents/<n>.md` | `.claude/commands/<n>.md` |
| `vscode` | `.github` | `.github/skills/<n>/SKILL.md` | `.github/agents/<n>.agent.md` | `.github/prompts/<n>.prompt.md` |
| `antigravity` | `.agents` | `.agents/skills/<n>/SKILL.md` | `null` (OOS) | `null` (OOS) |
| `cursor` | `.cursor` | `.cursor/skills/<n>/SKILL.md` | `null` (OOS) | `null` (OOS) |
| `roo` | `.roo` | `.roo/skills/<n>/SKILL.md` (evidencia 3rd-party) | `null` (OOS) | `null` (OOS) |

Racional:

- **El formato es parte del destino.** VS Code no lee `.github/agents/<n>.md`: lee `*.agent.md`; los
  prompts son `*.prompt.md`. Escribir sin la convención de nombre equivaldría a "soportar" un host
  cuyos archivos nunca carga. Por eso el modelo lleva `dir` **y** convención de nombre, no sólo `dir`.
- **`opencode` conserva exactamente sus rutas** (`.opencode/*`, `<n>.md`): sin regresión.
- **Corrige rutas existentes**: `.antigravity/skills` → `.agents/skills`; `.vscode/skills` →
  `.github/skills`. No es "agregar bases".
- Un único lugar declara rutas; ningún otro punto repite strings.

## D2 — Destino específico por host vs. `.agents/skills` (comparación y decisión)

Se comparan las tres estrategias exigidas:

**(a) Destino nativo por host** (elegida). Cada host recibe su layout en el directorio que su
documentación declara como propio.

**(b) Destino convergente `.agents/skills`** (rechazada). `.agents/skills` es leído por opencode,
Cursor, VS Code y Antigravity, pero **no** por Claude (`.claude/skills`) ni Roo (`.roo/skills`), y **no
cubre agents/commands** (no hay convergencia para ellos). Tomarlo como destino universal rompería en
silencio a Claude y Roo (los archivos nunca se cargarían) y convertiría `--agent` en un no-op para
skills. La convergencia es **evidencia de lectura**, no un destino universal.

**(c) Híbrida** (rechazada). Escribir skills a `.agents/skills` para los 4 hosts que lo leen y a un
directorio nativo para Claude/Roo. Costos: (i) **colisión** — si un proyecto apunta a opencode y a
Antigravity, ambos rutearían skills al mismo `.agents/skills`, y un único frontmatter debería satisfacer
a ambos; (ii) **duplica el mecanismo** (dos caminos de escritura de skills); (iii) **igualmente** necesita
ramas específicas para Claude/Roo → no simplifica; (iv) vuelve ambiguo qué host "posee" el skill.

**Decisión: (a).** El CLI escribe el layout nativo del host resuelto. `.agents/skills` queda
**documentado como punto de lectura compartido** (útil para el usuario que corre varios hosts), pero no
se convierte en destino por defecto ni universal. Esto es una decisión justificada, no una asunción.

## D3 — Qué significa realmente "support" por host (directorio ≠ soporte)

**Soporte** = (i) el host **lee** el directorio destino, **y** (ii) el **formato** del artefacto
(nombre + frontmatter) coincide con la convención del host. Un directorio existente sin formato
correcto **no** es soporte.

Niveles de este change:

| Host | skills | agents | commands |
|---|---|---|---|
| opencode | ✅ nativo | ✅ nativo | ✅ nativo |
| claude | ✅ | ✅ con adapter (D4) | ✅ (`description`) |
| vscode | ✅ `.github/skills` | ✅ `.agent.md` con adapter (D4) | ✅ `.prompt.md` |
| antigravity | ✅ `.agents/skills` | ⛔ OOS | ⛔ OOS |
| cursor | ✅ `.cursor/skills` | ⛔ OOS | ⛔ OOS |
| roo | ⚠️ `.roo/skills` (3rd-party) | ⛔ OOS | ⛔ OOS |

Cuando el asset es `null`, el CLI **no escribe** ese asset para ese host (y avisa), en lugar de
escribir un archivo que el host ignoraría.

## D4 — Adapter de agents para hosts cuyo formato difiere del origen (Claude y VS Code)

A1 deja de ser opcional, y **no es exclusivo de Claude**: el adapter aplica a **todo host cuyo formato de
asset difiera del origen** — coherente con D3 ("el formato es parte del soporte"). Hoy los hosts que lo
requieren para `agents` son `claude` y `vscode`; los demás assets/hosts pasan por el transformador como
identity.

El frontmatter de los agents de opencode **no** es válido para Claude ni para VS Code:

1. **`tools`**: opencode lo declara como **mapa** (`read: true`, `write: false`, …); Claude usa una
   **lista** textual de identificadores (`Read, Grep, Glob`) y el esquema fino de custom agents de VS Code
   sigue **no verificado**. Sin un **mapa verificado** de identificadores, el transformador **omite**
   `tools` (el host hereda/defaults) en vez de emitir una forma inventada.
2. **`model`**: opencode usa `opencode-go/*`; Claude usa **alias** (`sonnet|opus|haiku|inherit`) y para
   VS Code no hay equivalencia verificada. No hay equivalencia → el transformador **omite** `model`.
3. **Claves opencode-specific** (`mode`, `color`, `temperature`, `permission`): siempre se **eliminan**
   para Claude y para VS Code.
4. `description` se **preserva** (campo portable y verificado).

El adapter se implementa en la capability `skill-frontmatter-adapters` (dueño único) y lo consume el
flujo de instalación para **ambos hosts**; `claude-support` sólo declara que su ausencia hace que el
"soporte" sea ficticio.

## D5 — Política de preservación y de `model`/`tools` sin equivalencia: omitir/heredar o fallar

**Precisión de "Preservación por defecto":** preservar significa conservar **sólo los campos portables y
verificados** para el host destino (`name`, `description`; en skills además `license`, `compatibility`,
`metadata`). NO significa copiar verbatim el frontmatter de opencode: las claves específicas de opencode
(`mode`, `color`, `temperature`, `permission`) se **eliminan** y los campos sin equivalente verificado se
**omiten/heredan**. "Preservar" aplica a lo portable, nunca a las claves propias de opencode. Esto
resuelve la contradicción con el copiado verbatim de agents de VS Code: no hay verbatim cuando existe una
adaptación documentada para el host.

Regla única y explícita, aplicable a cualquier host:

- **Campos portables** se preservan (`name`, `description`; en skills además `license`,
  `compatibility`, `metadata`).
- **Claves específicas del host de origen** (`mode`, `color`, `temperature`, `permission`) se **eliminan**
  cuando el host destino tiene formato propio de agents (Claude y VS Code).
- **Campos del host de origen sin equivalente verificado** (`model` de catálogo, `tools` en forma
  incompatible, y `allowed-tools` si algún día apareciera) se **omiten/heredan** o, si el formato lo
  exige, el transformador **falla** con aviso.
- **Nunca** se genera un valor "válido" sintácticamente pero **semánticamente incorrecto** (p. ej. mapear
  `opencode-go/qwen` a `sonnet`).
- **Nota**: el esquema fino de custom agents de VS Code sigue **no verificado** → se aplica la política
  omitir/heredar de `model` y `tools`, igual que en Claude.

No se inventan equivalencias. La incorporación de una traducción nueva exige evidencia documentada.

**Nota sobre `allowed-tools` (R1, retractado):** se retractó el requirement que exigía una guarda
específica de `allowed-tools` en skills. Razón: es config **especulativa** — el frontmatter de skills de
Ancleto es `name`/`description`/`license`/`compatibility`/`metadata`, **sin** `allowed-tools` — y no
existe un mapa de identificadores de host verificado (construirlo violaría D5). La política genérica de
esta sección ya cubre el caso: si un campo así apareciera, se **omite/hereda** en vez de traducirse sin
evidencia.

## D6 — MCP explícitamente OOS (install ≠ generate ≠ transform ≠ preserve)

**Contrato de este change: no modificar ni generar configuración MCP específica de host.**

- **install** (en scope): materializar skills/agents/commands.
- **generate** (OOS): crear `.mcp.json` (Claude), `mcp_config.json` (Antigravity), `.vscode/mcp.json`
  (VS Code).
- **transform** (OOS): convertir entre esquemas MCP de distintos hosts.
- **preserve** (sin cambios): no borrar ni pisar config MCP preexistente del usuario.

Se **retracta** la generación de `.mcp.json` del diseño anterior. `mergeMcp` queda **sin modificar** en
este change. Nota honesta: el comportamiento actual (mergear en `opencode.json` aunque el agente no sea
opencode) puede ser incorrecto para otros hosts; queda **deferido** y documentado como OOS.

## D7 — Cursor/Roo: agents/commands OOS donde no están verificados

- **Roo**: los agents son **modes** en `.roomodes` (YAML/JSON con `slug/name/roleDefinition/groups`), no
  archivos `.md` por agente; el cambio de modelo no aplica. Commands sin evidencia. → agents/commands OOS.
- **Cursor**: no tiene directorio de subagents documentado; los commands son **legacy**
  (`.cursor/commands/*.md`) que Cursor **migra a skills**. → agents/commands OOS.
- Skills: ambos se rutean a sus directorios de skills (`D1`). Roo queda marcado por evidencia 3rd-party.

## D8 — `.github` **dentro** de VS Code, no como target aparte

`.github/` **no** es un agente independiente: es la superficie de personalización de VS Code/Copilot
(skills en `.github/skills`, agents en `.github/agents`, prompts en `.github/prompts`, instructions en
`.github/instructions`). Se resuelve **dentro del ruteo de `vscode`** (`D1`), sin una entrada de agente
separada, preservando la simetría "un host → un modelo de destino".

## D9 — Windsurf fuera de scope

`.windsurf/` no tiene demanda ni convención de agents/commands verificada en este change. Se **excluye**.
Queda como candidato de alta futura cuando exista (a) demanda concreta y (b) convención de host
verificada. No genera tasks de código.

## D10 — Varios agentes en el mismo proyecto y semántica de `--agent`

- **Instalación aditiva/no destructiva**: instalar con otro agente escribe en **su** base y **no borra**
  los layouts previos. Un repo puede acumular layouts de varios hosts.
- **`installedPaths` acumulativo**: el manifiesto registra la **unión** de destinos realmente escritos
  (no sólo el último), para que `check` valide **todos** los layouts presentes. `agent` guarda el host
  **primario/resuelto** (último instalado); no se agrega un array nuevo (evita config especulativa).
- **`--agent` semántica**: selecciona **el layout nativo a materializar y el pipeline de adaptación** de
  ese host. **No** controla qué descubre cada host: opencode/Cursor/VS Code leen `.agents/skills`
  (y VS Code/Cursor además `.claude/skills`), por lo que un skill instalado para un host puede ser
  descubierto por otro. Que dos hosts descubran el mismo skill es un **efecto del host**, no un
  conflicto que el CLI arbitre: no deduplica ni elige "ganador".

## D11 — Capabilities separables y red de tests

Cada recorte tiene su delta spec y su decisión de aprobación independiente (dentro de este change). La
nota OOS (D6–D9) no genera spec.

Tests por recorte:

- **Ruteo**: `init --agent vscode` escribe skills en `.github/skills` y agents/prompts con sufijos
  `.agent.md`/`.prompt.md` (agents con frontmatter **adaptado**, sin claves opencode); `antigravity`
  escribe skills en `.agents/skills` y **no** agents/commands; `opencode` mantiene `.opencode/*`
  (no-regresión); el manifiesto refleja lo real.
- **Manifiesto/multi-agente**: instalar para dos hosts deja ambos en `installedPaths` y `check` valida
  ambos sin huérfanos.
- **Adapters**: skill estándar se instala byte-idéntica; agent de opencode hacia Claude **y** hacia VS Code
  (`<n>.agent.md`) **no** contiene `mode:`/`color:`/`temperature:`/`permission:`, **no** contiene `model`
  de `opencode-go`, y **no** contiene `tools` con mapa opencode. No se fija verbatim para agents de VS
  Code.
- **Claude**: `--agent claude` no aborta; rutas `.claude/*`; **no** se crea `.mcp.json` ni se toca MCP.

## D12 — Aviso no bloqueante cuando un asset es `null` para el host

Cierra la subespecificación de D3 ("no escribe ese asset para ese host (y avisa)"): el spec de ruteo no
reflejaba el aviso. Decisión:

- **Destino**: el aviso va a **stderr**, **no bloqueante**; el **exit code no cambia** (la instalación
  sigue siendo exitosa).
- **Granularidad**: **una línea por asset omitido**, con formato estable:
  `skip agents: not supported by host 'antigravity'` (asset en plural + host entre comillas simples).
- **Manifiesto**: el aviso **NO** se registra en `.ancletorc`. Es consistente con D10: `installedPaths`
  es la unión de destinos **realmente escritos**; un asset omitido no produjo archivo.

Racional: el usuario debe poder distinguir "instalé todo" de "omití lo no soportado" sin que la omisión
esperada (ya documentada por host) cuente como fallo. El mensaje es informativo y verificable, no un
error.

---

## Open questions / risks

- **Preferencia de directorio de skills en opencode**: nativo `.opencode/skills` vs. convergente
  `.agents/skills`. Se elige nativo (no regresión); revisar si opencode documenta prioridad.
- **Frontmatter de custom agents de VS Code**: no hay evidencia fina del esquema; se aplica la política
  omitir/heredar (D5). Verificar antes de prometer campos no portables.
- **Roo**: evidencia sólo 3rd-party para `.roo/skills`.
- **MCP en hosts no-opencode**: el comportamiento actual (`opencode.json`) queda como limitación conocida
  y OOS.
- **Dependencias de aprobación**: (2) adapters y (3) claude dependen del modelo de ruteo (1).
- **Instalación global**: fuera de scope; sigue siendo config de opencode.

## Non-goals

- Sin MCP específico de host (generar/transformar). Sin `.mcp.json`/`mcp_config.json`/`.vscode/mcp.json`.
- Sin Windsurf; sin `.github` como agente separado.
- Sin agents/commands para Antigravity, Cursor y Roo.
- Sin cambios a tiers/modelos, `aspec/` ni al patrón `bash:false`.
- Sin borrado ni migración destructiva de rutas previas.
- Sin rewrites de frontmatter sin evidencia documentada del host.

## Nota sobre el contexto de origen

Contexto sin Work Item asociado (Azure DevOps deshabilitado). Seed técnico `READY`
(`docs/technical-discovery/units/cli-install.md`). Hallazgos confirmados contra el código real
(`src/cli/index.js`, `agents/*.md`, `skills/*/SKILL.md`, `test/cli.test.js`) y documentación oficial de
cada host.
