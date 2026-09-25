# Product Context - @ancleto/spec

> **This file is EXTENSIBLE and will never be replaced by @ancleto/spec**
>
> Fill in the sections according to your product/project. AI agents read this file to understand product-specific context.

## Project Type

- **CLI / orquestador SDD** (paquete `@ancleto/spec`; binarios `ancleto` y `aspec` → `src/cli/index.js`). No es una web app ni una API: es una herramienta de línea de comandos que vive dentro del IDE del usuario (OpenCode, Cursor, VS Code, Roo, etc.).
- Orquesta desarrollo asistido por IA bajo **Spec-Driven Development**: **especificar** (ciclo de changes `/cleto-*`), **descubrir** (mapa topológico + empaquetado de contexto) y **recordar** (memoria persistente de reglas y decisiones).
- Restricciones de diseño declaradas: **cero dependencias de runtime** y **Node ≥ 24** (motor de memoria sobre el módulo nativo `node:sqlite`), con control explícito de costo por **tiers** (`normal`, `minimo`, `gratis`).

---

## Tech Stack

- **Runtime**: Node.js ≥ 24.0.0 (obligatorio: `engines.node`; el motor de memoria usa `node:sqlite`).
- **Language**: JavaScript (ESM, `"type": "module"`). El paquete no tiene TypeScript ni `tsconfig.json`.
- **Framework**: ninguno (CLI ESM sin framework externo); la UI de terminal (banner y menús TTY) es propia, en `src/cli/ui.js`.
- **Testing**: Node Test Runner nativo (`node --test test/*.test.js`); 7 archivos de suite.
- **Infra / CI/CD**: GitHub Actions (`.github/workflows/publish.yml`): `npm ci` + tests y publicación a npm al pushear un tag `v*`. Empaquetado de contexto con **Repomix** (on-demand, opcional; se resuelve por `PATH` o vía `npx`).

---

## AI Memory (.ancleto/memory.db)

- **Repository App ID**: `ancleto.spec`
- **Scope**: `project:spec`

> Memory for this repository is persisted locally in `.ancleto/memory.db` (SQLite + FTS5).
> Agents store architectural decisions and rules here automatically. It never leaves the repo.
> Consult via the `searchMemory` tool when modifying prior decisions, after a
> `<ContextOverflowWarning>`, or before major refactors / contract changes.

---

## Azure DevOps (Optional)

**Estado en este repositorio: NO habilitado** (`.ancletorc` → `azure.enabled: false`).

_Fill in ONLY if this project uses Azure DevOps for Work Items._

- **Organization URL**: _(no configurado)_
- **Team Project**: _(no configurado)_

_Para habilitarlo: `ancleto init --with-azure` escribe `azure.enabled: true`; después completá los
dos campos de arriba e instalá la extensión con `az extension add --name azure-devops`._

**Work item fetch command (referencia neutral — requiere completar los campos de arriba):**

```bash
ORG=$(grep -Eim1 '\*\*(Organization URL|Organization)\*\*:' PRODUCT.md | grep -oE 'https?://[^ `"]+') && \
az boards work-item show --id <id> --org "$ORG" --expand none --fields System.Id,System.Title,System.WorkItemType,System.TeamProject,System.State,System.Description,Microsoft.VSTS.Common.AcceptanceCriteria \
 | sed 's/\\r\\n/\n/g; s/\\n/\n/g; s/<[^>]*>//g; s/&nbsp;/ /g; s/&quot;/"/g; s/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g' \
 | fold -s -w 200
```

- **Required inputs**: `id` + `org` (leído del campo `Organization URL` por `grep`). No pasar
  `--project` (falla).
- `--expand none --fields` es obligatorio (el default `--expand all` trae el work item completo).
- `sed` + `fold` no son cosméticos: `System.Description` llega en una sola línea HTML de hasta
  70k chars y el runtime trunca a 2k sin ellos.
- Setup: `az extension add --name azure-devops`; alcanza con `az login`.

---

## Project Structure

```text
src/
  cli/              # index.js (entry point y subcomandos), ui.js (wizard/menús TTY)
  core/             # discovery.js, repomix-tier.js, tier-models.js
  core/memory/      # database.js, engine.js, tools.js, mcp-server.js, doctor.js
