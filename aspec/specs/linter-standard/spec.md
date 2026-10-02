# Spec: linter-standard

## Purpose

Define el linting estándar del repositorio: una configuración mínima de ESLint (flat config) sobre
`src/` y `test/`, el script `npm run lint`, el script `npm test`, el gate de lint en CI, ESLint
exclusivamente como devDependency para preservar el contrato de runtime sin dependencias, y la
ausencia de violaciones en el código existente.

## Requirements

### Requirement: Configuración de ESLint mínima

The system SHALL proveer una configuración de ESLint (flat config) con exactamente 4 reglas habilitadas sobre los directorios `src/` y `test/`.

#### Scenario: Config flat con reglas mínimas

- **WHEN** se inspecciona `eslint.config.js`
- **THEN** el archivo SHALL ser un flat config (export default de un array) con `languageOptions.ecmaVersion: "latest"`, `languageOptions.sourceType: "module"`, globals de Node, y las reglas `no-undef`, `no-unused-vars`, `eqeqeq` (`"always"`), `no-dupe-keys`

#### Scenario: Reglas deshabilitadas explícitamente

- **WHEN** se evalúa la configuración
- **THEN** NO SHALL incluir Prettier, ni reglas de estilo (indentación, comas, nombres, formato), ni plugins adicionales más allá de `@eslint/js` (incluido con ESLint) y `globals`

### Requirement: Script npm de lint

The system SHALL proveer un script `npm run lint` que ejecute ESLint sobre `src/` y `test/`.

#### Scenario: Ejecución del script

- **WHEN** se ejecuta `npm run lint`
- **THEN** se corre `eslint src/ test/` y el proceso termina con exit 0 si no hay violaciones, o exit 1 si hay al menos una violación

#### Scenario: Detección de violaciones

- **WHEN** un archivo en `src/` o `test/` contiene una violación de las reglas configuradas
- **THEN** `npm run lint` SHALL reportar la violación con file:line y regla, y terminar con exit 1

### Requirement: Script npm de test

The system SHALL proveer un script `npm run test` que ejecute la suite de tests con el Node Test Runner nativo.

#### Scenario: Ejecución del script de test

- **WHEN** se ejecuta `npm run test`
- **THEN** se corre `node --test "test/*.test.js"` y el resultado es equivalente a ejecutar ese comando directamente

### Requirement: Paso de lint en CI

The system SHALL incluir un paso de lint en el workflow de CI (`publish.yml`) que corra antes de los tests y bloquee el publish si falla.

#### Scenario: CI corre lint antes de tests

- **WHEN** se dispara el workflow `publish.yml`
- **THEN** después de `npm ci`, se ejecuta `npm run lint` antes de `node --test`; si lint falla, el workflow se detiene y no publica

#### Scenario: Lint pasa y tests corren

- **WHEN** `npm run lint` termina con exit 0
- **THEN** el workflow continúa con el paso de tests (`node --test "test/*.test.js"`)

### Requirement: ESLint como devDependency

The system SHALL incluir ESLint y sus dependencias de configuración exclusivamente como devDependencies, sin agregar dependencias de runtime.

#### Scenario: Solo devDependencies

- **WHEN** se inspecciona `package.json`
- **THEN** `eslint` y `globals` aparecen en `devDependencies`, y `dependencies` permanece ausente o vacía (el contrato zero-dependencies de runtime se preserva)

### Requirement: Código existente libre de violaciones

The system SHALL no contener violaciones de las reglas de lint configuradas en `src/` y `test/`.

#### Scenario: Sin violaciones en el código base

- **WHEN** se ejecuta `npm run lint` sobre el código existente
- **THEN** el resultado SHALL ser exit 0 sin violaciones, sin ignores globales, y sin directivas `// eslint-disable` en el código fuente
