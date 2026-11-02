# Spec: code-review

## Purpose

Revisión de calidad interna del código sobre un scope declarado por el usuario, invocada vía
`/cleto-review`. Define la resolución del scope a archivos y líneas, la detección de código repetido,
redundante, mal ubicado y sin uso (leyendo fuera del diff solo como evidencia comparativa), y el
reporte estructurado por severidad sin modificar código.

## Requirements

### Requirement: Resolución de scope declarado por el usuario

The system SHALL resolver el scope que el usuario declara tras `/cleto-review` a una lista concreta de archivos y líneas a revisar.

#### Scenario: Scope por ticket en mensaje de commit

- **WHEN** el usuario indica `#123`
- **THEN** se resuelven los commits cuyo mensaje contiene `#123` y se revisa solo el código introducido en ellos

#### Scenario: Scope por rango o paths

- **WHEN** el usuario indica un rango git (`main..HEAD`) o paths existentes
- **THEN** se revisa solo el diff de ese rango o esos paths

#### Scenario: Scope ambiguo

- **WHEN** el input no matchea ninguna forma de scope ni se infiere del contexto
- **THEN** se listan los scopes candidatos y se pregunta al usuario en lugar de adivinar

### Requirement: Detección de código repetido y redundante

The system SHALL reportar código repetido dentro del scope y métodos del scope que duplican lógica ya existente fuera de él, citando la evidencia comparativa.

#### Scenario: Bloques gemelos en el scope

- **WHEN** dos bloques dentro del scope implementan la misma lógica
- **THEN** se reportan ambos `file:line` con recomendación de extracción a un helper común

#### Scenario: Método que ya existe en otro módulo

- **WHEN** una función del scope replica lógica existente fuera del diff
- **THEN** se cita el `file:line` externo y se recomienda reutilizarlo en lugar de duplicar

### Requirement: Detección de código mal ubicado y sin uso

The system SHALL reportar código del scope ubicado en el módulo incorrecto según la arquitectura del proyecto, y código del scope sin referencias en el repositorio.

#### Scenario: Lógica en el lugar incorrecto

- **WHEN** código del scope contradice el mapa del proyecto (`PRODUCT.md`, estructura de directorios, `aspec/specs/`)
- **THEN** se reporta con la ubicación recomendada y el motivo

#### Scenario: Función o import sin llamadas

- **WHEN** una función o import del scope no tiene referencias en el repo
- **THEN** se reporta como código sin uso con recomendación de eliminación

### Requirement: Reporte estructurado sin modificación de código

The system SHALL emitir un reporte por severidad (CRITICAL, WARNING, SUGGESTION, cap 5 por
severidad) con citas `file:line` y recomendación concreta por hallazgo, sin modificar ningún
archivo. La asignación de severidad SHALL regirse por estas reglas:

- `CRITICAL` SHALL reservarse a duplicación **literal** o dead code **probado** dentro del scope de
  review. Se considera **literal** sólo cuando la repetición es **verificable por inspección
  directa** —el mismo bloque repetido, o el mismo contenido comprobable—; una equivalencia
  **semántica inferida** entre dos implementaciones con texto distinto es redundancia **inferida** y
  NO SHALL reportarse como `CRITICAL`.
- La redundancia **inferida** o la ubicación **discutible** SHALL clasificarse como `WARNING` o
  `SUGGESTION`, y NO SHALL reportarse como `CRITICAL`.
- Ante duda, la severidad SHALL degradarse.

#### Scenario: Reporte de una revisión

- **WHEN** finaliza el análisis del scope
- **THEN** cada hallazgo trae severidad, ubicación exacta y acción recomendada, y la skill no escribe ni edita código

#### Scenario: Duplicación literal o dead code probado es CRITICAL

- **WHEN** el scope contiene dos bloques que implementan la misma lógica de forma literal, o una
  función o import del scope sin referencias comprobadas en el repositorio
- **THEN** el hallazgo se reporta como `CRITICAL`

#### Scenario: Redundancia inferida o ubicación discutible no es CRITICAL

- **WHEN** un método del scope replica lógica existente fuera del diff pero la diferencia es sutil
  o incierta, o el código del scope contradice el mapa del proyecto de forma discutible
- **THEN** el hallazgo se clasifica como `WARNING` o `SUGGESTION`
- **AND** no se reporta como `CRITICAL`

#### Scenario: Ante duda se degrada la severidad

- **WHEN** la evidencia no alcanza para probar duplicación literal ni dead code dentro del scope
- **THEN** la severidad se degrada
- **AND** el hallazgo no se reporta como `CRITICAL`
