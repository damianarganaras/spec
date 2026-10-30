# Delta: memory-engine

## ADDED Requirements

### Requirement: Refs normalizadas materializadas en el contenido del nodo

Todo nodo nuevo SHALL declarar sus referencias dentro de `content`, en un bloque parseable que
comienza con una línea `refs:` seguida de una lista con guion. La gramática SHALL ser cerrada y
normalizada:

```text
spec:<capability>#<stable-heading>
change:<stable-change-slug>
path:<repository-relative-path>
commit:<git-sha>
workitem:<tracker>:<external-key>
```

`commit:` y `workitem:` son opcionales. Las refs NO SHALL materializarse en una tabla ni en una
columna nueva: NO SHALL crearse `memory_refs` ni una migración de schema. La consulta inversa por
`spec:` o `change:` SHALL resolverse sobre el texto indexado de `content`. El bloque `refs:` es el
único elemento estructurado admitido en `content`.

#### Scenario: Un nodo declara sus refs en el contenido

- **WHEN** se escribe un nodo nuevo con un bloque `refs:` que contiene `change:mem-03-promocion-decisiones-refs`
  y `path:src/core/memory/engine.js`
- **THEN** el nodo persistido mantiene esas refs dentro de `content`
- **AND** el conjunto de objetos de `sqlite_master` es idéntico antes y después de la escritura

#### Scenario: Sin tabla ni columna nueva

- **WHEN** se escribe un nodo con refs
- **THEN** no existe la tabla `memory_refs` ni una columna de refs
- **AND** la lectura de `memory_nodes` conserva su DDL actual

### Requirement: Validación fail-closed de refs en el camino único de escritura

La validación de refs SHALL vivir en `recordNode`, el camino único de escritura del engine, y SHALL
ejecutarse antes de abrir la transacción: un rechazo NO SHALL escribir ni superseder ningún nodo. La
política SHALL ser fail-closed por construcción: se validan todas las escrituras que pasan por
`recordNode` y la única exención es una procedencia resuelta por el runtime exactamente igual a
`runtime` (default programático y fixtures). Una procedencia no prevista NO SHALL quedar exenta.
`cli:import` queda fuera porque NO SHALL pasar por `recordNode` y conserva su semántica
last-writer-wins. La superficie real de captura en producción es `mcp:ancleto-memory`; una
procedencia `agent:<rol>` provista por el host SHALL validarse por ser distinta de `runtime`.

Una `decision` SHALL tener al menos una ref `spec:` o `change:`. Una `rule` SHALL tener al menos una
ref `path:`, `spec:` o `change:`, o un `path:` que apunte a un archivo existente bajo `test/`. Un
bloque `refs:` vacío, una línea que no matchea la gramática o un prefijo de ref desconocido SHALL
rechazarse, nunca ignorarse. `path:` SHALL ser relativo al repositorio, NO SHALL ser absoluto, NO
SHALL contener `../` y SHALL apuntar a un archivo existente; un sufijo `:linea` es sólo un hint y NO
SHALL usarse para resolver.

Todo rechazo SHALL nombrar la `memory_key` y la regla violada, y la ref ofensora cuando aplique. Los
nodos existentes sin refs NO SHALL revalidarse, NO SHALL generar error y NO SHALL backfillearse. Las
firmas JSON Schema de las tools MCP NO SHALL ganar campos: `memory_key`, `content`, `justification` y
`scope` siguen siendo la superficie.

#### Scenario: Decisión sin ancla rechazada

- **WHEN** una superficie de captura intenta escribir una `decision` sin ref `spec:` ni `change:`
- **THEN** `recordNode` lanza un error que nombra la `memory_key` y la regla violada
- **AND** no se crea ni se supersede ningún nodo

#### Scenario: Regla sin anclaje rechazada

- **WHEN** una superficie de captura intenta escribir una `rule` sin `path:`, `spec:`, `change:` ni
  anclaje a un test existente
- **THEN** `recordNode` lanza un error que nombra la `memory_key` y la regla violada
- **AND** la base queda sin cambios

#### Scenario: Ref con prefijo desconocido o path inválido rechazada

- **WHEN** el bloque `refs:` contiene un prefijo no previsto, un `path:` absoluto o un `path:` con
  `../`
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref ofensora

#### Scenario: Los nodos existentes sin refs no generan error

- **WHEN** la memoria contiene nodos activos escritos antes de esta validación, sin refs
- **THEN** ninguna lectura los revalida ni falla
- **AND** no se reescriben ni se backfillean

#### Scenario: El import conserva su semántica

- **WHEN** se importa un JSON con entradas sin refs mediante `importNodes`
- **THEN** el import inserta y actualiza con la semántica last-writer-wins existente
- **AND** no aplica la validación de refs

#### Scenario: La escritura programática no se valida

