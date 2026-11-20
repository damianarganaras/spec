# Proposal: Guard de integridad de IDs de modelo sobre `opencode.json`

## Intención

Extender el guard estático que verifica que los IDs de modelo declarados en el repositorio existan en
`src/core/model-catalog.json` para que cubra también `opencode.json` →
`agent.<nombre>.model`, además de `TIERS`, `TIER_CHAINS`, `agents/*.md` y
`profiles/*/agents/*.md`. El change no cambia la resolución de tiers, no modifica IDs, no refresca el
snapshot y no publica una superficie nueva.

## Problema

- **`opencode.json` es una fuente declarada sin cobertura.** El archivo está versionado, tiene diez
  entradas en `agent` y es la superficie donde el agente primario declara su modelo. El guard actual
  sólo recolecta `agents/*.md` y `profiles/*/agents/*.md`; un ID retirado del snapshot que siga en
  `opencode.json` no rompe ningún test.
- **El test y la pre-validación de `--write` pueden divergir.** `scripts/refresh-model-catalog.mjs`
  deriva las declaraciones de `TIERS`/`TIER_CHAINS` y de las mismas fuentes de frontmatter. Si el test
  suma `opencode.json` y el script no, `--write` puede producir un snapshot que el test rechaza
  después.
- **La cláusula de modelo efectivo necesita una matización.** La spec afirma que un override de
  `opencode.json` es invisible para ancleto. El guard estático sí puede leer los IDs declarados, pero
  esa lectura no constituye una detección del modelo efectivo ni cambia el carácter advisory de los
  avisos de modelo gratis sobre agentes primarios.

## Cambio propuesto

1. **Quinta fuente declarada.** `opencode.json` → `agent.<nombre>.model` se suma a las fuentes
   versionadas de IDs de modelo, con origen estable `opencode.json#agent.<nombre>.model`. Sólo se
   lee el `opencode.json` de la raíz; `.opencode/opencode.json` es configuración del proyecto y queda
   fuera. Sólo se consideran valores string; `inherit` sigue excluido por `declaredModelIds`.
2. **Un único collector de E/S.** La lectura de `agents/*.md`, `profiles/*/agents/*.md` y
   `opencode.json` se centraliza en `readModelDeclarations({ rootDir })`, compartido por el guard de
   tests y el gate de `--write`. Falla cerrado si una fuente requerida no se puede leer.
3. **Guard de tests con grupo propio.** El guard cubre las cinco fuentes y evalúa `opencode.json` en
   un grupo derivado sólo de sus entradas, para que la deduplicación de `declaredModelIds` no oculte
   su origen cuando el ID ya está declarado por `TIERS` o por un agente.
4. **Coherencia de `--write`.** La derivación por defecto del script incluye `opencode.json` bajo el
   `rootDir` efectivo; la inyección de `declaredIds` sigue evitando toda lectura de archivos.
5. **Matiz de modelo efectivo.** Se explicita que el guard estático lee IDs declarados, pero los
   avisos de modelo gratis sobre agentes primarios siguen siendo advisory y no detectan el modelo
   efectivo.
6. **Sin cambios de runtime ni de IDs.** `TIERS`, `TIER_CHAINS`, `resolveTierModels`,
   `src/core/model-catalog.json` y los valores de `opencode.json` no cambian.

## Alcance

**In scope**

- `src/core/model-declarations.js` (nuevo): collector único de declaraciones versionadas.
- `test/model-catalog.test.js`: guard de cinco fuentes, grupo propio de `opencode.json` y caso
  negativo con su origen.
- `test/model-declarations.test.js`: tests offline del collector (fuentes, `inherit`, archivo
  ausente, JSON inválido, modo fail-closed).
- `test/model-catalog-discovery.test.js`: gate de `--write` con un ID declarado sólo en
  `opencode.json`.
- `scripts/refresh-model-catalog.mjs`: reutiliza el collector en la derivación de `--write`.
- `aspec/backlog.md`: registro del change en el ledger.
- Delta `MODIFIED` de `agent-model-tiers`.

**Out of scope / no-goals**

- Validar `normal`/`gratis` en runtime, agregar cadenas o cambiar `resolveTierModels`.
- Cambiar IDs de modelo, refrescar o reescribir `src/core/model-catalog.json`.
- Modificar los valores de `opencode.json` o publicar ese archivo en `package.json`.
- Ampliar el aviso advisory de IDs declarados de `ancleto check`: conserva sus cuatro fuentes
  actuales y no forma parte de este change.
