# Proposal: Guard estructural de delta specs de changes activos en la suite declarada

## Clasificación

**Funcional con delta `ADDED`.** No existe hoy un Requirement canónico que valide proactivamente la
estructura de los delta specs de changes activos: `specsCheckCommand` sólo valida keywords
(`src/cli/index.js:3344-3357`), `spec-sync` valida recién al mergear
(`aspec/specs/spec-sync/spec.md:95`) y el archive recién al archivar
(`aspec/specs/prompt-contracts/spec.md:1271`). El delta agrega un Requirement nuevo en la capability
`spec-sync`.

## Problema

Un delta spec malformado de un change activo no falla hasta el archive, cuando
`ancleto specs check --change` o `ancleto specs merge --change` lo rechazan. El error llega tarde: el
change ya se dio por terminado y el delta roto bloquea el cierre. La información necesaria para
detectarlo antes —el parser real del merge— ya existe y está exportado
(`src/core/specs-merge.js:177`).

## Propuesta

Cambio **test-only** que incorpora la validación estructural a la suite declarada (`npm test` =
`node --test "test/*.test.js"`) mediante un archivo nuevo, `test/delta-spec-structure.test.js`:

- **Reutiliza el parser real del merge**: `import { parseDeltaSpec } from '../src/core/specs-merge.js'`.
  No se duplica la gramática ni se reimplementa ningún regex del parser.
- **Barre los changes activos**: lee `aspec/changes`, salta la entrada llamada exactamente `archive`
  (exclusión por identidad, nunca por prefijo), y desciende a
  `<change>/specs/<capability>/spec.md`. No hardcodea ningún slug de change activo.
- **Tolera cero changes activos**: hoy `aspec/changes` contiene sólo el contenedor `archive` y el
  change diferido `ancleto-vscode-extension`; cero deltas es un estado válido. El fail-closed se
  limita a `aspec/changes` inexistente o ilegible y a un `spec.md` presente que no pueda leerse o
  parsearse.
- **Fixtures literales y mutación**: cada predicado tiene al menos un caso donde se rompe. La
  no-vacuidad la dan los fixtures, no el conteo de deltas del repositorio.
- **Colector sobre árbol temporal**: cubre 0 changes, 1 change con 2 capabilities, N changes, y
  `archive/<fecha>-<slug>/specs/...` más `archive/specs/...` malformados que no deben aparecer.

**Dentro del alcance:** los cuatro paths autorizados de este change —`proposal.md`, `tasks.md`,
`specs/spec-sync/spec.md` y `test/delta-spec-structure.test.js`.

**Fuera del alcance:** extender `specsCheckCommand`; cualquier edición bajo `src/`; superficie de
producto (`agents/`, `skills/`, `commands/`, `templates/`, `.opencode/`); las specs canónicas de
`aspec/specs/`; el change diferido `ancleto-vscode-extension`; bump de versión.

## Garantías

**Cero cambio de runtime.** No se toca `src/cli/index.js`, `specsCheckCommand` ni
`src/core/specs-merge.js`. El comportamiento observable de la CLI no cambia; el release no cambia de
categoría.

## Riesgos y mitigación

- **Falso rojo por exigir más que el parser**: mitigado anclando todos los asserts a `parseDeltaSpec`.
  Un delta que el merge acepta no debe fallar; un segundo H1 dentro del cuerpo de una sección NO es
  malformación (`errors === 0`) y no se incluye como caso inválido.
- **Romper al archivar el último change activo**: mitigado tolerando cero deltas. Cuando `archive`
  sea la única entrada, el barrido termina sin error.
- **Dependencia de una ruta activa concreta**: mitigado con el barrido de `aspec/changes`; ningún slug
  activo se hardcodea.
- **No cubre deltas que el merge ignora por un path mal formado**: aceptado y documentado como fuera
  de alcance; el guard valida estructura, no el descubrimiento de capabilities.

## Decisiones

- **memory_key:** active-delta-structure-guard
  **Elección:** incorporar a la suite declarada un test-only (`test/delta-spec-structure.test.js`) que
  barre los delta specs de los changes activos y los valida con el parser real del merge
  (`parseDeltaSpec`), sin tocar runtime.
  **Descartado:** reimplementar la gramática del delta con regex propias dentro del test.
  **Justificación:** `parseDeltaSpec` ya es la gramática canónica y está exportado
  (`src/core/specs-merge.js:177`); reutilizarlo evita un segundo oráculo que derive del primero, y un
  archivo de test no cambia la categoría de release.
  **Refs:**
  - spec:spec-sync#Validación estructural de delta specs de changes activos
  - path:src/core/specs-merge.js
  - path:aspec/specs/spec-sync/spec.md
  - change:active-delta-structure-guard

  **Estado:** aprobado

- **memory_key:** delta-validation-via-specs-check
  **Elección:** no extender `specsCheckCommand`; la validación estructural vive en la suite declarada
  y reutiliza el parser del merge.
  **Descartado:** extender `specsCheckCommand` para validar la estructura de los deltas de changes
  activos.
  **Justificación:** violaría la compatibilidad pineada de `specs check` y el alcance acotado de
  `specs merge` (`aspec/specs/spec-sync/spec.md:255-272`), tocaría `src/cli/index.js` y convertiría el
  release en minor; el gap se cierra sin runtime.
  **Refs:**
  - spec:spec-sync#Alcance acotado del comando specs merge
  - path:aspec/specs/spec-sync/spec.md
  - path:src/cli/index.js

  **Estado:** descartado

## Validación planeada

Comandos declarados en `PRODUCT.md` → `## Project Commands`:

- Lint: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- Tests: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run test` (`node --test "test/*.test.js"`).
- Format: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (paquete JavaScript, sin `tsconfig.json`).

Entorno declarado: Windows PowerShell 5.1 (`.ancleto/machine-env.md`), EOL `lf`.
