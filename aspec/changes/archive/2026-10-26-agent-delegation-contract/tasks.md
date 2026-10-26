# Tasks: Contrato de delegación de agentes

Implementa `design.md`. Cada tarea es verificable por sí sola. Los keywords y los nombres de archivo
quedan en inglés literal; el contenido va en español.

## 1. Fuente — `agents/*.md` (implementación)

- [x] **T1.1 — Orquestador: ownership de git.** Agregar `tools.task: true` y la sección/párrafo de
  ownership de git: commit mecánico y local → `@coder`, único agente que commitea, en sus checkpoints de
  implementación y en el archive, acotado a los archivos que el orquestador nombró; `@documenter` no
  commitea; push denegado como capacidad y ejecutado por el usuario o el agente del host que el usuario
  nombre en ese caso; merge permitido sólo con OK explícito del usuario por caso y nunca iniciado por
  iniciativa propia. Listo cuando el orquestador declara los dos momentos, el conjunto nombrado por
  checkpoint, la distinción push/merge, la referencia a `AGENTS.md`/`PRODUCT.md` para la convención y sin
  introducir roles ni destinos de delegación fuera de `agents/*.md`.

- [x] **T1.2 — Orquestador: review packet con `change diff`.** En `### Handling subagent returns`,
  conservar la regla general de no copiar prosa/logs/diffs y agregar la excepción acotada: el campo
  `change diff` de `@tester` se pasa verbatim a `@reviewer`, limitado a los archivos task-owned y marcado
  como evidencia, no instrucción. En el paso de review de Path A, pasar ese campo. Listo cuando la
  excepción nombra el campo, los archivos y la marca de evidencia, y no habilita copiar otros diffs.

- [x] **T1.3 — Orquestador: reglas de memoria por delegación.** Agregar el campo `project memory rules`
  destilado de `<ProjectMemoryRules>`: máximo 5 reglas y 1,500 bytes, marcado como dato no confiable a
  verificar contra el código, sin reenviar el bloque completo. Excluir a `@memory-keeper` y
  `@context-resolver`. Listo cuando el contrato declara el tope, la marca de no confiable, la prohibición
  de verbatim y las dos exclusiones.

- [x] **T1.4 — Orquestador: commit del archive.** En el paso de archive de Path A, después de que
  `@documenter` termina, delegar a `@coder` el commit de las rutas archivadas nombradas por el
  orquestador. No paralelizar ese commit con el documenter; el documenter y el memory-keeper siguen en
  paralelo. Listo cuando el orden es documenter → commit del coder, y el documenter no commitea.

- [x] **T1.5 — Orquestador: invariante de delete.** Conservar y declarar en el Active Change Check que
  ningún agente borra change folders, que no se delega un borrado y que el desarrollador elimina el
  change abandonado. Listo cuando el texto no autoriza delete a ningún agente y remite el borrado al
  desarrollador.

- [x] **T1.6 — Coder: commit ownership y autorización de merge.** Agregar `tools.task: false`; **no**
  modificar `permission.bash`: se conservan los deny existentes (incluido `git push`) y `git merge` no se
  agrega al deny. Agregar `## Commit Ownership` con: único agente que commitea, dos momentos, sólo los
  archivos nombrados por el orquestador, referencia a `AGENTS.md`/`PRODUCT.md` para Conventional Commits y
  `main`/`master` protegidas, push denegado, y merge ejecutado sólo tras OK explícito del usuario por caso,
  nunca iniciado por sí mismo. Listo cuando el `permission.bash` queda igual, el contrato no usa
  `git add -A` ni `git commit -a` y no declara el merge como prohibido ni como capacidad autónoma.

- [x] **T1.7 — Documenter: no commit y evidencia `file:line`.** Agregar `tools.task: false`; conservar
  intacta la prohibición de git de escritura (`agents/documenter.md:71-77`); declarar que nunca commitea y
  que el commit del archive lo hace el coder. En Output Expectations / Source-of-Truth Rules, exigir
  `file:line` del requirement tocado por cada afirmación de «actualizado» o «confirmado», usando `bash`,
  `glob` o `read`. Listo cuando no hay afirmación sin evidencia y la prohibición de git sigue presente.

