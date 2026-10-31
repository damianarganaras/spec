# Tasks: backfill-archived-design-decisions

Sin delta spec y sin cambio de código: las tareas se limitan a verificar el inventario, aprobar los bloques y promoverlos al archivar.

## 1. Verificación read-only

- [x] 1.1 Contar los `design.md` bajo `aspec/changes/archive/**` y confirmar 27 archivos y 0 `context.md`, sin escribir nada bajo esa ruta.
- [x] 1.2 Confirmar con `git status --porcelain aspec/changes/archive` que no hay modificaciones, altas ni bajas en archivos archivados.
- [x] 1.3 Verificar que los 5 bloques de `## Decisiones` citan refs que resuelven hoy: los 4 `design.md` archivados, los 5 `path:` (`engine.js` ×2, `working-context.js`, `agents/coder.md`, `skills/ancleto-archive/SKILL.md`) y los 5 `spec:#Requirement` (3 de `memory-engine`, 1 de `memory-ops`, 1 de `prompt-contracts`).
- [x] 1.4 Consultar en modo read-only `.ancleto/memory.db` y confirmar que ninguna de las 5 `memory_key` colisiona con un nodo activo.

## 2. Aprobación del contrato

- [x] 2.1 Presentar los 5 bloques (clave, elección, descartado, justificación, refs) y obtener la aprobación explícita del usuario; esperar el OK, no inferirlo del silencio.
- [x] 2.2 Sólo después de 2.1, cambiar `Estado: propuesto` → `Estado: aprobado` en los 5 bloques del proposal, sin tocar su contenido.

## 3. Validación declarada del repositorio

- [x] 3.1 Correr `npm run lint` como prueba de no-regresión (sin diff de código).
- [x] 3.2 Correr `npm test` como prueba de no-regresión (sin diff de código).

## 4. Archive y promoción

- [x] 4.1 Verificar los artifacts del change: proposal con auditoría de 27 archivos, 5 bloques en `Estado: aprobado`, sin `specs/` ni `design.md` por diseño.
- [ ] 4.2 Archivar el change con el pipeline de `skills/ancleto-archive`, preservando los 5 bloques en `Estado: aprobado`.
- [ ] 4.3 Promover los 5 bloques aprobados a `.ancleto/memory.db` con el pipeline de promoción de `skills/ancleto-archive` (el gate de cero candidatos no aplica: hay 5).
- [ ] 4.4 Confirmar que la promoción produjo 5 nodos nuevos y ninguna supersesión inesperada, y registrar el resultado en el resumen del archive.
