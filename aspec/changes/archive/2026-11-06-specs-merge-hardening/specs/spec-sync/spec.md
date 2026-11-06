# Delta: specs-merge-hardening

## MODIFIED Requirements

### Requirement: Merge determinístico de delta specs sobre specs canónicos existentes

The system SHALL aplicar el delta spec de un change sobre el spec canónico de la misma capability por
título exacto de `### Requirement:`. El comando `ancleto specs merge --change <slug>` SHALL soportar
las operaciones `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` y
`## RENAMED Requirements`, NO SHALL modificar requirements no mencionados en el delta, y SHALL escribir
únicamente `aspec/specs/<capability>/spec.md` cuando esa capability ya existe. `MODIFIED` SHALL
reemplazar el bloque completo del requirement —cuerpo y escenarios— por el bloque del delta. `REMOVED`
SHALL eliminar el bloque y SHALL ser no-op cuando el requirement ya no existe. `ADDED` SHALL insertar
el bloque dentro de `## Requirements` y SHALL ser no-op cuando el título ya existe con el mismo
contenido. `RENAMED` SHALL renombrar el heading de `FROM` a `TO` y SHALL ser no-op cuando el título
nuevo ya existe.

El delta SHALL poder comenzar con A LO SUMO un heading H1 a columna 0 al inicio del archivo, seguido de
líneas en blanco opcionales y de la primera sección `## ` reconocida; ese H1 SHALL ignorarse. La regla
NO SHALL restringirse a una lista literal de títulos: cualquier H1 único al inicio SHALL aceptarse. Un
segundo H1, o cualquier línea no vacía que no sea un H1 antes de la primera sección reconocida, SHALL
ser fail-closed.

`ADDED` SHALL insertar el bloque con exactamente UNA línea en blanco entre el bloque insertado y la
siguiente sección `## `, de forma determinística. Cuando la inserción ocurre al final del archivo, el
archivo SHALL terminar con el salto de línea final del bloque y NO SHALL agregar una línea en blanco
extra después. Una sección `## RENAMED Requirements` vacía SHALL ser un no-op válido, no un bloque
malformado.

#### Scenario: Aplicación de las cuatro operaciones por título exacto

- **WHEN** el delta contiene requirements bajo `ADDED`, `MODIFIED`, `REMOVED` y `RENAMED`
- **THEN** cada operación se aplica sobre el requirement cuyo heading `### Requirement:` coincide exactamente con el título indicado
- **AND** los requirements del spec canónico que el delta no menciona quedan sin cambios

#### Scenario: MODIFIED reescribe el cuerpo y los escenarios

- **WHEN** un delta declara `MODIFIED` para un requirement existente
- **THEN** el bloque canónico completo —cuerpo y escenarios— se reemplaza por el bloque del delta
- **AND** el cuerpo anterior no se conserva parcialmente ni se fusiona con el nuevo

#### Scenario: ADDED idéntico es no-op

- **WHEN** un delta declara `ADDED` para un título que ya existe en el spec canónico con el mismo contenido
- **THEN** el archivo canónico no cambia

#### Scenario: REMOVED idempotente

- **WHEN** un delta declara `REMOVED` para un título que ya no existe en el spec canónico
- **THEN** la operación no cambia el archivo y no se reporta como conflicto

#### Scenario: Preámbulo H1 estructural del delta

- **WHEN** el delta empieza con a lo sumo un H1 a columna 0, seguido de blancos opcionales y de una sección de operación reconocida
- **THEN** el preámbulo se ignora y las operaciones se aplican normalmente
- **AND** un segundo H1 o una línea no vacía y no H1 antes de la primera sección reconocida produce exit code 2 sin escribir
- **AND** el H1 se acepta cualquiera sea su título, sin allowlist literal

#### Scenario: ADDED separado por exactamente una línea en blanco

- **WHEN** un delta `ADDED` inserta un requirement antes de otra sección `## ` o al final del archivo
- **THEN** queda exactamente una línea en blanco entre el bloque insertado y la sección siguiente
- **AND** al final del archivo, el archivo termina con el salto de línea final del bloque y sin línea en blanco extra
- **AND** la estructura de líneas resultante es determinística

#### Scenario: Sección RENAMED vacía es no-op

- **WHEN** el delta contiene `## RENAMED Requirements` sin entradas
- **THEN** el comando termina con exit code 0 y reporta `changed:false`
- **AND** el contenido y el `mtime` del spec canónico no cambian

### Requirement: Fail-closed ante ambigüedad o delta inválido

