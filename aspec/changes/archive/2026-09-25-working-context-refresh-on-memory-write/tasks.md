# Tasks: Refrescar el working-context tras escrituras de memoria por MCP

> Orden: (1) módulo core → (2) engine sin cambios → (3) consolidación CLI → (4) enganche MCP →
> (5) robustez → (6) tests → (7) validaciones.
> Las tareas de las secciones 1–5 son de implementación (`@coder`). La **sección 6 pertenece a
> `@tester`** y no debe ejecutarse como parte de la implementación. La sección 7 son las
> validaciones obligatorias del repo.

## 1. Módulo core `src/core/memory/working-context.js`

- [x] **1.1** Crear `src/core/memory/working-context.js` como módulo core del invariante
  "memoria activa → `working-context.md`" (render + persistencia del artefacto derivado).
  Ref: Design "Ubicación del invariante".
- [x] **1.2** Implementar `workingContextPath(projectRoot)` → `join(projectRoot, '.ancleto',
  'working-context.md')`.
  Ref: Requirement "Raíz de proyecto del refresh disparado por MCP" / Scenario "Topología y salida
  desde la raíz del proyecto".
- [x] **1.3** Implementar `writeWorkingContext(engine, projectRoot, scope = 'project')`: render
  desde el engine vivo con `engine.buildWorkingContext(scope, MAX_TOKENS, projectRoot)` (tercer
  argumento = raíz explícita, nunca un `cwd` implícito), `mkdir` recursivo y `writeFile` con
  `block + '\n'`, o `''` si el bloque es `null` (paridad con el refresh actual). Retorna el path
  escrito o `null`. Resolver el tope de tokens sin agregar métodos de escritura al engine.
  Ref: Design "Ubicación del invariante" / "Render desde el engine vivo".
- [x] **1.4** Implementar `shouldRefreshWorkingContext(result)` →
  `(result.node.type === 'rule' && result.node.scope === 'project') || result.superseded > 0`.
  Recibe el **resultado completo de `recordNode`** (`{ node, superseded }`), no solo el nodo: la
  supersesión es la segunda señal del disparador (la supersesión de `memory_key` es transversal a
  `type`/`scope`, así que puede retirar del bloque una `rule` de scope `project`).
  Ref: Requirement "Frescura del working-context tras escrituras MCP" / Scenarios "Una escritura
  cross-type/cross-scope que supersede una regla de proyecto refresca" y "Una escritura de decisión
  que no supersede no dispara refresh".
- [x] **1.5** Implementar `resolveMemoryProjectRoot(dbPath)`: candidato
  `dirname(dirname(dbPath))`; walk-up buscando el primer directorio con `.ancletorc`; si no lo
  encuentra, fallback al candidato derivado de `dbPath` mientras exista el layout `.ancleto/`;
  `null` si no puede determinar raíz (el refresh se omite, best-effort).
  Ref: Requirement "Raíz de proyecto del refresh disparado por MCP" / Design "Resolución de
  project-root vía `.ancletorc`" y "Fallback de raíz sin `.ancletorc` (decidido)".

## 2. Engine sin cambios

- [x] **2.1** Confirmar que `src/core/memory/engine.js` permanece como capa pura de DB + render:
  `buildWorkingContext` expone la raíz como tercer argumento y NO se agregan métodos de escritura
  ni dependencias de filesystem/rutas de proyecto al engine.
  Ref: Design "Ubicación del invariante".

## 3. Consolidación del refresh del CLI

- [x] **3.1** Refactorizar `refreshWorkingContext` (`src/cli/index.js:1418-1432`) para **delegar**
  el render + escritura en `writeWorkingContext`, preservando su semántica: chequeo de existencia
  de DB y sin escribir cuando el bloque es `null`.
  Ref: Requirement "Frescura del working-context tras escrituras MCP" / Scenario "Los lifecycle
  points siguen regenerando".
