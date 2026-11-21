# Proposal: CH-00 — Congelar baseline reproducible (doc-only)

## Intención

Congelar, antes de CH-07, un baseline reproducible del framework: commit y runtime fijados, hosts/modelos/tiers, config MCP, `stats` histórico, cuentas de cache con semántica validada, golden tests y estado de mirrors. El baseline se publica como documento versionado y se obtiene sólo con comandos read-only, sin tocar producción.

## Alcance

### In

- Documento `docs/baseline/CH-00-2026-11-20.md` versionado, con metadatos, mirrors, diagnósticos, `stats` + arquetipos, golden tests, comandos reproducibles y `unknowns`.
- Runbook reproducible: comandos exactos (`check`, `doctor`, `discovery --check`, `stats --json`, `npm test`) y criterios de aceptación.
- Registro de los 3 arquetipos del plan —fix de conformidad, feature con delta, cambio de adapter/contrato compartido— más 1 prueba de recuperación de memoria y 1 de continuidad entre sesiones. Si `stats` no expone etiquetas de arquetipo, se registra la limitación y el criterio de mapeo.
- Registro del estado de mirrors de skills/agents y de las versiones de runtime y CLI usadas.

### Out

- Código de producto, schema o migraciones.
- Release, tag o publicación.
- JEV/Lucas, MEM-01 y cualquier operación sobre cuentas pagas.
- Cualquier escritura a `.ancleto/memory.db` o a la DB de opencode.
- Cambios en `aspec/specs/`, `.ancletorc`, `.opencode/**` o `src/**`.
- `design.md`: no aporta para un change doc-only.

## Conformidad y delta

Doc-only, sin cambio de comportamiento observable: **no hay delta funcional ni directorio `specs/`**.

El baseline documenta el requirement existente `spec:prompt-contracts#Gobernanza del presupuesto de tokens de los prompts`, que exige un baseline reproducible con la suite cronometrada y el consumo medido por `ancleto stats`. CH-00 materializa ese sustrato (metadatos, `stats`, golden tests y comandos reproducibles). La métrica Q = (1−RR)(1−escapes) y el registro de RR/escapes **no** se implementan en este change: quedan como gap declarado en `unknowns` y son insumo de CH-07.

Los comandos documentados son read-only según `path:aspec/specs/cli-diagnostics/spec.md`; el baseline no reescribe ese contrato.

## Criterios de aceptación

1. `docs/baseline/CH-00-2026-11-20.md` existe, está versionado y contiene la estructura mínima completa con comandos reproducibles desde el commit fijado.
2. Guards existentes verdes: `check` reporta `0 faltantes, 0 huerfanos` con exit 0; `doctor` exit 0; `discovery --check` exit 0; `npm test` verde con conteo y duración registrados.
3. Nada modificado en producción: sin cambios en `src/**`, `aspec/specs/**`, `.ancletorc`, `.opencode/**`, `.ancleto/memory.db`, ni release/tag.
4. Sin datos de JEV/Lucas ni de cuentas pagas.
5. Los `unknowns` están declarados con su motivo; no se registran costos ni ratios inventados.

## Rollback

Nulo. Es doc-only: revertir el commit elimina sólo `aspec/changes/ch-00-baseline/` y `docs/baseline/CH-00-2026-11-20.md`; no hay comportamiento, schema, release ni datos que deshacer.

## Supuestos

- El contexto de la delegación llegó como hechos verificados con rutas fuente citadas; no se citó un technical seed y este change no depende de él, porque el baseline se reconstruye con comandos read-only.
- `stats` puede no exponer etiquetas de arquetipo ni semántica de cache por proveedor; en ese caso se registra la limitación, no una estimación.
- El baseline se mide sobre el host declarado (win32, PowerShell 5.1, EOL `lf`); otra máquina puede diferir en wall time.

## Riesgos

- **Contaminación del dataset** si se usan sesiones de la cuenta paga: mitigado por la exclusión explícita de JEV/Lucas y cuentas pagas.
- **Deriva de entorno** entre la medición y el consumo por CH-07: mitigado fijando commit, versión de CLI, host y hash de la config MCP en el documento.
- **Cambio de contrato de `stats`**: el baseline registra comando y versión usados, no un formato asumido.

## Decisiones

- **memory_key:** baseline-artifact-home
  **Elección:** publicar el baseline como documento versionado en `docs/baseline/CH-00-2026-11-20.md`.
  **Descartado:** dejarlo sólo dentro de `aspec/changes/ch-00-baseline/` o en una salida temporal no versionada.
  **Justificación:** el plan exige guardar JSON y criterios versionados fuera del código temporal del change; CH-07 consume el baseline como insumo.
  **Refs:** `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`, `path:aspec/backlog.md`, `change:ch-00-baseline`
  **Estado:** propuesto

- **memory_key:** ch-00-doc-only-no-delta
  **Elección:** clasificar CH-00 como conformidad doc-only, sin delta de spec, citando el requirement existente.
  **Descartado:** crear un delta del capability o un spec nuevo de observabilidad.
  **Justificación:** no hay comportamiento observable nuevo; el baseline documenta un requirement ya normado y reutiliza comandos read-only existentes.
  **Refs:** `spec:prompt-contracts#Gobernanza del presupuesto de tokens de los prompts`, `change:ch-00-baseline`
  **Estado:** propuesto

- **memory_key:** ch-00-readonly-measurement-scope
  **Elección:** medir sólo con comandos read-only y excluir JEV/Lucas, MEM-01 y cualquier cuenta paga.
  **Descartado:** reutilizar sesiones de la cuenta paga para ampliar la muestra o ejecutar MEM-01 para normalizar datos.
  **Justificación:** un baseline contaminado por una cuenta paga no es comparable, y MEM-01 escribe la DB; CH-00 debe demostrar “nada modificado en producción”.
  **Refs:** `path:aspec/backlog.md`, `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`, `change:ch-00-baseline`
  **Estado:** propuesto

- **memory_key:** baseline-cache-semantics-raw-only
  **Elección:** registrar los campos crudos de `stats` y calcular cuentas de cache sólo con semántica de proveedor validada; lo no validado va a `unknowns`.
  **Descartado:** estimar costos o ratios derivados para “completar” el baseline.
  **Justificación:** el plan prohíbe costos inventados y ratios con denominadores ambiguos; un baseline con supuestos silenciosos no es reproducible.
  **Refs:** `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`, `spec:prompt-contracts#Gobernanza del presupuesto de tokens de los prompts`, `change:ch-00-baseline`
  **Estado:** propuesto
