# Backlog — @ancleto/spec

> Follow-ups que todavía no son un change aspec. Un change activo en `aspec/changes/` es la unidad de ejecución; este archivo lista lo que falta decidir/arrancar.
> Última actualización: 2026-11-06 (release 0.20.0).

## Prioridad de ejecución

1. **0.20.1 — `fix(cli)`**: guard de escritura en `repairProjectMcp` (`fixed` vacío + sin error → no tocar bytes). Bug contra contrato vigente; test de bytes/mtime; sin delta de spec. Change propuesto: `fix-repair-mcp-noop`.
2. **0.21.0 — `feat(cli)`**: advisories read-only de deriva legacy (`.opencode/*` histórico; bundle legacy sin intención MCP). Deltas MODIFIED en `project-portability` y `cli-diagnostics`; exit codes sin cambios. Change propuesto: `portability-followup-diagnostics`.
3. **Reingeniería P0**: PR-5 cerrado (`p0-pr5-archive-conformity`); MEM-01 pendiente como runbook que requiere aprobación explícita del usuario antes de escribir en `.ancleto/memory.db`. PR-4 ya está cumplido.
4. **Reingeniería P1**: CH-00 baseline (prerrequisito) → CH-06 merge de specs idempotente + selección de tests → CH-07 A/B de prefijos/caché/modelos.
5. **Reingeniería P2 colaboración**: CH-08/MEM-06 → T25/T27 (`formatVersion`, reindex) → T20 (idempotencia) → T30 (V1/V2) → CH-10 (matriz de hosts).
6. **Reingeniería P2 motor/host restante**: #4 (exclusión mutua de escritores), #6 (tope de verificación / orden archive→merge), #18 (seed stale por diseño).
7. **Deuda declarada**: MEM-05c–g, CH-09a–h.

> Nota: el paso 2 (0.21.0) es chico y cierra la línea de portabilidad, pero su valor estratégico es menor que P0. Si se quiere llegar antes a PR-5, se puede diferir 0.21.0.

## Portabilidad / bundle (post-0.20.0)

| Ítem | Estado | Destino | Evidencia |
|---|---|---|---|
| `repairProjectMcp` no reescribe un destino sano | open | 0.20.1 `fix-repair-mcp-noop` | `src/cli/index.js` (`repairProjectMcp`); `aspec/specs/project-portability/spec.md` (entradas sanas no se reescriben) |
| `.opencode/*` histórico en `installedPaths` | open (advisory / opt-in prune) | 0.21.0 `portability-followup-diagnostics` | `installedHostsFromPaths`; `unionInstalledPaths` |
| Bundle legacy sin intención MCP host-aware | open (advisory) | 0.21.0 | `importCmd` (`manifest.mcp` vacío) |
| Consumo runtime de `copilot-mcp.json` | limitación aceptada | documentar | `HOST_MCP_TARGETS`; `docs/technical-discovery/unknowns.md` |
| Working-context omite reglas por tamaño | aceptado / por diseño | curaduría de memoria (aparte) | renderer de working-context |
| Extensión VS Code | diferido | no tocar | `aspec/changes/ancleto-vscode-extension/` |

## Reingeniería memoria-first

Fuente detallada: `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` + `docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`. **Esos documentos están desactualizados**; el estado verificado abajo es el vigente al 2026-11-05.

### Estado verificado

Método: 29 ítems de nivel plan/backlog; las sub-deudas `CH-09a–h` y `MEM-05c–g` se anotan, no se cuentan.

- **Global:** 15/29 verificado (51,7%), 1 parcial (3,4%), 13 pendiente (44,8%).
- **Eje memoria (sin CH-12/13/14):** 12/26 = 46,2%.
- **Por fase:** P0 4/6 (66,7%); P1 6/8 (75%); P2 eje memoria 2/11 (18,2%); CH-00 0/1.

### Correcciones al plan/backlog

- **B5** figura abierto pero está implementado/archivado (`2026-10-05-memory-actor-provenance`).
- **MEM-05** y **CH-09** figuran sin ✅ pero están implementados/archivados.
- El plan dice "ninguna modificación aplicada" pero 0.20.0 ya contiene P0/P1 mayormente implementados.
- El backlog se declara "planificado, sin implementar" pero el contenedor y ≥10 tramos están archivados.
- El backlog declara lint `eslint src/ test/`; `package.json` ya incluye `scripts/`.
- El plan no incluye PR-4b; el backlog §4.5b y el archive `2026-10-30-backfill-archived-design-decisions` sí existen.
- **Pendiente de housekeeping:** reconciliar `docs/PLAN_...` y `docs/BACKLOG_...` con este estado verificado.

### Qué falta (por prioridad)

- **P0:** PR-5 cerrado (`p0-pr5-archive-conformity`); MEM-01 pendiente como runbook que requiere aprobación explícita del usuario antes de escribir en `.ancleto/memory.db`.
- **P1:** CH-00 baseline; CH-06 merge de specs idempotente + selección de tests; CH-07 A/B de prefijos/caché/modelos.
- **P1 · MEM-05 (pendiente) — presupuesto del working-context:** el bloque inyectado
  `<ProjectMemoryRules>` no distingue importancia. Con 39 reglas `scope: project` renderiza 8 y omite
  31; agregar una regla larga (2026-11-06) hizo caer las renderizadas de 9 a 8 y desplazó dos reglas
  que antes entraban, incluida `node-test-scope-explicit-paths`. MEM-05 debe fijar un set universal
  estable, recuperar el resto por tarea y fallar explícito (con `memory_key`) cuando una regla crítica
  no entra. Detalle y criterio de aceptación: `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` §5.
- **P2 colaboración:** `import --dry-run` por key, `--on-conflict`, `formatVersion`, tombstones, reindex desde proposals (T25, T27, T10/T26/M08/M10).
- **P2 motor/host:** T20 idempotencia, T30 V1/V2, CH-10 matriz de hosts, #4, #6, #18.
- **Deuda:** MEM-05c–g, CH-09a–h.

## Relación con 0.20.0

`2026-11-05-host-neutral-bundle` es una línea independiente de portabilidad (export/import/MCP), no un tramo memoria-first. Su equivalente en el eje memoria (colaboración/continuidad) es CH-08/MEM-06, aún pendiente.
