# Delta: memory-engine

## ADDED Requirements

### Requirement: Exposición de la ubicación resuelta de las refs

El engine SHALL exponer una única superficie read-only, `resolveNodeRefs({ content, projectRoot })`,
que parsea el bloque `refs:` de un nodo y devuelve, en el orden en que las refs están declaradas, la
ubicación resuelta de cada una. La superficie SHALL reutilizar el parser de bloques `refs:` y la
resolución de refs del camino de escritura; NO SHALL existir un segundo parser ni un segundo
resolvedor. La llamada NO SHALL escribir en la base ni en el filesystem y NO SHALL modificar nodos.

Cada entrada SHALL identificar la ref textual declarada, su `kind` y su `verifiable`. Una ref
`spec:`, `change:` o `path:` que resuelve SHALL devolver `ok: true` y su ubicación; una que no
resuelve SHALL devolver `ok: false` y un `reason` acotado de la taxonomía vigente: `inexistente`,
`ambiguo (<n> coincidencias)`, `inválido (<causa>)` o
`inválido (lectura no disponible: <CODE>)`.

La ubicación SHALL ser:

- `change:` → el path repo-relativo del directorio resuelto, con separadores `/`:
  `aspec/changes/<slug>` para el activo o `aspec/changes/archive/YYYY-MM-DD-<slug>` para el
  archivado.
- `spec:` → el path `aspec/specs/<capability>/spec.md` y el texto **real** del `### Requirement:`
  que matcheó, no su forma canónica. La resolución NO SHALL usar FTS.
- `path:` → el path repo-relativo normalizado, con separadores `/` y sin el sufijo `:linea`. NO
  SHALL resolverse con `realpath` ni exigir containment de symlinks.

Una ref `commit:` o `workitem:` NO SHALL reportarse como resuelta ni como rota: SHALL devolverse con
`verifiable: false` y sin ubicación ni `reason`. Cuando una ref de `spec:` o `change:` tiene más de
una coincidencia, el sistema NO SHALL elegir: SHALL reportar `ambiguo (<n> coincidencias)` y omitir
la ubicación. Cero coincidencias SHALL reportarse como `inexistente` y NO SHALL abortar la
resolución de las demás refs del nodo.

Sin raíz de proyecto, la superficie NO SHALL intentar resolver: SHALL devolver `needsRoot: true` y
cada ref verificable SHALL devolver `ok: false` con `reason` `sin raíz`, sin abortar el resto de las
refs del nodo. Esa condición SHALL ser una abstención y NO SHALL reportarse como falla del nodo.
`needsRoot` SHALL ser `true` sólo si el nodo declara al menos una ref `spec:`, `change:` o `path:`.

Una línea inválida del bloque `refs:` SHALL devolver `refs: []` y exponer el defecto en el campo raíz
`error` con el texto de esa línea; más de un bloque `refs:` SHALL devolver `refs: []` y exponer el
conteo en el campo raíz `blocks` (> 1). En ambos casos la llamada NO SHALL lanzar, el defecto NO
SHALL ignorarse y las refs de ese bloque NO SHALL resolverse. Un error de lectura durante la
resolución de una ref SHALL reportarse como `inválido (lectura no disponible: <CODE>)` para esa ref,
sin abortar el nodo ni las refs restantes.

#### Scenario: Un change activo expone su directorio

- **WHEN** un nodo declara `change:<slug>` y existe `aspec/changes/<slug>`
- **THEN** la entrada de esa ref devuelve `ok: true` y `path` `aspec/changes/<slug>`

#### Scenario: Un change archivado expone su directorio

- **WHEN** un nodo declara `change:<slug>` y existe un único
  `aspec/changes/archive/YYYY-MM-DD-<slug>`
- **THEN** la entrada de esa ref devuelve `ok: true` y el path repo-relativo de ese archive

#### Scenario: Un spec expone path y el heading real

- **WHEN** la ref `spec:<capability>#<heading>` difiere en mayúsculas o diacríticos del
  `### Requirement:` del archivo pero canonicaliza al mismo heading
- **THEN** la entrada devuelve `ok: true`, el path del `spec.md` de la capability y el texto real
  del heading tal como figura en el archivo

#### Scenario: Un spec ambiguo no elige

- **WHEN** dos `### Requirement:` del mismo `spec.md` canonicalizan al heading de la ref
- **THEN** la entrada devuelve `ok: false` y `reason` `ambiguo (2 coincidencias)`
- **AND** no devuelve `path` ni `heading`

#### Scenario: Un change ambiguo no elige

- **WHEN** existen dos archives que coinciden con `change:<slug>`
- **THEN** la entrada devuelve `ok: false` y `reason` `ambiguo (2 coincidencias)`
- **AND** no devuelve `path` y no selecciona ninguno de los dos

#### Scenario: Un path se expone normalizado

- **WHEN** un nodo declara `path:` con separadores `\` y sufijo `:linea` y el archivo existe
- **THEN** la entrada devuelve `ok: true` y el path repo-relativo con separadores `/`
- **AND** el path devuelto no incluye el sufijo `:linea`

#### Scenario: commit y workitem no son verificables

- **WHEN** un nodo declara `commit:<sha>` o `workitem:<tracker>:<key>`
- **THEN** la entrada devuelve `verifiable: false`
- **AND** no devuelve ubicación y no reporta la ref como resuelta ni como rota

#### Scenario: Sin raíz no hay resolución y queda como abstención

- **WHEN** se invoca la superficie con refs `spec:`, `change:` o `path:` y sin `projectRoot`
- **THEN** el resultado reporta `needsRoot: true`
- **AND** cada ref verificable devuelve `ok: false` y `reason` `sin raíz`
- **AND** las refs restantes del nodo no se abortan y la condición no se reporta como falla del nodo

#### Scenario: Una línea inválida queda en la raíz del resultado

- **WHEN** el `content` declara un bloque `refs:` con un item de gramática inválida
- **THEN** el resultado devuelve `refs: []` y el campo raíz `error` con el texto de esa línea
- **AND** la llamada no lanza y no resuelve las refs de ese bloque

#### Scenario: Más de un bloque refs queda en la raíz del resultado

- **WHEN** el `content` declara dos o más bloques `refs:`
- **THEN** el resultado devuelve `refs: []` y el campo raíz `blocks` con el conteo (> 1)
- **AND** la llamada no lanza y no resuelve las refs de esos bloques

#### Scenario: Error de lectura no aborta el nodo

- **WHEN** la lectura de una fuente referenciada falla con un código del runtime
- **THEN** la entrada de esa ref devuelve `ok: false` y
  `reason` `inválido (lectura no disponible: <CODE>)`
- **AND** las demás refs del nodo se resuelven igual
