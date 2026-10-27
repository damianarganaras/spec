# Plan maestro de reingeniería y optimización del framework

**Versión:** 2.0 — 27 de octubre de 2026  
**Estado:** plan rector ejecutable; ninguna modificacion aplicada al repositorio  
**Destinatario:** agente implementador y responsables técnicos  
**Identificador:** `<fw>` representa el nombre real del CLI y de sus skills. Sustituirlo al ejecutar, no renombrar el producto.  
**Meta:** desarrollo orgánico y rápido, documentación confiable entre iteraciones, consistencia arquitectónica y mínimo costo total por cambio correcto.

> **Mandato:** simplificar lo existente. Eliminar artefactos y pasos sin propósito. No añadir agentes, servicios, frameworks de memoria ni tablas por anticipado. Mantener controles de calidad, seguridad y trazabilidad. Ejecutar cambios pequeños y reversibles; si una estrategia falla, corregirla con evidencia, no protegerla por tradición.

---


## DECISIONES EJECUTIVAS (LEER PRIMERO)

Esta version 2.0 reemplaza la anterior. **La memoria es el eje del programa, no un apartado secundario.** No hay propuesta de sustituir SQLite ni de crear un nuevo orquestador. Cada decision tiene un destino, una dependencia, un test y un rollback.

| ID | Decision tomada | Implementacion exigida | Limite |
|---|---|---|---|
| DEC-01 | **Mantener SQLite + FTS5** | Sanear datos y corregir entrega/recall; no agregar Engram, vector DB ni nuevas tablas en P0/P1 | Cambios de schema solo por necesidad probada |
| DEC-02 | **Memoria de proyecto con fuentes verificables** | Specs = que; proposal versionado = por qué del change; SQLite = búsqueda/supersesion local; AGENTS/PRODUCT = políticas | Technical seed `decisions.md` es derivado, no fuente editable |
| DEC-03 | **Eliminar `design.md` de nuevos changes** | Trasladar decisiones a `proposal ## decisiones`, incluyendo las descubiertas durante coding; legacy readable | Preservar los 5 casos históricos con contenido único |
| DEC-04 | **Eliminar `context.md` como artifact nuevo** | Retirar lectores y borrado huerfanos; continuidad via `tasks.md` condicional | No confundir ausencia en archive con ausencia de uso |
| DEC-05 | **Delta spec solo si cambia el contrato** | Fix de conformidad cita Requirement existente; archive sin delta es no-op válido | Spec ambigua/desactualizada exige delta |
| DEC-06 | **Conservar checkpoints, cambiar objeto** | Aprobar contrato: alcance + requisito + riesgo + decisiones + paths + validacion | Stops humanos explicitos y distintos no se suprimen |
| DEC-07 | **recuperación a dos niveles** | Invariantes estables obligatorios + FTS/refs por tarea con disclosure progresivo | No buscar 21/21 reglas inyectadas; buscar 0 reglas requeridas omitidas |
| DEC-08 | **Sin escritura de conocimiento no aprobado** | único escritor `@memory-keeper`, idempotencia por key, evidencias y conflicto fail-closed | Nada de self-editing autonomo de specs o reglas críticas |
| DEC-09 | **Export/import es snapshot, no merge** | Mantenerlo, pero hacer divergencias visibles y nunca resolverlas por LWW silencioso | Git queda como respaldo de decisiones del change |
| DEC-10 | **Optimizar costo real, no conteo de documentos** | Usar stats existente; medir cache read/write, USD, latencia, rework y seguridad | Spawns/archivos enteros son diagnostico, no gate de calidad |
| DEC-11 | **única fuente de skills/agents** | Verificar la cadena de generación y regenerar mirrors desde origen | No editar dos arboles manualmente |
| DEC-12 | **API/hosts versionados** | Preservar contratos V1; adapter separado si se soporta OpenCode V2 | No cambiar `bash/task` por `shell/subagent` en V1 |

**Orden decidido:** preparacion de baseline de lectura -> curaduria memoria -> contrato memoria/captura -> eliminacion de artifacts -> fix conformidad -> recuperacion/ref -> colaboracion segura -> optimizacion runtime -> release multi-host. La captura y el reemplazo de `design.md` pueden publicarse en el mismo release de compatibilidad, pero nunca sin tests de decisiones unicas.

**Que NO se construye:** agente automejorador, service central, motor vectorial, grafo, 5 tablas, 6 comandos, un ADR paralelo, router nuevo o workflow clonado por host. La ausencia de estas cosas es una decision deliberada.

**Semantica de etiquetas:** `[R]` = relevamiento reportado por agente, condicionado a SHA; `[V]` = documentacion oficial verificada; `[D]` = orden de implementacion de este plan; `[M]` = medicion runtime sin resultado aun. No inventar que un [D] ya esta implementado.

---

## 0. Cómo interpretar este documento

**Tipos de afirmación:**

- **[R] Repo/auditoría:** hallazgo comunicado por el agente con referencias a archivo/línea; aún debe validarse contra el commit exacto al ejecutar.
- **[V] Verificado externamente:** principio o mecanismo descrito por una fuente primaria (sección 15).
- **[D] Decisión de diseño:** instrucción de implementación tomada aquí; no se presenta como hecho existente.
- **[M] Medir:** parámetro de runtime que no se puede deducir del código o de la web.

**Alcance:** modifica contratos, prompts, skills, CLI y tests del framework. No modifica las aplicaciones que lo usan ni el historial archivado. La auditoría del usuario no incluye aquí el código fuente completo; por ello las referencias `archivo:línea` son evidencia informada, no verificación independiente de este documento.

**Fuentes internas:** `framework-sdd.txt` (arquitectura original), `Texto pegado(5).txt` (auditoría Q1–Q12), más la verificación posterior sobre `context.md`, export/import y garantías compartida en esta conversación. El agente debe fijar un commit/tag antes de implementar para evitar deriva entre documentos y código.

### Resultado deseado, sin marketing

1. Una tarea pequeña no activa un pipeline documental ni una cadena multiagente innecesaria.
2. Una tarea que cambia requisitos mantiene `aspec/specs` actualizado y verificable.
3. Una decisión duradera puede recuperarse en una sesión distinta, con su justificación y fuente.
4. Un bug de conformidad se corrige contra un `Requirement` existente sin fabricar un delta.
5. La memoria nunca inyecta una regla conocida como falsa ni descarta silenciosamente una regla crítica.
6. Cada mejora reduce trabajo o riesgo sin perder controles; el costo real se mide.

---

## 1. Diagnóstico cerrado y asuntos que siguen abiertos

| Tema | Estado | Evidencia interna / consecuencia |
|---|---|---|
| `design.md` | **Eliminar para changes nuevos [D]** | 26/28 archives lo tienen; 21 redundantes y **5 con decisiones únicas** [R]. Migrar esas decisiones; lectura histórica permanece. |
| `context.md` | **Retirar como artifact del flujo nuevo [D]** | Tiene consumidores e instrucciones de borrado, pero **cero productores** identificados [R]. La ausencia en archives se debe a borrado al archivar: no usar 0/28 como prueba de inutilidad. |
| `specs/` | **Conservar y hacer delta condicional [D]** | Todos los archives estudiados tenían `specs/`; el caso sin delta no está probado. Hay que construir y testear el fix de conformidad. |
| `proposal.md` | **Conservar conciso [D]** | Será el respaldo Git de alcance, riesgos y decisiones duraderas descubiertas durante el trabajo. |
| `tasks.md` | **Condicional [D]** | Aporta reanudación/hand-off cuando la tarea atraviesa sesiones o tiene dependencias; no generar checklist ficticia para una tarea pequeña. |
| Memoria SQLite/FTS5 | **Conservar [D]** | 94 nodos, 70 activos (21 reglas, 49 decisiones), 24 superseded [R]; infraestructura ya funciona. |
| Calidad de memoria | **Corregir inmediatamente** | Se inyectan 14/21 reglas; 7 se desalojan por orden antiguo, contradicción activa y duplicación de validaciones [R]. |
| `memory export/import` | **Conservar, NO asumir sincronización colaborativa** | Existe, es idempotente, pero tiene last-writer-wins sin resolución de conflictos y exporta sin genealogía remota [R]. |
| `stats` | **Explotar antes de construir telemetría nueva** | Ya captura `cacheRead/cacheWrite` y costo por agente, pero faltan baseline reproducible y atribución completa por fase [R]. |
| Permisos/guards | **Conservar** | Separación orquestador/coder/reviewer, Git, archive, ledger y `LOCKED` ya tienen tests [R]. |
| Espejos de skills | **Verificar generación** | `skills/` y `.opencode/skills/` tienen contenidos duplicados; confirmar autoridad y pipeline de generación. |

**Contradicciones que NO se resuelven suponiendo:**

- La regla antigua de permisos de OpenCode afirma *last-match-wins* y la auditoría registra una prueba que la contradice. La documentación oficial actual **sí** describe last-match-wins para reglas de permisos; puede haber diferencia de versión, sintaxis, evaluación de `bash` o patrón. **No reemplazar una afirmación por otra sin prueba reproducible por versión.** Retirar temporalmente del contexto base la recomendación insegura; conservar ambas evidencias y cerrar la regla con test de la versión soportada. [V: EXT-07]
- La auditoría menciona truncamiento a 8.000 caracteres y un guard de `ProjectMemoryRules` de hasta 5 reglas/1.500 bytes. **Identificar las dos superficies y sus presupuestos antes de unificarlas.** No interpretar ambos números como una misma configuración.
- `mergeLocked` del CLI resuelve bloques de templates; **no equivale automáticamente** al merge semántico de deltas de `aspec/specs`. Implementar/testear el algoritmo ADDED/MODIFIED/REMOVED/RENAMED aparte.

---

## 2. Contrato de producto y garantías no negociables

### 2.1 Invariantes (tests de regresión, sin excepciones implícitas)

- Solo `@coder` puede commitear y únicamente los paths aprobados en el checkpoint; `git push` está denegado a todos los agentes con shell.
- Solo el orquestador declara `task: true`; no otorgarle `bash` ni escritura para simplificar intake.
- `@reviewer` mantiene su independencia y no ejecuta bash; recibe ledger cerrado.
- Nadie borra carpetas de changes; archive mueve, no destruye el histórico.
- `GUARANTEE NOT SUSTAINED` es bloqueo crítico. Nunca se interpreta como warning permisivo.
- Solo se ejecutan comandos declarados en `PRODUCT.md`; `not-configured` no equivale a falla.
- `STALE/material` del technical seed exige el permiso que ya establece el contrato.
- `LOCKED` se reconcilia sin pisar personalizaciones `EXTENSIBLE`; mirrors se regeneran desde fuente canónica.
- Los checkpoints de aprobación humana siguen siendo **explícitos y separados**: no suprimirlos por optimización. Cambia el **objeto** aprobado, no se falsifica una aprobación.
- El merge de specs no convierte automáticamente un bug en requisito vigente. Discrepancias funcionales se resuelven contra intención aprobada.