- **WHEN** se invoca `engine.recordNode` con procedencia `runtime` (default, sin `source`) y sin refs
- **THEN** el nodo se persiste
- **AND** la validación de refs no se ejecuta

#### Scenario: Una procedencia distinta de runtime se valida

- **WHEN** se invoca `engine.recordNode` con `context.source` `agent:memory-keeper` y `content` sin refs
- **THEN** `recordNode` lanza un error que nombra la `memory_key` y la regla violada
- **AND** no se crea ni se supersede ningún nodo

### Requirement: Resolución de refs `change:` con unicidad

Una ref `change:<slug>` SHALL resolver a exactamente una ubicación: `aspec/changes/<slug>` para un
change activo, o un directorio `aspec/changes/archive/YYYY-MM-DD-<slug>` cuyo nombre coincida
exactamente con el formato `YYYY-MM-DD-<slug>` con el slug completo, sin admitir sufijos parciales del
slug, para un change archivado. La resolución SHALL validar unicidad: cero coincidencias o más de
una SHALL rechazar la escritura. El sistema NO SHALL elegir arbitrariamente entre un change activo y
uno archivado con el mismo slug, ni entre dos archives que coincidan.

#### Scenario: Una ref a un change archivado resuelve

- **WHEN** se escribe un nodo con `change:<slug>` y existe un único
  `aspec/changes/archive/YYYY-MM-DD-<slug>`
- **THEN** la ref resuelve y la escritura se acepta

#### Scenario: Una ref a un change activo resuelve

- **WHEN** se escribe un nodo con `change:<slug>` y existe `aspec/changes/<slug>`
- **THEN** la ref resuelve y la escritura se acepta

#### Scenario: Ref inexistente rechazada

- **WHEN** se escribe un nodo con `change:<slug>` y no existe ni el change activo ni un archive
  coincidente
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref

#### Scenario: Un slug parcial no resuelve

- **WHEN** se escribe un nodo con `change:<slug-parcial>` y el archive existente sólo coincide como
  sufijo de un slug más largo
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref
- **AND** la resolución no acepta coincidencias por sufijo parcial

#### Scenario: Ambigüedad no se resuelve al azar

- **WHEN** existen dos ubicaciones que coinciden con `change:<slug>`
- **THEN** la escritura se rechaza nombrando la `memory_key`, la ref y la ambigüedad
- **AND** el sistema no selecciona ninguna de las dos

### Requirement: Resolución de refs `spec:` por heading canónico

Una ref `spec:<capability>#<heading>` SHALL resolverse contra `aspec/specs/<capability>/spec.md`
comparando el heading contra las líneas `### Requirement: <texto>` del archivo, en forma exacta
(trim y colapso de espacios) y canónica (minúsculas, sin diacríticos, sin backticks ni negritas,
espacios colapsados). La resolución NO SHALL usar FTS, porque el índice sólo contiene el contenido de
`memory_nodes`. Cero coincidencias SHALL rechazar la escritura. Dos o más coincidencias bajo
cualquiera de las dos formas SHALL reportar ambigüedad y rechazar la escritura, sin elegir.

#### Scenario: Heading exacto resuelve

- **WHEN** se escribe un nodo con `spec:memory-engine#Alcance del bloque de reglas proactivas`
- **THEN** la ref resuelve contra el `Requirement` correspondiente y la escritura se acepta

#### Scenario: Heading canónico resuelve

- **WHEN** el heading de la ref difiere en mayúsculas, espacios o diacríticos del heading canónico
- **THEN** la ref resuelve por la forma canónica y la escritura se acepta

#### Scenario: Capability o heading inexistente rechazado

- **WHEN** la capability no tiene `spec.md` o el heading no coincide con ningún `Requirement`
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref

#### Scenario: Ambigüedad de heading reportada

- **WHEN** dos `Requirement` distintos canonicalizan al mismo heading
- **THEN** la escritura se rechaza reportando la ambigüedad
- **AND** el sistema no elige uno de los dos

### Requirement: Rechazo de secretos en el camino de escritura

Toda escritura de un nodo nuevo SHALL inspeccionar `content` y `justification` y SHALL rechazarla si
contiene un patrón de credencial: claves con prefijo `sk-`, `ghp_` o `AKIA`, encabezados
`Authorization: Bearer`, asignaciones tipo `TOKEN=`/`SECRET=`/`PASSWORD=` y bloques de clave privada.
El rechazo SHALL ser incondicional, sin importar la procedencia, y NO SHALL escribir ni superseder
ningún nodo. El mensaje SHALL nombrar la `memory_key` y la regla violada y NO SHALL repetir el valor
detectado. Un candidato de sesión —transcripción, estado transitorio de tareas o resumen de sesión— NO
SHALL clasificarse como decisión duradera en la captura; su rechazo corresponde al gate de promoción y
NO SHALL resolverse por heurística en el engine.