The system SHALL rechazar con exit code 2 y cero escrituras toda condición que no pueda aplicarse sin
ambigüedad, y SHALL reportar en el mensaje la capability, el requirement y el motivo. Las condiciones
fail-closed SHALL incluir: 0 o 2 o más requirements con el título exacto buscado; una entrada de
requirement bajo `MODIFIED` o `RENAMED` sin bloque o cuerpo; `ADDED` de un título existente con
contenido distinto; `RENAMED` con ambos títulos presentes o con ninguno presente; `FROM`/`TO`
faltantes; capability sin spec canónico; 0 o ≥2 directorios de change para el slug; y bloque de delta
malformado. Una sección de operación reconocida y vacía (`## MODIFIED Requirements` o `## RENAMED
Requirements` sin entradas) SHALL ser un no-op válido, no un bloque malformado. Si cualquier
capability del change falla, el comando NO SHALL escribir ninguna de las restantes.

El contenedor `aspec/changes/archive` NO SHALL tratarse como un change. Un `--change archive`, o
cualquier slug cuyo directorio activo resuelto sea ese contenedor, SHALL ser fail-closed: exit code 2,
cero escrituras, y mensaje que nombre el slug o el contenedor. La detección SHALL basarse en la
identidad del path del contenedor, NO en la presencia de `proposal.md`, porque los change dirs
delta-only son válidos y algunos archives legacy no tienen `proposal.md`.

**Atomicidad acotada.** La validación del plan SHALL ser fail-closed con cero escrituras. La fase de
escritura es secuencial y NO transaccional: un error de I/O o una interrupción durante esa fase MAY
dejar escritos un prefijo de los specs del plan, sin rollback ni atomicidad entre archivos. Esta spec
NO SHALL prometer ninguna garantía de atomicidad fuera del plan.

#### Scenario: Título ambiguo o inexistente

- **WHEN** un requirement buscado no coincide con ningún heading, o coincide con dos o más headings, del spec canónico
- **THEN** el comando termina con exit code 2
- **AND** el mensaje nombra la capability, el requirement y el motivo
- **AND** ningún spec canónico se escribe

#### Scenario: Operación MODIFIED o RENAMED incompleta

- **WHEN** una entrada de requirement bajo `MODIFIED` o `RENAMED` no trae el cuerpo, los escenarios o los campos exigidos
- **THEN** el comando termina con exit code 2 sin escribir ningún archivo
- **AND** una sección reconocida sin entradas no se trata como bloque incompleto

#### Scenario: ADDED en conflicto con el contenido existente

- **WHEN** un delta declara `ADDED` para un título que ya existe pero con contenido distinto
- **THEN** el comando termina con exit code 2 sin escribir ningún archivo

#### Scenario: RENAMED con estados incompatibles

- **WHEN** un `RENAMED` tiene presente tanto el título `FROM` como el `TO`, o no tiene presente ninguno de los dos
- **THEN** el comando termina con exit code 2 sin escribir ningún archivo

#### Scenario: Capability destino inexistente

- **WHEN** el delta corresponde a una capability que no tiene `aspec/specs/<capability>/spec.md`
- **THEN** el comando termina con exit code 2 nombrando la capability
- **AND** no crea el spec canónico faltante ni escribe otros specs

#### Scenario: Bloque de delta malformado

- **WHEN** un bloque del delta no se puede interpretar como una de las cuatro operaciones soportadas
- **THEN** el comando termina con exit code 2 sin escribir ningún archivo

#### Scenario: Sin escrituras parciales entre capabilities

- **WHEN** un change contiene deltas para varias capabilities y al menos uno falla fail-closed
- **THEN** ninguno de los `aspec/specs/<capability>/spec.md` del change se escribe
- **AND** el contenido y el `mtime` de todos los specs canónicos involucrados permanecen inalterados

#### Scenario: Resolución del change fail-closed

- **WHEN** `--change <slug>` no coincide con ningún directorio activo o archivado, o coincide con dos o más
- **THEN** el comando termina con exit code 2 y no escribe ningún archivo
- **AND** el mensaje nombra el slug

#### Scenario: Contenedor archive no es un change

- **WHEN** se ejecuta `ancleto specs merge --change archive`, o un slug resuelve al directorio contenedor `aspec/changes/archive`
- **THEN** el comando termina con exit code 2 y no escribe ningún archivo
- **AND** el mensaje nombra el slug o el contenedor
- **AND** el mismo resultado se obtiene con `--dry-run`
