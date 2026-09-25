---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-09-25T14:03:34Z
pluginVersion: 0.6.37
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Reglas estructurales (declaradas)

1. **Zero-Dependencies + Node ≥ 24.** Sin `better-sqlite3` ni binarios nativos; el motor usa
   `node:sqlite` (`DatabaseSync`). Cualquier dependencia nueva rompe el contrato de costo y
   distribución. Evidencia: `package.json`, `DESIGN-memory-engine-v0.2.0.md`, `BACKLOG.md`.
2. **Una sola versión activa por `memory_key`.** La supersesión es atómica en transacción
   `BEGIN IMMEDIATE`: marca el nodo previo `superseded` e inserta el nuevo; hay índice único
   parcial sobre nodos activos. Evidencia: `DESIGN-memory-engine-v0.2.0.md`, `BACKLOG.md`.
3. **Solo 3 tools expuestas al LLM** (`searchMemory`, `recordRule`, `recordDecision`).
   `source`, `confidence`, `status` e `id` los gestiona el runtime y **nunca** aparecen en el
   JSON Schema (`additionalProperties: false`; args forjados se ignoran). Evidencia:
   `DESIGN-memory-engine-v0.2.0.md`, `src/core/memory/tools.js`.
4. **Ciclo de vida del contexto.** *Rules* se recuperan proactivamente y se inyectan en el
   system prompt dentro de `<ProjectMemoryRules>` como **datos no confiables**; *decisions* se
   recuperan reactivamente con `searchMemory`. Evidencia: `DESIGN-memory-engine-v0.2.0.md`,
   `agents/orchestrator.md`.
5. **Frontera repo vs agente.** La memoria del repo vive en `.ancleto/memory.db` (se comparte
   con el equipo); la memoria del agente (p. ej. engram) es de sesión. Una entrada vive en una
   sola. Evidencia: `README.md`, `AGENTS.md` (`LOCKED: memory-boundary`).
6. **Merge no destructivo de templates.** `install`/`update`/`upgrade` re-aplican el interior
   de los bloques `<!-- LOCKED: name -->` y preservan el resto (EXTENSIBLE); si los tags
   faltan o están mal formados, avisa y **no toca** el archivo. Evidencia: `src/cli/index.js`,
   `README.md`, `BACKLOG.md` (G7).
7. **Patrón "CLI materializa + agente lee".** `ancleto memory context` escribe
   `.ancleto/working-context.md`; el orquestador lo lee como datos no confiables sin `bash`.
   Evidencia: `BACKLOG.md`, `agents/orchestrator.md`, `src/cli/index.js`.
8. **`@coder` con `bash` acotado (issue #13).** Allow base + deny de lo destructivo
   (`az`, `git push/reset/checkout/rebase`, `rm -rf`, `npm publish`). Evidencia: `BACKLOG.md`,
   `agents/coder.md`.

## Seed incremental (contrato del discovery)

- `ancleto discovery --check` devuelve `state` + `impact`:
  - `none` → sin cambios; `minor` → cambios no materiales (el agente trabaja y lo anota, no
    ofrece regenerar); `material` → cambió un config de runtime, entry point o apareció un
    directorio raíz nuevo (ofrece regenerar, siempre con aprobación).
- Con `impact: minor` y `affectedDocs` no vacío, el seed-writer reescribe **solo** esos
  documentos. El mapeo vive en `seed-map.json` (lo mantiene la skill); sin ese archivo la
  regeneración es completa.
- Al archivar un change, el seed puede quedar `STALE` (issue #17).
Evidencia: `README.md`, `BACKLOG.md`, `src/cli/index.js`.

## Riesgos, deuda y acoplamiento

- **Pack comprimido y sesgado a `src/`.** El tier `minimo` ignora `**/*.md` y `test/**`, y
  `.gitignore` excluye `.opencode/` y `/documentation`; `discovery.exclude` excluye `docs`.
  Resultado: `agents/`, `commands/`, `skills/`, `templates/`, `docs/` y `documentation/` **no
  entran** en el pack. El seed los describe por listados/README/BACKLOG, no por su contenido.
  Impacto: una regeneración futura puede no detectar cambios en esos assets (ver `unknowns.md`).
- **Repomix no consume contexto por defecto**: se ejecuta on-demand en `ancleto discovery`.
  Evidencia: `BACKLOG.md` (relevamiento §7).
- **`agents/`, `commands/`, `skills/`, `templates/` son la superficie de producto instalable.**
  Cambiarlos altera lo que reciben todos los proyectos usuarios; `installAgentSkills()` es el
  punto único de copia y el frontmatter de skills puede requerir adaptación por IDE (A1 del
  backlog v0.7.0).
- **`ancleto stats` acoplado a opencode**: lee la base de sesiones de opencode; no funciona con
  otros IDEs. Evidencia: `README.md`, `src/cli/index.js`.
- **MCP = costo fijo por request.** La lista de tools viaja en cada request
  (`ancleto-memory` ~500, caveman ~830, engram ~4.900 tokens). Engram quedó opcional
  (`--with-engram`) justamente por eso. Evidencia: `README.md`, `BACKLOG.md`.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, CI o Azure. Los tokens
  viven fuera del repo (env/secretos del IDE); nombrar la variable y omitir el valor.
- **Deuda declarada v0.7.0**: export/import de memoria, garbage collection (`memory gc`),
  adapters de frontmatter por IDE. Evidencia: `BACKLOG.md`.

## Decisiones registradas en memoria del repo

- `dogfooding-versionado-init`: versionar `AGENTS.md`, `PRODUCT.md` y `aspec/`; ignorar
  `.opencode/`, `.ancletorc`, `.ancleto/`.
- `fix-init-tier-huerfano-0.6.36` y `fix-init-tier-guardado-0.6.37`: `init` debe aplicar el tier
  guardado a los agentes locales (paridad con `install`), incluido re-init sin flags.
Evidencia: `.ancleto/memory.db` vía `ancleto memory list`.
