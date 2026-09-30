# Tasks: add-multi-agent-cli-support

## 1. Implementación — Modelo de ruteo por host (recorte 1)

- [x] 1.1 En `src/cli/index.js`, reemplazar `AGENT_SKILLS_DIR` (`:735-741`) por un modelo único de
  destino por host (agente → `{ skills, agents, commands }`, cada uno con **directorio + convención de
  nombre**; `null` = no soportado) según design D1: rutas nativas corregidas (`.antigravity` →
  `.agents`; `.vscode` → `.github`), `vscode` con sufijos `.agent.md`/`.prompt.md`. El test de ruteo de
  esta task SHALL **nombrar** explícitamente `.cursor/skills` y `.roo/skills` (esta última marcada como
  evidencia 3rd-party) además de `.opencode/*`, `.github/*` y `.agents/skills`.
- [x] 1.2 Separar `copyTemplates` (`:867-883`) para que sólo mergee `AGENTS.md`/`PRODUCT.md` en la raíz;
  sacar de ahí el copiado de `ASSETS` a `.opencode/` (`:868-869`).
- [x] 1.3 Implementar `installAgentAssets(projectDir, agent)` como **dueño único**: copia skills,
  agents y commands al destino del host y devuelve las rutas relativas (con `/`). Plegar
  `installAgentSkills` o dejarlo como helper interno invocado sólo por este dueño.
- [x] 1.4 Eliminar la rama condicional por agente del copiado de skills (`:757-759`): el catálogo es el
  mismo para todo host.
- [x] 1.5 Aplicar la convención de nombre por asset (D1): agents de vscode como `<n>.agent.md`,
  commands de vscode como `<n>.prompt.md`; opencode/claude como `<n>.md`.
- [x] 1.6 Cuando un asset es `null` para el host (agents/commands de antigravity, cursor, roo), **no
  escribirlo** y emitir aviso (design D12): a **stderr**, una línea por asset omitido con formato
  `skip agents: not supported by host 'antigravity'`, **no bloqueante** (exit code sin cambios) y **sin**
  registrarlo en el manifiesto; no crear archivos que el host ignoraría.
- [x] 1.7 En `init`, `install` (`:964-980`) y `upgrade` (`:1025-1033`), escribir `installedPaths` con
  las rutas reales devueltas por el dueño, **acumulando** la unión de destinos (design D10); sacar el
  hardcode `.opencode/agents`/`.opencode/commands` (`:976-978`, `:1029-1031`).
- [x] 1.8 Verificar que `ancleto check` valida la unión de rutas del manifiesto sin cambios de lógica y
  que no se borra ninguna ruta previa (aditivo/no destructivo).
- [x] 1.9 (R2, doc) Materializar en README (o `docs/`) la decisión D2: `.agents/skills` es un **punto de
  lectura compartido** entre hosts, **no** un destino universal. Documentar por qué cada host recibe sus
  skills en su directorio nativo.
- [x] 1.10 (R3, doc) Documentar en `--help` (fuente del help del CLI) y en README la semántica de
  `--agent`: selecciona el **layout nativo a materializar** y el **pipeline de adaptación del host**.
  Aclarar que el **descubrimiento cruzado es efecto del host**, no un conflicto que el CLI arbitre (no
  deduplica ni elige "ganador") — alineado con design D10.

## 2. Implementación — Adapters de frontmatter (recorte 2, obligatorio)

- [x] 2.1 Agregar helpers `parseFrontmatter`/`serializeFrontmatter` (cero dependencias, `node:*`) que
  preserven claves y orden desconocidos; manejar block scalar en `description`.
- [x] 2.2 Implementar `adaptFrontmatter(content, host, assetKind)` con política preservar-por-defecto
  (campos portables) y la regla D5: sin equivalencia verificada → omitir/heredar o fallar; nunca emitir
  valor semánticamente incorrecto.
- [x] 2.3 Adaptador de agents para hosts cuyo formato difiere (design D4) — Claude: eliminar
  `mode`/`color`/`temperature`/`permission`; **omitir** `model` (`opencode-go/*` → sin alias inventado);
  **omitir** `tools` (mapa) o traducirlo a lista sólo si existe mapa verificado; preservar `description`.
- [x] 2.4 Aplicar el transformador en el flujo de instalación (`installAgentAssets`) antes de escribir
  cada skill y cada agent/command, para todo host (identity cuando no hay adaptación).
- [x] 2.5 Sin rewrites especulativos: no agregar adaptaciones sin evidencia documentada del host.
- [x] 2.6 Adaptar los agents de `vscode` (design D4, mismo mecanismo general): al escribir
  `.github/agents/<n>.agent.md`, eliminar `mode`/`color`/`temperature`/`permission` del frontmatter;
  **omitir** `model` de `opencode-go` y `tools` en forma de mapa (esquema fino de VS Code no verificado →
  política D5 omitir/heredar); preservar `description`. El copiado deja de ser verbatim.

