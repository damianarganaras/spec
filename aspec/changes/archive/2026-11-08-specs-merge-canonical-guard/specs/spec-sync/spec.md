# Delta: specs-merge-canonical-guard

## MODIFIED Requirements

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

**Guard de heading de delta en la spec canónica.** Toda spec canónica que el comando pudiera
modificar (`aspec/specs/<capability>/spec.md`) NO SHALL contener un heading ATX de sección de delta en
columna 0 (sin indentación): `## ADDED Requirements`, `## MODIFIED Requirements`,
`## REMOVED Requirements` o `## RENAMED Requirements`. El guard SHALL reconocer sólo headings ATX de
sección de delta en columna 0, la misma semántica que el parser de delta, sin rastreo de code fences:
un heading indentado (1–3 espacios) NO SHALL contar como heading de sección de delta, y un heading a
columna 0 dentro de un bloque de código SHALL tratarse igual que en el parser —limitación declarada,
fuera del alcance del guard—. La validación SHALL ejecutarse en la fase de plan y SHALL cubrir los
CUATRO tipos de operación —`ADDED`, `MODIFIED`, `REMOVED` y `RENAMED`—, no sólo `ADDED`. Cuando una
spec canónica contiene al menos uno de esos headings, el comando SHALL ser fail-closed —exit code 2 y
cero escrituras en todas las capabilities del lote, aunque otras capabilities del delta fueran
aplicables— y el mensaje SHALL nombrar la capability y el heading ofensor. `--dry-run` SHALL producir
el mismo exit code 2 y tampoco SHALL escribir. La forma `--json` SHALL reutilizar el reporte de
errores existente (`ok:false` y `errors:[...]`), sin agregar campos nuevos.

El guard SHALL aplicar SÓLO a specs canónicas. Un delta spec bajo `aspec/changes/**/specs/**` que
contenga `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` o
`## RENAMED Requirements` SHALL seguir parseando como delta válido y NO SHALL ser rechazado por este
guard. Normalizar el heading de una canónica malformada a `## Requirements` SHALL ser una reparación de
higiene del repositorio, NO una corrección automática del comando: el merge SHALL rechazar la canónica
y NO SHALL reescribirla para repararla.

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

#### Scenario: Heading de delta en la canónica bloquea MODIFIED

- **WHEN** un delta declara `MODIFIED` para un requirement de una capability cuya spec canónica contiene `## ADDED Requirements` o cualquier otro heading de sección de delta
- **THEN** el comando termina con exit code 2 y el mensaje nombra la capability y el heading ofensor
- **AND** ningún spec canónico del change se escribe; el contenido y el `mtime` permanecen inalterados
- **AND** `--dry-run` produce el mismo exit code 2 y cero escrituras, y con `--json` el reporte es `ok:false` con `errors:[...]`

#### Scenario: Heading de delta en la canónica bloquea REMOVED

- **WHEN** un delta declara `REMOVED` para un requirement de una capability cuya spec canónica contiene un heading de sección de delta
- **THEN** el comando termina con exit code 2 y el mensaje nombra la capability y el heading ofensor
- **AND** ningún spec canónico del change se escribe; el contenido y el `mtime` permanecen inalterados

#### Scenario: Heading de delta en la canónica bloquea RENAMED

- **WHEN** un delta declara `RENAMED` para un requirement de una capability cuya spec canónica contiene un heading de sección de delta
- **THEN** el comando termina con exit code 2 y el mensaje nombra la capability y el heading ofensor
- **AND** ningún spec canónico del change se escribe; el contenido y el `mtime` permanecen inalterados

#### Scenario: Heading de delta en la canónica bloquea ADDED

- **WHEN** un delta declara `ADDED` y la spec canónica contiene `## Requirements` y además un heading de sección de delta
- **THEN** el comando termina con exit code 2 sin escribir ningún archivo
- **AND** el mensaje nombra la capability y el heading ofensor

#### Scenario: Un delta con headings de sección de delta sigue parseando

- **WHEN** el archivo delta bajo `aspec/changes/<slug>/specs/<capability>/spec.md` contiene `## ADDED Requirements` y la spec canónica es válida
- **THEN** el delta se parsea y sus operaciones se aplican normalmente con exit code 0
- **AND** el guard NO rechaza el archivo delta por contener ese heading

#### Scenario: El guard nunca rechaza el delta por sus headings

- **WHEN** un delta declara operaciones bajo cualquiera de los cuatro headings de sección de delta y la spec canónica es válida
- **THEN** la única condición de rechazo del guard es la presencia de esos headings en la spec canónica
- **AND** ninguno de los headings del archivo delta produce por sí mismo un error fail-closed
