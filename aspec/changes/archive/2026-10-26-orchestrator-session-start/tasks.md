# Tasks: Intake de sesión, techo de lecturas acotado y recall accionable

Implementa `design.md` tal cual. Cada tarea es verificable por sí sola; sin volcado de código. Los keywords y los nombres de archivo quedan en inglés literal.

## 1. Fuente del orquestador — `agents/orchestrator.md`

- [x] **T1.1** Fusionar `:54`-`:58` en un único párrafo de `## Repository Reading Limit`: conservar el techo de tres archivos, la exención proactiva de `:56` y agregar la exención de archivos nombrados por el usuario con tope de 5 por mensaje y delegación por encima del tope. Listo cuando no queda una línea separada para la exención y siguen presentes `## Project Memory Rules`, `## Machine Environment` y `do NOT consume this ceiling`.
- [x] **T1.2** Reescribir el bullet absoluto de `### PROHIBITED ACTIONS` (`:90`) para hablar de archivo "un-directed" y reconciliar la exención y la delegación del sexto. Listo cuando ninguna formulación absoluta contradice la exención y el tramo conserva `## Project Memory Rules`, `## Machine Environment` y `do not consume the ceiling`.
- [x] **T1.3** Insertar `## Session Intake` entre `### MANDATORY STOPS` (`:100`) y `## Active Change Check` (`:102`), después de `## Lazy Repository Context Routing`. Debe contener el listado único de `aspec/changes/` sin `archive/`, el contrato de `git status --short` delegado a `@technical-discovery` (cwd raíz del repo, comando exacto, salida porcelain `XY path`, vacío = limpio, una vez por intake), el reporte sólo de diferencias, el silencio cuando el árbol está limpio y no hay change ajeno, y la prohibición de fetch de Work Item en el paso. Listo cuando la sección existe antes de `## Active Change Check`, no duplica el match de active change y nombra `git status --short`, `@technical-discovery` y la condición de silencio.
- [x] **T1.4** Ajustar una línea de `## Active Change Check` (`:104`) para consumir el listado producido por Session Intake en lugar de releer `aspec/changes/`. Listo cuando el check no lista el directorio por segunda vez ni repite la comparación.
- [x] **T1.5** Agregar en `## Team Memory`, bullet Recall (`:172`), el disparador de `<ContextOverflowWarning>`: un único Recall a `@memory-keeper` con el topic de la tarea antes de cualquier otra etapa, sin repetirlo por el mismo warning. Listo cuando `:170` queda intacto y el bullet menciona el warning, la unicidad y `@memory-keeper`.

## 2. Enabler read-only — `agents/technical-discovery.md`

- [x] **T2.1** Agregar `'git status --short': allow` bajo `'*': deny` en `permission.bash` (`:15-18`). Listo cuando el bloque conserva `'*': deny` y exactamente dos literales allow (`ancleto discovery --check`, `git status --short`).
- [x] **T2.2** Ajustar la cláusula "Do not execute any other command" (`:75`) para permitir sólo el comando de estado del árbol, una vez y desde la raíz del repo. Listo cuando la cláusula autoriza exactamente `git status --short` y sigue prohibiendo cualquier otro comando.

## 3. Texto del aviso — `src/core/memory/engine.js`

- [x] **T3.1** Reemplazar el literal de `:144` en una sola línea: conservar `<ContextOverflowWarning>`, `${omitted}` y el prefijo `Context truncated due to size limits. ${omitted} rules omitted.`, y sustituir sólo la oración final por la delegación de un Recall a `@memory-keeper` con el topic de la tarea. Listo cuando la línea no menciona `searchMemory` y sí `@memory-keeper`.
- [x] **T3.2** Revisar `:145` y cambiarlo sólo si repite la oración removida. Listo cuando queda registrada la decisión; si no la repite, el `console.warn` sigue igual.

## 4. Guards de contenido

- [x] **T4.1 (a)** En `test/content-guards.test.js`, guard del techo reconciliado. Listo cuando `## Repository Reading Limit` contiene la exención de archivos nombrados, el tope de cinco por mensaje, la delegación por encima del tope y la cota "merely mentioned"; `### PROHIBITED ACTIONS` contiene "un-directed" y ya no el absoluto `NEVER read a fourth repository file to answer a repository-context question`; siguen verdes los literales de `:722-739`.
- [x] **T4.2 (b)** En `test/content-guards.test.js`, guard del tope en el mismo párrafo del techo. Listo cuando el tramo afirma "five named files per user message" y la delegación del sexto.
- [x] **T4.3 (c)** En `test/content-guards.test.js`, guard del intake. Listo cuando `## Session Intake` existe antes de `## Active Change Check` y contiene `git status --short`, `@technical-discovery` y la condición de silencio.
- [x] **T4.4 (d)** En `test/memory-engine.test.js`, junto a `:530`, test ejecutable del aviso. Listo cuando el warning generado contiene `@memory-keeper` y `Recall`, no matchea `/searchMemory/` y sigue matcheando `/Context truncated due to size limits\. (\d+) rules omitted/`.
- [x] **T4.5** En `test/content-guards.test.js`, guard de la superficie de privilegio. Listo cuando `agents/technical-discovery.md` sigue con `'*': deny` y sólo los dos literales allow.
- [x] **T4.6** Marcar como `no-testeable-por-construcción`, en los guards correspondientes, el conteo real de archivos por mensaje, el silencio efectivo del intake y la unicidad del Recall por warning. Listo cuando cada propiedad no ejecutable tiene su marca explícita junto al guard que la ancla.

## 5. Mirrors generados

- [ ] **T5.1** Regenerar `.opencode/agents/orchestrator.md` y `.opencode/agents/technical-discovery.md` con el mecanismo existente (`ancleto upgrade` o `ancleto install`), sin edición manual. Listo cuando ambos mirrors reflejan los cambios y el mirror del orquestador conserva `## Compresión de contexto (tool del host)`.
- [x] **T5.2** Confirmar que `.ancleto/working-context.md:36` sólo cambia por regeneración (`ancleto upgrade` o `ancleto memory context --out`), nunca a mano. Listo cuando el texto viejo persiste hasta la regeneración y el archivo no aparece en un diff manual.

## 6. Verificación

- [x] **T6.1** Correr `npm run lint`. Listo cuando exit 0.
- [x] **T6.2** Correr acotado `node --test test/content-guards.test.js test/memory-engine.test.js`. Listo cuando exit 0.
- [x] **T6.3** Correr completo `npm test`. Listo cuando exit 0.
- [x] **T6.4** Registrar Format `not-configured` y Typecheck "no aplica"; no inventar comandos. Listo cuando la omisión queda anotada en el resumen.

## 7. Cierre

- [ ] **T7.1** Dogfood gate: `ancleto upgrade`, reiniciar sesión y volver a correr `ancleto memory context` para ver el texto nuevo del aviso. Listo cuando el aviso mostrado nombra `@memory-keeper` y no `searchMemory`.
- [ ] **T7.2** Mirror-sync check: `.opencode/agents/orchestrator.md` coincide con la fuente salvo la sección de compresión del host. Listo cuando la única diferencia es esa sección.
- [ ] **T7.3** Handoff git: commits y merge a `development` los hace un agente con git; sin push sin autorización explícita del usuario. Listo cuando el commit usa Conventional Commits y no se ejecutó push.
