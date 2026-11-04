# Delta: linter-standard

## MODIFIED Requirements

### Requirement: Configuración de ESLint mínima

The system SHALL proveer una configuración de ESLint (flat config) con exactamente 4 reglas
habilitadas sobre los directorios `src/`, `test/` y `scripts/`.

#### Scenario: Config flat con reglas mínimas

- **WHEN** se inspecciona `eslint.config.js`
- **THEN** el archivo SHALL ser un flat config (export default de un array) con
  `languageOptions.ecmaVersion: "latest"`, `languageOptions.sourceType: "module"`, globals de Node, y
  las reglas `no-undef`, `no-unused-vars`, `eqeqeq` (`"always"`), `no-dupe-keys`

#### Scenario: Reglas deshabilitadas explícitamente

- **WHEN** se evalúa la configuración
- **THEN** NO SHALL incluir Prettier, ni reglas de estilo (indentación, comas, nombres, formato), ni
  plugins adicionales más allá de `@eslint/js` (incluido con ESLint) y `globals`

#### Scenario: La configuración cubre `scripts/`

- **WHEN** se ejecuta ESLint sobre un archivo de `scripts/`
- **THEN** se aplican las mismas 4 reglas que en `src/` y `test/`
- **AND** no se requiere una configuración, un plugin ni un ignore nuevo

### Requirement: Script npm de lint

The system SHALL proveer un script `npm run lint` que ejecute ESLint sobre `src/`, `test/` y
`scripts/`.

#### Scenario: Ejecución del script

- **WHEN** se ejecuta `npm run lint`
- **THEN** se corre `eslint src/ test/ scripts/` y el proceso termina con exit 0 si no hay
  violaciones, o exit 1 si hay al menos una violación

#### Scenario: Detección de violaciones

- **WHEN** un archivo en `src/`, `test/` o `scripts/` contiene una violación de las reglas
  configuradas
- **THEN** `npm run lint` SHALL reportar la violación con file:line y regla, y terminar con exit 1
- **AND** el comando declarado en `package.json` y en `PRODUCT.md` → `## Project Commands` coincide
  con `eslint src/ test/ scripts/`

### Requirement: Código existente libre de violaciones

The system SHALL no contener violaciones de las reglas de lint configuradas en `src/`, `test/` y
`scripts/`.

#### Scenario: Sin violaciones en el código base

- **WHEN** se ejecuta `npm run lint` sobre el código existente
- **THEN** el resultado SHALL ser exit 0 sin violaciones, sin ignores globales, y sin directivas
  `// eslint-disable` en el código fuente