## 3. Implementación — Soporte de Claude (recorte 3)

- [x] 3.1 Agregar `claude` a `SUPPORTED_AGENTS` (`:594`), al wizard (`:597-606`, `:926-928`, `:1062`) y
  al help (`:38`).
- [x] 3.2 Agregar la entrada de `claude` al modelo de destino: `.claude/skills`, `.claude/agents`,
  `.claude/commands` (reusa el recorte 1); garantizar que el manifiesto las refleje.
- [x] 3.3 Conectar el adaptador de agents (task 2.3) al ruteo de Claude; sin él, el "soporte" es ficticio.
- [x] 3.4 **No** generar `.mcp.json` ni modificar `mergeMcp` (MCP OOS, design D6). Verificar que
  `--agent claude` no cree ni toque configuración MCP de host.

## 4. Decisión — Exclusiones (recorte 4; sin código)

- [x] 4.1 Confirmar que no se agrega `windsurf` ni una entrada de agente `.github`, ni agents/commands
  para antigravity/cursor/roo; dejar registradas las exclusiones razonadas en `proposal.md`/`design.md`.

## 5. Tests

- [x] 5.1 Recorte 1: `init --agent vscode` escribe skills en `.github/skills`, agents como
  `.github/agents/<n>.agent.md` y commands como `.github/prompts/<n>.prompt.md`;
  `installedPaths` lo refleja.
- [x] 5.2 Recorte 1: `init --agent antigravity` escribe skills en `.agents/skills` y **no** crea
  agents/commands; el comando sale con exit 0 e imprime en stderr el aviso de omisión (D12), y
  `installedPaths.agents` no registra rutas de agents para ese host.
- [x] 5.3 Recorte 1 (no-regresión, valida la semántica de `--agent`): `opencode` conserva `.opencode/*`
  y `<n>.md`; reinstalar no borra rutas previas.
- [x] 5.4 Recorte 1 (multi-agente, valida la semántica de `--agent`): instalar para dos hosts deja ambos
  destinos en `installedPaths`; `ancleto check` valida ambos sin faltantes ni huérfanos.
- [x] 5.5 Recorte 2: una `SKILL.md` sin adaptación se instala byte-idéntica; un agent de opencode hacia
  Claude no contiene `mode:`/`color:`/`temperature:`/`permission:`, ni `model` de `opencode-go`, ni
  `tools` con mapa opencode; `description` se conserva.
- [x] 5.6 Recorte 3: `init --agent claude` sale con exit 0, guarda `agent: "claude"` y escribe bajo
  `.claude/*`.
- [x] 5.7 Recorte 3: con `agent: claude` **no** se crea `.mcp.json` ni se modifica ninguna config MCP.
- [x] 5.8 Ajustar las expectativas existentes de `test/cli.test.js` que asuman `.opencode/` para agentes
  no-opencode y las rutas viejas `.vscode/skills`/`.antigravity/skills` (revisar `:83-116`, `:118-211`,
  `:731-779`).
- [x] 5.9 (R3) Aditividad explícita de `--agent`: instalar `--agent claude` después de
  `--agent opencode` deja `.opencode/*` **intacto** (no se borra ni se reescribe).
- [x] 5.10 (R2) Test barato de documentación: el README menciona `.agents/skills` como punto de lectura
  compartido. Sin test funcional adicional.
- [x] 5.11 (R4) Ruteo de skills de cursor y roo: `agent: cursor` escribe en `.cursor/skills` y
  `agent: roo` en `.roo/skills`; el test **nombra** ambas rutas (roo marcada como evidencia 3rd-party).
- [x] 5.12 Recorte 2 (vscode adaptado, **reemplaza** la expectativa de verbatim): `init --agent vscode`
  escribe `.github/agents/<n>.agent.md` con frontmatter **adaptado** — sin `mode:`/`color:`/
  `temperature:`/`permission:`, sin `model` de `opencode-go` y sin `tools` en mapa de opencode — y con
  `description` conservada. El test que fijaba el copiado verbatim de los agents de vscode se actualiza
  para verificar el resultado adaptado (task 2.6).

## 6. Validaciones del repositorio

- [x] 6.1 `node --check src/cli/index.js`.
- [x] 6.2 `node --check test/cli.test.js`.
- [x] 6.3 `node --test test/cli.test.js` (archivo puntual; evitar `node --test` sin rutas, que descubre
  tests vendored ajenos).
- [x] 6.4 `npm test`/`npm run typecheck`/`npm run lint` NO existen en este repo (sin `scripts` ni
  devDependencies): reportar "gate ausente" en lugar de intentarlos.
