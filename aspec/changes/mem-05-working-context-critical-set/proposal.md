# Proposal: Conjunto crítico estable del working-context

## Problem

El bloque `<ProjectMemoryRules>` se arma con un orden determinístico y un corte por presupuesto
(`<ContextOverflowWarning>`), pero no garantiza que un conjunto pequeño de invariantes universales
quede siempre inyectado. Medición sobre una copia read-only de la DB real: 367 nodos, 252 activos,
45 `rule` activas de scope `project`, de las cuales se renderizan 8 y se omiten 37. El contenido
total de esas 45 reglas es 31.072 caracteres, muy por encima del presupuesto por defecto de 2.000
tokens (~8.000 caracteres): inyectarlas todas exigiría ~6.900 tokens. Además, hoy las 45 declaran
alguna ref de anclaje, así que el criterio de anclaje no discrimina.

El resultado es que una regla crítica puede quedar fuera del bloque sin que nadie lo note, y que la
selección queda gobernada por recencia y orden lexicográfico, no por criticidad declarada.

Ver `spec:memory-engine#Orden determinístico de inyección de reglas`.
El contrato de `spec:memory-engine#Aviso de overflow accionable para el orquestador` es la frontera
que este change NO modifica: su formato, su conteo y sus consumidores quedan intactos.

## Proposed change

Mecanismo híbrido sin escritura en la DB: una lista curada de claves críticas se persiste fuera de
la base, en `.ancletorc` bajo la clave aditiva `memory.criticalKeys` (array de `memory_key`). Si la
clave no existe, el valor efectivo es `[]` y el comportamiento es idéntico al actual. El renderer
(`working-context.js`) lee esa lista en sus dos puntos de render y la pasa como el cuarto argumento
ya existente `{ required }` a `buildWorkingContext`. El llenado conserva el comparador determinístico
vigente: las requeridas primero, luego scope, anclaje, recencia y `memory_key`.

Fallo explícito sólo en la superficie explícita: `ancleto memory context` (incluido `--out`) sale
con código distinto de cero, nombra la `memory_key` y NO sobrescribe el archivo previo. El refresh
on-write propaga el error de render y su llamador en el MCP lo captura y emite `console.warn`; los
refreshes de lifecycle también emiten `console.warn` y no escriben un bloque degradado. Las
superficies derivadas (`memory merge` y `memory consolidate --apply`) fallan con código distinto de
cero cuando el refresh del working-context no puede completarse, para no reportar éxito con un bloque
desactualizado. El formato de `<ContextOverflowWarning>` y sus consumidores no cambian.

## Scope

In scope:
- Lectura tolerante de `memory.criticalKeys` en `.ancletorc` (ausente, malformada o no-array → `[]`).
- Paso de `{ required }` desde los dos puntos de render del working-context.
- Error explícito con `memory_key` para clave crítica inexistente, inactiva o que no entra en el
  presupuesto.
- Política de fallo diferenciada: dura en la CLI explícita, best-effort con `console.warn` en
  lifecycle y refresh on-write.
- Declaración de las claves críticas iniciales en `.ancletorc`.
- Tests que cubren el renderizado, la política de fallo y la invariancia del aviso de overflow.

Out of scope:
- Cambios en el schema de la DB, columnas de prioridad/criticidad o migraciones.
- Cambios en `searchMemory` ni en su contrato de `required`.
- Cambios al texto o al comportamiento de `<ContextOverflowWarning>`.
- UI o comandos nuevos de administración de la lista crítica.
- Inyectar como críticas todas las reglas activas.

## Risks

- La lista curada queda desactualizada o incluye una clave que luego se inactiva: el fallo explícito
  nombra la clave y obliga a corregir la configuración; el test de configuración malformada evita
  fallos silenciosos.
- El error duro en la CLI explícita rompe scripts que hoy obtienen un bloque parcial: es intencional
  y sólo aplica cuando hay claves críticas declaradas; sin la clave, el comportamiento no cambia.
- Un refresh de lifecycle podría intentar escribir un bloque degradado: se evita capturando el error
  antes de escribir y emitiendo `console.warn`.
