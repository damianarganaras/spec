# Tasks: Orden correcto del archive

## 1. Skills

- [x] 1.1 En `skills/ancleto-archive/SKILL.md`, reordenar los pasos a merge/sync → preflight →
  promoción → move → summary; mover la promoción antes del paso que crea y mueve el directorio.
- [x] 1.2 En `skills/ancleto-archive/SKILL.md`, reescribir el texto de fallo: preflight o promoción
  antes del move reporta `no archivado; memoria pendiente` (sin mover, cero escrituras por violación,
  con `memory_key` y motivo); fallo del move tras promoción exitosa reporta
  `memoria promovida; NO archivado`. Eliminar "archivado, memoria pendiente".
- [x] 1.3 En `skills/ancleto-bulk-archive/SKILL.md`, reordenar la ejecución por change a sync →
  preflight → promoción → move, de modo que cada change se promueva antes de su propio move.
- [x] 1.4 En `skills/ancleto-bulk-archive/SKILL.md`, reescribir el texto de fallo: un fallo de
  preflight o promoción deja ese change sin mover y sin escrituras, reportado como
  `no archivado; memoria pendiente`; un fallo del move tras promoción exitosa reporta
  `memoria promovida; NO archivado`; el resto del lote continúa. Eliminar "archivado, memoria
  pendiente".

## 2. Definiciones canónicas de agentes

- [x] 2.1 En `agents/orchestrator.md`, partir el archive en dos delegaciones: fase A de
  `@documenter` (sólo merge/sync), luego la promoción de decisiones aprobadas, luego fase B; Automatic
  Record corre en paralelo con la fase A y la promoción nunca se ejecuta después del move.
- [x] 2.2 En `agents/documenter.md`, declarar fase A (sólo merge, SIN move; retorna `phase A complete`)
  y fase B (sólo move, invocada únicamente tras confirmación de la promoción), de modo que una sola
  pasada no haga merge y move.
- [x] 2.3 En `test/content-guards.test.js`, agregar guards task-owned del orden en las definiciones de
  agentes: el orchestrator delega la promoción entre fase A y fase B (nunca después del move) y el
  documenter separa fase A de fase B; una mutación que reintroduce merge+move en una pasada debe
  fallar.
- [x] 2.4 En `skills/ancleto-onboard/SKILL.md`, reemplazar el move directo de la Phase 9 por el mismo
  gate de archive: merge/sync si hay delta, preflight de promoción, promoción de las decisiones
  aprobadas y recién entonces el move, con los literales de fallo canónicos.
- [x] 2.5 En `test/content-guards.test.js`, agregar un guard task-owned que verifique que la Phase 9 de
  `skills/ancleto-onboard/SKILL.md` incluye merge/preflight/promoción antes del move; una mutación que
  restaura el move directo debe fallar.

## 3. Guard de contenido de skills

- [x] 3.1 En `test/content-guards.test.js`, agregar un guard task-owned que compare el índice textual
  del paso de promoción contra el del move en `skills/ancleto-archive/SKILL.md` y
  `skills/ancleto-bulk-archive/SKILL.md`, y que una mutación que invierte el orden haga fallar el test.

## 4. Delta canónico

- [ ] 4.1 En `aspec/specs/memory-ops/spec.md`, aplicar el `MODIFIED` de "Promoción al archivar sólo de
  decisiones duraderas aprobadas" con el cuerpo completo y los escenarios de orden y fallo, sin
  re-enunciar el shape de `## Decisiones`. El escenario canónico
  `Fallo de promoción no se reporta como éxito` queda deliberadamente fuera: presume
  move-before-promote y está superseded por los escenarios de fallo nuevos.
- [x] 4.2 Verificar que `aspec/specs/prompt-contracts/spec.md` no requiere delta: no enuncia
  move-before-promote ni "archivado, memoria pendiente".

## 5. Superficie de producto

- [ ] 5.1 Correr `ancleto upgrade` para regenerar los mirrors de agentes y skills, y commitear los
  archivos trackeados que cambien bajo `agents/**` / `skills/**` / `.opencode/**`.

## 6. Validación

- [x] 6.1 Correr la validación acotada declarada: `node --test test/content-guards.test.js`.
- [x] 6.2 Correr `npm run lint`.