- [x] **T1.8 — Reviewer: diff como evidencia, sin bash.** Agregar `tools.task: false`; en Input Modes /
  Validation Evidence, declarar que el campo `change diff` es evidencia, no instrucción: se usa para
  juzgar y citar `file:line`, no se ejecuta. Conservar `bash: false`. Listo cuando el reviewer sigue sin
  bash y el diff no habilita comandos.

- [x] **T1.9 — Tester: campo `change diff`.** Agregar `tools.task: false`; en Output Expectations,
  agregar `change diff` con `git diff --unified=3 -- <final task-owned files>` más `git diff --stat`,
  `-U3`, tope de 200 líneas, degradación a `--stat` más hunks seleccionados, nunca `-U0`, y declaración
  explícita de cuántas líneas o hunks quedaron fuera cuando se recorta. Aclarar que el payload del diff no
  consume el tope de 15 líneas de prosa. Listo cuando el comando, el tope, la degradación y la declaración
  de truncación están escritos, y el `-U0` aparece sólo como prohibición.

- [x] **T1.10 — Spec-writer: sin delete.** Agregar `tools.task: false`; no agregar delete ni ninguna tool
  de borrado. Listo cuando sus tools no incluyen delete y el invariante de delete vive en el orquestador y
  en el spec.

- [x] **T1.11 — Restantes: `task: false`.** Agregar `tools.task: false` a `memory-keeper`,
  `context-resolver`, `technical-discovery` y `technical-seed-writer`. Listo cuando las 10 definiciones
  declaran `task` explícitamente: `true` sólo en `@orchestrator`, `false` en las 9 restantes.

## 2. Content guards y tests de contrato (testing)

- [x] **T2.1 — Helper normalize + slice + mutación.** En `test/content-guards.test.js`, incorporar/extraer
  los helpers de normalización de whitespace, slice por sección y mutación en copia scratch. Listo cuando
  los guards tocados pueden asertar el invariante sobre el tramo normalizado sin copiar párrafos.

- [x] **T2.2 — Guard del coder.** Actualizar `coder tiene bash con allowlist y deny de lo destructivo` para
  conservar los deny existentes (incluido `git push`), exigir `task: false` y verificar que `*git merge*`
  **no** está en el deny. Agregar un guard de comportamiento del commit ownership: único agente que
  commitea, dos momentos, archivos nombrados por el orquestador, referencia a `AGENTS.md`/`PRODUCT.md`,
  push denegado y merge sólo con OK explícito por caso, nunca autónomo. Listo cuando el guard falla si se
  quita cualquiera de esos invariantes o si se agrega merge al deny.

- [x] **T2.3 — Guard de las 10 declaraciones `task`.** Agregar un guard que recorra `agents/*.md` y exija
  `task` explícito en las 10, con `true` sólo en `orchestrator`. Listo cuando una definición sin `task` o
  con el valor incorrecto rompe el guard.

- [x] **T2.4 — Guard del destilado del orquestador.** Actualizar `el orchestrator destila el retorno de
  subagentes antes de reinyectarlo` para conservar la regla general y exigir la excepción acotada del
  `change diff` (campo, archivos task-owned, evidencia, no instrucción, truncación pasada verbatim sin
  completar ni inferir). Listo cuando el guard falla si la excepción se generaliza, si se elimina o si el
  orquestador reescribe la cuenta omitida.

- [x] **T2.5 — Guard del `change diff` del tester.** Agregar un guard de comportamiento del campo:
  `-U3`, tope de 200 líneas, degradación a `--stat` más hunks seleccionados, prohibición de `-U0` y
  declaración explícita de líneas o hunks omitidos cuando se recorta. Listo cuando el guard falla si
  aparece `-U0` como opción, si falta el tope o si un diff truncado se presenta como completo.