- [x] **3.2** Verificar que los lifecycle points (`init` `:1087`, `install --project` `:932`,
  `upgrade` `:996`, `memory context --out` `:1434`) no cambian de comportamiento.
  Ref: Scenario "Los lifecycle points siguen regenerando".

## 4. Enganche en la capa de handlers MCP

- [x] **4.1** En `createMemoryToolHandlers` (`src/core/memory/tools.js:64-70`): tras
  `engine.recordNode`, si `runtimeContext.projectRoot` está presente y
  `shouldRefreshWorkingContext(result)` es verdadero, llamar a
  `writeWorkingContext(engine, runtimeContext.projectRoot)` dentro de un `try/catch` aislado.
  Pasar a `shouldRefreshWorkingContext` el **resultado completo** `{ node, superseded }` de
  `recordNode` (no `result.node`), para que la condición de supersesión sea evaluable.
  Ref: Requirement "Frescura del working-context tras escrituras MCP" / Scenarios "Alta por MCP de
  una regla de proyecto refresca el working-context", "Supersesión por MCP de una regla de
  proyecto refresca el working-context" y "Una escritura cross-type/cross-scope que supersede una
  regla de proyecto refresca".
- [x] **4.2** Registrar cualquier error del refresh por `console.warn` (stderr), nunca por stdout
  (canal JSON-RPC del server).
  Ref: Design "Aviso de error seguro para el protocolo".
- [x] **4.3** En `createMemoryServer` (`src/core/memory/mcp-server.js:7-17`): resolver
  `projectRoot` **una sola vez** en la creación con `resolveMemoryProjectRoot(dbPath)` e
  inyectarlo en `createMemoryToolHandlers`; sin `projectRoot` el refresh es un no-op (opt-in).
  Ref: Requirement "Raíz de proyecto del refresh disparado por MCP".
- [x] **4.4** Preservar la compatibilidad de `createMemoryToolkit` (`tools.js:72-75`) y de los
  usos existentes de `createMemoryToolHandlers` sin `projectRoot` (los tests actuales no deben
  romperse).
  Ref: Design "Punto de enganche".

## 5. Robustez (implementación)

- [x] **5.1** Asegurar que el refresh ocurre después del commit de `recordNode` y que su fallo no
  se propaga al resultado de la tool: la escritura persiste y la tool devuelve el nodo.
  Ref: Requirement "Robustez del refresh del working-context" / Scenario "Falla del refresh no
  pierde la escritura".
- [x] **5.2** Confirmar que ninguna ruta del refresh llama a `recordNode` ni a un handler MCP, y
  que `working-context.md` no es `memory.db`: sin recursión.
  Ref: Scenario "Sin recursión ni corrupción".
- [x] **5.3** Reutilizar el engine vivo del server (una sola conexión) para el render, sin abrir
  una segunda conexión al WAL: sin deadlock.
  Ref: Design "Sin deadlock".
- [x] **5.4** Garantizar render sin timestamps (solo reglas activas + topología) para que dos
  refreshes sin escrituras intermedias produzcan bytes idénticos.
  Ref: Scenario "Refresh repetido es idempotente".
- [x] **5.5** No optimizar el trigger para evitar el **over-refresh**: un par `decision -> decision`
  (o `rule feature -> rule feature`) con la misma `memory_key` dispara refresh aunque el bloque no
  cambie. Es **intencional y aceptado** —consecuencia de la forma actual del motor (`recordNode`
  solo expone `{ node, superseded }` y `findActive` descarta `type`/`scope` del nodo retirado;
  `engine.js:82`, `:183-186`) y del único consumidor (una lectura por sesión)—; **no** es un bug
  pendiente. Ref: Design "Over-refresh: consecuencia intencional, no bug pendiente".
- [x] **5.6** No implementar la **Opción 2** (refresh selectivo exponiendo el nodo superseded desde
  el motor): queda **diferida como mejora futura**, fuera del alcance de este change.
  Ref: Design "Alternativas consideradas" (D).

