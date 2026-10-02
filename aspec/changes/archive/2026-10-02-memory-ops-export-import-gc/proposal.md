# Proposal: Memory Ops — Export/Import/GC

## Problem

El motor de memoria (`src/core/memory/`) almacena reglas y decisiones en `.ancleto/memory.db`
pero no ofrece forma de:

1. **Backup o compartición** de reglas/decisiones activas entre máquinas o entre miembros del
   equipo (el change `cross-machine-export-import` cubre portabilidad de config/MCP, pero
   explícitamente deja fuera la memoria — ver su proposal, sección "Out of scope").
2. **Limpieza** de nodos superseded que acumulan espacio en la BD sin valor operativo (hoy
   permanecen para trazabilidad de genealogía, pero tras 30 días ya no aportan contexto).

## Proposed change

Agregar tres operaciones al motor de memoria, expuestas como subcomandos del grupo
`ancleto memory`:

- **`ancleto memory export [--out <file>]`**: exporta nodos activos (rules + decisions) a JSON
  sanitizado (sin paths absolutos, sin secretos). Formato: array de
  `{memory_key, type, content, justification, scope, createdAt}`.
- **`ancleto memory import <file>`**: importa desde JSON, haciendo upsert por `memory_key`
  (el nodo más reciente gana). Idempotente: re-importar el mismo archivo es no-op.
- **`ancleto memory gc [--dry-run]`**: purga nodos con `status='superseded'` y antigüedad
  mayor a 30 días (umbral configurable), luego ejecuta `VACUUM` + `REINDEX`. Con `--dry-run`
  solo reporta cantidad de nodos y tamaño estimado a liberar.

## Scope

In scope:
- Métodos del engine: `exportActive()`, `importNodes(json)`, `gcSuperseded(opts)`.
- Subcomandos CLI en `src/cli/index.js` bajo el grupo `memory` existente.
- Tests unitarios en `test/memory-engine.test.js` para los tres métodos.
- Formato JSON de export con schema mínimo y estable.
- Umbral de antigüedad configurable (default 30 días, override por env o flag).

Out of scope:
- Export/import de nodos superseded (solo activos).
- Integración con el bundle de `cross-machine-export-import` (son cambios ortogonales).
- Migración de `memory.db` entre versiones del schema (no hay cambio de schema).
- UI interactiva de merge o resolución de conflictos en import.

## Risks

- **Pérdida de genealogía en import**: si el archivo de import no incluye el nodo superseded
  original, el upsert crea un nodo nuevo sin historial. Mitigación: documentar que el export
  es de activos únicamente y que la genealogía se reconstruye a partir de `memory_key`.
- **GC prematuro**: purgar un nodo supersedado reciente podría romper trazabilidad de un
  cambio en progreso. Mitigación: umbral conservador de 30 días (configurable) y `--dry-run`
  obligatorio para auditoría.
- **Idempotencia de import**: si el archivo tiene `createdAt` idéntico al nodo existente pero
  `content` distinto, ¿cuál gana? Mitigación: comparar `createdAt` y, en empate, preferir el
  nodo existente (no sobrescribir).

## Non-goals

- No cambiar la API existente (`searchMemory`, `recordRule`, `recordDecision`).
- No agregar dependencias externas (solo `node:sqlite` y módulos estándar de Node).
- No modificar el schema de `memory.db` (los nodos exportados ya tienen todos los campos
  necesarios en el schema actual).
