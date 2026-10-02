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

The system SHALL emitir un reporte por severidad (CRITICAL, WARNING, SUGGESTION, cap 5 por severidad) con citas `file:line` y recomendación concreta por hallazgo, sin modificar ningún archivo.

#### Scenario: Reporte de una revisión

- **WHEN** finaliza el análisis del scope
- **THEN** cada hallazgo trae severidad, ubicación exacta y acción recomendada, y la skill no escribe ni edita código
