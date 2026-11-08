# Proposal: Alineación del tier `minimo` a la canónica migrada (0.24.0)

## Problema

El commit `9e45105 chore(agents): migrar modelos a opencode-go/deepseek-v4.1-flash` migró el `model:`
de los diez `agents/*.md` y de `opencode.json` de `commandcode/deepseek/deepseek-v4.1-flash` a
`opencode-go/deepseek-v4.1-flash` —porque `commandcode` quedó sin saldo—, pero no actualizó
`src/core/tier-models.js`: `TIERS.minimo[*]` y `MINIMO_CHAIN[0]` siguen en
`commandcode/deepseek/deepseek-v4.1-flash`.

La consecuencia está reproducida en HEAD: `install`/`update`/`init --tier minimo` instalan
`commandcode/...` mientras la canónica `agents/*.md` declara `opencode-go/...`; `ancleto check` emite
divergencia en los diez agentes; y once tests que pasan en `origin/development` (cbe35a8) fallan en
HEAD —uno de `test/agent-model-coherence.test.js` y diez de `test/cli.test.js`—. Los tests no
codifican proveedor: derivan el modelo esperado de la canónica y exigen
`TIERS.minimo[n] === modelOf(agents/<n>.md) === TIER_CHAINS.minimo[n][0]` y un mirror byte-idéntico.

## Intención

Restaurar la invariante «el tier `minimo` publica el modelo de la canónica» alineando la tabla
derivada al modelo que la canónica ya publica. La canónica `agents/*.md` es la fuente de verdad; la
tabla de tiers la sigue. No se revierte la migración ni se cambia la lógica de resolución.

## Alcance

**Dentro:**

- Alinear `TIERS.minimo[*]` y la cabeza de `MINIMO_CHAIN` a `opencode-go/deepseek-v4.1-flash` en
  `src/core/tier-models.js`.
- Retirar `commandcode/deepseek/deepseek-v4.1-flash` de `MINIMO_CHAIN`: el proveedor dejó de usarse y
  la canónica ya no lo publica; conservarlo como candidato permitiría instalar un modelo que la
  canónica nunca declara. La cadena queda `opencode-go/deepseek-v4.1-flash` →
  `opencode/deepseek-v4.1-flash-free`.
- Delta spec: `MODIFIED` del requirement "Resolución de `minimo` por cadena de preferencia contra un
  catálogo verificado" en `specs/agent-model-tiers/spec.md`, reescribiendo el cuerpo completo del
  requirement y preservando los scenarios no afectados.
- Tests: reutilizar el guard existente `test/agent-model-coherence.test.js`; ajustar sólo si algo
  codificara un proveedor (hoy deriva de la canónica).
- Documentación: alinear `README.md` (filas del modelo `minimo` y cadena de candidatos) y la nota de
  modelo por defecto en `AGENTS.md` (raíz, fuera de bloques LOCKED) a
  `opencode-go/deepseek-v4.1-flash` y cadena de 2.
- Verificar si `src/` contiene otras referencias derivadas al ID
  `commandcode/deepseek/deepseek-v4.1-flash` que deban alinearse para que la invariante se sostenga.
  Hoy la única declaración derivada es `src/core/tier-models.js`; `src/core/model-catalog.json` es un
  snapshot de disponibilidad y no se toca.

**Fuera (exclusión explícita):**

- Cambiar `agents/*.md` u `opencode.json`: ya migrados por `9e45105`.
- Revertir la migración a `opencode-go` o reintroducir `commandcode` como proveedor.
- Cambiar la forma de `TIERS`, la firma del resolver, `applyTier`, la lógica de `check` o el guard
  estructural.
- Modificar el snapshot `src/core/model-catalog.json` ni su procedimiento de refresco.
- Modificar `package.json` o la versión del paquete en este change: el release aplica la versión.

## Riesgos y mitigación

- **Cambio de modelo publicado para `--tier minimo`.** Todo usuario que instale, actualice o inicialice
  con `minimo` recibirá `opencode-go/deepseek-v4.1-flash` en lugar de `commandcode/...`. Mitigación: es
  exactamente el modelo que la canónica ya publica y el que usa el entorno desde `9e45105`; el cambio
  elimina la divergencia que hoy rompe once tests y `check`.
- **Regresión de la cadena de fallback.** Al retirar `commandcode`, la cadena queda con dos
  candidatos. Mitigación: el escenario «ningún candidato disponible» conserva el error explícito que
  nombra al agente y la cadena; el tercer candidato previo sólo aplicaba cuando los dos primeros
  faltaban.
- **Deriva silenciosa futura.** La invariante sólo se sostiene si la canónica y la tabla se mueven
  juntas. Mitigación: el guard estructural existente falla si `TIERS.minimo[n]` difiere del `model:`
  canónico o de la cabeza de la cadena, y no codifica proveedor.

## Decisión de versión

Release objetivo: **0.24.0** (minor). El cambio es observable para todos los usuarios: el modelo que
instala `--tier minimo` cambia de proveedor y de identificador. No agrega comandos ni flags, pero
altera el default publicado por un tier, por lo que no es patch-class.

**Nota de release:** `9e45105` cambió `agents/**` sin bump de versión. El release DEBE correr
`ancleto upgrade` sobre el repositorio y commitear los tracked files si cambian (los mirrors
`.opencode/agents/*.md` derivan de la canónica), además de aplicar la versión 0.24.0.

## Delta spec

- `specs/agent-model-tiers/spec.md` — 1 `MODIFIED`: "Resolución de `minimo` por cadena de preferencia
  contra un catálogo verificado". Ningún `ADDED`, `REMOVED` ni `RENAMED`.
- El `MODIFIED` reescribe el cuerpo completo del requirement para la cadena de dos candidatos y, en
  sus scenarios, elimina "Sólo el tercer candidato está disponible" (ya no hay tercer candidato) y
  renombra el scenario del segundo candidato de "La cabeza no está disponible y el segundo candidato
  sí" a "La cabeza no está disponible y el candidato restante sí", para que el diff del archive sea
  auditable. No agrega escenarios nuevos de `install`, `check` ni de la tabla de tiers: esa cobertura
  ya existe en otros requirements de la canónica y no se duplica en el delta.

## Decisiones

- **memory_key:** tier-minimo-opencode-go-alignment
  **Elección:** Alinear `TIERS.minimo` y `MINIMO_CHAIN` a `opencode-go/deepseek-v4.1-flash` para
  restaurar la invariante tier == canónica; no inventar IDs.
  **Descartado:** Conservar `commandcode/deepseek/deepseek-v4.1-flash` como candidato de la cadena;
  inventar un identificador sustituto para el tier.
  **Justificación:** `commandcode` quedó sin saldo y la canónica ya migró; mantenerlo como candidato
  permitiría instalar un modelo que la canónica no publica y dejaría la invariante rota.
  **Estado:** aprobado

refs:
  - path:src/core/tier-models.js
  - path:test/agent-model-coherence.test.js
  - change:agent-model-minimo-migration

- **memory_key:** agent-model-migration-source-of-truth
  **Elección:** La canónica `agents/*.md` (ya migrada) es la fuente de verdad del modelo; la tabla de
  tiers es derivada y debe seguirla.
  **Descartado:** Tratar `TIERS.minimo` como fuente y revertir la canónica a `commandcode`.
  **Justificación:** El default publicado es el de `agents/*.md`; una tabla derivada no puede
  contradecirlo sin romper `check` y los guards de coherencia.
  **Estado:** aprobado

refs:
  - path:src/core/tier-models.js
  - path:agents/coder.md
  - change:agent-model-minimo-migration