### 2.2 Calidad, después eficiencia

**Gate de calidad (bloqueante):** tests relevantes y guards pasan; permisos intactos; requisitos y decisiones se conservan; referencias resolubles; no aparecen regresiones críticas; los cambios de alto riesgo reciben la revisión exigida.

**Gate de eficiencia (comparativo):** reportar spawns, turnos, cantidad de documentos, latencia, tokens facturados, cache hit/costo y retrabajo. Una reducción de enteros **no autoriza por sí sola** un cambio si se pierde cobertura o calidad.

Principios externos: controles proporcionales al riesgo y trazabilidad [V: EXT-01]; software seguro, comprensible y modificable [V: EXT-02]; automatizar toil solo cuando compense costo y mantenimiento [V: EXT-03]. No se pretende aplicar a este framework el régimen regulatorio de NASA; se adoptan sus principios de ingeniería.

---

## 3. Arquitectura objetivo: mínima, orgánica y recuperable

```text
PEDIDO NATURAL DEL USUARIO
        |
        v
TRIAGE EXISTENTE + CONTRATO DE RIESGO  (sin router nuevo)
        |
        v
CONTEXTO RELEVANTE (AGENTS/PRODUCT mínimos + spec + decisiones)
        |
        +--> FIX DE CONFORMIDAD: requisito correcto, código incorrecto
        |      citar Requirement, corregir, testear, sin delta
        |
        +--> CAMBIO FUNCIONAL: actualizar delta spec, aprobar contrato,
        |      implementar iterativamente, testear, mergear delta
        |
        +--> CAMBIO CRÍTICO: decisión explícita, aprobaciones, tests
               y revisión independiente obligatoria
        |
        v
VALIDATION LEDGER + REVISIÓN SEGÚN GARANTÍAS
        |
        v
PERSISTENCIA SELECTIVA: specs + decisión duradera si la hubo
        |
        v
ARCHIVE (move) + métricas + siguiente iteración
```

**No se crean rutas nuevas renombrando todo el triage**: preservar categorías existentes y agregar discriminadores `fix de conformidad` y `spec-lite` donde corresponda. La ejecución puede seguir siendo Explore → Implement → Revise sin obligar una carpeta documental por etapa.

### Matriz de comportamiento (normativa)

| Caso | Delta spec | Proposal | Tasks | Design | Revisión | Checkpoint |
|---|---|---|---|---|---|---|
| Formato/refactor local sin cambio observable | No | No, salvo change formal exigido por contrato actual | Si necesita continuidad | No | Verificación adecuada | El exigido por ruta vigente |
| Fix de conformidad con spec inequívoca | **No**; cita Requirement | Breve si se abre change | Condicional | **No** | Tests del requisito; riesgo manda | Aprobar alcance/requisito cuando aplique |
| Feature pequeña/moderada | **Sí** | Sí, conciso | Condicional | **No** | Tests + ledger + escalamiento por riesgo | Aprobar contrato del cambio |
| Migración/seguridad/contrato compartido | **Sí** o referencia a requisito existente si conformidad | Sí, con alternativas/decisión y riesgos | Sí si hay fases | **No** | Independiente y controles completos aplicables | Aprobación explícita del contrato y decisión |
| Documentación o exploración read-only | Solo si altera requisito aprobado | Solo si cambia alcance formal | No por defecto | No | Consistencia y fuentes | No inventar aprobación |

**Regla:** cualquier duda relevante sobre requisitos o seguridad escala la profundidad de análisis, no inventa un artifact adicional.

---

## 4. Contrato documental definitivo

### 4.1 Mantener `aspec/specs/<capability>/spec.md`

- Fuente canónica de comportamiento aprobado; requisitos y escenarios verificables.
- Mantener keywords parseables `ADDED`, `MODIFIED`, `REMOVED`, `RENAMED` y `Requirement`/`Scenario`; no cambiar gramática durante esta reingeniería.
- Delta solo cuando cambia el requisito o se corrige una especificación errónea/incompleta.
- Al archivar, merge determinístico con validación previa, `--dry-run` o diff claro, transacción lógica y resultado idempotente. Rechazar ante ambigüedad o colisión.
- Crear test explícito para un change **sin carpeta de delta**: merge no-op, archive válido, evidencia contra Requirement existente.

### 4.2 `proposal.md`: breve, con decisiones registradas

```markdown
# <change-id>
## Problema
<2-3 líneas: motivo y resultado esperado>
## Alcance
Dentro: ...
Fuera: ...
## Riesgos y aprobación
<impacto, referencias al contrato, estado del checkpoint>
## Decisiones
- <decisión> | alternativa descartada | por qué | fuente/evidencia
```

- `## Decisiones` se completa **también durante implementación** si surge un tradeoff no previsto, no solo en la etapa propose.
- Solo decisiones duraderas se promueven a memoria al cierre; una línea de implementación obvia no genera un recuerdo.
- Las **5 decisiones únicas** detectadas en los `design.md` históricos deben extraerse/respaldarse sin eliminar los documentos antiguos, con verificación humana de que su explicación no se perdió.
- No duplicar el `Qué` de la spec. `proposal` responde *por qué y alcance*; la spec responde *qué comportamiento*.

### 4.3 Eliminar `design.md` para nuevos changes

- Eliminarlo del contrato y de generadores `@spec-writer`, `propose`, `ff`, `continue`, `onboard`, `upgrade` y referencias de templates.
- Ajustar consumidores `@orchestrator`, `@coder`, `@tester`, `@reviewer`, `@documenter` para **no exigirlo**; lectura histórica condicional intacta.
- No borrar archivos archivados; no migrar mecánicamente todas sus líneas a memoria.
- Guard nuevo: ningún generador produce `design.md` en changes nuevos; legacy archive con design sigue pasando.
- Si un cambio tiene una decisión compleja, registrarla en `proposal ## Decisiones`, vincularla y aprobarla; no recrear el archivo eliminado con otro nombre.

### 4.4 `tasks.md` condicional y de estado

- Producirlo cuando hay >1 sesión, varios bloques dependientes, progreso parcial o handoff real.
- Campos mínimos: pendiente/hecho, última validación, bloqueos, paths relevantes, siguiente paso. No generar listas detalladas especulativas.
- Si no hay tasks, el orquestador reanuda leyendo `proposal`, change activo, git status y tests; no declarar que un archivo ausente es corrupción.
- Para tareas largas, actualizar tasks al avanzar, no solo al inicio y cierre.

### 4.5 Retirar `context.md` sin sustituto automático

- Sin productores actuales y con consumidores residuales, se elimina de generación/lectura/borrado **en el flujo nuevo**.
- Conservar lectura opcional de formatos legacy si algún change activo/histórico lo contiene, hasta que no haya consumidores; la compatibilidad se prueba.
- No reemplazarlo por `handoff.md` ni otro artifact solo por estética. `tasks.md` cubre continuidad cuando se necesita.

### 4.6 Checkpoint: aprobar el contrato, no documentos

El resumen de aprobación debe contener, en menos de una pantalla: **intención, alcance, Requirement nuevo/existente, riesgos, decisión de arquitectura si aplica, validación prevista y paths autorizados**. Conservar stop explícito, IDs y auditoría de aprobación; no vincular un stop a la existencia de `design.md`.

---

## 5. Memoria SQLite/FTS5: reparar entrega antes de ampliar almacenamiento

**Autoridad de cada conocimiento:** `aspec/specs/` conserva comportamiento aprobado; `recordDecision` conserva justificación consultable; `proposal.md` es respaldo revisable durante el change; `AGENTS.md`/`PRODUCT.md` contienen reglas operativas. `docs/technical-discovery/decisions.md` es **derivado/regenerable**: nunca escribir ahí manualmente una decisión nueva como única fuente. Evitar que la misma afirmación compita en dos hogares.

### 5.1 P0 — curaduría inmediata

1. Export/backup consistente de SQLite **antes** de escribir; conservar snapshot etiquetado y validar `quick_check`.
2. Reunir los cuatro nodos de validación equivalentes, extraer todas las restricciones, consolidarlos en una **regla canónica**; mantener separada `node-test-scope-explicit-paths`, que es única.
3. Resolver la contradicción de permisos **con versión, sintaxis exacta y prueba reproducible**. Mientras no se cierre, no inyectar la afirmación que puede ser falsa. No afirmar que todo el matcher de OpenCode es indeterminista cuando docs actuales describen reglas ordenadas [V: EXT-07].
4. Reclasificar las 6–8 entradas tipo bitácora fuera del contexto base, conservando historial.
5. Regenerar `working-context.md`; comprobar 0 contradicciones conocidas inyectadas y 0 invariantes críticos desalojados.
6. Testear que el historial de supersesión sigue consultable y se puede restaurar el snapshot.

**Nota:** re-registrar una regla no siempre es rollback perfecto (tiene nuevos IDs/timestamps). El rollback real es snapshot/back-up de base consistente + plan de restauración probado.

### 5.2 Entrega en dos niveles

- **Base estable:** mínimo conjunto versionado/revisado de invariantes universales. No volcar todas las 21 reglas; no priorizar por fecha de creación. Estabilidad del prefijo favorece reutilización de caché [V: EXT-08, EXT-09].
- **Por tarea:** cuando se conoce la capability, usar FTS5/BM25 + filtros de scope, paths y referencias; devolver candidatos cortos y abrir detalles sólo cuando haga falta.
- **Reglas críticas:** sin truncamiento silencioso. Si exceden presupuesto, fallo explícito o referencia a política obligatoria, no omisión arbitraria.
- **Resultados:** clave, tipo, breve contenido, estado, evidencia y refs; devolver máximo inicial configurable (probar 3–5, no declararlo estándar).
- **No activar recall por el mero hecho de exceder un límite arbitrario**; primero recuperar de forma determinística. Una delegación de recall necesita una razón propia.
- **No asumir que `cacheRead / (cacheRead + input)` es universal**: validar qué incluyen esos campos en cada host antes de calcular tasas.

### 5.3 Referencias estables sin tablas nuevas por ahora

Conservar `memory_key` como identidad. Probar una convención parseable `refs:` dentro del contenido existente:

```text
memory_key: auth-session-policy
refs:
  - spec:authentication#token-expiration
  - change:update-auth-expiration
  - path:src/auth/session.js
  - workitem:188155
```

- Resolutor de `change:<id>` busca activo y `archive/YYYY-MM-DD-<id>`, valida unicidad y no elige arbitrariamente si hay múltiples coincidencias.
- Resolver capacidades/requisitos contra specs canónicas, y paths contra archivos existentes; rutas de línea son hints sujetos a drift.
- Registrar refs al **capturar** una decisión, no generar miles de enlaces retroactivos. Migrar primero memorias activas y frecuentes.
- Incluir test de renombrado por archive y de referencia rota; permitir un CLI diagnóstico de lectura si hay necesidad, reutilizando comandos existentes cuando sea posible.
- Solo añadir columna/tabla de refs si el formato en texto fracasa en corrección, complejidad de consulta o mantenimiento medidos.

