# Backlog — @ancleto/spec

> Follow-ups que todavía no son un change aspec. Un change activo en `aspec/changes/` es la unidad de ejecución; este archivo lista lo que falta decidir/arrancar.
> Última actualización: 2026-11-06 (release 0.22.1).

## Prioridad de ejecución

1. **0.20.1 — `fix(cli)`**: guard de escritura en `repairProjectMcp` (`fixed` vacío + sin error → no tocar bytes). Bug contra contrato vigente; test de bytes/mtime; sin delta de spec. Change propuesto: `fix-repair-mcp-noop`.
2. **0.21.0 — `feat(cli)`**: advisories read-only de deriva legacy (`.opencode/*` histórico; bundle legacy sin intención MCP). Deltas MODIFIED en `project-portability` y `cli-diagnostics`; exit codes sin cambios. Change propuesto: `portability-followup-diagnostics`.
3. **Reingeniería P0**: PR-5 cerrado (`p0-pr5-archive-conformity`); MEM-01 pendiente como runbook que requiere aprobación explícita del usuario antes de escribir en `.ancleto/memory.db`. PR-4 ya está cumplido.
4. **Reingeniería P1**: CH-00 baseline (runbook, prerrequisito) → CH-06a merge determinístico de delta specs **cerrado en 0.22.0** (`ch-06a-specs-merge-deterministic`) → CH-06b selección de tests por affected-set (diferido) → CH-07 A/B de prefijos/caché/modelos (bloqueado por CH-00).
5. **Reingeniería P2 colaboración**: CH-08/MEM-06 → T25/T27 (`formatVersion`, reindex) → T20 (idempotencia) → T30 (V1/V2) → CH-10 (matriz de hosts).
6. **Reingeniería P2 motor/host restante**: #4 (exclusión mutua de escritores), #6 (tope de verificación / orden archive→merge), #18 (seed stale por diseño).
7. **Deuda declarada**: MEM-05c–g, CH-09a–h.

> Nota: el paso 2 (0.21.0) es chico y cierra la línea de portabilidad, pero su valor estratégico es menor que P0. Si se quiere llegar antes a PR-5, se puede diferir 0.21.0.

> **Actualización 0.22.1 (2026-11-06):** se cerró la deuda residual de CH-06a (ítems 1–4) y se documentó el ítem 5 como exclusión explícita; también quedó fijado el orden archive → merge. CH-06b sigue **diferido** (proyección de tests incompleta, sin consumidor probado) y CH-07 sigue **bloqueado por CH-00**.

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
- **P1:** CH-00 baseline como runbook; CH-06a cerrado en 0.22.0 (`ch-06a-specs-merge-deterministic`, capability `spec-sync`); CH-06b (selección de tests por affected-set) diferido — `computeAffectedSet`/`ancleto affected` ya existen y son determinísticos, la selección focalizada es heurística y no tiene consumidor probado; CH-07 A/B bloqueado por CH-00.
- **P1 · MEM-05 (pendiente) — presupuesto del working-context:** el bloque inyectado
  `<ProjectMemoryRules>` no distingue importancia. Con 39 reglas `scope: project` renderiza 8 y omite
  31; agregar una regla larga (2026-11-06) hizo caer las renderizadas de 9 a 8 y desplazó dos reglas
  que antes entraban, incluida `node-test-scope-explicit-paths`. MEM-05 debe fijar un set universal
  estable, recuperar el resto por tarea y fallar explícito (con `memory_key`) cuando una regla crítica
  no entra. Detalle y criterio de aceptación: `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` §5.
  Núcleo archivado el 2026-11-02; el "set universal estable" sigue pendiente y queda fuera de 0.22.0: requiere curaduría de memoria (MEM-01) y definición de criticality (CH-09a, diferido), y no es código offline-testeable.
- **P2 colaboración:** `import --dry-run` por key, `--on-conflict`, `formatVersion`, tombstones, reindex desde proposals (T25, T27, T10/T26/M08/M10).
- **P2 motor/host:** T20 idempotencia, T30 V1/V2, CH-10 matriz de hosts, #4, #6, #18.
- **Deuda:** MEM-05c–g, CH-09a–h.

### Deuda residual de CH-06a — cerrada en 0.22.1

- **(1) Contenedor `--change archive`** — corregido: el resolver de path falla cerrado por identidad de path, exit 2, cero escrituras; aplica también a `--dry-run`.
- **(2) Preámbulo H1** — corregido: regla estructural (como máximo un H1, con cualquier título; un segundo H1 o contenido suelto antes de la primera sección falla cerrado). Se preservan las formas legacy de delta archivadas y se actualizó `spec-sync`.
- **(3) Espaciado ADDED** — corregido: exactamente una línea en blanco antes del siguiente `## `; sin blanco extra al final del archivo.
- **(4) `## RENAMED Requirements` vacío** — test agregado; no-op confirmado.
- **(5) Fase de escritura no transaccional** — documentada como exclusión explícita en `spec-sync`; la atomicidad de plan se mantiene y no se implementó atomicidad multi-archivo.

## Relación con 0.20.0

`2026-11-05-host-neutral-bundle` es una línea independiente de portabilidad (export/import/MCP), no un tramo memoria-first. Su equivalente en el eje memoria (colaboración/continuidad) es CH-08/MEM-06, aún pendiente.

## Relación con 0.22.0

0.22.0 cierra CH-06a: `ancleto specs merge --change <slug> [--dry-run] [--json]`, merge estructural idempotente por título exacto, fail-closed con cero escrituras y atomicidad de plan; nueva capability canónica `spec-sync`. No cambia `specs check`, `mergeLocked`, el affected-set ni los contratos de memoria/seed.

## Relación con 0.22.1

0.22.1 contiene dos changes, `specs-merge-hardening` y `archive-order-correctness`, sin comandos ni flags nuevos. Se sincronizaron las specs canónicas `spec-sync` y `memory-ops`. El orden de archivo queda fijado en: merge → preflight read-only → promover `## Decisiones` aprobadas → mover → commit, a través de `agents/orchestrator.md`, `agents/documenter.md`, `skills/ancleto-archive`, `skills/ancleto-bulk-archive` y `skills/ancleto-onboard`; los content guards fijan ese orden.

**Descartado / diferido en 0.22.1 (sigue pendiente, no hecho):**

- **CH-06b `--tests`** (proyección de tests por affected-set): descartado — no puede ser un contrato completo de selección de tests y no tiene consumidor probado. Sigue diferido.
- **CH-00 baseline**: runbook, no publicable; sigue pendiente.
- **CH-07** (A/B de prefijos/caché/modelos): bloqueado por CH-00.
- **CH-08/MEM-06, MEM-05 y el P2 motor/host restante** (#4, #6, #18, T20, T30, CH-10, T25/T27): siguen pendientes/diferidos.
- **Extensión VS Code**: sin cambios en esta release; sigue diferida.