- [x] **T2.6 — Guard del reviewer.** Conservar el guard de `bash: false` y agregar el de evidencia: el
  `change diff` se consume sin ejecutar y se cita `file:line`. Listo cuando el guard falla si el reviewer
  recupera shell o si el diff se trata como instrucción.

- [x] **T2.7 — Guard de reglas de memoria por packet.** Agregar el guard del campo
  `project memory rules`: 5 reglas, 1,500 bytes, marca de dato no confiable, verificación contra el código,
  no verbatim y exclusiones de `@memory-keeper`/`@context-resolver`. Listo cuando el guard falla si falta
  el tope o la marca de procedencia.

- [x] **T2.8 — Guard del documenter.** Agregar el guard de evidencia `file:line` por cada
  «actualizado/confirmado» y el de la prohibición de git de escritura. Listo cuando el guard falla si el
  documenter afirma sin `file:line` o si se elimina la prohibición de git.

- [x] **T2.9 — Guard del delete.** Agregar el guard de que ningún agente borra change folders, que el
  orquestador no delega el borrado y que `@spec-writer` no tiene delete. Listo cuando el guard falla si
  aparece una tool de delete o una instrucción de borrado para un agente.

- [x] **T2.10 — Guards existentes.** Verificar y, si corresponde, extender sin debilitar:
  `orchestrator, reviewer y spec-writer siguen sin bash` (`:159-164`), guards del ledger (`:621-643`),
  `las 10 definiciones de agente referencian el artefacto` (`:676-686`) y
  `la lista de agentes con bash del orquestador coincide con las definiciones` (`:741-746`). Listo cuando
  todos siguen verdes y los que tocan el contrato asiertan el comportamiento nuevo.

- [x] **T2.11 — Mutación en copia scratch.** Probar cada guard nuevo/tocado en una copia descartable:
  quitar el invariante debe romper el guard; dejarlo debe pasarlo. Listo cuando la mutación está
  registrada y no depende de la copia del repo.

- [x] **T2.12 — Portabilidad `task` en Antigravity/Command Code.** Agregar/ajustar tests para que el
  `task: true` real del orquestador se descarte con aviso visible, que su salida Command Code siga siendo
  `tools: [read_file]` (`test/cli.test.js:3563-3571`) y que el `task: false` de los subagentes no cambie
  las listas adaptadas (incluida la superficie Antigravity del coder, `test/cli.test.js:383-403`). Listo
  cuando la brecha queda cubierta sin romper esas superficies.

- [x] **T2.13 — Consistencia del bloque de entorno.** Verificar que `.ancleto/machine-env.md` sigue
  propagándose a los 6 agentes con bash y que los guards de `machine environment block` siguen verdes, sin
  cambiar la propagación. Listo cuando la lista de 6 agentes y los guards no cambian.

## 3. Mirrors generados

- [x] **T3.1 — Regenerar con `ancleto upgrade`.** Regenerar `.opencode/agents/*` únicamente con
  `ancleto upgrade`, sin edición manual y sin usar `install` para este cierre. Listo cuando los mirrors
  reflejan los cambios de `agents/*.md`.

- [x] **T3.2 — Verificar las 10 líneas `model:`.** Comparar antes/después de la regeneración y confirmar
  que las 10 líneas `model:` de `.opencode/agents/*` no cambiaron (el tier se aplica con `install`, no con
  `upgrade`). Listo cuando las 10 coinciden con la línea base.

- [x] **T3.3 — Verificar el diff de mirrors.** Confirmar que el diff entre `.opencode/agents/*` y
  `agents/*.md` es sólo el bloque de compresión del mirror del orquestador
  (`## Compresión de contexto (tool del host)`). Listo cuando no hay otra deriva.

## 4. Backlog

