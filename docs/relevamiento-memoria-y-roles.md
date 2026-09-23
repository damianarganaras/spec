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

## 7. Pendientes

- [x] **Recibidas las respuestas del agente** con evidencia cruda (19/19). Hallazgo #2 **descartado** (las tools funcionaban); aparecieron **3 bugs nuevos** (B1/B2/B3) y **5 gaps nuevos** (G8–G12).
- [ ] **Volcar esto al BACKLOG** cuando el usuario lo indique (candidatos: sección `v0.7.0` o épica nueva "Memory & Roles hardening"; F1–F12 ya están redactados para copiar).
- [ ] Decidir **F1** (auto-generación del working-context), **F3** (rol del coder) y **F9** (semántica de `searchMemory`), que son los tres cambios de comportamiento.
- [ ] Recordar: el proyecto de prueba tiene `/aspec` en su `.gitignore`, un `openspec/` legacy, y tareas de verificación en dispositivo real pendientes (6/7/8/11 del change PWA).
- [ ] Nota de higiene: el proyecto tenía `.ancletorc` y `.discovery-map.json` modificados **por la propia auditoría** (B1) — conviene revisar si dejarlos así.

---

## 8. Anexo: evidencia cruda del agente (para no perderla)

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