agents/             # 10 subagentes instalables (.md)
commands/           # 12 comandos /cleto-* (.md)
skills/             # 18 skills nativas (SKILL.md + references)
templates/          # AGENTS.md, PRODUCT.md
aspec/              # config.yaml; changes/ (changes activos)
test/               # suite node --test (*.test.js)
docs/               # technical-discovery/ (seed) + documentación del framework
documentation/      # material legado lnx-cli (gitignored, no es runtime)
.github/workflows/  # publish.yml (publish a npm)
```

---

## Critical Files & Guardrails

Guardrails del repositorio (fuente: `AGENTS.md`):

- **TypeScript strict** (`strict: true`). _Nota: este paquete es JavaScript ESM puro; la regla es genérica del template `AGENTS.md` y no hay `tsconfig.json` (ver Project Commands)._
- **Commits**: Conventional Commits (`feat(scope):`, `fix(scope):`, `chore(scope):`). No commitear directo a ramas protegidas (`main`, `master`).
- **Seguridad**: toda operación destructiva (borrado de BD, archivos clave, deploys) requiere confirmación explícita del usuario.
- **Validaciones obligatorias antes de cerrar una tarea**: `npm run typecheck` (o `npx tsc --noEmit`), `npm run lint`, `npm test`. _Nota: `package.json` no define esos scripts (ver Project Commands)._
- **Protocolo de memoria reactiva**: invocar `searchMemory` antes de modificar/revertir una decisión de diseño previa, ante un `<ContextOverflowWarning>`, o antes de refactorizaciones mayores y cambios de contratos de API/persistencia.
- **Frontera de memoria**: la memoria **del repo** (`.ancleto/memory.db`) guarda reglas y decisiones del proyecto y se comparte; la **del agente** (p. ej. engram) es de sesión. Una entrada vive en una sola.

**Take special care when modifying:**

- `src/cli/index.js` — entry point y punto único de instalación/actualización (copia de assets, merge de bloques `LOCKED` en templates, MCP, aplicación de tiers).
- `src/core/memory/*` — SQLite nativo + FTS5 con supersesión atómica por `memory_key`; contrato de persistencia.
- `agents/`, `commands/`, `skills/`, `templates/` — superficie de producto instalable: cambiarlos altera lo que reciben todos los proyectos usuarios.
- `.ancletorc` — manifiesto de instalación; no editar a mano durante el discovery.

**Avoid:**

- Agregar dependencias de runtime (rompe el contrato **zero-dependencies** y el costo de distribución).
- Cambios breaking no comunicados en la CLI o en los contratos de templates/memoria.
- Copiar valores de secretos (`.ancletorc`, `opencode.json`, CI, Azure): nombrar la variable y omitir el valor.

---

## Project Commands

- **No hay scripts npm definidos en `package.json`** (el archivo no tiene sección `scripts`), por lo que `npm run dev`, `npm run build`, `npm run lint` y `npm test` del template **no existen en este repo**. Discrepancia declarada: las validaciones obligatorias de `AGENTS.md` (`npm run typecheck`, `npm run lint`, `npm test`) apuntan a scripts ausentes.
- **Tests (runner real)**: `node --test test/*.test.js`.
- **CLI**: `node src/cli/index.js <comando>` — o, instalado, `ancleto <comando>` / `aspec <comando>` (`init`, `install`, `update`, `upgrade`, `discovery`, `mcp`, `memory`, `specs`, `stats`, `projects`, `check`, `doctor`).
- **Typecheck**: no aplica (paquete JavaScript, sin `tsconfig.json`).

<!-- LOCKED: test-block -->
Contexto gestionado por @ancleto/spec — no editar: se re-aplica en cada actualizacion.
<!-- /LOCKED: test-block -->