### 5.4 Compartición sin afirmar que export/import es merge

**Estado real:** `.<fw>/memory.db` está ignorada por Git y depende del cwd. Snapshot export/import es útil, pero usa last-writer-wins; no aporta resolución colaborativa. El audit también informa que una key solo `superseded` puede ignorar una versión entrante posterior y que el snapshot carece de tombstones; cubrir ambos casos con tests antes de confiar en import como sincronización. Worktrees separados no comparten DB por defecto [R].

**Decisión:** no versionar la DB binaria; no automatizar importaciones de memorias compartidas hasta tener una política de conflictos. Resolver según uso real:

- **Un desarrollador, worktree aislado:** mantener memoria local + backup/export explícito. No hacer migración de formato.
- **Varias ramas/worktrees con conocimiento compartido:** primero añadir a import un reporte `--dry-run` por `memory_key` (nuevo/idéntico/divergente/tombstone), opción de fallo seguro ante divergencia y export con genealogía si hace falta. No sobrescribir silenciosamente.
- **Equipo paralelo y PRs con decisiones:** recién ahí utilizar una representación textual versionable por clave como autoridad del conocimiento compartido, y SQLite como índice derivado. Esto es una opción activada por necesidad, no arquitectura universal.
- La rama/commit y autor de cada decisión deben ser recuperables, al menos mediante metadata de Git/refs del proposal; nunca publicar credenciales o notas de sesión.

**Importante:** no hacer escritura concurrente de un mismo archivo SQLite por red o entre máquinas; consultar límites WAL de SQLite [V: EXT-10]. `memory doctor` debe prometer solo diagnóstico cuando se ejecute en modo read-only; inspeccionar y corregir el checkpoint WAL observado, diferenciando checks de mantenimiento.

### 5.5 Auto-mejora controlada, sin «agente que se modifica solo»

La auto-mejora de v1 es *un proceso de curaduría y evaluación*, no otro framework:

- Al cerrar: detectar si hubo una decisión duradera, comprobar duplicación/contradicción y **proponer** guardar solo si añade conocimiento recuperable.
- Semanalmente o en mantenimiento solicitado: revisar refs rotas, duplicados, reglas sin fuente, obsoletas y supresión injustificada.
- Nunca promocionar a memoria una decisión crítica basándose solo en éxito de la tarea; conservar aprobación y evidencia.
- Medir si se recuperó, si resolvió una referencia y si fue citada. No atribuir éxito causal sin un experimento controlado.
- Priorizar controles determinísticos; no convocar `@memory-keeper` para cada change si no hay candidato.
- Si aparecen errores recurrentes se transforman en guards, tests, docs o reglas canónicas, no en una acumulación de recuerdos.

Inspiración práctica: repositorio como sistema de conocimiento y «golden principles» mecánicos para reducir entropía [V: EXT-11].

---


### 5.6 Contrato operativo de memoria: fuente, lectura y escritura [D]

**Contrato normativo (no opcional):** una memoria tiene que ser **correcta, recuperable y enlazada a una fuente**. Ningun nodo de memoria local puede reemplazar una spec aprobada. Si las fuentes discrepan, detener la promocion y reportar conflicto; nunca elegir el texto mas reciente por intuicion.

| Tipo de conocimiento | Fuente autoritativa | Indice/copia | Autoriza cambio | Pregunta que responde |
|---|---|---|---|---|
| Requisito observable | `aspec/specs/<cap>/spec.md` | FTS + refs | Flujo de cambio aprobado | Que debe hacer |
| Motivo/decision de change | `proposal.md ## Decisiones` versionado (activo/archivado) | `recordDecision` en SQLite | Aprobacion de contrato; capture al archive | Por que y con que alternativas |
| Restriccion universal de agente | `AGENTS.md` / `PRODUCT.md` versionados | Prompt base estable | Politica de cambio y tests | Que nunca hacer |
| Regla local reusable de tooling | `recordRule` en SQLite | `working-context` / recall | `@memory-keeper` con evidencia | Como evitar trampa recurrente |
| Estado de ejecucion | `tasks.md` solo si se necesita | Ninguno permanente | Rol autorizado de ejecucion | Donde retomar |
| Topologia/decisions seed | Fuentes del repo + artefactos de discovery | `docs/technical-discovery` regenerable | `@technical-seed-writer` | Como esta organizado hoy |
| Historial remoto de memoria | Export JSON + procedencia explicita | Import local; **no merge automatico** | Operador o proceso aprobado | Que se puede transferir |

**Garantia de versionado:** la persistencia Git de `proposal` cubre las decisiones de un change. La DB SQLite sigue siendo local y su busqueda **no** garantiza que una worktree nueva pueda recordar decisiones que solo existen en otra DB. El programa no puede declarar memoria compartida hasta demostrar una de las rutas de sincronizacion de 5.11.

### 5.7 Captura: cuando escribir y cuando NO escribir [D]

**Gatillos permitidos:** (a) tradeoff arquitectonico real; (b) requisito/no-obvio o compatibilidad descubierta; (c) fallo repetible con causa generalizable; (d) cierre de change con decision duradera; (e) correction humana de una regla incorrecta.

**No capturar:** transcripcion de sesion, fecha/version de release sin leccion reusable, resena de un test verde, estado temporal de tareas, copia de Requirement, notas ya presentes en AGENTS/PRODUCT, hipotesis sin evidencia, secretos y rutas de usuarios.

**Evaluacion manual de candidato:**

1. Responde una pregunta que un agente futuro podria formular **sin** conocer el nombre del change.
2. Tiene una fuente concreta (Requirement, diff/commit, prueba o decision humana).
3. No es duplicado; si contradice un nodo activo, se resuelve antes de activar.
4. Tiene `memory_key` de dominio estable; no inventar ID paralelo.
5. Tiene referencias navegables cuando existen; ninguna referencia inventada.
6. La decision no impone una nueva politica general sin permiso humano.

**Cero candidato = cero escrituras de memoria.** El `@memory-keeper` no se invoca solo para declarar que no hubo aprendizaje si otro rol/CLI puede determinarlo con una regla concreta y segura.

**Ciclo durante change:**

```text
propose -> proposal/Requirements -> SPEC CHECKPOINT explicito
   -> implementacion -> si emerge decision nueva:
       propuesta de amendment en `proposal ## Decisiones`
       -> aprobacion cuando cambia alcance, riesgo o arquitectura
   -> tests + Validation Ledger cerrado -> review -> ARCHIVE CHECKPOINT
   -> sync de specs si hay delta -> move a archive
   -> @memory-keeper: promover solo decisiones duraderas aprobadas
   -> @coder commit de paths permitidos
```

**Regla de integridad:** memoria SQLite y Git no forman una sola transaccion. Si falla la promocion tras mover el change, **no se finge exito**: conservar proposal/versionado, dejar estado de promocion pendiente visible para retry, no repetir decisiones ni corromper archive. El rollback operativo restaura snapshot y archivos Git conforme al checkpoint. No devolver un resultado 'archivado y memorizado' si solo se archivo.

**Formato minimo en proposal:** Markdown legible, sin convertir la seccion en otro documento de diseno. Para cada decision duradera:

```markdown
## Decisiones
- **memory_key:** <tema-estable>
  **Eleccion:** <solucion>
  **Descartado:** <alternativa o 'ninguna relevante'>
  **Justificacion:** <motivo/tradeoff verificable>
  **Refs:** `spec:<capability>#<requirement>`; `change:<slug>`
  **Estado:** aprobado
```

Una decision simple puede ser una sola linea; el parser/lector debe preservar equivalencia semantica. Solo `Estado: aprobado` y refs validas habilitan promocion. El agente implementador puede **proponer** un nuevo bloque; la escritura en `proposal` respeta los permisos actuales (no dar edit/bash al orquestador).

### 5.8 Lectura: algoritmo deterministico sobre herramientas existentes [D]

**Dos superficies distintas:** `working-context` tenia un corte de 8.000 caracteres y el guard de `ProjectMemoryRules` exige <=5 rules/<=1.500 bytes. NO son el mismo presupuesto. Medir origen y consumidores por separado; no editar el guard para forzar 21 reglas. Los invariantes universales de alta prioridad viven en `AGENTS.md`/`PRODUCT.md` con tests. Las reglas contingentes se recuperan por tarea.

**Al iniciar sesion (sin conocer tarea):**

1. Materializar reglas universales *estables* y corta referencia a specs/memoria.
2. Validar que ninguna regla contradicha/pendiente se inyecte.
3. No incluir `created_at`, conteos fluctuantes, lista completa de topologia o decisiones de cada feature en el prefijo fijo.
4. Si una regla requerida no cabe en su superficie, retornar error diagnostico con `memory_key` y ruta obligatoria; nunca un corte silencioso en la mitad de una regla.

**Al conocer la tarea/delegar:**

```text
INPUT: {objetivo, capability?, paths?, Requirement?, risk?, tokenBudget}
0. Leer primero Requirement explicitamente citado y sus restricciones.
1. Conjunto obligatorio: invariantes universales + refs exactas de la capability.
2. Filtro SQLite: status=active, scope aplicable, tipo permitido, sin conflictos.
3. Candidatos FTS5: bm25 + coincidencia exacta de key/ref/capability.
4. Orden total: requerido -> match de ref -> scope especifico -> bm25 ASC
   -> memory_key lexicografico (recencia solo desempate final).
