# Delta: prompt-contracts — protocolo de memoria canónico

## ADDED Requirements

### Requirement: Protocolo de memoria canónico en AGENTS.md y puntero único desde PRODUCT.md

`AGENTS.md` y `templates/AGENTS.md` SHALL declarar el protocolo de memoria reactiva dentro de un
bloque `<!-- LOCKED: memory-protocol -->` … `<!-- /LOCKED: memory-protocol -->` que incluya el
heading `## Memoria Persistente (Protocolo Reactivo)` y su cuerpo completo, para que
`install`/`update`/`upgrade` lo re-apliquen en lugar de dejar la guía plana.

El bloque SHALL declarar, en tres partes:

- **(a) Cuándo consultar la memoria.** Antes de modificar o revertir una decisión previa, antes de
  refactorizaciones mayores o cambios de contratos, y ante un `<ContextOverflowWarning>`. El aviso
  SHALL describirse como el nombre de las `memory_key` omitidas, hasta 40 claves y con el sufijo
  `+N` cuando queden claves sin listar. La recuperación SHALL describirse como un Recall acotado
  —una única delegación a `@memory-keeper` con el topic de la tarea en este flujo— y NO SHALL
  describirse como repetir el contexto completo ni como una invocación directa de `searchMemory`
  desde el orquestador.
- **(b) Contrato de `searchMemory`.** El modo por defecto SHALL documentarse como preview: prefijo
  literal de hasta 240 caracteres, `limit` 5 y `content_truncated`; el preview NO SHALL
  presentarse como el texto íntegro. `expand: true` SHALL documentarse como la vía al payload
  completo; `keys` como expansión selectiva que falla si una clave pedida no está en la página; y
  `required` como entrada de llamada que falla si excede el `limit` o el presupuesto.
- **(c) Comportamiento.** La memoria recuperada SHALL tratarse como contexto de lectura, puede
  estar desactualizada, NO SHALL pisar seguridad, validación ni el diseño vigente, y una
  discrepancia con el estado actual SHALL reportarse en lugar de aplicarse a ciegas.

`PRODUCT.md` y `templates/PRODUCT.md` NO SHALL duplicar ese contrato: SHALL reemplazar el
blockquote legado por un puntero de una línea al bloque `LOCKED: memory-protocol` de `AGENTS.md`,
que es la fuente única. En ambos archivos, las líneas específicas del proyecto
(`Repository App ID`, `Scope`) SHALL quedar fuera de todo bloque `LOCKED` y SHALL preservarse.

#### Scenario: El bloque canónico envuelve la sección completa

- **WHEN** se revisan `AGENTS.md` y `templates/AGENTS.md`
- **THEN** el heading `## Memoria Persistente (Protocolo Reactivo)` y su cuerpo están dentro del
  bloque `LOCKED: memory-protocol`
- **AND** el bloque `LOCKED: memory-boundary` sigue existiendo por separado
- **AND** no queda una copia plana de esa sección fuera del bloque

#### Scenario: El aviso de overflow se documenta con el contrato vigente

- **WHEN** se lee la parte de cuándo consultar la memoria
- **THEN** describe el `<ContextOverflowWarning>` como el nombre de las `memory_key` omitidas,
  hasta 40 claves con sufijo `+N`
- **AND** describe la recuperación como un Recall acotado con una única delegación a
  `@memory-keeper`
- **AND** no afirma que el aviso indique usar `searchMemory` para recuperar lo omitido

#### Scenario: El contrato de searchMemory vive en el bloque canónico

- **WHEN** se lee la parte del contrato de `searchMemory`
- **THEN** documenta el preview por defecto con `≤240` caracteres literales, `limit` 5 y
  `content_truncated`
- **AND** aclara que el preview no es el texto íntegro
- **AND** documenta `expand: true` para el payload completo
- **AND** documenta `keys` como expansión selectiva que falla si la clave no está en la página
- **AND** documenta `required` como entrada de llamada que falla al exceder el `limit` o el
  presupuesto

#### Scenario: PRODUCT.md apunta y no duplica