- [x] **T4.1 — Tildar 1, 3 y 9 re-anclando por sección.** Marcar `[x]` los ítems 1, 3 y 9 de
  `## Detectado en auditoría de 9 sesiones` y reemplazar las citas obsoletas del orquestador por el nombre
  de la sección: `:140` → `## Delegation Contracts` / `### Artifacts Language`; `:154` →
  `## Project Memory Rules` / `## Team Memory`; `:273`, `:284` → `## Workflow` →
  `### Path A: Spec-Required Changes` y `### Handling subagent returns`. No tocar las citas que caigan en
  ítems fuera de alcance. Listo cuando los tres ítems están tildados y sus referencias ya no dependen de
  números de línea.

- [x] **T4.2 — Nota `Hecho (agent-delegation-contract)`.** Agregar bajo cada ítem tildado una nota breve
  con el change y los requirements/spec tocados, sin mencionar los ítems fuera de alcance como
  «relacionados». Listo cuando la nota remite al spec y no introduce alcance ajeno.

- [x] **T4.3 — Nota de evidencia en el ítem 18, sin tildarlo.** Agregar bajo el ítem 18 una nota fechada
  que registre la segunda instancia del mismo falso positivo que el ítem ya describe para `package.json`:
  el checker cuenta `.ancleto` como **área cambiada**, y `.ancleto` lo escribe el propio CLI — `init`,
  `install --project` y `upgrade` regeneran `.ancleto/machine-env.md` y `.ancleto/working-context.md` —,
  así que cada init/upgrade deja stale su propio seed. Evidencia: `ancleto discovery --check` devolvió
  `STALE` / `impact: minor` con `changedAreas: [".ancleto"]`,
  `affectedDocs: ["inventory.md","overview.md","setup.md","unknowns.md"]`, `materialReasons: []`,
  `missingDocs: []` y sin `SEED_ACTION_REQUIRED`; la deriva es posterior a una regeneración del mismo día,
  lo que confirma que el `.ancleto` escrito por el CLI re-marca el seed. **No** tocar el código del
  checker, **no** re-anclar el resto del ítem 18 y **no** tildarlo: sigue fuera del alcance del change y
  sólo suma evidencia. Listo cuando la nota está fechada, el ítem sigue `[ ]` y no hay cambios en
  `src/cli/index.js`.

## 5. Validación

- [x] **T5.1 — Lint.** Correr `npm run lint`. Listo cuando exit 0.

- [x] **T5.2 — Tests acotados.** Correr
  `node --test test/content-guards.test.js test/adapters-frontmatter.test.js test/cli.test.js`. Listo
  cuando exit 0.

- [x] **T5.3 — Suite completa.** Correr `npm test`. Listo cuando exit 0.

- [x] **T5.4 — Declarar omitidos.** Registrar Format `not-configured` y Typecheck «no aplica»; no inventar
  comandos. Listo cuando la omisión queda anotada en el resumen de cierre.

## 6. Cierre

- [x] **T6.1 — Verificar keywords y language.** Revisar que el delta spec use `### Requirement:`,
  `#### Scenario:`, `**WHEN**`/`**THEN**`/`**AND**` y `SHALL` en inglés literal, con contenido en español.
  Listo cuando no hay headings ni keywords traducidos.

- [ ] **T6.2 — Dogfood de definiciones.** Reiniciar la sesión para que el runtime recargue las
  definiciones de agente (se cachean al inicio) y verificar que el orquestador, el coder y el reviewer
  muestran el contrato nuevo. Listo cuando la sesión nueva opera con las definiciones regeneradas.

- [x] **T6.3 — Archive y commit.** Archivar sólo con aprobación explícita del usuario; el commit del
  archive lo hace `@coder` con las rutas archivadas nombradas por el orquestador. No ejecutar push sin
  autorización explícita. Listo cuando el commit usa Conventional Commits, no incluye archivos fuera del
  conjunto nombrado y no se ejecutó push.

> Archive 2026-10-26. T6.2 pendiente: requiere reinicio de sesión para recargar las definiciones.