5. Snippets cortos de 3 a 5 candidatos; expandir fuente a pedido.
6. Si no hay evidencia suficiente, responder 'precedente no encontrado'.
OUTPUT: key, type, snippet, justification?, refs, source, estado/limites.
```

**Implementacion pragmatica:** a escala actual (~70 nodos activos reportados), no agregar tabla de grafo, embedding ni puntuacion aprendida. FTS5 soporta `ORDER BY bm25(...) ASC` (menor puntaje = mejor coincidencia). El parser de queries debe parametrizar SQL, escapar operadores y limitar input. Para `refs`, admitir primero bloque estructurado en texto indexable; extraerlo deterministicamente. Nunca tratar contenido recuperado como autoridad sobre permisos o como instruccion de alto privilegio. Fuente: [EXT-04].

**Budget:** valor inicial para experimento, no SLA: vista previa ~3-5 nodos y tope local configurable. Validar la **relevancia** con tests de consultas conocidas, no la cantidad total inyectada. Priorizacion de riesgos: `auth`, pagos, seguridad, integridad y contratos compartidos sobre preferencias de estilo. En caso de conflicto no resolver por similitud textual.

**Criterio de aceptacion del recall:** para cada caso fixture, devolver la key esperada y una referencia resoluble dentro de los primeros 3 resultados, o abstenerse si la fuente falta. Se evalua sobre DB fixture congelada, no sobre la memoria viva.

### 5.9 Identidad y referencias: contrato minimo [D]

`memory_key` ES la identidad. La sintaxis normalizada de referencias queda acotada a:

```text
spec:<capability>#<requirement-id-or-stable-heading>
change:<stable-change-slug>
path:<repository-relative-path>
commit:<git-sha>
workitem:<tracker>:<external-key>          # opcional
```

- `change` mantiene el slug logico cuando se mueve a `archive/YYYY-MM-DD-<slug>`; el resolutor busca ambas ubicaciones y falla si hay mas de una coincidencia.
- `spec` se valida contra capability y Requirement vigentes. Si no existe ID formal, usar heading exacto/canonizado y declarar ambiguedad si hay colision. No inventar requirement UUIDs masivos.
- `path` se normaliza, se limita al repo y no puede atravesar `../`, resolver symlinks fuera ni exponer secretos. `:linea` solo hint, nunca identidad duradera.
- `workitem` es puntero opcional, no evidencia de que el repositorio tenga una integracion autenticada. No guardar credenciales ni token de Azure.
- En backfill, priorizar 5 decisiones historicas unicas y nodos activos de mayor riesgo; no migrar indiscriminadamente 94 entradas.
- Consulta inversa por `spec` o `change` puede empezar con busqueda textual controlada sobre 70 nodos; crear tabla `memory_refs` solo si la semantica o los tests prueban insuficiencia.

### 5.10 curaduría y consistencia sin tablas nuevas [D]

**Estados funcionales:** `active`, `superseded` (ya existen). Un candidato conflictivo se mantiene **fuera de la memoria activa** mientras se investiga; no introducir un status SQL nuevo antes de comprobar que hace falta.

**Control sobre cada escritura:**

1. Misma `memory_key`, mismo contenido normalizado y mismas refs -> NO-OP idempotente.
2. Misma `memory_key`, distinto contenido -> requerir justificacion, fuente y supersesion valida.
3. Dos keys distintas, misma regla -> propuesta de deduplicacion; nunca merge semanticamente automatico.
4. Dos keys distintas, afirmaciones contradictorias -> impedir ambas en el bloque base hasta resolucion humana/tipo de fuente.
5. Fuente o ref rota -> marcar en diagnostico; no borrarla automaticamente ni cambiar una spec.
6. `scope: task`/sesion -> nunca inyectar como regla universal.

**Operacion P0 especifica de la auditoria:** fusionar las **4** reglas redundantes conservando **1** regla unica (`node-test-scope-explicit-paths`), quitar la regla de permisos contradicha del contexto hasta probar la sintaxis/host real y sacar 6-8 bitacoras del scope project. Comparar antes/despues con tabla `memory_key -> restricciones`, no por parecido del titulo.

**Auditoria read-only:** `memory doctor` debe usar apertura de DB de solo lectura (opcion `readOnly` de `DatabaseSync`) y evitar `wal_checkpoint`, DDL, pragmas mutantes o side effects. `PRAGMA query_only` por si solo NO evita checkpoints; separar explicitamente `doctor` de `memory maintenance`/operaciones de backup. Probar bytes/hashes del `.db`, `-wal` y `-shm` antes y despues en una fixture, con cierre de conexiones. [EXT-05, EXT-10, EXT-21]

### 5.11 compartición y recovery entre worktrees: una solucion operativa, no una promesa [D]

**Por defecto en V2:** no hacer import LWW automatico, no versionar `.memory.db` y no prometer estado compartido solo por export/import. El historial Git del `proposal` y las specs es el respaldo de las decisiones de producto; SQLite guarda una copia buscable local de ellas y reglas de tooling.

**Cambios exigidos al export/import existente:**

1. `export` con `formatVersion`, `sourceRepo`, commit/branch de origen (sin hostname/secretos), fecha y `memory_key` estable. El modo nuevo `--with-history` conserva genealogia; lectores antiguos siguen aceptando formato anterior.
2. `import --dry-run`: por key clasificar `new`, `identical`, `incoming-newer`, `local-newer`, `divergent`, `deleted/tombstone-unknown`. No usar `created_at` como autoridad unica de conflicto entre ramas.
3. `import --on-conflict=fail`: comportamiento predeterminado del **modo colaborativo**. No reemplazar divergen-tes sin confirmacion. En una key solo superseded local, NO ignorar silenciosamente una version entrante: debe aparecer en reporte.
4. No permitir resurreccion implicita de una decision retirada. Sin tombstones/genealogia confiables: `needs-manual-resolution`.
5. Backups consistentes usando la API de backup o snapshot SQLite correcto; no copiar `.db` aislada en WAL activo sin protocolo. Test import/export ida-vuelta + falla/rollback.
6. No sincronizar automaticamente por red ni compartir un WAL entre maquinas (limitacion oficial SQLite).

**Para equipo con ramas paralelas:** no imponer al inicio otra representacion masiva. Primera implementacion de continuidad cruzada: al `init`/`update` y cuando el motor detecte DB vacia, ofrecer **reindexacion desde proposals versionados** (solo decisiones con key/estado/fuente verificables), sin reescribir los proposals; las reglas puramente locales no se inventan. Si distintas ramas versionan decisiones conflictivas con la misma key, mostrar conflicto y rechazar promocion. En caso de no alcanzar este mecanismo, habilitar RFC posterior para registros Git por key + SQLite derivado; no llamarlo obligatorio sin necesidad.

**Invariante de reconstruccion:** una decision de producto presente en proposal versionado debe poder ser reencontrada en una worktree nueva, mediante reindexacion o lectura dirigida, sin necesitar copiar la DB ignorada de otra maquina. **Este test es obligatorio para declarar 'memoria duradera'**; caso contrario documentar explicitamente 'memoria local con respaldo Git no indexado'.

### 5.12 Auto-mejora realista y corpus de recuperación [D]

**Definicion:** el motor mejora mediante **deteccion, propuesta, aprobacion, versionado y regresion**, no mediante una IA con autoridad de escribir sus propias instrucciones. Se construye sobre tests, `memory doctor` y `@memory-keeper` actuales; 0 agentes y 0 tablas nuevos.

Corpus inicial versionado de 10 preguntas con outcome conocido:

| ID | Caso | Ground truth | Gate |
|---|---|---|---|
| M01 | Regla de test runner vendorizado | key unica preservada + archivo fuente | Aparece en top3 o restriccion universal |
| M02 | Contradiccion permisos | evidencia por host/version; regla vieja no se inyecta | Bloqueante |
| M03 | Decision de producto historica | 1 de las 5 decisions unicas, refs reales | Recuperacion reproducible |
| M04 | Requirement exacto | spec vigente; no decision contradictoria | Bloqueante |
| M05 | Cambio archivado | `change:slug` resuelve path unico | Bloqueante |
| M06 | Cambio archivado ambiguo | no elige arbitrariamente | Bloqueante |
| M07 | Fuente inexistente | no inventa referencia; devuelve sin evidencia | Bloqueante |
| M08 | Session nueva, DB limpia | reindexa o navega proposal versionado | Bloqueante para colaboracion |
| M09 | Decision ausente | no escribe memoria solo por archivar | Bloqueante |
| M10 | Import de dos ramas divergentes | reporte/abstencion; nunca LWW silencioso | Bloqueante para modo colaborativo |

**Indicadores medibles ahora:** `retrieved`, `cited`, `ref_resolved`, rank conocido, reglas criticas omitidas, contradicciones conocidas en contexto, bytes/tokens devueltos, costo y latencia de consulta. **No** inferir que la memoria 'causo' un cambio exitoso a partir de una correlacion de tareas.

**Cadencia:** evaluar fixtures en CI al tocar motor/prompt; `doctor` read-only en cambios de memoria; curaduria periodica solo si se detecta drift o una solicitud humana. No crear un cron/servicio automatico solo para revisar 70 filas.

**Evolucion posterior condicionada:** comparar retrieval con y sin refs, medir false positives y drift; solo si el corpus demuestra fallos recurrentes introducir mas ranking, tabla refs, vectores o indice de grafo.

### 5.13 Contratos de API CLI/MCP que deben sobrevivir [D]

Sin renombrar herramientas publicas: mantener `recordRule`, `recordDecision`, `searchMemory`, `memory context/list/doctor/export/import/gc`. Ampliar compatiblemente su **payload/documentacion**, no crear un conjunto paralelo de seis comandos.

| Operacion | Precondicion | Salida esperada | Invariante |
|---|---|---|---|
| `recordRule` | evidencia+scope+key, sin conflicto | key y revision o no-op | Nunca convertir session log en project rule |
| `recordDecision` | justificacion+key+estado y refs validas | key y fuente consultable | No cambia specs ni permisos |
| `searchMemory` | query/scopes acotados | snippets+keys+refs+estado | FTS deterministico; query parametrizada |
| `memory context` | presupuesto/superficie declarados | contexto base valido o diagnostico | Nunca truncar un invariante requerido |
| `memory doctor` | DB existente; apertura read-only | issues/warnings + exit code | No WAL checkpoint ni mutacion en modo diagnostico |
| `memory export` | permiso explicito y ruta segura | snapshot versionado | Sin secretos, historia configurable |
| `memory import` | dry-run previo en colaborativo | reporte de diferencias y resultado | Fail-closed ante divergencia |
| `archive` | approval, ledger cerrado, refs resolubles | move, merge o no-op, captura trazable | Idempotencia y compat legacy |

**Prioridad de desarrollo:** primero compatibilidad y pruebas; luego optimizar internamente. Si el CLI necesita un helper nuevo, agregarlo como funcion interna. Las interfaces nuevas deben justificarse por un consumidor concreto.

---

## 6. Eficiencia real: tokens, caché, delegación y tools

### 6.1 Baseline antes de la primera optimización económica

- Fijar tag/commit de framework, host/version, modelo exacto, proveedor, configuración MCP, perfil/tier y memoria exportada.
- Corpus mínimo de 3 arquetipos **con resultado esperado**: fix de conformidad, feature con delta, cambio de adapter/contrato compartido. Agregar 1 prueba de recuperación de memoria y 1 de continuidad entre sesiones.
- Repetir con repositorios clonados desde el mismo estado. Dos o tres corridas son exploratorias, no evidencia estadística para porcentajes pequeños.
- Usar `stats --session`/`byAgent`, leer sesiones e hijos sin asignar costo por duplicado. Registrar input sin caché, cached read/write, output/reasoning según semántica real del proveedor, USD, wall time, errores y rework.
- Guardar JSON y criterios de aceptación versionados fuera del código temporal del change. Evitar costos inventados o ratios con denominadores ambiguos.

**Modelo de costo** (conceptual, categorías no solapadas):

```text
Costo ≈ input_no_cacheado * precio_input
      + cache_read       * precio_cache_read
      + cache_write      * precio_cache_write_si_aplica
      + output_incl_reasoning_si_facturado_así * precio_output
      + llamadas_herramientas_cobradas_aparte