## 6. Tests — propiedad de `@tester`

> **Esta sección la ejecuta `@tester`, no `@coder`.** Patrón existente: `test/memory-engine.test.js`
> (`node:test`, `mkdtempSync`, DB temporal).

- [x] **6.1** Unit de `shouldRefreshWorkingContext(result)` — tabla de verdad:
  `rule`+`project` → `true` (aunque `superseded = 0`); `decision`+`project` y `rule`+`feature`/`task`
  con `superseded = 0` → `false`; **cualquier** nodo (incl. `decision` y `rule` de scope
  `feature`/`task`) con `superseded > 0` → `true`.
  Ref: Requirement "Frescura del working-context tras escrituras MCP".
- [x] **6.2** Unit de `resolveMemoryProjectRoot` — (a) con `.ancletorc` en la raíz; (b) con DB
  anidada; (c) sin `.ancletorc` → fallback derivado de `dbPath`; (d) sin layout `.ancleto/` →
  omitir (`null`).
  Ref: Requirement "Raíz de proyecto del refresh disparado por MCP".
- [x] **6.3** Integración trigger positivo — `recordRule` scope `project` vía handler actualiza
  `working-context.md` con la regla nueva.
  Ref: Scenario "Alta por MCP de una regla de proyecto refresca el working-context".
- [x] **6.4** Integración trigger negativo — `recordDecision` scope `project` y `recordRule` scope
  `feature`/`task` **que NO superseden** (`superseded = 0`) **no** modifican el contenido del
  archivo.
  Ref: Scenarios "Una escritura de decisión que no supersede no dispara refresh" y "Una regla de
  scope no proyectado que no supersede no dispara refresh".
- [x] **6.5** Integración supersesión — un segundo `recordRule` de la misma `memory_key` deja en
  el archivo el contenido nuevo y no el previo.
  Ref: Scenario "Supersesión por MCP de una regla de proyecto refresca el working-context".
- [x] **6.6** Robustez — forzando el fallo del refresh (p. ej. escritura no permitida), el handler
  devuelve el nodo, la DB lo contiene y el archivo conserva su contenido previo.
  Ref: Scenario "Falla del refresh no pierde la escritura".
- [x] **6.7** Idempotencia — dos refreshes sin escrituras intermedias → archivo byte-idéntico.
  Cubre asimismo el **over-refresh intencional**: un par `decision -> decision` (o
  `rule feature -> rule feature`) con la misma `memory_key` dispara refresh pero reescribe bytes
  idénticos (el conjunto activo del bloque no cambió).
  Ref: Scenario "Refresh repetido es idempotente" / Design "Over-refresh".
- [x] **6.8** Raíz vs `cwd` — con `.discovery-map.json` sembrado en la raíz y el server resuelto
  desde otra raíz de DB, `<ProjectTopology>` refleja el mapa de la raíz detectada por `.ancletorc`.
  Ref: Scenario "Topología y salida desde la raíz del proyecto".
- [x] **6.9** Sin recursión ni corrupción — el proceso no recursa ni queda en deadlock y
  `.ancleto/memory.db` permanece íntegra (índice FTS5 consistente).
  Ref: Scenario "Sin recursión ni corrupción".
- [x] **6.10** Integración trigger positivo por **supersesión cross-type/cross-scope** — un
  `recordDecision` (o un `recordRule` de scope `feature`/`task`) con la misma `memory_key` que una
  `rule` de scope `project` existente sí dispara refresh, y el archivo refleja la **retirada** de
  esa rule previa (`superseded = 1`), aunque el nodo entrante no sea `rule`+`project`.
  Ref: Scenario "Una escritura cross-type/cross-scope que supersede una regla de proyecto
  refresca".

## 7. Validaciones obligatorias del repo

- [ ] **7.1** `npx tsc --noEmit` (typecheck).
- [ ] **7.2** `npm run lint`.
- [ ] **7.3** `npm test`.
