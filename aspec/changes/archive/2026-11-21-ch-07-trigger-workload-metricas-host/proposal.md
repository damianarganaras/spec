# Proposal: Trigger CH-07 — workload y métricas de host para A/B de prefijos/caché/modelos

## Problem
CH-07 está bloqueado por CH-00 y sin trigger medible. El backlog lo define como
«Sólo post-baseline. A/B de prefijos estables, remover schemas sólo donde el host
realmente los omite, medir cache facturado, experimentar modelos por rol si la calidad
es equivalente. Si el host no expone métrica: reportar `not-supported`, no extrapolar»
(`docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md:407`). El plan V2 exige «no optimizar
cache/modelos/tools antes de medir cache *facturado* y calidad final; no sobre-interpretar
ratio read/input» (`docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md:690`).

El baseline CH-00 (`docs/baseline/CH-00-2026-11-20.md` §8) deja los unknowns que impiden
arrancar el A/B sin inventar datos:
- `stats` no expone etiqueta de arquetipo; las sesiones sólo traen
  `title`, `agent`, `model`, `cost`, `tokens`.
- Sin métrica de wall time: `timeCreated`/`timeUpdated` son vida de sesión, no wall de corrida.
- El JSON de `stats` no incluye `errors`; `stats failures` mide tool parts fallidos con otro
  universo, no «sesiones con error».
- `cacheRead`/`cacheWrite` se registran crudos (`src/cli/index.js:4393-4394`,
  `5054-5055`); sin semántica de proveedor validada, no se derivan ratios ni ahorro.
  En alcance proyecto `cacheWrite=0` (baseline §5).
- `USD` es el campo `cost` tal cual; no se recalcula por tarifa.
- Métricas de host no medidas: CPU, RAM e I/O no se capturaron durante `npm test`; sólo se
  registra el host declarado (`win32 10.0.26200, x64, 20 vCPU, 23.7 GB RAM`).

Sin trigger explícito, cualquier A/B extrapolaría ratios o wall time inexistentes.

## Proposed change
Definir el trigger de CH-07 como gate read-only, sin tocar runtime ni specs canónicas:
el A/B sólo arranca cuando el workload y las métricas cumplen las condiciones de abajo;
si el host no expone una métrica, se reporta `not-supported` y ese brazo queda fuera,
nunca se extrapola.

Trigger mínimo (las 4 deben cumplirse):
1. **Workload etiquetado fuera de `stats`:** conjunto cerrado y repetible de tareas con
   arquetipo declarado manualmente (p. ej. fix de conformidad citando Requirement,
   feature con delta, cambio de adapter/contrato), mismo prompt/seed/comando, criterio de
   calidad binario por tarea. `stats` no etiqueta arquetipos: no se deriva conteo por
   arquetipo desde `stats`.
2. **Métricas de costo facturado por sesión:** `cost`, `tokens.{input,output,reasoning,
   cacheRead,cacheWrite}`, `model`, `agent`, `timeCreated/timeUpdated` tal cual los entrega
   `stats --json`. Prohibido derivar hit-rate, ahorro o wall time desde esos campos.
3. **Métricas de host declaradas o `not-supported`:** CPU/RAM/I-O-tiempo sólo si se miden
   con instrumento externo durante la corrida; hoy no existen (baseline §8). Sin instrumento,
   el informe dice `not-supported` para host.
4. **Calidad equivalente definida antes del A/B:** qué mide calidad por tarea y qué umbral
   conserva capability/seguridad (V2 §CH-07: «sin pérdida de capability/seguridad»);
   sin esa definición no hay brazo de modelos por rol.

## Scope
In:
- Definir el gate y el formato del informe pre-A/B (workload, campos `stats`, estado
  `supported`/`not-supported` por métrica, criterio de calidad).
- Checklist read-only para verificar el trigger (`stats --json`, `stats failures --json`,
  `discovery --check`, `doctor`).

Out:
- Implementar el A/B, cambiar prefijos, remover schemas, cambiar modelos/tiers/hosts.
- Agregar comandos, flags, tablas, índices o specs canónicas.
- Medir CPU/RAM/I-O con instrumentación nueva (queda como `not-supported` hasta que exista).

## Risks
Gate ignorado y A/B con ratios inventados: el proposal fija `not-supported` antes que extrapolar; el checklist exige citar fuente por métrica.
Workload no repetible: el trigger exige tareas cerradas con criterio binario; sin eso no se abre el A/B.
Deriva de `stats`/baseline: el trigger cita commit y comandos reproducibles del baseline; re-medición si cambia el commit.

## Decisiones
- `ch-07-trigger-gate-readonly` | Trigger CH-07 como gate read-only con `not-supported` antes que extrapolar | Abrir el A/B con ratios read/input o wall derivado de `timeCreated/Updated` | Backlog P1 CH-07 + V2 §8A.2 + baseline §8 + `src/cli/index.js:4393-4394,5054-5055` | Estado: propuesto
- `ch-07-workload-etiquetado-manual` | Arquetipo declarado manualmente, no derivado de `stats` | Contar arquetipos desde `title/agent/model` | Baseline §8 (sesiones sólo traen `title,agent,model,cost,tokens`) | Estado: propuesto
- `ch-07-sin-delta-specs` | Este change no toca `aspec/specs/**` ni runtime | Crear delta ADDED/MODIFIED sin cambio de comportamiento | Flujo spec: sin comportamiento especificado no hay delta | Estado: propuesto
