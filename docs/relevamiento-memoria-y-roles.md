# Relevamiento: memoria, roles y uso real del framework

> **Documento interno.** No se publica en npm (`docs/` queda fuera del campo `files` del paquete).
> **Fecha:** 2026-09-22 · **Versión auditada:** `0.6.16` (tag `v0.6.16`)
> **Origen:** auditoría read-only del framework + retrospectiva de un agente (`@orchestrator`) sobre un proyecto real (App Coffice) + las **19 preguntas de auditoría respondidas con evidencia cruda** por ese agente.
>
> **Estado:** cruzado y verificado contra el código. Los veredictos de §3 incluyen ahora el resultado del cruce.
> **Trabajo derivado:** épica [#9 Memory & Roles hardening](https://github.com/damianarganaras/spec/issues/9) con los fixes F1–F12 como sub-issues en el [Project](https://github.com/users/damianarganaras/projects/1).

---

## 0. Resultado del cruce (qué confirmó y qué corrigió la evidencia)

### Confirmado con evidencia cruda del agente

| Hallazgo | Evidencia que lo confirma |
|---|---|
| `working-context.md` ausente → reglas nunca inyectadas | `.ancleto/` contiene solo `memory.db`, `-shm`, `-wal`. Inyectadas en la sesión: **0** de 10 |
| `searchMemory` **existe y funciona** (no era el WAL) | `searchMemory("maskable")` → 4 resultados con keys reales |
| **pero es AND léxico, no semántico** | `maskable`=4, `maskable pwa`=3, `como instalar la pwa en el celular`=`[]`, `autenticacion jwt`=`[]` |
| Guarda de roles **no forzada** | Escribieron memoria `@memory-keeper` **y** `@spec-writer` (y otros) |
| Seed **STALE** | `ancleto discovery --check` → `state: STALE`, `recommendedAction: regenerate` |
| `AGENTS.md`/`PRODUCT.md` ausentes | glob + búsqueda recursiva → ninguno; 0 bloques `LOCKED` |
| Tier `minimo` **huérfano** | `.opencode/.ancleto-tier` = `minimo`, pero **no existe `.opencode/agents/`**; los 10 agentes globales están todos en `deepseek-v4.1-flash` |
| Keywords de spec **inconsistentes** | `pwa-instalable/spec.md` en inglés literal; `reset-order/spec.md` traducido (`RF1` / `Dado`-`Cuando`-`Entonces`, 0 matches de `Requirement|Scenario|WHEN|THEN|SHALL`) |
| `@coder` sin shell | `agents/coder.md:11` → `bash: false`; el agente reportó 5 veces que no podía buildear |
| Tareas pendientes quedaron explícitas | Change PWA archivado con **7/11** (tareas 6, 7, 8, 11 = verificación en dispositivo real) |

### BUGS NUEVOS encontrados por la evidencia (verificados en el código)

| # | Bug | Evidencia en el código | Gravedad |
|---|---|---|---|
| **B1** | **`ancleto discovery --check` muta el filesystem.** El reporte dice "read-only" pero el handler llama a `writeDiscoveryMap` **antes** del check | `src/cli/index.js:747` → `try { writeDiscoveryMap(process.cwd()) } catch {}` dentro de `discovery()`, que corre para `--check` también. El agente observó `.discovery-map.json` cambiando de 506 → 525 B con `--check` | Media |
| **B2** | **`memory context --out` puede fallar por directorio inexistente.** `install --project` corre `copyTemplates` (que crea `.opencode/`) pero **no crea `.ancleto/`**; `init` tampoco | `writeFile(resolve(out), ...)` en `memoryContext` sin `mkdir` previo; `initProject` no crea `.ancleto/` (`src/cli/index.js:548-554`) | Media |
| **B3** | **`init` no instala los templates.** `AGENTS.md`/`PRODUCT.md` solo los copia `install --project` (`copyTemplates`), no `init` | `initProject` (`:525-557`) llama `scaffoldAspec` pero **no** `copyTemplates`; las dos llamadas a `copyTemplates` están en `install` (`:441`) y `upgrade` (`:500`) | Media |

> **Matiz importante:** el README dice "init crea .ancletorc, plantillas AGENTS.md y PRODUCT.md". El planteo correcto es: **`init` define la configuración del repo; los templates y assets los pone `install --project`**. La secuencia prevista es `init` → `install --project`. El agente solo corrió `install` global, por eso no tiene templates locales.
>
> **Corrección a mi hipótesis previa:** asumí que el "motor no disponible" podía ser el MCP no cargado por arrancar la sesión antes del install. La evidencia lo **descarta**: las tools estaban **presentes y funcionando**. El Recall inicial devolvió vacío porque **el MCP no conocía el proyecto** (arrancó desde `cwd`, que en el primer momento no era el repo, o la DB estaba recién creada). El WAL **no** fue la causa.

### Descartado / no es del framework (ratificado)

| # | Hallazgo | Estado |
|---|---|---|
| 4 | `aspec/` gitignoreado | **Decisión del proyecto**, no del framework (no tocamos `.gitignore`). El agente lo confirma: `.gitignore` ignora `/aspec`, `/openspec`, `/.ancleto`, `/.ancletorc`, `/.opencode`, `dist` |
| 8 | Repo del CLI ≠ workspace | Setup del usuario |
| 10 | Overhead de compresión/`retrieve` | Viene del MCP caveman del usuario (no hay instrucción nuestra) |

---

## 1. Cómo funciona hoy la memoria (estado verificado en el código)

No hay bases vectoriales: **SQLite nativo (`node:sqlite`) con FTS5 + BM25**, en `.ancleto/memory.db`. Tres piezas comparten el mismo archivo:

| Pieza | Qué hace | Dónde |
|---|---|---|
| **Almacenamiento** | Nodos `rule` / `decision` con `scope` (`project`/`feature`/`task`), supersesión atómica por `memory_key` (índice único parcial sobre activas) | `src/core/memory/database.js`, `src/core/memory/engine.js` |
| **Tools del LLM** | Servidor MCP stdio zero-deps que expone `searchMemory`, `recordRule`, `recordDecision` | `src/core/memory/mcp-server.js` (subcomando `ancleto mcp`) |
| **CLI** | `ancleto memory context [--scope X] [--out file]` materializa `<ProjectMemoryRules>`; `ancleto memory doctor` verifica integridad FTS5 y unicidad | `src/cli/index.js` |

Flujo previsto:

```
recordRule / recordDecision ─► MCP (ancleto mcp) ─► .ancleto/memory.db (SQLite+FTS5)
                                                          │
                       ancleto memory context --out ─► <ProjectMemoryRules> ─► el agente lo lee
searchMemory ◄─ MCP ◄─────────────────────────────────────┘
```

Notas verificadas:

- El bloque de contexto incluye **solo reglas** (`type = 'rule'`) y, por defecto, **solo scope `project`** (`SCOPE_HIERARCHY` en `engine.js`). Las `decision` se consultan a demanda con `searchMemory`.
- `openDatabase` fija `journal_mode = WAL` (`database.js:44`). **No hay ningún checkpoint** en el código: con una conexión abierta (el MCP de la sesión), las escrituras viven en el `-wal` y el `.db` queda chico.
- El MCP no conoce la identidad del llamador: todas las escrituras quedan con `source: 'mcp:ancleto-memory'`.

---

## 2. Cómo lo usó realmente un agente (retrospectiva de campo)

### Funcionó bien (según el agente, con evidencia)

- **Verificación cruzada entre roles**: el defecto raíz del PWA (íconos PNG corruptos) lo encontró `@tester` con evidencia dura (Pillow + inflate), no el orquestador "a ojo". Lo mismo la violación de zona segura del `maskable` (reviewer → medición).
- **Separación de artifacts** (proposal / design / tasks / delta-spec): hizo explícito el alcance y **frenó scope creep**; el coder reportó "no toqué nada fuera del contrato" y aparecieron desajustes spec↔código.
- **Archive** dejó fuente-de-verdad en `aspec/specs/…` y la memoria acumuló decisiones reutilizables (10 nodos activos).
- **Fase 1 bloqueante** (verificar causa raíz antes de configurar) evitó parchear a ciegas.

### Las 10 desconexiones que reportó

| # | Desconexión | Impacto que le asignó |
|---|---|---|
| 1 | Inyección de reglas OFF toda la sesión (`.ancleto/working-context.md` no existe) | Alto |
| 2 | "Motor de memoria frágil / intermitente" (Recall vacío → Record "motor no disponible" → después funcionó) | Alto |
| 3 | `@coder` sin shell: no puede correr `npm run build` ni generar assets | Alto |
| 4 | `aspec/` gitignoreado en el proyecto → la fuente-de-verdad no viaja en git | Alto |
| 5 | El technical seed se desactualiza solo; nadie lo regenera | Medio |
| 6 | La guarda de roles no se cumple técnicamente (`@spec-writer` escribió memoria) | Medio |
| 7 | Dos memorias sin puente (engram vs ancleto-memory) | Medio |
| 8 | El repo del CLI ≠ workspace de la sesión | Medio |
| 9 | Legacy `openspec` convive con `aspec` (`.gitignore` con ambos; `config.yaml` dice "OpenSpec") | Bajo/Medio |
| 10 | Costo de retrieval por compresión de outputs de subagentes | Medio |

---

## 3. Veredicto: qué es real, qué está mal diagnosticado y qué no es del framework

| # | Hallazgo | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Inyección de reglas OFF | ✅ **Real — el más importante** | `agents/orchestrator.md:135-145`: el orquestador **lee** el archivo si existe, tiene `bash: false` y dice explícitamente *"do not generate it yourself"*. `install`, `upgrade` y ninguna skill lo crean. El único lugar que menciona el comando es esa nota |
| 2 | "DB vacía / WAL" como causa del motor intermitente | ❌ **Descartado por evidencia** | Las tools estaban **presentes y funcionando** (`searchMemory("maskable")` → 4 resultados). La DB **no** está vacía: el `-wal` tiene los datos y SQLite los lee. El Recall inicial vacío se explica porque **el MCP no conocía el proyecto** (arrancó con otro `cwd` / DB recién creada), no por el WAL. **Riesgo residual real:** si el proceso muere con SIGKILL o se copia solo el `.db`, se pierde todo (sin checkpoint, `database.js:44`) |
| 3 | `@coder` sin shell | ✅ **Real y por diseño** | `agents/coder.md:11` → `bash: false`. Es separación de roles (coder escribe, tester verifica), pero en cambios chicos con build/assets es fricción pura |
| 4 | `aspec/` gitignoreado | ✅ Real, **no es del framework** | `git grep gitignore -- src` → vacío: **nunca tocamos `.gitignore`**. Lo agregó el proyecto (junto con `openspec`). Es una **decisión del repo**, no un bug |
| 5 | Seed desactualizado en silencio | ✅ **Real** | Existe `ancleto discovery --check` (STALE) y la regeneración está gated por aprobación del usuario (`orchestrator.md:62-75`), pero **nada ata el chequeo al cierre/archive** |
| 6 | Guarda de roles no exigible | ✅ Real, **no exigible con la arquitectura actual** | El MCP es único y no recibe identidad del agente: todas las escrituras quedan con `source: 'mcp:ancleto-memory'`. Escribir memoria es honor-system |
| 7 | Dos memorias sin puente | ✅ **Real** | Ningún archivo define la frontera engram (memoria del agente) vs ancleto-memory (memoria del repo) |
| 8 | Repo del CLI ≠ workspace | ➖ No es del framework | Configuración de la sesión |
| 9 | Legacy `openspec` | ⚠️ **Parcial** | El comentario `config.yaml` → `# OpenSpec project configuration` **sí es nuestro** (`DEFAULT_ASPEC_CONFIG`, se dejó a pedido). El directorio `openspec/` residual queda porque `upgrade` no migra si ya existe `aspec/` (decisión explícita para no pisar) |
| 10 | Overhead de compresión / `retrieve` | ➖ **No es del framework** | En `agents/`, `skills/`, `templates/`, `commands/` no hay ninguna instrucción sobre el MCP caveman (el único `--compress` es el de Repomix en `ancleto-technical-discovery`). Viene del setup global de caveman del usuario |

---

## 4. Gaps confirmados del framework (a atacar)

| # | Gap | Detalle | Estado del cruce |
|---|---|---|---|
| **G1** | La inyección proactiva no ocurre nunca sola | Nadie genera `.ancleto/working-context.md`; el orquestador no puede (sin shell) y no debe (regla explícita). El README, además, **promete** que los bloques se inyectan "desde el día cero", lo que hoy no se cumple sin correr el comando a mano | ✅ Confirmado (0 inyectadas de 10) |
| **G2** | Inspección de memoria: frágil y sin modo lectura | No hay comando read-only (`memory context` abre en modo escritura y hace checkpoint), no hay listado, y el WAL sin checkpoint complica backups | ✅ Confirmado |
| **G3** | `@coder` no puede verificar sus builds | Fricción estructural reportada como la número uno (5 intentos del agente) | ✅ Confirmado |
| **G4** | Sin regla de precedencia engram ↔ ancleto-memory | Riesgo de duplicación y ambigüedad | ✅ Confirmado (ambas memorias cargadas) |
| **G5** | El seed envejece sin aviso | El chequeo existe pero no está atado al cierre; hoy **STALE** | ✅ Confirmado |
| **G6** | `aspec/` (fuente-de-verdad) sin recomendación de versionado | `.gitignore` no lo gestiona el framework, pero tampoco hay guía | ✅ Confirmado (el proyecto lo ignora) |
| **G7** | `config.yaml` con comentario "OpenSpec" | Cosmético pero confunde | — |
| **G8** (nuevo) | **`searchMemory` es AND léxico**: consultas en lenguaje natural devuelven `[]` | `ftsQuery` une todos los términos con AND (`engine.js:17-20`). El contrato de `@memory-keeper` ya dice "escribí queries como prosa", lo que **empeora** el resultado | ✅ Medido: `como instalar la pwa en el celular` → `[]` |
| **G9** (nuevo) | **`discovery --check` no es read-only** (B1) | `writeDiscoveryMap` corre antes del check | ✅ Observado el archivo mutando |
| **G10** (nuevo) | **Faltan templates en proyectos instalados por vía global** (B3): el orquestador asume `AGENTS.md` | `init` no copia templates; solo `install --project` | ✅ Confirmado (sin `AGENTS.md`/`PRODUCT.md`) |
| **G11** (nuevo) | **Tier huérfano**: se escribe `.opencode/.ancleto-tier` pero los agentes son globales | El tier local no aplica a los agentes globales | ✅ Confirmado |
| **G12** (nuevo) | **Keywords de spec inconsistentes** entre capacidades del mismo repo | La regla de inglés está en `spec-writer`, pero un `direct`/otro camino produjo specs traducidos | ✅ Confirmado (mixto) |

---

## 5. Plan de fixes propuesto (pendiente de decisión)

| Fix | Qué haría | Decisión pendiente |
|---|---|---|
| **F1** (alto) | `install`/`upgrade` generan `.ancleto/working-context.md` (creando `.ancleto/` con `mkdir`); `ancleto memory context` queda para refrescar. Corregir el README | ¿Auto-generar o dejar manual y solo documentar? |
| **F2** (alto) | `memory doctor` hace `wal_checkpoint(TRUNCATE)`; el MCP checkpointea al cerrar; nuevo `ancleto memory list [--type rule\|decision] [--scope X] [--json]` **read-only** | ¿Confirmado? |
| **F3** (alto) | Rol del `@coder`: (a) `bash` acotado a build/test (precedente: `documenter`), (b) mantener `false` y dar el build explícito al tester, (c) unificar coder+tester en cambios chicos | **Elección del usuario** |
| **F4** (medio) | Frontera engram ↔ ancleto-memory en `templates/AGENTS.md` | ¿Se escribe? |
| **F5** (medio) | Al archivar/verificar, chequear frescura del seed y ofrecer regenerar | ¿Se agrega al flujo de `archive`? |
| **F6** (bajo) | Cambiar el comentario del `config.yaml` emitido ("OpenSpec" → aspec) | ¿Se cambia? |
| **F7** (doc) | Guía de `.gitignore`: `aspec/` versionado (fuente-de-verdad), `.ancleto/` local | ¿Se documenta? |
| **F8** (medio, nuevo) | **`discovery --check` verdaderamente read-only**: mover `writeDiscoveryMap` a la ruta de pack, no a `--check` | ¿Se corrige? |
| **F9** (medio, nuevo) | **`searchMemory` tolerante**: usar `OR` como fallback cuando el `AND` devuelve 0, o `NEAR`/prefijos; ajustar el contrato de `@memory-keeper` (que hoy pide prosa, agravando el problema) | ¿Se cambia la semántica? |
| **F10** (medio, nuevo) | **`init` también deja los templates** (o el README/HELP explica `init` + `install --project`), y aclarar cuándo hace falta `AS` local | ¿Se cambia `init` o solo la doc? |
| **F11** (bajo, nuevo) | **Tier huérfano**: avisar si hay `.ancleto-tier` sin agentes locales donde aplicarlo | ¿Se agrega warning en `check`? |
| **F12** (bajo, nuevo) | **Guard en `spec-writer`/`verify`**: verificar keywords en inglés al cerrar (¿un check de contenido?) | ¿Vale el esfuerzo? |


---

## 6. Preguntas de auditoría enviadas al agente (para cruzar evidencia)

Se agruparon así; la clave es pedir **output crudo**, no resúmenes.

**Memoria (lo más importante)**

1. Listar las tools de memoria disponibles y de qué MCP vienen → si no aparecen `searchMemory`/`recordRule`/`recordDecision`, el MCP no se cargó en esa sesión (reiniciar IDE tras `install`).
2. Hacer una llamada real a `searchMemory` y pegar el output → distingue "existe" de "funciona".
3. ¿Existe `.ancleto/working-context.md`? ¿Por qué no? → confirma/descarta **G1**.
4. ¿Qué reglas y decisiones hay en `memory.db` (con scope) y cuáles se inyectaron en la sesión? → separa *guardado* de *inyectado*.
5. ¿Se llamó a `searchMemory` durante la sesión? ¿Con qué query y qué devolvió?
6. ¿Qué se grabó y con qué `justification`? ¿Algo supersedió a algo?
7. ¿Qué dice `ancleto memory doctor`? → integridad FTS5 y unicidad.

**Ciclo SDD**

8. ¿Qué skills se invocaron y por qué (routing)?
9. ¿Qué hay en `aspec/changes/`? Artefactos y estado de checkboxes.
10. ¿Los specs usan keywords en inglés (`Requirement`/`Scenario`/`WHEN`/`THEN`) o se tradujeron?
11. ¿Se corrió `verify` antes de cerrar? ¿Se archivó? ¿Quedó algo sin archivar?
12. ¿Qué clasificación de triage se aplicó y por qué?

**Contexto técnico e integridad**

13. ¿Existe `.discovery-map.json` y el seed? ¿Qué dice `ancleto discovery --check` (READY/STALE)? → **G5**.
14. ¿Qué tier en `.ancleto-tier` y qué modelo quedó en cada `.opencode/agents/*.md`?
15. Correr `ancleto check` y `ancleto doctor` y pegar el output.
16. ¿Los bloques `LOCKED` de `AGENTS.md`/`PRODUCT.md` están intactos y las secciones `EXTENSIBLE` preservadas?
17. ¿Qué archivos se crearon/modificaron en la sesión? (contrastar con `git status`)

**Anti-confabulación**

18. Para cada afirmación técnica: path y línea, o output del comando que la respalda.
19. ¿Qué parte de la respuesta es observación y qué parte es inferencia?

### Qué confirma o descarta cada respuesta crítica

| Respuesta esperada | Qué concluye |
|---|---|
| `searchMemory` **no** aparece en su lista de tools | Confirma que el "motor no disponible" fue por **MCP no cargado** (no por el WAL) → hallazgo #2 mal diagnosticado |
| Texto exacto del error "motor no disponible" | Distingue entre tool ausente, error de la tool, o DB inaccesible |
| `.ancleto/working-context.md` ausente | Confirma **G1** (ya confirmado por código) |
| `discovery --check` = STALE | Confirma **G5** (seed envejecido) |

---

## 7. Cruce #2: matriz real de permisos (contrato vs frontmatter)

Segunda consulta al orquestador: se le pidio la lista de agentes con responsabilidades y **permisos** ("cuales tienen bash"), y respondio con el **contrato en prosa**. Se contrasto contra el `frontmatter` real de cada `agents/*.md` de este repo.

### Matriz verificada

| Agente | Contrato que declaro el agente | `frontmatter` real del repo | Coincide |
|---|---|---|---|
| orchestrator | No implementa, no usa bash | `read:true write:false edit:false bash:false` | ✅ |
| **coder** | "puede usar herramientas para implementar **y validar**" | **`read:true write:true edit:true bash:false`** | ❌ **no puede ejecutar nada** |
| tester | Corre tests, format-check y lint | `write:true edit:true bash:true` (`'*':allow`, `'*az *':deny`) | ✅ |
| reviewer | Solo lectura/analisis | `read:true write:false edit:false bash:false` | ✅ |
| documenter | Escribe solo documentacion/archivo | `write:true edit:true bash:true` (allow salvo `az`) | ✅ |
| context-resolver | Solo lectura de la tarjeta | `bash:true` pero `'*':deny` + 1 grep en allowlist | ✅ |
| technical-discovery | Solo lectura + estado del seed | `bash:true` pero `'*':deny` + `'ancleto discovery --check':allow` | ✅ |
| technical-seed-writer | Escribe solo el seed | `write:true edit:true bash:true` | ✅ |
| spec-writer | Escribe solo artefactos de change | `write:true bash:false` | ✅ |
| memory-keeper | Unico que toca memoria | `write:false edit:false` + `searchMemory`/`recordRule`/`recordDecision` | ✅ |

### El hallazgo central

**El contrato del agente dice que `@coder` implementa y valida, pero su `frontmatter` no le da shell.** Es la misma friccion #1 que reporto en App Coffice ("no puedo correr `npm run build`", 5 veces). Ademas:

- El agente **no sabe** que esta limitado: describe el contrato, no su propia configuracion. Si le preguntas "¿podes buildear?", responde que si — hasta que lo intenta.
- **Repomix no consume nada por defecto**: esta solo como herramienta on-demand de `ancleto discovery` (via `npx`). No es dependencia ni pesa en el contexto. Confirmado: no aparece en `agents/`/`skills/`/`templates/`.

### Implicancia

`coder` sin shell es un **problema doble**: (a) no puede verificar su propio trabajo, (b) empuja el build/assets a un agente fuera de rol. Es el issue **#13**, y este cruce lo confirma con evidencia independiente (dos entornos distintos, misma limitacion).

### Preguntas de auditoria #2 enviadas (para cuando responda)

1. `tools:`/`permission:` **literal** de cada agente (no la descripcion).
2. ¿`@coder` puede ejecutar comandos? ¿Que error exacto da en un build?
3. ¿Quien genera los artefactos de build si el coder no puede?
4. ¿Se puede convencer al orquestador de implementar directo (resistencia del guardrail)?
5. Cuando `reviewer` marca CRITICAL, ¿frena o sigue? Caso concreto.
6. En el checkpoint de `direct-implementation`, ¿espera o asume "si" por silencio?
7. `searchMemory` en lenguaje natural: ¿funciona o solo terminos exactos?
8. `.ancleto/working-context.md`: ¿existe? ¿quien lo genera y cuando?
9. Cuando el Recall vuelve vacio, ¿explica por que o sigue?
10. Contexto inicial del repo: ¿cuantos tokens y con que tope?
11. ¿Detecta el seed STALE y lo regenera, o usa info vieja?
12. ¿Quien decide leer archivo entero vs fragmento? ¿Limite de archivos?
13. Si `@spec-writer` escribe memoria, ¿esta bloqueado tecnicamente o es honor-system?
14. Si encuentra un bug del sistema, ¿lo arregla o escala?
15. Los specs, ¿salen con keywords en ingles (`Requirement`, `WHEN`, `THEN`)?

---

## 8. Cruce #3: respuestas de auditoria del entorno del trabajo

El orquestador del trabajo respondio las 15 preguntas. Lo mas valioso: **se auto-limito a lo verificable** ("no voy a inventar los permisos restantes", "no pude confirmar ni refutar") — un comportamiento sano que vale registrar. Resumen y contraste con nosotros:

### Respuestas claves

| # | Pregunta | Su respuesta | Contraste con nuestro repo |
|---|---|---|---|
| 1 | Frontmatter literal | Solo pudo abrir `orchestrator` y `coder`; ambos con `bash: false`. Los otros 8 **no auditados**. | Nosotros tenemos el frontmatter de los 10 y **ya corregimos el coder** (#13) |
| 2 | ¿`@coder` ejecuta comandos? | **No** — `bash: false`, y el contrato dice "You do not have Bash". No probo el build (no quiso pedir una accion que no puede) | **Igual que era el nuestro antes de #13**. Ahora si puede |
| 3 | ¿Quien genera bundles/assets? | **Nadie definido**. Coder no ejecuta; tester es el candidato; CI/CD "no verificado" | Lo mismo. Con #13 el coder ya puede buildear; el tester valida |
| 4 | ¿Se persuade al orchestrator? | No: `write/edit/bash: false` + prohibicion contractual. **Sin prueba adversarial** | Nosotros: mismo `write/edit/bash: false`; tampoco testeado adversarialmente |
| 5 | `reviewer` CRITICAL → ¿frena? | Contrato dice MUST STOP; **caso esperado, no ejecucion historica** | Nosotros: misma regla contractual |
| 6 | Checkpoint direct-implementation | Contrato inequivoco: espera respuesta explicita, no asume silencio. Sin evidencia de violacion | Idem nuestro |
| 7 | `searchMemory` natural language | Distingue **engram** (FTS5, modo all/any) de **mem0 recall** (semantico pero puede dar 0 por umbral). **Sin garantia de recall por parafrasis** | Nosotros medimos lo mismo: `como instalar la pwa...` → 0. Ver #14 |
| 8 | `.ancleto/working-context.md` | **No existe y nadie lo genera** ("el contexto se resuelve con OpenSpec, seed y memoria") | **Nuestro gap G1**, ya arreglado en #10 (`init`/`install`/`upgrade` lo materializan) |
| 9 | Recall vacio | Reporta "no relevant memories" y sigue; **no diagnostica el por que** | Nosotros: idem. Mejorable |
| 10 | Contexto, tokens, tope | Carga on-demand; **tope de 3 archivos**; sin presupuesto de tokens declarado | Nosotros: mismo tope de 3 archivos |
| 11 | Seed STALE | Usa con advertencia y **ofrece** regenerar (gated por aprobacion); nunca automatico | Nosotros: mismo diseno. Gap G5 = falta atarlo al archive (#17) |
| 12 | Archivo entero vs fragmento | Sin politica universal; depende de la herramienta/pregunta. Tope: 3 archivos | Idem |
| 13 | ¿`spec-writer` escribe memoria? | **No auditado** (no abrio su frontmatter). Contrato: solo `memory-keeper`; posible honor-system | **Nuestro: `spec-writer` NO tiene tools de memoria** (`write:true`, sin `searchMemory`/`recordRule`/`recordDecision`) → enforcement real, no honor-system |
| 14 | Bug del sistema | No lo arregla: clasifica, pide aclaracion/aprobacion, delega a coder | Idem |
| 15 | Keywords de specs | **No verificado** por el limite de lectura; no puede confirmar ni refutar | Nosotros medimos inconsistencia real (issue #21) |

### Lo que este cruce nos ensena

1. **Su entorno tiene exactamente los mismos dos problemas que el nuestro** (coder sin bash, working-context ausente). No son bugs nuestros: son del diseno compartido. **Ya los resolvimos en #13 y #10.**
2. **Nuestro enforcement de memoria es mas fuerte que el suyo**: su `spec-writer` podria tener las tools de memoria (no auditado, posible honor-system); **el nuestro no las tiene declaradas** — no puede escribir memoria ni queriendo.
3. **`mem0` (litellm) aparece en su configuracion** (`litellm_mem0-recall`/`litellm_mem0-remember`, ambos `false` en orchestrator/coder). Nosotros no usamos mem0: nuestro motor es SQLite propio. Es un tercer sistema de memoria en su stack.
4. **Su honestidad de alcance** ("no voy a inventar", "no pude confirmar ni refutar") es el comportamiento correcto: un agente que reporta el limite en vez de rellenar con inferencia. Vale como criterio.

---

## 9. Cruce #4: puntos de dolor propios (builds, contexto, idioma, output, guardrails)

Tercera consulta al orquestador, sobre **los dolores que ya medimos nosotros**. Su respuesta fue consistentemente honesta ("no verificado", "no comprobado"). Lo mas valioso: **casi todos los huecos que el reporta, nosotros ya los tenemos cerrados o especificados** — y aparecieron **3 dolores nuevos a revisar en nuestro repo**.

### Comparacion por foco

| Foco | El (entorno del trabajo) | Nosotros | Veredicto |
|---|---|---|---|
| **Builds/assets** | **No definido**. Coder sin bash; tester "candidato", CI no verificado | **Resuelto en #13**: el coder buildea y valida con bash acotado; el tester sigue haciendo la validacion formal | ✅ **Vamos adelante** |
| **Recall vacio** | Solo "no relevant memories"; no explica el por que | Igual (gap reconocido) | ⚠️ Pendiente chico |
| **Busqueda por parafrasis** | Engram (FTS5) no garantiza; mem0 puede dar 0 | Medido: mismo problema (#14) | ⚠️ Pendiente |
| **Dedup de memorias** | **No hay politica** engram vs mem0; tension contractual | **Una sola memoria** (SQLite) + **supersesion atomica por `memory_key`** | ✅ **Mejor diseno** |
| **working-context ausente** | No existe y el orquestador no avisa | **Arreglado en #10**: se materializa en `init`/`install`/`upgrade` | ✅ **Vamos adelante** |
| **Quien crea AGENTS/PRODUCT** | No comprobado; solo evidencia de bloque `LOCKED` reinstalado | **Arreglado en #15**: `init` los crea **sin pisar** lo existente (fusiona `LOCKED`) | ✅ **Vamos adelante** |
| **AGENTS propio existente** | No comprobado si mergea o pisa | **Respetado y fusionado** (`mergeLocked` + preserve) | ✅ **Mejor** |
| **Idioma** | Sin politica global; mezcla (AGENTS en ingles, discovery en espanol) | Politica explicita: **artefactos en ingles con keywords literales**, memoria/seed/respuestas en espanol | ✅ **Mejor** |
| **Keywords de specs** | No verificado; "la inconsistencia es plausible" | Medida y cubierta por guard tests (#21 pendiente el chequeo al cerrar) | ⚠️ Parcial |
| **Limite de output** | **No hay limite global**; riesgo real de inflar contexto | **Tampoco** (los contratos piden "short structured summary" pero sin tope) | 🔴 **Dolor compartido** |
| **Filtrado de output de subagente** | Llega entero al orquestador, sin filtrado | Igual: el resultado vuelve entero | 🔴 **Dolor compartido** |
| **Contar tokens** | Sin telemetria | Sin telemetria | 🔴 **Idea nueva** |
| **Skills: metadata vs cuerpo** | **29 skills**; metadata breve siempre, cuerpo on-demand | 18 skills; mismo modelo (metadata ~1.000 tok/req, cuerpo on-demand) | ✅ Similar |
| **Duplicacion skills/comandos** | Solapamiento `ln-*` vs `openspec-*` sin saber si son wrappers | **Resuelto**: 12 comandos son wrappers finos de las skills (fuente unica) | ✅ **Mejor** |
| **Guard tests de skills** | Sin guard tests automaticos | **7 guard tests** (idioma, refs, wrappers, permisos) | ✅ **Mejor** |
| **Resistencia a checkpoints** | Fuerte contractual + permisos; sin prueba adversarial | Igual; **sin prueba adversarial** | ⚠️ Compartido |
| **Conflictos de memoria** | Engram tiene `judgment_required`/relations; mem0 puede duplicar | Supersesion por key (mas simple, sin relaciones) | ✅/⚠️ distinto |
| **Reintentos** | Especificado: reportar y **detenerse**, sin retry automatico | Igual (`MUST REPORT subagent failures and wait`) | ✅ Alineado |
| **Fuente de verdad en git** | No verificado | Coffice la tenia **gitignored** (`/aspec`) | ⚠️ Decision del proyecto |

### 3 dolores nuevos detectados (a evaluar en nuestro repo)

| # | Dolor | Evidencia |
|---|---|---|
| **D1** | **No hay tope de output de subagentes.** Los contratos piden *"short structured summary"* pero sin limite numerico. Un `@tester` con Validation Ledger largo, o un `@reviewer` con muchos findings, inflan el contexto del orquestador en cada hop. | `agents/orchestrator.md` usa "short structured" sin cifra; el propio orquestador admite "riesgo real de inflar contexto" |
| **D2** | **El output de un subagente llega entero** al orquestador, sin filtrado. No hay paso intermedio que lo resuma/recorte. | Coincide con lo que el orquestador del trabajo reporta |
| **D3** | **Sin telemetria de tokens.** No podemos saber cuanto contexto consume una sesion, ni comparar antes/despues de optimizar. | Ambos entornos carecen de esto |

> D1 y D2 son la contraparte de la optimizacion que ya hicimos en skills/commands (los outputs vuelven completos, aunque las instrucciones esten comprimidas). D3 es instrumentacion.

### Otras observaciones utiles

- **Su stack de memoria tiene 3 sistemas** (engram, mem0, OpenSpec) y **sin politica de dedup** — nosotros tenemos **uno** con supersesion. Es una ventaja concreta de nuestro diseno.
- **Tiene 29 skills** con solapamiento `ln-*`/`openspec-*` sin saber si son wrappers. Nosotros 18, con los comandos ya reducidos a wrappers y guard tests que lo verifican.
- **Su AGENTS.md se auto-reinstala como bloque LOCKED** y no hay evidencia de preservacion de secciones propias; el nuestro **fusiona y preserva** explicitamente.

---

## 10. Pendientes

- [x] **Recibidas las respuestas del agente** con evidencia cruda (19/19). Hallazgo #2 **descartado** (las tools funcionaban); aparecieron **3 bugs nuevos** (B1/B2/B3) y **5 gaps nuevos** (G8–G12).
- [x] **Cruce #2** con la matriz real de permisos (§7): confirmado que **`@coder` sin shell** es el problema central (#13), y que **Repomix no consume contexto** por defecto.
- [x] **Cruce #3** (§8): el entorno del trabajo tiene **los mismos dos problemas** (coder sin bash, working-context ausente) — eran del diseno compartido, no bugs nuestros. **Ya resueltos con #13 y #10.**
- [x] **Cruce #4** (§9): relevados los dolores propios. Casi todos los huecos que el reporta los tenemos cerrados; aparecieron **3 dolores nuevos** (D1 tope de output, D2 filtrado entre subagentes, D3 telemetria de tokens).
- [x] Issues abiertos en el Kanban (epica #9 + 12 sub-issues). **Cerrados:** #10, #11, #12, #13, #14, #15, #16, #17, #18, #19, #20, #21, #25, #26.
- [ ] Pendiente decidir **F9** (semantica de `searchMemory`) cuando se retome #14. El cruce #3/#4 confirma que el problema es compartido: ni engram (FTS5) ni mem0 garantizan recall por parafrasis.
- [ ] Mejora candidata: cuando el Recall vuelve vacio, explicar el por que ("sin coincidencias lexicas — proba terminos exactos") en vez de solo "no relevant memories".
- [x] **Evaluar los 3 dolores nuevos** (D1/D2/D3): tope de output de subagentes, filtrado del retorno hacia el orquestador, y telemetria de tokens. → issues **#25** (D1), **#26** (D2), **#27** (D3). **D1 y D2 resueltos en v0.6.25**; D3 queda en #27.
- [ ] Recordar: el proyecto de prueba tiene `/aspec` en su `.gitignore`, un `openspec/` legacy, y tareas de verificacion en dispositivo real pendientes (6/7/8/11 del change PWA).
- [ ] Recordar: el stack del trabajo incluye **mem0 (litellm)** ademas de engram — tercer sistema de memoria ajeno al nuestro. No es parte del framework.

---

## 11. Anexo: evidencia cruda del agente (para no perderla)

**Tools cargadas:** `searchMemory`/`recordRule`/`recordDecision` (ancleto-memory) + `mem_*` (engram) + `caveman_*`. Todas presentes.

**`searchMemory` — semántica medida:**
`maskable`=4 · `maskable pwa`=3 · `como instalar la pwa en el celular`=`[]` · `autenticacion jwt`=`[]`

**`.ancleto/`:** solo `memory.db` (4.096 B) + `-shm` (32.768 B) + `-wal` (469.712 B). Sin `working-context.md`.

**Memoria:** 12 filas → 10 activas (3 `rule` · 7 `decision`; 5 `project` · 5 `feature`), 2 superseded. **Inyectadas en la sesión: 0.** Si se generara el contexto, entrarían solo las **3 `rule/project`**.

**`memory doctor`:** `quick_check ok` · `indice FTS5 consistente` · `una sola activa por memory_key` (exit 0). Sin cambios en `.ancleto/` (no checkpointea).

**`discovery --check`:** `{ "schemaVersion": 2, "state": "STALE", "recommendedAction": "regenerate", "message": "El repositorio cambio desde el ultimo pack.", "missingDocs": [] }` — y **mutó** `.discovery-map.json` (506 → 525 B).

**`check` / `doctor`:** `0 faltantes, 0 huerfanos` (exit 0) · Node 24.15.0, `node:sqlite`, `opencode.json` válido (exit 0).

**Changes:** sin activos. Archivados: `reset-pedido-intuitivo` (11/11 ✅) y `pwa-instalable-android-ios` (**7/11**, pendientes 6/7/8/11 en dispositivo real). Legacy fuera de `aspec/`: `openspec/changes/cafeteria-pwa-foundation/` (activo).

**Triage:** reset → `spec-required` (UX + comportamiento observable) · PWA → `spec-required` (transversal + criterios por plataforma) · logos → `direct-implementation` (contrato sin cambios, con confirmación) · tooling del CLI → **bloqueado** (fuente en otro repo).

**Skills del orquestador:** `ancleto-technical-discovery` (orientación), `triage-clarifier` (categoría no obvia), `ancleto-commit` (convención del repo).

**Tier/modelos:** `.opencode/.ancleto-tier` = `minimo`; **no** hay `.opencode/agents/`; los 10 agentes **globales** en `deepseek-v4.1-flash`.

**Templates:** **sin** `AGENTS.md` ni `PRODUCT.md` → 0 `LOCKED`, sin `EXTENSIBLE`.

**`.gitignore` del proyecto:** ignora `/aspec`, `/openspec`, `/.ancleto`, `/.ancletorc`, `/.opencode`, `dist`.

**Commits:** `d40dc7c`, `55935d1`, `f6dab7e`, `e6cc7d5` (por el orquestador vía subagente) + `88d7b58` "Update de iconos" (externo al flujo).