```

No sumar «prompt fijo» o «spawn» a la factura otra vez: son **atribuciones internas** de los tokens ya contabilizados.

### 6.2 Optimizar prefijos y superficie de tools

**Constatación externa:** OpenAI documenta que el contexto renderizado puede incluir definiciones de tools y que cambios tempranos alteran coincidencias de prefijo [V: EXT-08]; Anthropic documenta jerarquía tools → system → messages y TTL/precios específicos [V: EXT-09]. Los costos y políticas son por proveedor/modelo; no usar multiplicadores universales.

- Separar instrucciones universales estables de fragmentos dinámicos (fecha `generated_at`, git status, working-context cambiante). Nunca sacrificar frescura del dato funcional.
- Evitar reescribir el prefijo en cada evento de memoria; inyectar digest dinámico donde corresponda, no alterar innecesariamente reglas base.
- En OpenCode, preferir permisos `permission` por agente; `tools` legacy está deprecado [V: EXT-07]. Probar si la allowlist **oculta schemas de prompt** o solamente impide la invocación: no confundir control de acceso con ahorro de tokens.
- Para VS Code/Copilot y otros hosts, verificar qué herramienta recibe realmente cada agente y si los perfiles admiten MCP por rol; los hosts **no garantizan paridad** [V: EXT-12]. Mantener adaptador + tests por host.
- Comparar alternativas de tool surface y prefijo con igual modelo/tarea antes de aplicar una configuración global: una allowlist distinta entre agentes puede reducir tokens, pero también reducir reutilización de prefijo.
- Tratar TTL (5 min/1h en ofertas pertinentes de Anthropic, otras condiciones en OpenAI) como parámetro externo actualizable, no constante del framework.

### 6.3 Delegar por función económica y garantía

Una delegación se justifica cuando aporta al menos una de estas funciones:

1. **Aislamiento de contexto:** exploración/test produce salidas grandes que no deberían ensuciar al orquestador.
2. **Independencia:** revisión necesita una perspectiva diferente y permisos restringidos.
3. **Privilegios:** acción requiere una capacidad que el rol principal no debe tener.

**Regla:** no crear agentes por especialización de nombre. Preservar `@coder`, `@tester`, `@reviewer`, `@memory-keeper` y exploración con sus permisos. Reducir spawns de tareas mecánicas solo si existe una ruta segura y comprobada.

- `@tester` puede justificar aislamiento por logs y evidencias.
- `@reviewer` se justifica en alto riesgo por independencia; su presencia en bajo riesgo puede ser condicional **solo** si los guards y la política revisada lo permiten.
- `@technical-discovery` no debería arrancar para devolver dos líneas de `git status` si el host puede ofrecer estado de solo lectura fresco sin vulnerar permisos.
- No asumir que un subagente «hereda la caché del padre»: medir si coincide su prefijo y qué `cacheRead` efectivamente reporta.
- No paralelizar tareas con dependencias fuertes solo para tener más agentes concurrentes. Reducir nodos innecesarios antes de paralelizar.

### 6.4 Intake, tests y discovery

- **Intake:** explorar posibilidad de un estado derivado regenerado con frescura explícita (patrón actual `working-context.md`/`machine-env.md`) sin darle shell al orquestador. Si el estado está stale, refrescarlo por mecanismo autorizado; no tomar decisiones de seguridad sobre snapshots vencidos.
- **Specs merge:** convertir el merge de deltas semánticos a operación CLI idempotente y probada; revisar si ya existe `sync-specs` y envolverlo en vez de reimplementarlo. `mergeLocked` **no** sustituye a este parser.
- **Tests:** permitir selección determinística basada en `affected-set` cuando la cobertura sea confiable; ampliar a integración/full en cambios compartidos, dinámicos o de riesgo alto. Nunca inferir que «13 → 5 tests» es automáticamente mejor.
- **Discovery:** limitar output por relevancia, mapear afectación y evitar packs completos sin necesidad; agregar `.gitignore` solo si no oculta inputs relevantes. Refinar staleness para distinguir cambios de versión de cambios semánticos; preservar consentimiento de `STALE/material`.
- **Topología:** agregar presupuesto explícito; devolver índice navegable en lugar de inyectar lista creciente de todos los archivos.

### 6.5 Matriz de capacidades por host (información oficial, no suposición de paridad)

| Host / superficie | Capacidad verificada | Decisión para el adapter |
|---|---|---|
| **OpenCode** | Configuración de permisos por agente, patrones de tools/MCP y subagentes [V: EXT-07]. | Migrar gradualmente del campo `tools` legacy a `permission`, preservando tests de patrones y versión. |
| **Claude Code** | Subagentes Markdown con `tools`/`disallowedTools` y modelos por rol; heredan contexto según modo [V: EXT-17]. | Adaptar frontmatter y probar conjunto real de tools; no asumir que las reglas de permisos son idénticas a OpenCode. |
| **VS Code / Copilot** | Custom agents con selección de tools [V: EXT-12]. | Verificar harness elegido y la allowlist efectivamente entregada. |
| **Copilot cloud agent** | Tools y servidores MCP por perfil, con limitaciones propias [V: EXT-12]. | Mantener destino específico, no reutilizar sin traducción el archivo de VS Code. |
| **Cursor** | Admite subagentes en `.cursor/agents/`, contexto aislado y MCP heredado en tareas locales [V: EXT-18]. | **Oportunidad posterior:** el framework hoy instala solo skills en Cursor; ampliar soporte de agentes solo si tiene demanda y tests. |
| **Roo / Antigravity / CommandCode** | No hay verificación oficial suficiente de permisos/filtrado MCP por agente en esta investigación. | Conservar compatibilidad actual, marcar `capability: unverified`, no generar permisos falsos ni prometer ahorro. |

**Provider no equivale a host:** OpenCode puede usar diversos modelos; una sesión de OpenCode con OpenAI o Anthropic estará sujeta al caching real del proveedor y a cómo OpenCode renderiza la solicitud. **No hay garantía documental general de que un subagente herede caché de su padre.** [M]

| Proveedor | Confirmado externamente | Uso en este framework |
|---|---|---|
| **OpenAI API** | Prefijo renderizado y herramientas forman parte del material relevante para cache; la compatibilidad depende del modelo y de coincidencia de prefijo [V: EXT-08]. | Preservar prefijos estables, medir tokens cacheados de la respuesta efectiva. |
| **Anthropic API** | La jerarquía tools/system/messages afecta invalidación; modalidades de 5 min y 1 h tienen precios diferentes [V: EXT-09]. | No usar un único multiplicador fijo; comparar read/write/caducidad de modelo y sesión. |
| **Gemini API** | Caching implícito disponible en modelos compatibles; caching explícito y TTL dependen de API/modelo [V: EXT-19]. | Opt-in experimental por host/modelo; no asumir que toda la familia permite caché explícito. |

---

## 7. Multi-host, mirrors y compatibilidad

### 7.1 Única fuente de agentes/skills

- Confirmar si `skills/` genera `.opencode/skills/` y si el CLI regenerador es la única autoridad. Comparar hashes y comportamiento de `install/update/upgrade/import`.
- Editar únicamente fuente canónica, regenerar mirrors, verificar igualdad según normalizaciones propias de cada host.
- Si un mirror está modificado manualmente, detectar drift antes de sobrescribirlo (reportar/backup), salvo contrato `LOCKED` ya aprobado.
- Probar los ocho hosts declarados por `AGENT_TARGETS`; no asumir funciones de permiso equivalentes. Hosts con solo skills pueden mantener flujo documental, pero no pretender subagentes inexistentes.

### 7.2 Ruta de compatibilidad para cambios documentales

1. Changes antiguos con `design.md`: se pueden leer/archivar sin alteración.
2. Changes nuevos: ningún generator produce `design.md`.
3. Mirrors del host: se regeneran por la ruta normal `upgrade`, no a mano.
4. `init/install/update/upgrade/import --repair`: todos mantienen `LOCKED`, `EXTENSIBLE`, rutas y versiones coherentes.
5. Artifacts sin delta: se reconocen como fix de conformidad solamente si citan requisito canónico inequívoco.
6. No reescribir archivo histórico silenciosamente al actualizar el paquete.

---

## 8. Plan ejecutable por changes pequeños (orden prescriptivo)

> Cada change es independiente, tiene diff revisable, tests, checkpoint aplicable, respaldo y rollback. **No empaquetar todo en un único `spec-required`.** Guardar baseline antes de modificar contratos compartidos.

### CH-00 — Congelar baseline y matriz de compatibilidad (P0)

**Modificar:** harness/tests/reporting de lectura y documentación de baseline.  
**Hacer:** fijar commit + runtime Node + hosts/modelos/tiers; extraer `stats` histórico de 3 arquetipos; calcular cuentas de cache con semántica validada; registrar artefactos de golden tests; inspeccionar si skills son mirrors.  
**Aceptar:** baseline reproducible y guards existentes verdes, nada modificado en producción.  
**Rollback:** ningún cambio de comportamiento.

### CH-01 — Sanear memoria activa (P0, primero en comportamiento)

**Modificar:** datos de memoria con herramientas existentes, luego `working-context.md`.  
**Hacer:** respaldo consistente; consolidación **4→1 + 1 única preservada**; resolver contradicción de permisos con prueba/versionado; reclasificar bitácoras; verificar inyección y FTS.  
**Aceptar:** ninguna falsedad conocida inyectada; ninguna restricción necesaria perdida; tests/FTS íntegros; restauración ensayada.  
**Rollback:** restablecer snapshot íntegro, no «recrear clave» como único rollback.

### CH-02 — Contrato documental liviano (P0; release conjunto con CH-04)

**Modificar:** `agents/spec-writer.md`, `agents/orchestrator.md`, `agents/{coder,tester,reviewer,documenter}.md`; `skills/<fw>-{propose,ff,continue,update,onboard,upgrade,archive,bulk-archive}` y referencias; mirrors generados; `test/content-guards.test.js`.  
**Hacer:** eliminar `design.md` nuevo; `proposal ## Decisiones`; retirar `context.md` huérfano de la ruta nueva; tasks condicionales; cambiar objeto de checkpoint a contrato; lectura de legacy intacta. **No publicar sin CH-04 funcional y tests de captura durante coding.**  
**Aceptar:** 0 `design.md`/`context.md` nuevos, 5 decisiones únicas históricas conservadas, checkpoints explícitos, tests de legacy y guards verdes.  
**Rollback:** reinstalar versión anterior; datos históricos intactos.

### CH-03 — Fix de conformidad y delta opcional (P0)

**Modificar:** triage/clarifier, `@coder`, `@tester`, `@documenter`, archive y tests de specs.  
**Hacer:** si spec es correcta e inequívoca, citar Requirement, reproducir bug, corregir, probar y archivar sin delta; si falta/contradice, delta obligatorio.  
**Aceptar:** los dos caminos se distinguen en tests; archive no-op sin delta; no se aceptan cambios funcionales no especificados.  
**Rollback:** desactivar ruta nueva y utilizar flow formal.

