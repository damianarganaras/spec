## ADDED Requirements

### Requirement: Merge determinístico de delta specs sobre specs canónicos existentes

The system SHALL aplicar el delta spec de un change sobre el spec canónico de la misma capability por
título exacto de `### Requirement:`. El comando `ancleto specs merge --change <slug>` SHALL soportar
las operaciones `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` y `## RENAMED Requirements`, NO SHALL
modificar requirements no mencionados en el delta, y SHALL escribir únicamente
`aspec/specs/<capability>/spec.md` cuando esa capability ya existe. `MODIFIED` SHALL reemplazar el
bloque completo del requirement —cuerpo y escenarios— por el bloque del delta. `REMOVED` SHALL eliminar
el bloque y SHALL ser no-op cuando el requirement ya no existe. `ADDED` SHALL insertar el bloque dentro
de `## Requirements` y SHALL ser no-op cuando el título ya existe con el mismo contenido. `RENAMED`
SHALL renombrar el heading de `FROM` a `TO` y SHALL ser no-op cuando el título nuevo ya existe.
El delta SHALL poder comenzar con un preámbulo H1 opcional —`# Delta: <name>` o
`# Spec delta: <name>`— seguido de las secciones de operación, y ese preámbulo SHALL ignorarse.
Cualquier otro contenido antes de la primera sección de operación reconocida SHALL ser fail-closed.

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

#### Scenario: Preámbulo H1 del delta

- **WHEN** el delta empieza con un heading H1 opcional (por ejemplo `# Delta: <nombre>`) seguido de una sección de operación reconocida
- **THEN** el preámbulo se ignora y las operaciones se aplican normalmente
- **AND** un contenido distinto de líneas en blanco o de un H1 generaría exit code 2

### Requirement: Idempotencia del merge de specs

The system SHALL ser idempotente: ejecutar dos veces el mismo `ancleto specs merge --change <slug>`
SHALL producir un archivo canónico byte a byte idéntico, y una corrida cuyo plan no contiene cambios
SHALL no escribir ningún archivo.

#### Scenario: Segunda corrida byte a byte idéntica

- **WHEN** se ejecuta el mismo merge dos veces consecutivas sobre el mismo change y los mismos specs canónicos
- **THEN** el contenido de cada `aspec/specs/<capability>/spec.md` resultante es byte a byte idéntico en ambas corridas
- **AND** la segunda corrida no agrega, duplica ni reordena requirements

#### Scenario: Plan vacío no escribe

- **WHEN** todas las operaciones del delta resultan no-op
- **THEN** el comando reporta éxito sin escribir y el contenido y el `mtime` de los specs canónicos permanecen inalterados

### Requirement: Fail-closed ante ambigüedad o delta inválido

The system SHALL rechazar con exit code 2 y cero escrituras toda condición que no pueda aplicarse sin
ambigüedad, y SHALL reportar en el mensaje la capability, el requirement y el motivo. Las condiciones
fail-closed SHALL incluir: 0 o 2 o más requirements con el título exacto buscado; una entrada de
requirement bajo `MODIFIED` o `RENAMED` sin bloque o cuerpo; `ADDED` de un título existente con contenido distinto; `RENAMED` con
ambos títulos presentes o con ninguno presente; `FROM`/`TO` faltantes; capability sin spec canónico;
0 o ≥2 directorios de change para el slug; y bloque de delta malformado. Una sección de operación
reconocida y vacía (`## MODIFIED Requirements` o `## RENAMED Requirements` sin entradas) SHALL ser un
no-op válido, no un bloque malformado. Si cualquier capability del
change falla, el comando NO SHALL escribir ninguna de las restantes.

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

- **WHEN** --change <slug> no coincide con ningún directorio activo o archivado, o coincide con dos o más
- **THEN** el comando termina con exit code 2 y no escribe ningún archivo
- **AND** el mensaje nombra el slug

### Requirement: Dry-run sin escrituras en specs merge

The system SHALL soportar `--dry-run`, que SHALL computar y reportar el plan de merge sin escribir
ningún archivo, y SHALL usar los mismos códigos de salida que la ejecución real: exit code 0 cuando el
plan es aplicable y exit code 2 cuando alguna condición es fail-closed. `--json` SHALL emitir el plan o
el resultado en formato legible por máquina.

#### Scenario: Dry-run reporta el plan y no escribe

- **WHEN** se ejecuta `ancleto specs merge --change <slug> --dry-run`
- **THEN** se reporta el plan por capability y operación sin escribir ningún archivo
- **AND** el contenido y el `mtime` de todos los `aspec/specs/<capability>/spec.md` permanecen inalterados

#### Scenario: Dry-run con condición fail-closed

- **WHEN** el plan contiene una condición fail-closed
- **THEN** el comando termina con exit code 2 y cero escrituras
- **AND** el reporte identifica la capability, el requirement y el motivo

#### Scenario: Dry-run con `--json`

- **WHEN** se ejecuta `ancleto specs merge --change <slug> --dry-run --json`
- **THEN** la salida es JSON válido que describe el plan y su aplicabilidad
- **AND** no se escribe ningún archivo

### Requirement: Alcance acotado del comando specs merge

The system SHALL limitar las escrituras a `aspec/specs/<capability>/spec.md` de capabilities ya
existentes y presentes en el delta del change. El comando NO SHALL modificar los archivos delta, la
carpeta del change, la memoria, el seed de discovery, la versión del paquete, `specs check`,
`mergeLocked` ni el affected-set. NO SHALL crear capabilities nuevas y NO SHALL modificar el
comportamiento de `specs check` ni del comando `specs` sin argumentos.

#### Scenario: Escritura limitada a los specs canónicos del delta

- **WHEN** se ejecuta un merge exitoso
- **THEN** los únicos archivos escritos son los `aspec/specs/<capability>/spec.md` de las capabilities presentes en el delta
- **AND** los archivos delta del change, `.ancleto/memory.db`, el seed de discovery y `package.json` quedan sin cambios

#### Scenario: Compatibilidad de `specs check` y `specs`

- **WHEN** se ejecuta `ancleto specs check` o `ancleto specs` sin el token `merge`
- **THEN** el comportamiento y los códigos de salida son los mismos que antes de este change

#### Scenario: Ninguna capability nueva se crea

- **WHEN** el delta nombra una capability sin spec canónico
- **THEN** el comando no crea `aspec/specs/<capability>/spec.md` ni ningún otro archivo
- **AND** `aspec/specs/` conserva el mismo conjunto de archivos que antes de la invocación
