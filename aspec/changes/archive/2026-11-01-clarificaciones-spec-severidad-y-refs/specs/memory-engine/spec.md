## MODIFIED Requirements

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

`change:<stable-change-slug>` SHALL escribirse con el slug del change **tal como se nombra el
change**, sin el prefijo `YYYY-MM-DD-`. El prefijo de fecha lo aporta únicamente el nombre del
directorio archivado (`aspec/changes/archive/YYYY-MM-DD-<slug>`) y NO SHALL incluirse en la ref.

`commit:` y `workitem:` son opcionales. Las refs NO SHALL materializarse en una tabla ni en una
columna nueva: NO SHALL crearse `memory_refs` ni una migración de schema. La consulta inversa por
`spec:` o `change:` SHALL resolverse sobre el texto indexado de `content`. El bloque `refs:` es el
único elemento estructurado admitido en `content`.

Los items de la lista SHALL poder ir indentados o no, y ambas formas SHALL parsearse de forma
idéntica: un item es toda línea que matchea un guion seguido de un espacio (`- `) con cualquier
indentación previa, incluida ninguna, y su contenido SHALL validarse contra la gramática cerrada.

El bloque SHALL terminar en la primera línea en blanco o en la primera línea que no sea item de
lista ni esté indentada. Una línea indentada que no es item SHALL permanecer dentro del bloque y
SHALL ser inválida. Toda línea no-item dentro del bloque SHALL ser inválida. Un bloque sin items NO
SHALL aportar refs; el rechazo en escritura de ese caso corresponde al Requirement de validación
fail-closed y NO se re-enuncia acá.

#### Scenario: Un nodo declara sus refs en el contenido

- **WHEN** se escribe un nodo nuevo con un bloque `refs:` que contiene `change:mem-03-promocion-decisiones-refs`
  y `path:src/core/memory/engine.js`
- **THEN** el nodo persistido mantiene esas refs dentro de `content`
- **AND** el conjunto de objetos de `sqlite_master` es idéntico antes y después de la escritura

#### Scenario: Sin tabla ni columna nueva

- **WHEN** se escribe un nodo con refs
- **THEN** no existe la tabla `memory_refs` ni una columna de refs
- **AND** la lectura de `memory_nodes` conserva su DDL actual

#### Scenario: Items sin indentar se parsean

- **WHEN** un `content` declara `refs:` seguido de items de lista sin indentación
- **THEN** los items se parsean y se validan igual que los items indentados
- **AND** el bloque aporta todas las refs declaradas

#### Scenario: Items indentados siguen funcionando

- **WHEN** un `content` declara `refs:` seguido de items de lista indentados
- **THEN** los items se parsean y se validan como antes
- **AND** el bloque aporta todas las refs declaradas

#### Scenario: El bloque termina en línea en blanco

- **WHEN** un `content` declara `refs:` con items y luego una línea en blanco seguida de prosa
- **THEN** el bloque termina antes de la línea en blanco
- **AND** la prosa posterior no se interpreta como refs

#### Scenario: Línea no-item dentro del bloque es inválida

- **WHEN** un `content` declara `refs:` y dentro del bloque aparece una línea indentada que no es
  item de lista
- **THEN** esa línea se reporta como inválida
- **AND** no se ignora ni se trata como continuación válida del bloque

#### Scenario: El slug canónico de `change:` resuelve

- **WHEN** se escribe un nodo con `change:<stable-change-slug>` y el slug corresponde al nombre del
  change, activo o archivado, sin el prefijo de fecha
- **THEN** la ref resuelve y la escritura se acepta
- **AND** la ref no incluye el prefijo `YYYY-MM-DD-`

#### Scenario: El slug con prefijo de fecha no resuelve

- **WHEN** se escribe un nodo con `change:<YYYY-MM-DD-slug>` incluyendo el prefijo de fecha en la
  ref
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref
- **AND** la resolución reporta el change como inexistente, porque el prefijo de fecha sólo lo
  aporta el nombre del directorio archivado