- El presupuesto real no alcanza para las 45 reglas: la lista crítica se limita a invariantes
  universales y el resto se recupera por tarea (FTS/refs), no se inyecta.

## Architecture decision

- La fuente de criticidad es configuración del proyecto, no una columna de la DB: `.ancletorc` ya es
  el seam de configuración y evita migración, export/import y blast radius de schema.
- El engine no conoce criticidad: sigue recibiendo `required` como opción de llamada no persistida,
  preservando la invariante de que `required` no forma parte del nodo ni del schema.
- Un único comparador determinístico gobierna el orden; la criticidad sólo promueve claves al frente.
- La política de fallo se decide por superficie: la explícita tiene un humano esperando respuesta; el
  lifecycle y el on-write no deben bloquear `init`/`install`/`upgrade` ni una escritura MCP.

## Planned validation

- `npm run lint` (script declarado en `package.json`).
- `npm test` (script declarado en `package.json`: `node --test "test/*.test.js"`), invocado vía
  `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run test`.
- Format check: `not-configured` (el proyecto no declara formatter).
- Typecheck: no aplica (proyecto JavaScript, sin script declarado).
- Los tests no abren la DB real `.ancleto/memory.db`: usan DB temporal y `.ancletorc` temporal.

## Authorized paths

- `src/core/memory/working-context.js`
- `src/cli/index.js`
- `.ancletorc`
- `test/` (archivos de test nuevos o existentes del working-context)
- `aspec/changes/mem-05-working-context-critical-set/**`
- `aspec/backlog.md` (registro de cierre)

## Decisiones

**memory_key:** working-context-critical-set-source
**Elección:** lista curada de claves críticas persistida en .ancletorc bajo memory.criticalKeys, leída por el renderer y pasada como { required }.
**Descartado:** columna de prioridad/criticidad en la DB; archivo allowlist separado.
**Justificación:** .ancletorc ya es el seam de configuración y la clave es aditiva (ausente = []); no requiere migración ni toca export/import. Una columna tendría blast radius de schema y un archivo separado duplicaría el seam.
**Refs:**
- spec:memory-engine#Orden determinístico de inyección de reglas

**Estado:** aprobado

**memory_key:** working-context-critical-failure-policy
**Elección:** error duro con memory_key en ancleto memory context (sin sobrescribir el archivo previo); el refresh on-write propaga el error de render y su llamador en el MCP lo captura y emite console.warn; los refreshes de lifecycle emiten console.warn; ningún caso escribe un bloque degradado, y las superficies derivadas (memory merge, memory consolidate --apply) salen != 0 si el refresh falla.
**Descartado:** truncamiento silencioso; advertir sin fallar en todas las superficies.
**Justificación:** la superficie explícita tiene un humano esperando una respuesta y debe fallar visiblemente; el lifecycle no debe bloquear init/install/upgrade ni una escritura MCP, pero tampoco debe persistir un bloque degradado.
**Refs:**
- spec:memory-engine#Orden determinístico de inyección de reglas
- change:mem-05-working-context-critical-set

**Estado:** aprobado

**memory_key:** working-context-critical-no-db-write
**Elección:** no escribir en la DB ni cambiar el schema; required sigue siendo una opción de llamada no persistida.
**Descartado:** persistir criticidad como columna o tabla.
**Justificación:** preserva la invariante documentada de que required no forma parte del nodo ni del schema, y evita migración y riesgo sobre datos existentes.
**Refs:**
- spec:memory-engine#Orden determinístico de inyección de reglas
- spec:memory-engine#Recall task-aware con orden total, preview expandible y keys requeridas

**Estado:** aprobado

**memory_key:** working-context-critical-release
**Elección:** release MINOR.
**Descartado:** release MAYOR; release PATCH.
**Justificación:** la clave de configuración es aditiva y el comportamiento sin ella es idéntico al actual; no hay ruptura de contrato, pero sí capacidad nueva observable.
**Refs:**
- change:mem-05-working-context-critical-set

**Estado:** aprobado