#### Scenario: Credencial en el contenido rechazada

- **WHEN** se intenta escribir un nodo cuyo `content` contiene `Authorization: Bearer <valor>`
- **THEN** la escritura se rechaza nombrando la `memory_key` y la regla
- **AND** el mensaje no incluye el valor detectado
- **AND** no se crea ningún nodo

#### Scenario: Credencial en la justificación rechazada

- **WHEN** se intenta escribir un nodo cuya `justification` contiene `API_TOKEN=<valor>`
- **THEN** la escritura se rechaza y la base queda sin cambios

#### Scenario: Texto sin credenciales no se bloquea

- **WHEN** `content` menciona una variable de entorno por su nombre sin asignarle un valor
- **THEN** la escritura se acepta

### Requirement: Render del bloque proactivo sin el bloque `refs:`

El render de `<ProjectMemoryRules>` en `buildWorkingContext` SHALL mostrar, por cada regla, sólo la
**prosa** de su `content`, omitiendo el bloque `refs:` completo —la línea `refs:` y sus entradas—.
El `content` **almacenado** SHALL permanecer intacto con sus refs: el recorte SHALL aplicarse
únicamente en el render del bloque proactivo y NO SHALL persistirse ni propagarse a otras salidas.
La lectura de operador, `export`, `list`, `searchMemory` y las tools MCP NO SHALL cambiar. Las
refs se resuelven bajo demanda y NO SHALL consumir el presupuesto fijo (`maxChars`) del bloque. El
orden, el filtro de nodos, el tope y el `<ContextOverflowWarning>` SHALL conservarse sin cambios.
Una regla cuyo `content` no tenga bloque `refs:` SHALL renderizarse igual que antes.

#### Scenario: Una regla con `refs:` se renderiza sin el bloque

- **WHEN** una regla activa del scope inyectado tiene un `content` compuesto por prosa seguida de un
  bloque `refs:` válido
- **THEN** el bloque `<ProjectMemoryRules>` muestra la prosa de esa regla
- **AND** el bloque NO muestra la línea `refs:` ni sus entradas
- **AND** el `content` almacenado del nodo sigue conteniendo el bloque `refs:`

#### Scenario: Una regla sin `refs:` no cambia

- **WHEN** una regla activa del scope inyectado tiene un `content` sin bloque `refs:`
- **THEN** el bloque `<ProjectMemoryRules>` la renderiza con la prosa completa, igual que antes
- **AND** no se agrega ni se quita texto

#### Scenario: Las demás salidas conservan las refs

- **WHEN** se lee el mismo nodo por `export`, `list`, `searchMemory` o las tools MCP
- **THEN** el `content` devuelto incluye su bloque `refs:`
- **AND** el orden, el filtro, el tope y el aviso de truncamiento del bloque proactivo no cambian

## MODIFIED Requirements

### Requirement: Frontera entre procedencia y enforcement

La procedencia SHALL ser un dato **descriptivo de auditoría**. El motor NO SHALL usar `source` para
autorizar ni denegar escrituras, ni para asignar o retirar ownership y permisos sobre los nodos, y NO
SHALL tratar como verificada una identidad de actor auto-declarada por el caller. `source` SÍ MAY
condicionar la **validación de contenido** que se aplica a una escritura sobre `recordNode`: cada regla
de contenido SHALL declarar si es incondicional o si tiene una exención por procedencia, y una exención
NO SHALL extender la escritura más allá de esa regla. En particular, la validación de refs declara su
exención para la procedencia `runtime`, mientras que el rechazo de secretos se declara incondicional y
se evalúa en toda escritura. En la arquitectura actual (MCP sobre stdio, sin canal de identidad
autenticado), la superficie de escritura del runtime es el único actor registrable; el rol del LLM NO
SHALL registrarse como si estuviera autenticado. La implementación de enforcement de ownership SHALL
quedar fuera de este change.

#### Scenario: La procedencia no autoriza escrituras

- **WHEN** se registra un nodo desde cualquier superficie confiable
- **THEN** el motor lo persiste sin evaluar `source` como condición de autorización

#### Scenario: La procedencia describe la superficie, no el rol del LLM

- **WHEN** se audita la procedencia de un nodo escrito por una tool MCP
- **THEN** la procedencia identifica la superficie de escritura (`mcp:ancleto-memory`)
- **AND** no afirma una identidad de rol del LLM como verificada

#### Scenario: Una exención de contenido no altera ownership ni permisos

- **WHEN** se invoca `recordNode` con procedencia `runtime`
- **THEN** la exención de refs se aplica sólo a esa validación de contenido
- **AND** no se saltea ninguna otra validación de contrato ni cambia el ownership del nodo
- **AND** el rechazo de secretos se evalúa igual que en cualquier otra procedencia
