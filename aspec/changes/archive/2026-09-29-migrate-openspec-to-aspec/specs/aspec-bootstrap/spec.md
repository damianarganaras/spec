# Spec delta: migrate-openspec-to-aspec

## ADDED Requirements

### Requirement: Detección automática de la carpeta legacy `openspec/` en los scripts de inicio

Los scripts de inicio `ancleto init` y `ancleto upgrade` SHALL detectar la presencia de una carpeta
`openspec/` en la raíz del proyecto, sin requerir un comando separado ni intervención manual del
usuario. La detección y la eventual migración SHALL ejecutarse antes del scaffold de `aspec/`
(creación de `aspec/changes/` y `aspec/config.yaml`), de modo que el scaffold NO SHALL impedir la
detección.

#### Scenario: `init` detecta `openspec/` antes de crear `aspec/`

- **WHEN** `ancleto init` se ejecuta en una raíz que contiene `openspec/` y no contiene `aspec/` con
  contenido real
- **THEN** detecta la carpeta legacy antes de ejecutar el scaffold de `aspec/`
- **AND** la migración no queda bloqueada por el scaffold

#### Scenario: `upgrade` detecta `openspec/`

- **WHEN** `ancleto upgrade` se ejecuta en una raíz con `.ancletorc` que contiene `openspec/`
- **THEN** detecta la carpeta legacy como punto de partida de la migración

#### Scenario: Sin carpeta legacy no se actúa

- **WHEN** no existe `openspec/` en la raíz del proyecto
- **THEN** `init` y `upgrade` no ejecutan ninguna acción de migración
- **AND** el comando completa sin error

### Requirement: Migración por copia del contenido legacy cuando `aspec/` no existe o no tiene contenido real

Cuando `openspec/` existe y `aspec/` no existe **o** existe sin contenido real (sólo scaffold), el
script de inicio SHALL copiar el contenido completo de `openspec/` a `aspec/`, preservando la
estructura de subdirectorios y el contenido de todos los archivos, y SHALL reportar la migración en
la salida del comando. Al completar exitosamente la copia, el script SHALL escribir el archivo
marcador `aspec/.migrated-from-openspec`. La copia SHALL NO pisar de forma destructiva el
`config.yaml` ni la estructura ya presente en `aspec/`. La migración SHALL ser no interactiva, sin
prompts, para operar en terminal no-TTY/CI. Tras la migración, `openspec/` SHALL conservarse en la
raíz como backup y ambos directorios SHALL convivir; el comando NO SHALL eliminar `openspec/`.

#### Scenario: Migración preserva estructura y contenido

- **WHEN** existe `openspec/changes/demo/proposal.md` y no existe `aspec/`
- **AND** se ejecuta `init` o `upgrade`
- **THEN** el archivo queda en `aspec/changes/demo/proposal.md` con contenido idéntico
- **AND** `openspec/changes/demo/proposal.md` sigue existiendo (se conserva como backup)
- **AND** el comando reporta que el contenido fue migrado
- **AND** queda escrito el marcador `aspec/.migrated-from-openspec`

#### Scenario: `aspec/` existente sólo-scaffold se migra encima

- **WHEN** existe `aspec/` con sólo el scaffold (`aspec/changes/` vacío y/o `aspec/config.yaml`) y
  existe `openspec/` con contenido
- **AND** se ejecuta `init` o `upgrade`
- **THEN** el contenido de `openspec/` se copia dentro de `aspec/`
- **AND** el `aspec/config.yaml` existente se conserva sin sobrescribir
- **AND** `openspec/` se conserva como backup

#### Scenario: Migración no interactiva

- **WHEN** la migración se ejecuta en un contexto sin TTY (CI)
- **THEN** no presenta prompts
- **AND** no requiere entrada del usuario
- **AND** completa con el contenido legacy copiado a `aspec/`

### Requirement: Coexistencia cuando `aspec/` tiene contenido real

Cuando `openspec/` existe y `aspec/` existe **con contenido real y sin el marcador
`aspec/.migrated-from-openspec`**, el script de inicio SHALL NO modificar ni fusionar el contenido de
ninguna de las dos carpetas, SHALL conservar ambas intactas, y SHALL emitir una advertencia que
indique que la revisión es manual.

#### Scenario: `aspec/` con contenido real coexiste con `openspec/`

- **WHEN** la raíz contiene `openspec/` y `aspec/` con contenido real propio
- **AND** no existe el marcador `aspec/.migrated-from-openspec`
- **AND** se ejecuta `init` o `upgrade`
- **THEN** `aspec/` conserva su contenido sin cambios
- **AND** `openspec/` permanece intacta
- **AND** el comando emite una advertencia de revisión manual
- **AND** el comando completa sin error

### Requirement: Idempotencia y ausencia de pérdida de datos

La detección y migración SHALL ser idempotentes. Cuando existe el marcador
`aspec/.migrated-from-openspec`, una ejecución posterior SHALL ser una no-op silenciosa: NO SHALL
recopiar, NO SHALL emitir advertencia y NO SHALL fallar. El contenido de `openspec/` NO SHALL
eliminarse sin haber quedado preservado en `aspec/`.

#### Scenario: Segunda ejecución tras migrar

- **WHEN** `upgrade` o `init` se ejecuta y una corrida anterior migró por copia `openspec/` a `aspec/`
- **AND** existe el marcador `aspec/.migrated-from-openspec` y `openspec/` sigue existiendo como backup
- **THEN** la segunda ejecución no vuelve a copiar el contenido a `aspec/`
- **AND** no emite advertencia
- **AND** no falla y completa con éxito
- **AND** `aspec/` conserva el contenido migrado
- **AND** `openspec/` se conserva intacta

#### Scenario: No se pierde contenido legacy

- **WHEN** se completa una migración por copia de `openspec/` a `aspec/`
- **THEN** todo el contenido que estaba en `openspec/` está presente en `aspec/`
- **AND** ninguna entrada se pierde por la operación