- Leer `.opencode/**`, `.ancletorc`, la red o ejecutar procesos desde los helpers puros.
- Detectar el modelo efectivo de `opencode.json` o volver bloqueantes los avisos advisory.
- Cambiar el schema o los PRAGMAs de memoria.
- Publicar un release.

## Beneficio

Cierra el último punto ciego entre las declaraciones versionadas de modelo y el snapshot verificado:
un ID ausente en `opencode.json` rompe el guard y bloquea `--write` antes de reescribir el snapshot.
El test y el script pasan a compartir la misma lectura, sin duplicar el parseo de `opencode.json` ni
habilitar validación de runtime.

## Riesgos

- **La deduplicación puede ocultar el origen de `opencode.json`.** Todos sus IDs actuales ya están
  declarados por `TIERS`. Mitigación: grupo propio con `declaredModelIds` restringido a las entradas
  del archivo y una aserción de que aporta al menos una declaración.
- **El collector introduce E/S compartida.** Mitigación: sólo `node:fs`, sin red ni
  `node:child_process`; los helpers de cálculo siguen puros.
- **Un `rootDir` de fixture sin `opencode.json` puede fallar en modo fail-closed.** Mitigación: los
  tests de `--write` que no prueban la derivación siguen inyectando `declaredIds`.
- **El merge de specs puede borrar escenarios.** Mitigación: el delta reescribe el cuerpo completo y
  todos los escenarios de cada requirement modificado.

## Supuestos

- `opencode.json` está trackeado por git, existe en la raíz y declara diez entradas en `agent` con el
  valor `opencode-go/deepseek-v4.1-flash`.
- `package.json` → `files` no incluye `opencode.json`; la cobertura es higiene del repositorio, no una
  superficie del paquete instalado.
- `declaredModelIds` ya acepta `agentModels: [{ id, source }]`, deduplica y excluye `inherit`; no
  requiere cambios de contrato.
- El snapshot vigente contiene el ID declarado por `opencode.json`; este change no lo refresca.
- El aviso advisory de `check` no es el guard de integridad: su cobertura de cuatro fuentes se
  mantiene deliberadamente y su collector fail-soft no se toca en este change.

## Decisiones

- **memory_key:** `opencode-json-integrity-fifth-source`
  **Elección:** `opencode.json` → `agent.<nombre>.model` se suma como quinta fuente declarada en el
  guard de tests y en la pre-validación de `--write`.
  **Descartado:** cubrir también el aviso advisory de `check`; resolver el modelo efectivo de
  `opencode.json` en runtime; leer `.opencode/**` o `.ancletorc`.
  **Justificación:** el archivo está versionado y declara IDs que hoy no se verifican; si el test y
  `--write` no comparten la misma derivación, el gate puede aceptar un snapshot que el guard rechaza.
  La lectura de IDs no equivale a detectar el modelo efectivo ni cambia el carácter advisory de los
  avisos de modelo gratis.
  **Refs:**
  - spec:agent-model-tiers#Integridad de los IDs declarados contra el snapshot
  - spec:agent-model-tiers#Aviso advisory de modelo gratis sobre un agente primario
  - change:model-catalog-guard-opencode-json

  **Estado:** aprobado

- **memory_key:** `versioned-model-declarations-single-collector`
  **Elección:** un único collector `readModelDeclarations({ rootDir })` en
  `src/core/model-declarations.js` lee `agents/*.md`, `profiles/*/agents/*.md` y `opencode.json`;
  el guard y `--write` lo comparten en modo fail-closed.
  **Descartado:** mantener dos collectors independientes entre test y script; poner la lectura de
  archivos dentro de `declaredModelIds`; leer `opencode.json` sólo desde el test.
  **Justificación:** el parseo de `opencode.json` y la lista de fuentes quedan en un solo lugar, el
  test y `--write` no pueden divergir y `declaredModelIds` conserva su contrato puro.
  **Refs:**
  - spec:agent-model-tiers#Integridad de los IDs declarados contra el snapshot
  - change:model-catalog-guard-opencode-json

  **Estado:** aprobado

## Change Log

- 2026-11-19 — Creación de los artefactos a partir de los hechos verificados de la delegación. Sin
  technical seed generado en este change y sin implementación de código.