### CH-04 — Decisiones de proposal a memoria, sin duplicación (P0; deploy junto con CH-02)

**Modificar:** `@memory-keeper`, archive/CLI donde ya exista captura, motor solo si hace falta para referencias; tests.  
**Hacer:** al cerrar, inspeccionar `## Decisiones`; promover solo duraderas, con `memory_key` estable + refs a capability/Requirement/change; no duplicar ni sobrescribir divergencias en silencio. Resolver archive fecha+slug. La decision que nace durante la implementacion debe editar el proposal por su rol autorizado y quedar aprobada si modifica alcance o riesgos; la ausencia de candidato no genera un spawn/registro vacio.  
**Aceptar:** decisión hallable desde sesión nueva; sin decisión → 0 escrituras; referencias legacy siguen funcionando; no se pierde justificación.  
**Rollback:** disabling de promoción; proposal versionado sigue siendo fuente histórica.

### CH-05 — Recuperación de contexto y límites seguros (P1)

**Modificar:** `src/core/memory/engine.js`, generación de working-context/overlays, tests de memoria y destilación.  
**Hacer:** contexto base crítico y estable, selección contextual por tarea, FTS5 y filtros, presupuesto seguro, sin truncamiento arbitrario; monitoreo de refs; corregir contradicción 8.000 caracteres vs 5 reglas/1.500 B.  
**Aceptar:** corpus mínimo de recall responde correctamente con evidencia; 0 críticos descartados; no aumenta costo injustificado de entrada; determinismo de ranking para mismo estado/consulta.  
**Rollback:** selección anterior disponible tras flag temporal, sin perder memoria.

### CH-06 — Operaciones determinísticas al CLI (P1)

**Modificar:** `src/cli/index.js`, `sync-specs`, capa de status/affected, tests CLI.  
**Hacer:** mover únicamente operaciones con semántica pura y consumidores comprobados; specs merge con dry-run/fail-closed; seleccionar tests focalizados cuando cobertura sea suficiente; evaluar intake read-only fresco.  
**Aceptar:** comandos idempotentes; mismas garantías del ledger; no shell nuevo para orquestador; sin merges silenciosos; tests representativos.  
**Rollback:** skills existentes como camino anterior.

### CH-07 — Optimización de cache, tools y modelos (P1 condicionado a baseline)

**Modificar:** adaptador del host y configuración de agents; estadísticas/tests multi-host.  
**Hacer:** A/B de prefijos estables; remover schemas innecesarios **solo** donde el host realmente los omite; medir cache hits en padre/hijo; experimentar modelos por rol si calidad equivalente.  
**Aceptar:** mejora de costo real con mismas tareas y calidad; modelos/hosts soportados verificados; sin pérdida de capability/seguridad.  
**Rollback:** perfil/config previa.

### CH-08 — Memoria colaborativa (P2, condicional por equipo)

**Disparador:** más de un worktree/desarrollador compartiendo decisiones y divergencias comprobadas.  
**Hacer:** backup/export, detección de conflicto por clave antes del import, genealogía/tombstones si necesaria, reporte auditable, decidir texto versionable por clave **solo** si snapshots no alcanzan.  
**Aceptar:** test dos ramas misma key divergentemente → import no sobrescribe en silencio; los worktrees recuperan memoria correcta; export externo sin secretos.  
**Rollback:** snapshot restaurable y formato anterior de lectura.

### CH-09 — Curaduría recurrente y auto-mejora supervisada (P2)

**Modificar:** checks existentes, salida de `memory doctor` o un solo subcomando diagnóstico si faltan capacidades.  
**Hacer:** detección determinística de refs rotas/duplicados exactos; revisión periódica de recuerdos que no tienen utilidad; corpus de recuperación conocido; sugerencias de mejora, no cambios semánticos automáticos.  
**Aceptar:** auditoría sin mutaciones en modo read-only; reportes verificables, 0 autopromociones críticas sin aprobación; mantenimiento mínimo.  
**Rollback:** desactivar job/skill; memoria no se reescribe.

### CH-10 — Hardening y release multi-host (P2)

**Hacer:** ejecutar matriz de hosts/versiones, instalación/upgrade/import, compatibilidad legacy, tests de permisos por host, smoke end-to-end y documentación de migración/rollback.  
**Aceptar:** checks completos verdes, no regresión contractual, baseline comparativo adjunto; versión etiquetada y release notes; proyectos anteriores pueden actualizar sin destruir changes.

---


## 8A. Secuencia de PRs de memoria: orden de ejecución detallado [D]

Estos PRs refinan CH-00, CH-01, CH-04, CH-05, CH-08 y CH-09. No son un segundo backlog: **son sus paquetes de implementacion**.

| PR | Dependencia | Archivos/superficies | Entregable verificable | Rollback |
|---|---|---|---|---|
| MEM-00 Snapshot y fixture | Ninguna | `src/core/memory/engine.js`, `src/cli/index.js`, `test/fixtures/` | Copia consistente + 10 consultas golden + digest DB | No cambia runtime |
| MEM-01 curaduría | MEM-00 | `.ancleto/memory.db`, `working-context` | 4->1, regla única intacta, contradiccion desactivada, 6-8 logs fuera | Restaurar snapshot real |
| MEM-02 `doctor` estricto | MEM-00 | `engine.js`, CLI, tests | Test de no-mutacion DB/WAL/SHM, distincion `doctor`/maintenance | Revertir commit |
| MEM-03 Captura versionada | MEM-01, DOC-01 | `proposal`, spec-writer, memory-keeper, archive | Decision que nace en coding y cruza archive; 0 escritura sin candidato | Deshabilitar promocion, mantener proposal |
| MEM-04 Ref resolver | MEM-03 | `engine.js`, lector refs, tests | slug archivado, Requirement y paths; conflicto visible | Fallback lectura proposal |
| MEM-05 recuperación task-aware | MEM-01, MEM-04 | `working-context`/distillation, `searchMemory` | 10 golden; no omisiones críticas | Feature flag/fallback anterior |
| MEM-06 Colaboracion segura | MEM-00, MEM-03 | `memory export/import`, opcional reindex | Dos worktrees divergen sin LWW silencioso | Export/import manual original desactivado en modo team |
| MEM-07 curaduría supervisada | MEM-05 | Tests/doctor/reporting | Reportes reproducibles; no auto-reescritura | Apagar detecciones opcionales |

**DOC-01** = CH-02 (eliminacion de design, `proposal ## decisiones`, tasks condicionales, `context` huerfano). **EXEC-01** = CH-03 (fix de conformidad). La nomenclatura MEM-/DOC-/EXEC- solo identifica el paquete para el agente; **no obliga** a crear nuevas carpetas ni comandos.

### 8A.1 Archivos concretos reportados en la auditoria

- `src/core/memory/engine.js`: selection `created_at DESC` (`:124`), corte (`:142-144`), import/supersesion (`:271-332`); corroborar hashes y lineas contra SHA.
- `src/cli/index.js`: export/import (`:2306-2362`), stats/cache (`:2744-2785`, `:3389-3411`), helpers de merge `LOCKED` (`:1394-1419`) que **no** sustituyen merge de specs.
- `agents/spec-writer.md:45,79` crea `design`; `agents/orchestrator.md:93,115,305-321` checkpoints/artifacts; `agents/{coder,tester,reviewer,documenter}.md` leen artifacts; guards en `test/content-guards.test.js`.
- `skills/ancleto-{propose,ff,continue,onboard,upgrade,update,archive,bulk-archive}/SKILL.md`; `skills/ancleto-propose/references/templates.md:190` si sigue ese path; mirrors `.opencode/skills` solo generados desde fuente.
- `.ancleto/working-context.md` tiene reglas truncadas, pero es artefacto generado. El cambio va al generador, no a editarlo manualmente.
- `AGENTS.md:67` vs `PRODUCT.md:30-31`: corregir contradiccion local/versionable; nunca declarar sincronizacion de DB por Git.

### 8A.2 Dependencias que NO deben invertirse

- No eliminar `design.md` hasta que **su sustituto `proposal ## Decisiones`** este probado para decisiones tomadas durante la implementacion; se puede desplegar en el mismo PR con test integrado.
- No habilitar import colaborativo hasta que `--dry-run` y conflicto fail-closed pasen escenarios dos ramas.
- No optimizar cache/modelos/tools antes de medir cache *facturado* y calidad final; no sobre-interpretar ratio read/input.
- No promocionar automaticamente conocimiento hasta que el backing Git sea accesible y la operacion sea reintentable.
- No ejecutar `memory doctor` que toque WAL en una auditoria supuestamente read-only.

### 8A.3 Deltas compactos por PR (lo que el agente debe entregar)

```text
PR_ID:
BASE_SHA:
FILES_CHANGED:
CONTRACT_BEFORE / CONTRACT_AFTER:
MIGRATION: (none | compatible | schema)
TESTS: <cmds + results>
MEMORY: <backup + keys added/superseded + refs verified>
SECURITY_GUARDS: pass/fail
COST: <tokens, USD, cache read/write, spawns, time; n/a si no aplica>
ROLLBACK: <instruccion reproducible>
OPEN_ISSUES: <no inventar porcentajes>
```

## 9. Suite mínima de pruebas de aceptación (obligatoria)

| ID | Escenario | Resultado exigido |
|---|---|---|
| T01 | Crear feature nueva | Proposal + delta; sin `design.md`; tasks solo cuando lo amerita. |
| T02 | Fix con Requirement correcto | Reproduce/soluciona/valida; sin delta; archive válido. |
| T03 | Bug con spec incorrecta | Genera/aprueba delta; no falsea conformidad. |
| T04 | Archive legacy con `design.md` | Se lee y mueve sin alterar historial. |
| T05 | Decisión nace durante implementación | Aparece en proposal; se recupera después de archive si es duradera. |
| T06 | Decisión no duradera | No se guarda nodo nuevo. |
| T07 | Memoria antigua crítica fuera de presupuesto | Se recupera o se bloquea explícitamente; jamás se omite silenciosamente. |
| T08 | Regla y decisión contradictorias | La versión no validada no se inyecta; evidencia recuperable. |
| T09 | Refs a change archivado | Resolver encuentra el único archivo correcto, falla si ambiguo. |
| T10 | Dos ramas importan una key distinta | No LWW silencioso cuando habilitada compartición colaborativa. |
| T11 | `memory doctor --read-only` | No escribe DB/WAL ni cambia sus bytes, o se separa una variante de mantenimiento explícita; test según semántica real de SQLite. |
| T12 | Tarea trivial | No se crean spawns/specs ni aprobaciones adicionales fuera del contrato vigente. |
| T13 | Cambio crítico auth/datos/contrato | Checkpoint, tests exigidos, ledger cerrado, review independiente. |
| T14 | `GUARANTEE NOT SUSTAINED` | Bloquea archive, incluso en camino corto. |
| T15 | Update/upgrade/import en 8 hosts | Assets canónicos, mirrors coherentes, LOCKED/EXTENSIBLE preservados. |
| T16 | Working-context cambia | Determinar impacto de caché y mantener información correcta/fresca. |
| T17 | Affected-set incompleto para dependencia dinámica | Escala tests/integración, no se declara validado a ciegas. |
| T18 | Rollback de curaduría/migración | Estado y consultas recuperados desde backup probado. |

