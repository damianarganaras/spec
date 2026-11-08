# Tasks: Guard de heading de delta en specs canónicas

## 1. Reparación de higiene de las specs canónicas

- [x] 1.1 En `aspec/specs/copilot-support/spec.md`, `aspec/specs/legacy-import/spec.md` y
  `aspec/specs/test-profile/spec.md`, reemplazar el heading `## ADDED Requirements` por
  `## Requirements`. Cambiar sólo el heading; no tocar requirements ni scenarios.

## 2. Validación fail-closed en el merge

- [x] 2.1 En `src/core/specs-merge.js`, validar en la fase de plan que la spec canónica que se
  modificaría no contenga `## ADDED Requirements`, `## MODIFIED Requirements`,
  `## REMOVED Requirements` ni `## RENAMED Requirements`. La validación cubre los cuatro tipos de
  operación y aplica sólo a la canónica: al detectar un heading, devolver un error cuyo `reason`
  nombre el heading ofensor y dejar el output canónico intacto (cero escrituras). El delta no se
  inspecciona con este guard.

## 3. Tests de comportamiento

- [x] 3.1 En `test/specs-merge.test.js`, agregar fixtures de canónica con heading de delta para
  `MODIFIED`, `REMOVED` y `RENAMED`: exit code 2, `ok:false`, mensaje con la capability y el heading
  ofensor, y bytes y `mtime` del canónico intactos. Incluir también `ADDED` con `## Requirements`
  presente más un heading de delta adicional.
- [x] 3.2 En `test/specs-merge.test.js`, agregar el control positivo: un delta con
  `## ADDED Requirements` sobre una canónica normalizada aplica sus operaciones con exit code 0, y
  una segunda corrida deja el archivo byte a byte idéntico.
- [x] 3.3 En `test/specs-merge.test.js`, agregar la invariante negativa explícita: un delta con los
  cuatro headings de sección y una canónica válida no falla por el guard, porque el único origen de
  rechazo es la canónica.
- [x] 3.4 En `test/content-guards.test.js`, afirmar que ninguna `aspec/specs/**/spec.md` contiene
  `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` ni
  `## RENAMED Requirements`, excluyendo `aspec/changes/**`.

## 4. Validación

- [x] 4.1 Correr la validación acotada con rutas explícitas:
  `node --test test/specs-merge.test.js test/content-guards.test.js`.
- [x] 4.2 Correr `npm run lint`.
- [x] 4.3 Correr `npm test` (comando declarado). El format check es `not-configured` y el typecheck
  no aplica (paquete JavaScript, sin `tsconfig.json`).
- [x] 4.4 Confirmar que no cambiaron `package.json`, `specs check`, `mergeLocked`, el affected-set,
  la memoria, el seed ni los archivos delta, y que las tres canonales sólo cambiaron su heading.