- **WHEN** se revisan `PRODUCT.md` y `templates/PRODUCT.md`
- **THEN** el blockquote legado de memoria ya no está
- **AND** existe un puntero de una línea al bloque `LOCKED: memory-protocol` de `AGENTS.md`
- **AND** no se repiten los detalles normativos del contrato (preview, `expand`, `keys`,
  `required`, `content_truncated`)

_No-testeable-por-construcción en este change: la ausencia de duplicación es una propiedad
negativa del contenido y `test/content-guards.test.js` queda fuera de los paths autorizados; la
remoción del blockquote se cubre en el test de merge y la ausencia de los detalles se verifica en
review. Disparador de reapertura: primer change que autorice un content guard._

#### Scenario: Las líneas específicas del proyecto se preservan fuera de LOCKED

- **WHEN** se revisan `PRODUCT.md` y `templates/PRODUCT.md`
- **THEN** `Repository App ID` y `Scope` no están dentro de ningún bloque `LOCKED`
- **AND** conservan su contenido sin cambios

## MODIFIED Requirements

### Requirement: Reconciliación de superficies mergeadas por bloques

Toda ruta que invoca `mergeLocked` sobre los templates raíz (`AGENTS.md` y `PRODUCT.md`,
`src/cli/index.js` → `TEMPLATES`) —`install`/`update`/`upgrade` (vía `copyTemplates`) e `import`—
SHALL reconciliar las superficies que el framework mergea por bloques antes de mergear, para que las
instalaciones existentes no conserven guía plana obsoleta junto al bloque canónico. NO SHALL existir
una ruta que mergee `TEMPLATES` sin reconciliar. Cuando un contrato pase de texto plano a un bloque
`LOCKED` —las validaciones declarativas y el protocolo de memoria reactiva—, estas rutas SHALL
eliminar el texto plano legado identificado del archivo del proyecto y SHALL dejar sólo el bloque
canónico, sin pasos manuales.

La reconciliación SHALL aplicarse a las firmas sólo fuera de un bloque `LOCKED`: el bloque canónico
recién insertado contiene el mismo heading legado, así que la búsqueda de firmas SHALL excluir el
rango `<!-- LOCKED: ... -->` … `<!-- /LOCKED: ... -->` completo; de lo contrario cada `upgrade`
emitiría un aviso falso. El bloque canónico NO SHALL interpretarse como firma legada ni disparar un
aviso en ejecuciones posteriores. La reconciliación SHALL ser segura (no elimina contenido del usuario fuera del bloque
legado identificado), idempotente (re-ejecutarla no duplica ni rompe), host-neutral, sin nuevas
dependencias de runtime y con coincidencia exacta línea a línea. Si el run legado no coincide
exactamente, la reconciliación SHALL emitir un aviso y SHALL NO eliminar el run ni alterar contenido
del usuario fuera del bloque identificado. La invocación MAY modificar el archivo por el merge de
bloques `LOCKED` del mismo pase (inserción del bloque canónico faltante y reemplazo de bloques
`LOCKED` existentes); la garantía NO SHALL enunciarse como "el archivo no cambia".

El run legado de `AGENTS.md` SHALL identificarse como el tramo contiguo exacto entre el heading
`## Memoria Persistente (Protocolo Reactivo)` y la última línea de la lista que sigue a
`**Comportamiento:**`, y SHALL considerarse cerrado sólo cuando la siguiente línea no vacía sea
cualquier marcador de apertura `<!-- LOCKED: <nombre> -->`. El bloque
`LOCKED: memory-boundary` SHALL conservarse. El run legado de `PRODUCT.md` SHALL identificarse como
las cuatro líneas exactas del blockquote de memoria que preceden a la sección siguiente, y SHALL
eliminarse sólo en `PRODUCT.md`.

#### Scenario: Instalación existente queda sin la guía vieja

- **WHEN** un proyecto ya instalado tiene la lista plana legada de validaciones en `AGENTS.md`
- **AND** se corre `ancleto upgrade` (o `install`/`update`)
- **THEN** la lista plana legada se elimina
- **AND** queda el bloque canónico `LOCKED: validation-commands`
- **AND** no coexisten la guía vieja y la nueva

