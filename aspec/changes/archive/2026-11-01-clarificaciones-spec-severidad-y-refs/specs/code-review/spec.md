## MODIFIED Requirements

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
