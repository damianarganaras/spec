# Tasks: Idempotencia de reescritura idéntica en `recordNode`

> Change funcional de la release 0.23.0. Sin migración, sin dependencias nuevas, sin cambio de schema.

## Implementación

- [x] 1. `src/core/memory/engine.js`: extender el lookup del nodo activo que usa `recordNode` para
  traer `content`, `justification` y `scope` además de `id` y `type` (hoy `findActive` selecciona
  sólo `id, type`). Agregar la rama de idempotencia dentro de la transacción existente, después de
  `BEGIN IMMEDIATE` y del lookup de `prev`, comparando la tupla (`memory_key`, `type`, `scope`,
  `content`, `justification`) por igualdad exacta contra el nodo activo. Si coincide, no insertar,
  no actualizar y no superseder; devolver los valores persistidos del nodo activo
  (`memory_key`, `type`, `scope`, `content`, `justification` y el `created_at` existente) con
  `superseded: 0`. No cambiar el orden de validación (`looksLikeSecret`, `validateRefsForWrite`
  antes de la transacción y de la comprobación) ni las claves del objeto devuelto.

## Pruebas

- [x] 2. `test/memory-engine.test.js`: agregar los escenarios del delta como tests. Cubrir: misma
  `memory_key` y contenido idéntico no cambia el conteo de filas, devuelve `superseded: 0` y conserva
  el `created_at` del nodo activo; contenido distinto inserta fila nueva y supersede; `type` o
  `scope` distinto supersede; la validación de refs corre antes de la comprobación de identidad (una
  escritura idéntica inválida sigue rechazándose); `importNodes` conserva su semántica
  last-writer-wins. Listo cuando `node --test test/memory-engine.test.js` (ruta explícita) pasa en
  verde y `npm run lint` no reporta errores.

## Validación

- [x] Cerrar con las validaciones declaradas en `PRODUCT.md` → `## Project Commands`: `npm run lint`
  y `npm test`. Registrar cualquier omisión; no inventar comandos no declarados.
