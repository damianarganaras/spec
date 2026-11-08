# Tasks: Sync de delta al archivar ruteado por specs merge

## 1. Ruteo en `skills/ancleto-archive/SKILL.md`

- [x] 1.1 En §2 "Assess delta spec sync state", reemplazar la edición manual de
  `aspec/specs/<capability>/spec.md` y la lista de las cuatro operaciones por la invocación
  `ancleto specs merge --change <name>` cuando el usuario elige sincronizar. Conservar el precheck
  `ancleto specs check --change <name> --json` y la regla "Never merge into a non-canonical spec
  silently".
- [x] 1.2 Documentar en la misma skill: exit code 0 ⇒ continuar con preflight, promoción y move;
  cualquier exit code distinto de 0 ⇒ abortar sin preflight, sin promoción y sin move, reportando la
  capability, el requirement y el motivo. Eliminar la frase que promete preservar scenarios no
  mencionados en `MODIFIED` y no alterar el orden de la secuencia.

## 2. Ruteo en `skills/ancleto-bulk-archive/SKILL.md`

- [x] 2.1 En §8a "Sync specs", invocar `ancleto specs merge --change <name>` una vez por change, en el
  orden determinado; eliminar la edición manual de las cuatro operaciones y la promesa de preservar
  scenarios no mencionados.
- [x] 2.2 Definir el fallo del lote: un exit code distinto de 0 falla ese change sin moverlo y continúa
  con el resto; conservar el skip de §5c sin invocar `specs merge` para un change sin implementación.

## 3. Ruteo en `agents/documenter.md`

- [x] 3.1 En Phase A, reemplazar "update the relevant source-of-truth specs" por la invocación
  `ancleto specs merge --change {change-name}`; conservar el `specs check` previo, el reporte
  `sin delta`, la separación Phase A / Phase B y el no-move de Phase A. No tocar
  `agents/orchestrator.md`: delega en documenter y no prescribe el mecanismo manual.

## 4. Guards de contenido (`test/content-guards.test.js`)

- [x] 4.1 Agregar asserts que exijan `ancleto specs merge --change` en
  `skills/ancleto-archive/SKILL.md`, `skills/ancleto-bulk-archive/SKILL.md` y `agents/documenter.md`.
- [x] 4.2 Agregar asserts negativos: ninguna de las tres superficies instruye editar la spec canónica a
  mano con las cuatro operaciones ni afirma que `MODIFIED` preserva scenarios no mencionados.
- [x] 4.3 Agregar la mutación de control: revertir el texto a la edición manual debe romper el guard;
  los guards existentes de `ancleto specs check` y del orden merge→preflight→promoción→move siguen
  verdes.

## 5. Validación

- [x] 5.1 Correr la validación acotada con ruta explícita:
  `node --test test/content-guards.test.js`.
- [x] 5.2 Correr `npm run lint`.
- [x] 5.3 Correr `npm test`.
- [x] 5.4 Registrar el format check como `not-configured` y el typecheck como no aplicable (paquete
  JavaScript ESM sin `tsconfig.json`).
- [x] 5.5 Confirmar que no cambiaron `src/core/specs-merge.js`, los flags y la semántica de
  `specs merge`, el orden de archive, el gate de promoción, la memoria, el seed ni `.opencode/**`.