No usar solo greps positivos sobre prompts. Incluir tests de mutación para comprobar que un guard falla cuando su contrato se viola.

---



### 9.1 Pruebas adicionales obligatorias del contrato de memoria

| ID | Escenario | Esperado |
|---|---|---|
| T19 | 4 reglas parecidas + 1 unica | Canonicidad sin perder excepcion del runner |
| T20 | Memory key re-grabada identica | `no-op`, sin revision falsa ni sobreescritura |
| T21 | Dos keys que se contradicen | No se publica ambas en base; alerta con fuentes |
| T22 | Proposal gana decision despues de checkpoint | Enmienda aprobada si afecta riesgo/alcance; memory la recupera luego |
| T23 | Candidate de sesion o secreto | No se guarda ni se inyecta |
| T24 | `memory doctor` bajo WAL activo | Sin checkpoint ni mutacion; modo de mantenimiento separado |
| T25 | Formato de export anterior | Import antiguo se lee; no pierde datos en migracion |
| T26 | Import de key solo superseded local | Reporta conflicto/revivir, nunca ignora silenciosamente |
| T27 | Memoria de producto tras clone/worktree DB vacia | Recuperable desde proposal versionado o declarado como gap bloqueante |
| T28 | Presupuestos `working-context` vs `ProjectMemoryRules` | Se prueban separadamente; no falsear 21/21 |
| T29 | `spec` ref con heading ambiguo | No elige al azar; reporta ambiguedad |
| T30 | OpenCode V1 y V2 permisos | El adapter no mezcla formatos `bash/task` y `shell/subagent` |

**Nota sobre tests de no mutacion:** probar apertura de solo lectura y comparar contenido/estado del triplete db/wal/shm sobre fixture controlada. SQLite puede crear/mantener archivos auxiliares segun configuracion; documentar la semantica exacta y nunca prometer una propiedad que el modo de apertura no garantiza en el entorno ensayado.

---

## 10. Criterios de aceptación por release

### 10.1 Calidad: bloquea la entrega

- 100% de tests contractuales existentes más los nuevos pertinentes pasan (exclusiones justificadas y registradas).
- Cero violaciones conocidas de permisos, Git, checkpoints, garantías o ledger.
- Cero decisiones arquitectónicas únicas perdidas en eliminación de artifacts.
- Cero requisitos canónicos modificados implícitamente por bug/fix.
- Cero contradicciones **conocidas** en el bloque base y cero invariantes marcados críticos omitidos.
- Rollback probado para cada migración que escriba estado.

### 10.2 Eficiencia: objetivo de optimización medido, no garantía ficticia

- Registrar mediana/rango de costo total USD, tiempo hasta cambio correcto, spawns y cache read/write por arquetipo.
- Buscar menos spawns innecesarios y menos lecturas redundantes; no comprometer calidad por un umbral arbitrario.
- Para cambios de prompts/configs: comparar sobre corpus fijo, misma versión de host/modelo y datos iniciales; si los resultados son ambiguos, no proclamar ahorro.
- Un reporte de mejora puede ser negativo: se documenta y se revierte o se corrige.

### 10.3 Usabilidad

- El usuario expresa la tarea en conversación natural y aprueba un resumen contractual legible; no tiene que recordar comandos SDD para cambios cotidianos.
- Una sesión nueva encuentra requisitos y decisiones vigentes con pocas consultas dirigidas.
- La documentación sirve para desarrollar, no para acumular archivos que nadie consulta.

---

## 11. Qué eliminar / conservar / posponer (decisión final)

| Acción | Decisión |
|---|---|
| **Eliminar** | Generación de `design.md` en nuevos changes; mantener lectura histórica. |
| **Eliminar** | Lecturas/borrados de `context.md` huérfano en flujo nuevo, sin crear reemplazo artificial. |
| **Eliminar** | Duplicación de reglas y bitácoras transitorias en memoria base. |
| **Eliminar** | Planificación exhaustiva `tasks.md` para cambios pequeños. |
| **Eliminar** | Spawns de tareas puramente determinísticas **cuando** exista ruta segura que realmente suprima el spawn. |
| **Conservar** | `aspec/specs`, gramática de deltas, archive move, proposal breve y traceabilidad. |
| **Conservar** | SQLite/FTS5, memory_key, MCP actual, permisos por rol y host adapters. |
| **Conservar** | `@coder`, `@tester`, `@reviewer`, `@memory-keeper`, agentes de discovery, sin agregar nuevos por ahora. |
| **Conservar** | Checkpoints explícitos y Validation Ledger, con objeto de aprobación más útil. |
| **Posponer** | Base vectorial, Engram, MongoDB, Neo4j y «agente automejorador». |
| **Posponer** | Migración de memoria por archivo/clave para todos; se activa por conflicto colaborativo real. |
| **Posponer** | Router nuevo con nombre distinto; primero hacer evolucionar el triage existente. |
| **Posponer** | Benchmarks comparativos contra frameworks externos hasta estabilizar corpus propio. |
| **Investigar/medir** | Reutilización del caché por subagentes, allowlist MCP efectiva, latencia, retrabajo y cobertura por affected-set. |

---

## 12. Riesgos de la reingeniería y respuestas previstas

| Riesgo | Prevención |
|---|---|
| Borrar información única de design | Migrar las 5 decisiones únicas a proposal/memoria; legacy intacto. |
| Proposal termina siendo otro design | Imponer brevedad, decisión + alternativa + justificación, sin duplicar specs. |
| `recordDecision` sobrescribe decisión incompatible | Comparar versión/clave y requerir reconciliación en import/merge colaborativo. |
| Se omite regla crítica al reducir contexto | Lista estable de críticos, test de overflow y bloqueo explícito. |
| Una spec faltante habilita cambio funcional sin contrato | Discriminador obligatorio de conformidad con Requirement inequívoco. |
| `@coder` amplía paths para redactar deltas | Incluir paths aprobados y guard de scope; no ampliar permisos globales. |
| El reviewer pierde independencia | Mantener review de riesgo alto y ledger; no darle bash. |
| Se reduce toolset pero empeora prompt cache | A/B de costo efectivo por host/modelo antes de activar por defecto. |
| Espejos quedan desincronizados | Fuente única, hashes/regeneración y test upgrade/import. |
| Un comando `doctor` diagnostica escribiendo DB | Separar modo read-only de mantenimiento y probar mutaciones WAL. |
| Migración gigante imposible de revertir | CH-00..CH-10, flags de transición temporales, snapshots y tags. |

---

## 13. Instrucciones para el agente implementador

1. Leer el commit actual de `README.md`, `AGENTS.md`, `PRODUCT.md`, `agents/orchestrator.md`, specs/memoria/skills y guards pertinentes. No confiar en líneas de esta auditoría si el repo cambió.
2. Verificar fuente canónica y mirrors **antes de modificar skills**. No editar generado manualmente.
3. Abrir un change por etapa (máximo una iniciativa coherente por change), entregar diff acotado, tests, decisión de aprobación y plan de rollback.
4. Prioridad operativa: **CH-00 → CH-01 → CH-02 → CH-03 → CH-04 → CH-05**. CH-06/07 después de medir; CH-08 solo si se necesita; CH-09/10 de consolidación.
5. No pedir que se aprueben cuatro documentos: mostrar contrato y decisión; respetar los stops humanos existentes.
6. Registrar en cada PR: **hecho verificado / decisión / hipótesis medida / deuda restante**. Nunca presentar una hipótesis de ahorro como resultado medido.
7. Si un test de seguridad o documentación falla, detener la promoción. No «arreglar» el guard para ocultar una violación.
8. Evitar scope creep: si aparece un problema ajeno, documentarlo y abrir otro change, no expandir rutas de escritura silenciosamente.
9. No construir nueva infraestructura por una sola excepción; extender mecanismos actuales cuando sean suficientes.
10. Publicar al final un cuadro **antes/después**: artifacts, spawns, costo, tiempo, tests, referencias recuperables, regresiones, decisiones únicas preservadas.

### Primer PR recomendado

`CH-01: saneamiento verificable de memoria` después de `CH-00` liviano. Cambiar solo datos de memoria y guards mínimos: 4→1 preservando la regla única, reconciliar la contradicción sobre permisos con prueba de versión, retirar bitácoras del contexto base. Ejecutar restauración desde snapshot. **No mezclarlo con `design.md`.**

### Segundo PR recomendado

`CH-02: contrato documental mínimo`. Eliminar `design.md` del flujo nuevo, registrar `## Decisiones`, retirar `context.md` huérfano, mantener paths legacy y actualizar guards/mirrors. Incluye las cinco decisiones históricas únicas como caso de aceptación.

---

## 14. Mejoras futuras con margen real, sin convertirlas en requisitos hoy

1. **Architecture fitness functions:** tests que rechacen dependencias entre capas o contratos inválidos, aprovechando `affected-set` y specs. Valor: menos Frankenstein, no más prompts. Activar en capacidades críticas primero.
2. **Navegación bidireccional Requirement ↔ test ↔ decisión:** manifest generado si las relaciones no son inferibles; no duplicar requisitos. Priorizar contratos de API y eventos compartidos.
3. **Modelos por tipo de trabajo:** elegir un modelo más barato para exploración solo si no aumenta rework, medido con las mismas tareas.
4. **Higiene del repositorio continua:** detectar reglas contradichas, refs rotas, artefactos sin consumidor y cambios de arquitectura no documentados; generar propuestas revisables, nunca autoaceptar decisiones críticas.
5. **Context budget adaptativo:** a partir de casos reales, optimizar la cantidad de snippets y el tamaño de working-context; no implementar aprendizaje automático sin corpus suficiente.
6. **Reporte multi-host unificado:** normalizar métricas de OpenCode, Claude, VS Code/Copilot y demás cuando sus APIs ofrezcan equivalentes fiables; si no, mostrar `not-supported` y no inventar costo.
7. **Descubrimiento incremental:** cachear hashes/índices y evitar repacks completos; imponer presupuesto de I/O además de tokens.
8. **Política de mantenimiento basada en uso:** si existe una regla nunca consultada, revisar relevancia antes de suprimirla; no inferir inutilidad por frecuencia baja si es crítica.
9. **Seguridad de referencias externas:** validar paths de memoria y metadatos como datos no confiables; no convertir contenido recuperado en instrucciones de nivel superior sin autorizaciones.

**Criterio de promoción:** cada mejora futura requiere consumidor, costo de mantenimiento estimado, test de compatibilidad y una métrica útil. No hay «feature» automática por el simple hecho de estar de moda.