#### Scenario: Importar un bundle también reconcilia la guía vieja

- **WHEN** se importa un bundle (`ancleto import`) cuyo `AGENTS.md` trae el bloque canónico
- **AND** el `AGENTS.md` del proyecto destino conserva la lista plana legada de validaciones
- **THEN** la lista plana legada se elimina antes del merge
- **AND** queda sólo el bloque canónico `LOCKED: validation-commands`
- **AND** no coexisten la guía vieja y la nueva

#### Scenario: Ninguna ruta mergea `TEMPLATES` sin reconciliar

- **WHEN** se revisan las rutas que invocan `mergeLocked` sobre `TEMPLATES` (`install`/`update`/`upgrade`
  en `copyTemplates`, e `import`)
- **THEN** todas ejecutan la reconciliación de bloques planos legados antes del merge

#### Scenario: La reconciliación es segura e idempotente

- **WHEN** el bloque legado fue personalizado o no coincide exactamente con la firma reconocida
- **THEN** no se elimina el run identificado ni contenido del usuario fuera de él
- **AND** se registra un aviso
- **AND** el merge de bloques `LOCKED` del mismo pase MAY insertar el bloque canónico faltante y
  reemplazar bloques `LOCKED` existentes
- **AND** re-ejecutar la actualización no duplica ni elimina contenido del usuario (la idempotencia
  no exige igualdad byte a byte cuando hay un run personalizado)

#### Scenario: Superficies mergeadas vs copiadas enteras

- **WHEN** se actualiza el proyecto
- **THEN** `AGENTS.md`/`PRODUCT.md` (mergeados por bloque) se reconcilian
- **AND** los assets de skill (`.opencode/skills/`, copiados enteros) se regeneran

#### Scenario: El protocolo de memoria plano se reemplaza por el bloque canónico

- **WHEN** un proyecto ya instalado tiene la sección `## Memoria Persistente (Protocolo Reactivo)`
  plana, seguida de `<!-- LOCKED: memory-boundary -->`
- **AND** se corre `ancleto upgrade` (o `install`/`update`)
- **THEN** la sección plana se elimina
- **AND** queda el bloque `LOCKED: memory-protocol` en su lugar
- **AND** el bloque `LOCKED: memory-boundary` se conserva
- **AND** no coexisten la guía vieja y el bloque canónico

#### Scenario: El protocolo plano se elimina aunque el bloque de validaciones lo separe de `memory-boundary`

- **WHEN** la sección plana de memoria está seguida del bloque `LOCKED: validation-commands` y
  después de `LOCKED: memory-boundary`
- **AND** se corre `ancleto upgrade` (o `install`/`update`)
- **THEN** la sección plana se elimina
- **AND** ambos bloques `LOCKED` se conservan
- **AND** el orden final no duplica bloques ni pierde contenido del usuario

#### Scenario: PRODUCT.md pierde el blockquote legado

- **WHEN** un proyecto ya instalado tiene el blockquote de memoria legado en `PRODUCT.md`
- **AND** se corre `ancleto upgrade` (o `install`/`update`)
- **THEN** las cuatro líneas del blockquote legado se eliminan
- **AND** las secciones específicas del usuario se preservan
- **AND** el resto de `PRODUCT.md` no se toca

#### Scenario: El bloque canónico no se confunde con la firma legada

- **WHEN** ya existe `<!-- LOCKED: memory-protocol -->` en `AGENTS.md`
- **AND** se vuelve a correr `ancleto upgrade`
- **THEN** el bloque canónico no se elimina ni se duplica
- **AND** no se emite un aviso de bloque legado de memoria

#### Scenario: El import reconcilia el protocolo de memoria del destino

- **WHEN** se importa un bundle cuyo `AGENTS.md` trae `LOCKED: memory-protocol`
- **AND** el `AGENTS.md` del destino conserva la sección plana de memoria
- **THEN** la sección plana se elimina antes del merge
- **AND** queda sólo el bloque canónico `LOCKED: memory-protocol`