---

## 15. Bibliografía verificada y cómo se aplica

Consulta realizada el **27-10-2026**. Se priorizaron textos primarios y documentación de proveedores. Estos enlaces sustentan mecanismos generales; **no prueban el costo o la calidad de este repositorio**.

| ID | Fuente primaria | Hallazgo útil para el plan |
|---|---|---|
| **EXT-01** | [NASA NPR 7150.2D](https://swehb.nasa.gov/spaces/SITE/pages/123601159/NPR%2B7150.2D) | Tailoring proporcional a riesgo; trazabilidad bidireccional requisitos/verificaciones. |
| **EXT-02** | [MIT 6.031 — Software Construction](https://web.mit.edu/6.031/www/sp18/) | Especificaciones, tests, revisiones, modularidad, invariantes y facilidad de evolución. |
| **EXT-03** | [Google SRE Workbook — Eliminating Toil](https://sre.google/workbook/eliminating-toil/) | Eliminar tareas repetitivas y evaluar costo de automatizar/mantener. |
| **EXT-04** | [SQLite FTS5](https://www.sqlite.org/fts5.html) | BM25, tablas external-content, triggers, rebuild, búsqueda local; no exigen vectores. |
| **EXT-05** | [Node.js 24 — `node:sqlite`](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) | Al 27-10-2026 figura Stability **1.2 — Release candidate**; probar minor de Node soportado y APIs usadas. |
| **EXT-06** | [Git — worktree](https://git-scm.com/docs/git-worktree) | Cada worktree permite trabajar con ramas separadas; no garantiza compartir SQLite local ignorado por Git. |
| **EXT-07** | [OpenCode — permisos](https://docs.opencode.ai/docs/permissions/) y [agentes](https://docs.opencode.ai/docs/agents/) | `permission` por agente, patrones y reglas; `tools` legacy deprecated. Validar comportamiento exacto por versión. |
| **EXT-08** | [OpenAI — Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) | Cache sobre prefijos renderizados, incluso definición de tools; cambios previos afectan reutilización. |
| **EXT-09** | [Claude — Tool use with prompt caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching) y [pricing](https://platform.claude.com/docs/en/about-claude/pricing) | Orden tools/system/messages, invalidación, TTL y precios de lectura/escritura según modalidad/modelo. |
| **EXT-10** | [SQLite — WAL](https://sqlite.org/wal.html) | Advertencias sobre checkpoint, lectores y archivos auxiliares; no compartir binario por Git como fuente colaborativa. |
| **EXT-11** | [OpenAI — Harness engineering](https://openai.com/index/harness-engineering/) | Repo como sistema de conocimiento, constraints ejecutables, documentación navegable y limpieza continua de entropía. |
| **EXT-12** | [VS Code — custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents) y [GitHub Copilot — custom agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents) | Tools por agente existen en determinadas superficies; la semántica concreta depende del host. |
| **EXT-13** | [GitHub Spec Kit — bugfix workflow](https://github.com/github/spec-kit/blob/main/docs/guides/bugfix.md) | La corrección de bugs puede tener un flujo propio sin recorrer obligatoriamente SDD feature. |
| **EXT-14** | [OpenAI — Agent evaluations](https://developers.openai.com/api/docs/guides/agent-evals) | Datasets, trazas y criterios de regresión para agentes. |
| **EXT-15** | [MADR — Markdown Architectural Decision Records](https://github.com/adr/madr) | Referencia para capturar decisiones breves/versionadas; **no obliga** a crear ADRs externos en este framework. |
| **EXT-16** | [OpenAI — Rethinking skills and prompts](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | Revisar prompts/skills heredados; demasiada instrucción es deuda de contexto. |
| **EXT-17** | [Claude Code — subagents](https://code.claude.com/docs/en/sub-agents) y [tools reference](https://code.claude.com/docs/en/tools-reference) | Frontmatter y allowlists/denylists por subagente; cuidado con modo de ejecución y permisos. |
| **EXT-18** | [Cursor — subagents](https://cursor.com/docs/subagents) | Cursor ya soporta subagentes y aislamiento de contexto; potencial ampliación de adapter. |
| **EXT-19** | [Google Gemini — context caching](https://ai.google.dev/gemini-api/docs/caching) | Caching implícito vs explícito según versión de API y modelo; no es una constante del host. |


| **EXT-20** | [OpenCode V2 - permissions](https://opencode.ai/v2/docs/permissions) y [Migracion V1](https://dev.opencode.ai/v2/docs/migrate-v1/) | V2 usa array `permissions`/`shell`/`subagent`; no mezclar reglas de V1 `permission`/`bash`/`task`. El matcher depende de version y configuracion. |
| **EXT-21** | [SQLite PRAGMA query_only](https://www.sqlite.org/pragma.html#pragma_query_only) | `query_only` bloquea mutaciones SQL normales pero no equivale a apertura inmutable ni impide checkpoints; usar modo real readOnly. |
| **EXT-22** | [SQLite DatabaseSync readOnly (Node 24)](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) | Opcion `readOnly: true` en `DatabaseSync`; modulo Node 24 Stability 1.2 RC. |
| **EXT-23** | [Claude cache diagnostics](https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics) | Prefijos, tools y timestamps alteran hits; hay diagnostico en APIs compatibles. |
| **EXT-24** | [MIT 6.031 objetivos](https://web.mit.edu/6.031/www/sp21/general/) | Safe from bugs / easy to understand / ready for change como indicadores de calidad, no como porcentaje de ahorro. |

### 15.1 Hallazgos externos que sí cambian prioridades

- OpenCode documenta `permission` por agente y recomienda abandonar el campo booleano legacy `tools`: hacer compatibilidad por versión, no un rewrite general.
- El prefijo cacheable incluye definiciones y orden de herramientas en proveedores relevantes. Optimizar MCP **sin** medir caché puede empeorar resultados.
- La estabilidad reportada de `node:sqlite` en Node 24 es release candidate: **no reemplazar el motor**, pero fijar/testing de minors y backups antes de explotar APIs nuevas.
- Spec Kit ya diferencia bugfix del pipeline SDD normal: un fix de conformidad es un patrón de ingeniería razonable; su implementación concreta sigue siendo nuestra.
- Los estudios de ingeniería de agentes recomiendan repositorio legible, instrucciones compactas, pruebas automáticas y limpieza incremental; no justifican añadir memoria vectorial para 70 nodos.

---

## 16. Definition of Done del programa completo

El plan estará implementado cuando:

- [ ] La versión nueva genera cero `design.md` y cero `context.md` en changes nuevos, con compatibilidad legacy.
- [ ] `proposal.md` registra decisiones duraderas de forma revisable; specs siguen siendo fuente canónica.
- [ ] Un fix de conformidad se archiva sin delta y con Requirement verificable.
- [ ] Un cambio contractual sí genera delta y no altera specs aprobadas sin validación.
- [ ] La memoria base no contiene contradicciones conocidas ni omite invariantes críticos.
- [ ] Las refs clave de decisiones se resuelven incluso después del archive.
- [ ] Los 5 casos históricos de decisiones únicas sobreviven a la migración.
- [ ] Se conservan todos los guards de seguridad, permisos y Git; tests de mutación cubren nuevos contratos.
- [ ] Baseline y reportes comparativos usan costo real, no estimaciones arbitrarias.
- [ ] `skills/` y mirrors tienen fuente única/regeneración comprobada.
- [ ] Las políticas de caché/delegación se activan solo tras A/B con calidad equivalente.
- [ ] Cada fase es reversible y tiene changelog/test/rollback.

**Criterio final:** *desarrollar orgánicamente, preservar conocimiento útil, validar con rigor proporcional al riesgo y pagar únicamente por el proceso que aporta valor.*

---

## 17. Instruccion directa para el agente que implementa

> **Objetivo:** aplicar este plan a la version exacta del repositorio, por cambios atomicos y reversibles. No abrir nuevas conversaciones de arquitectura ni solicitar permisos para cada detalle de bajo riesgo. Respetar los checkpoints humanos existentes.

1. Registrar `BASE_SHA`, Node minor, host/V1-V2, tier, inventario de memoria y fuente real de mirrors; ejecutar tests actuales.
2. Ejecutar MEM-00 y emitir reporte inicial de 10 golden queries sin mutar DB viva.
3. Preparar MEM-01 con snapshot SQLite consistente y mapa de cuatro restricciones -> canonicidad; **pedir solo la aprobacion requerida para modificar DB**, luego aplicar.
4. Implementar DOC-01 + MEM-03 como paquete compatible: eliminacion de design nuevo con decisión en proposal y captura durante coding; tests T01/T04/T05/T22.
5. Implementar EXEC-01: fix de conformidad y archive sin delta, preservando specs y aprobaciones.
6. Implementar MEM-02, MEM-04 y MEM-05, priorizando reglas críticas y refs. Comparar las diez preguntas golden.
7. Implementar MEM-06 solo cuando el alcance colaborativo exija sincronizacion; en cualquier caso **prohibir** que un modo llamado colaborativo haga LWW silencioso.
8. Reutilizar `stats` para optimizar prefijos y tools. Si un host no expone metrica, reportar `not-supported`; no extrapolar valores de otro host.
9. Cerrar con matriz de hosts, guard tests, rollback ensayado, cambios de version y antes/despues. No publicar un release con una decision unica historica perdida.

**Protocolo en caso de discrepancia:** [R] no coincide con SHA -> corregir informe y seguir codigo; [V] contradice prueba reproducible host/version -> aislar comportamiento y no generalizar; [D] imposible sin violar seguridad -> detener esa tarea y proponer cambio minimo compatible; [M] no medido -> no reclamar ahorro. El plan es prescriptivo, pero las garantias son superiores al calendario.

### Checklist final de cobertura del plan

- [ ] Memoria: fuentes y ownership, capturas, rechazos, key, lifecycle, conflictos, refs, ranking, presupuestos y disclosure.
- [ ] Memoria: 4+1, regla falsa, bitacoras, 5 decisiones historicas, reindex de worktree, export/import LWW y diagnostico WAL.
- [ ] Artifacts: design fuera, context huerfano fuera, tasks condicional, proposal como puente, specs canonical/delta condicional.
- [ ] Workflow: checkpoints contractuales, fix conformidad, archive no-op, ledger cerrado, reviewer independiente, commit solo coder.
- [ ] Arquitectura: seed derivado, provenance, guard de acoplamiento, mirrors unica fuente, ocho hosts y V1/V2.
- [ ] Eficiencia: costo real, cache read/write con semantica correcta, MCP por agente, prefijos, spawns y tests afectados.
- [ ] Operacion: seguridad de queries/refs, secretos, backups, rollback, compat de snapshots, Node runtime.
- [ ] Mejora continua: corpus golden versionado, gates de calidad, evaluacion de uso y curaduria asistida sin self-editing.
