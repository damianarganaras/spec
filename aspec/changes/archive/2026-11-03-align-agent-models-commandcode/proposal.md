# Proposal: align-agent-models-commandcode

## Intención

Alinear el modelo por defecto que publica e instala `@ancleto/spec`: los diez agentes canónicos
declaran `commandcode/deepseek/deepseek-v4.1-flash`, `ancleto upgrade` propaga esa canónica al
mirror del proyecto, el tier `minimo` deja de reescribirlos y `ancleto check` deja de ocultar la
deriva de modelos. No se toca el control de costo por tiers ni el adaptador de frontmatter.

## Problema

Hoy el default publicado y el default instalado no coinciden, y la deriva es invisible:

- **La canónica no declara el default publicado.** Ocho `agents/*.md` declaran
  `opencode-go/deepseek-v4.1-flash` y dos (`coder.md`, `technical-seed-writer.md`) declaran
  `opencode-go/minimax-m3`; ninguno declara el default que el proyecto usa hoy. `agents` sí se
  publica (`package.json:10-17`), así que la canónica es superficie de producto.
- **El mirror está editado fuera de banda.** Los diez `.opencode/agents/*.md` declaran
  `commandcode/deepseek/deepseek-v4.1-flash`, pero `.opencode/**` está gitignored y no es
  reproducible desde la canónica.
- **Un tier puede pisar el mirror sin señal.** `applyTier` reescribe cualquier línea `^model: .*$`
  (`src/cli/index.js:625-634`) y `TIERS.minimo` mapea los diez agentes a
  `opencode-go/deepseek-v4.1-flash` (`src/cli/index.js:595-606`). Un `install`/`update` deja el
  mirror en `opencode-go/...`, divergiendo del default publicado, y `ancleto check` no lo dice.
- **El oráculo de `check` está invertido.** `checkAgentsFrontmatter`
  (`src/cli/index.js:2939-2981`) inyecta el tier en la canónica y compara contra el mirror: si
  canónica y mirror coinciden pero difieren del tier, reporta un falso positivo; si el tier pisó
  el mirror, pasa en silencio. El aviso es no bloqueante (`src/cli/index.js:2913`).

## Cambio propuesto

1. **Canónica uniforme.** Los diez `agents/*.md` pasan a
   `commandcode/deepseek/deepseek-v4.1-flash`.
2. **`TIERS.minimo` alineado a la canónica.** Los diez valores de `minimo` pasan al mismo modelo,
   de modo que `applyTier(canónica, 'minimo')` sea un no-op y el repo (tier `minimo`) quede estable
   tras `install`/`update`. `TIERS.normal` y `TIERS.gratis` no cambian.
3. **Oráculo de `check` con la canónica como referencia.** `checkAgentsFrontmatter` compara el
   mirror contra la adaptación de la canónica. Para `opencode`, acepta además el estado de tier
   aplicado como estado esperado (no es divergencia) y emite un aviso informativo, distinto y no
   bloqueante cuando el tier configurado aplicaría un modelo distinto al de su fuente esperada
   (canónica, o el perfil para los agentes que un overlay reemplaza). Nunca hay diferencia de modelo
   por tier sin aviso.
4. **Guard estructural.** Un test nuevo (`test/agent-model-coherence.test.js`) compara el conjunto
   de nombres y el modelo de `TIERS.minimo` contra `agents/*.md`. Sin literales de proveedor y sin
   leer `.opencode/**`.
5. **Documentación.** `README.md` publica la tabla real de modelos y `AGENTS.md` corrige la
   afirmación obsoleta de que la instalación global gana: en este setup gana el mirror del proyecto.
6. **Mirror regenerado por la herramienta.** `ancleto upgrade` regenera `.opencode/agents/*`; no se
   edita `.opencode/**` a mano.

## Alcance

**In scope**

- `agents/*.md` (10 archivos): una sola línea `model:` por archivo.
- `src/core/tier-models.js`: recibe `TIERS` (hoy `src/cli/index.js:582-619`) y lo exporta; el
  módulo ya es dueño del mapeo de tiers (`tierModels`).
- `src/cli/index.js`: importa `TIERS` desde `src/core/tier-models.js`, ajusta `TIERS.minimo` y el
  oráculo de `checkAgentsFrontmatter`.
- `test/agent-model-coherence.test.js` (nuevo): guard estructural.
- `test/cli.test.js`: actualización de asserts de modelo y cobertura del nuevo oráculo y de
  `upgrade`.
- `README.md`: tabla pública de agentes y modelos por tier.
- `AGENTS.md`: sección "Cambiar el modelo de los agentes".
- Regeneración del mirror del proyecto con `ancleto upgrade`: los agents base quedan byte-idénticos a
  la adaptación de la canónica más las notas de host que correspondan (p. ej. `CAVEMAN_USAGE_NOTE` en
  `orchestrator` cuando la compresión está habilitada).
- `aspec/changes/align-agent-models-commandcode/**`.

La garantía de byte-identidad de `upgrade` aplica al conjunto base de agentes (los diez
`agents/*.md` → agents instalados). Esa identidad es con la adaptación de la canónica más las notas
de host que correspondan (`CAVEMAN_USAGE_NOTE` en `orchestrator` cuando la compresión está
habilitada), no necesariamente con `agents/orchestrator.md` a secas. El overlay del perfil `test`
queda excluido de esa garantía porque en `upgrade` (que no aplica tier) el perfil es dueño de su
`model:`; en `install`/`update` el tier sí se aplica a esos dos agentes (ver Out of scope).

`templates/AGENTS.md` fue inspeccionado: no contiene la sección de superficies de modelo ni la
afirmación obsoleta, así que no requiere cambio.

**Out of scope / no-goals**

- Valores de `TIERS.normal` y `TIERS.gratis`.
- `src/core/adapters/frontmatter.js` y `test/adapters-frontmatter.test.js`: el adaptador sigue
  siendo model-agnostic.
- Edición manual de `.opencode/**`, `~/.config/opencode/**` u `opencode.json`.
- El change activo `ancleto-vscode-extension`.
- `profiles/test/agents/tester.md` y `profiles/test/agents/reviewer.md` (overlay del perfil `test`):
  en `upgrade` el `model:` lo fija el perfil (`installProfileOverlay` los reemplaza después de
  `installAgentAssets`, `src/cli/index.js:1824`); en `install`/`update` el tier reescribe su `model:`
  como el de todo agent instalado (`applyTier` corre después del overlay). Alinear su proveedor a
  `commandcode/...` exigiría IDs no verificables contra el catálogo del proveedor (p. ej.
  `commandcode/qwen3.6-plus`); queda en backlog. `check` los compara contra el perfil y acepta el
  estado del tier, sin reportar divergencia.
- Proveedor e IDs de modelos para los tiers `normal` y `gratis`: no hay forma de verificar que
  existan `commandcode/qwen3.7-plus` o `commandcode/minimax-m3` en el catálogo del proveedor.
  Queda en backlog.
- Un mecanismo genérico de validación de catálogos de proveedor.

## Paths autorizados del change

- `agents/*.md` (los 10)
- `src/core/tier-models.js`
- `src/cli/index.js`
- `test/agent-model-coherence.test.js` (nuevo)
- `test/cli.test.js`
- `README.md`
- `AGENTS.md`
- `aspec/changes/align-agent-models-commandcode/**`

## Riesgos

- **(i) Ruido de `check` en proyectos con tier `normal`.** El tier `normal` es el fallback no
  interactivo y difiere de la canónica en varios agentes, así que cada `check` emitirá una línea de
  aviso. Mitigación: un solo aviso agregado por directorio de agents (no una línea por archivo),
  informativo y no bloqueante; el exit code no cambia.
- **(ii) Falso positivo del oráculo si se compara sólo contra la canónica.** Una instalación sana
  con tier `gratis` tiene los diez modelos reescritos y se reportaría como divergente. Mitigación:
  el estado de tier aplicado cuenta como estado esperado y se acompaña con el aviso de tier; sólo
  se reporta divergencia cuando el mirror no coincide ni con la canónica ni con el tier.
- **(iii) Refactor de `TIERS` con efecto sobre dos consumidores.** Mover `TIERS` a
  `src/core/tier-models.js` y exportarlo es un refactor sin cambio de comportamiento: el guard
  importa el mismo símbolo exportado, así que desaparece el riesgo de parsear texto o de ejecutar el
  dispatch de `process.argv` al importar `src/cli/index.js`. El riesgo residual es que la mudanza
  altere los valores de `normal` y `gratis`; mitigación: el diff debe preservar byte a byte cada
  string de esos dos tiers y los tests existentes de tier cubren el mapeo.
- **(iv) Regeneración del mirror con efectos laterales.** `ancleto upgrade` también re-aplica
  templates y regenera artefactos locales. Mitigación: revisar el diff; `.opencode/**`,
  `.ancleto/**` y `aspec/` locales no se commitean; sólo se conservan los paths autorizados.
- **(v) El CLI no valida catálogos de proveedor.** Un ID de modelo inválido falla en el host, no en
  `ancleto`. Mitigación: el guard fija coherencia entre canónica y tier, no disponibilidad del
  proveedor; se documenta como supuesto.
- **(vi) Ambigüedad de "default publicado".** Puede leerse como el tier que elige un `install` sin
  `--tier` (`normal`), que difiere de la canónica. Mitigación: la documentación define "default
  publicado" como el valor `model:` de los archivos canónicos `agents/*.md` —lo que materializa
  `upgrade`— y aclara aparte que `normal` es el tier por defecto que selecciona un `install` sin
  `--tier`.
- **(vii) Tier y perfil comparten `model:` en install; el perfil recupera su modelo en `upgrade`.**
  Para `tester` y `reviewer` con `profile: test` hay dos fuentes que escriben la misma línea en fases
  distintas: `install`/`update`/`init` aplican el tier también al overlay, y `upgrade` (sin tier)
  restaura el `model:` del perfil. Mitigación: un único dueño por fase — install=tier, upgrade=perfil
  — y `check` acepta ambos estados como sanos, reportando la diferencia de tier con el aviso de tier
  en lugar de marcarla como divergencia de frontmatter.
- **(viii) El tier `gratis` tiene dos modelos conocidos y el estado esperado debe aceptar ambos.** Un
  proyecto legacy o importado sin `.ancletorc.gratisModel` persistido resuelve el modelo gratis por
  entorno/detección en el momento del `check`, que puede diferir del usado en el `install`; comparar
  contra un único modelo resuelto produce diez falsos `frontmatter diverge del adaptador`. Mitigación:
  el estado esperado es un conjunto de aceptación con `MUSE_SPARK_MODEL` y `GRATIS_FALLBACK_MODEL`, más
  un test de regresión en `test/cli.test.js`; el aviso de tier sigue calculándose con el modelo
  resuelto, no con el conjunto.

## Supuestos

- `commandcode/deepseek/deepseek-v4.1-flash` es el default publicado deseado; el CLI no consulta
  catálogos de proveedor para resolverlo.
- El traslado de `TIERS` a `src/core/tier-models.js` es byte-preserving para `normal` y `gratis`:
  ningún string de modelo de esos tiers cambia.
- `.opencode/**` es gitignored y no existe en CI; el guard lee sólo archivos versionados.
- `applyTier` ya evita escribir cuando el contenido resultante es igual; el change sólo necesita
  que el valor del tier coincida con la canónica.
- El aviso de tier de `check` se emite una vez por directorio de agents instalado.

## Decisiones

- **memory_key:** `agent-model-default-canonico-uniforme`
  **Elección:** los diez `agents/*.md` declaran `commandcode/deepseek/deepseek-v4.1-flash`, que es
  el default publicado y la fuente de `ancleto upgrade`.
  **Descartado:** conservar la canónica mixta (`opencode-go/` en ocho, `minimax-m3` en dos) y
  confiar en el mirror local.
  **Justificación:** la canónica se publica (`package.json:10-17`). Si el default sólo vive en un
  archivo gitignored, ningún consumidor lo recibe de forma reproducible y la deriva no es
  auditable.
  **Refs:** `change:align-agent-models-commandcode`; `path:package.json`;
  `path:agents/orchestrator.md`;
  `spec:agent-model-tiers#Modelo por defecto uniforme en la canónica publicada`
  **Estado:** aprobado

- **memory_key:** `agent-model-minimo-noop`
  **Elección:** `TIERS.minimo` mapea los diez agentes a
  `commandcode/deepseek/deepseek-v4.1-flash`, de modo que aplicarlo sobre la canónica sea un no-op
  y el repo (tier `minimo`) quede estable tras `install`/`update`.
  **Descartado:** colapsar `normal` y `minimo`; migrar `normal`/`gratis` a `commandcode/`.
  **Justificación:** colapsar tiers destruye el control de costo por tiers, una restricción de
  diseño declarada (`PRODUCT.md:11`). `normal` y `gratis` son elecciones explícitas del usuario, no
  defaults silenciosos, y no hay forma de verificar que `commandcode/qwen3.7-plus` o
  `commandcode/minimax-m3` existan en el catálogo del proveedor; inventar IDs rompería `normal`.
  Queda en backlog.
  **Refs:** `change:align-agent-models-commandcode`; `path:src/cli/index.js`;
  `path:PRODUCT.md`;
  `spec:agent-model-tiers#Aplicación de tier idempotente y no-op sobre la canónica`
  **Estado:** aprobado

- **memory_key:** `agent-model-check-oraculo-canonico`
  **Elección:** `ancleto check` compara el mirror contra la adaptación de la canónica versionada;
  para `opencode` acepta además el estado del tier aplicado como estado esperado y emite un aviso
  informativo, distinto y no bloqueante cuando el tier configurado aplicaría un modelo distinto.
  **Descartado:** seguir comparando contra la canónica con el tier inyectado (falso positivo cuando
  canónica y mirror coinciden, silencio cuando el tier pisó el mirror); comparar sólo contra la
  canónica sin reconocer el estado de tier (marcaría como divergencia una instalación sana de
  `normal` o `gratis`).
  **Justificación:** la canónica es la verdad de referencia y el tier no puede alterar modelos sin
  reportarlo. Aceptar el estado de tier evita el falso positivo; el aviso separado evita el
  silencio. Ambos desenlaces son verificables con la salida de `check`.
  **Refs:** `change:align-agent-models-commandcode`; `path:src/cli/index.js`;
  `spec:skill-frontmatter-adapters#ancleto check valida frontmatter de agents contra el adaptador y la canónica`
  **Estado:** aprobado

- **memory_key:** `agent-model-guard-estructural`
  **Elección:** un guard en `test/agent-model-coherence.test.js` compara el conjunto de nombres y
  el modelo por agente de `TIERS.minimo` contra `agents/*.md`. Deriva el lado canónico de los
  `agents/*.md` versionados y el lado del tier del `TIERS` exportado desde
  `src/core/tier-models.js`; ningún lado se obtiene por regex sobre `src/cli/index.js`, y el test no
  codifica literales de proveedor.
  **Descartado:** un test que instale en un directorio temporal y compare sólo la salida (no detecta
  una entrada faltante en `TIERS.minimo` porque `applyTier` omite archivos inexistentes).
  **Justificación:** el invariante es estructural: nombres y modelos deben alinearse en el código
  versionado. `.opencode/**` está gitignored y ausente en CI, así que no puede ser la fuente del
  guard. Codificar IDs de proveedor duplicaría el valor que el guard debe verificar.
  **Refs:** `change:align-agent-models-commandcode`; `path:test/agent-model-coherence.test.js`;
  `spec:agent-model-tiers#Guard estructural de coherencia entre canónica, tier minimo y catálogo`
  **Estado:** aprobado

- **memory_key:** `tiers-owned-by-tier-models`
  **Elección:** `TIERS` vive y se exporta en `src/core/tier-models.js`; `src/cli/index.js` lo importa
  desde allí.
  **Descartado:** parsear el literal `TIERS` desde el test con regex; importar `src/cli/index.js`
  desde el test (dispara el dispatch de `process.argv`).
  **Justificación:** el módulo ya es dueño del mapeo de tiers (`tierModels`); un único dueño evita que
  el guard duplique conocimiento y se rompa por reformateo. Refactor sin cambio de comportamiento:
  los valores de `normal` y `gratis` se preservan byte a byte.
  **Refs:** `change:align-agent-models-commandcode`; `path:src/core/tier-models.js`;
  `path:src/cli/index.js`;
  `spec:agent-model-tiers#Guard estructural de coherencia entre canónica, tier minimo y catálogo`
  **Estado:** aprobado

- **memory_key:** `agent-model-mirror-regenerado-sin-edicion`
  **Elección:** el mirror del proyecto se regenera sólo con `ancleto upgrade`; no se edita
  `.opencode/**` a mano ni se toca la instalación global para cambiar el default.
  **Descartado:** editar el mirror a mano como se hizo hasta ahora; repuntar la instalación global.
  **Justificación:** `upgrade` ya llama `installAgentAssets` (`src/cli/index.js:1860`), que
  materializa la canónica; el mirror es derivado y gitignored. La copia global es una instalación
  distinta del CLI y no es la fuente del paquete.
  **Refs:** `change:align-agent-models-commandcode`; `path:AGENTS.md`;
  `spec:agent-model-tiers#upgrade regenera el mirror de agents desde la canónica`
  **Estado:** aprobado

- **memory_key:** `agent-model-profile-test-excluido`
  **Elección:** la exclusión se limita a la **alineación de proveedor** de
  `profiles/test/agents/*.md` (queda en backlog: exigiría IDs `commandcode/...` no verificables). NO
  se excluye a esos agentes del control de tier: la propiedad del `model:` es por fase — en
  `install`/`update`/`init` el **tier** es dueño del `model:` de todos los agents instalados, overlay
  incluido (`installProfileOverlay` corre antes de `applyTier`); en `upgrade` (que nunca aplica tier)
  el **perfil** es dueño del body y del `model:` de `tester` y `reviewer`, y por eso la identidad
  byte a byte con `profiles/test/agents/*` se cumple sólo después de `upgrade`. `check` acepta ambos
  estados como sanos y reporta la diferencia de tier con el aviso de tier, no como divergencia.
  **Descartado:** alinear `profiles/test/agents/*.md` a `commandcode/...` (requiere IDs no
  verificables, p. ej. `commandcode/qwen3.6-plus`); hacer que el overlay quede fuera del tier en
  `install`/`update` (rompería la seguridad de costo: `--tier gratis` dejaría `tester`/`reviewer` con
  un modelo pago); incluir el overlay en el guard estructural de la canónica.
  **Justificación:** `--tier gratis` debe seguir siendo cost-safe con `profile: test`, así que el
  tier debe reescribir también los dos agentes del overlay en `install`/`update`; el perfil recupera
  su `model:` en `upgrade`. Un dueño único por fase evita que dos fuentes se pisen sin señal y hace
  verdadera la garantía de byte-identidad de `upgrade`.
  **Refs:** `change:align-agent-models-commandcode`; `path:src/cli/index.js`;
  `path:profiles/test/agents/tester.md`; `path:profiles/test/agents/reviewer.md`;
  `spec:agent-model-tiers#upgrade regenera el mirror de agents desde la canónica`;
  `spec:agent-model-tiers#Aplicación de tier idempotente y no-op sobre la canónica`
  **Estado:** aprobado

- **memory_key:** `agent-model-check-gratis-acceptance-set`
  **Elección:** para el tier `gratis`, el estado esperado de `check` es un conjunto de aceptación con
  `MUSE_SPARK_MODEL` y `GRATIS_FALLBACK_MODEL`; el mirror es sano si coincide con cualquiera de los dos.
  El aviso de tier sigue calculándose con el modelo resuelto (persistido o detectado).
  **Descartado:** comparar contra un único modelo resuelto en el momento del check.
  **Justificación:** un proyecto legacy sin `.ancletorc.gratisModel` persistido puede resolver un modelo
  gratis distinto al usado en el install; comparar contra uno solo produce diez falsos
  `frontmatter diverge del adaptador`. El aviso de tier no se duplica porque no describe el conjunto
  de aceptación sino la diferencia del modelo resuelto.
  **Refs:** `change:align-agent-models-commandcode`; `path:src/cli/index.js`;
  `path:test/cli.test.js`;
  `spec:skill-frontmatter-adapters#ancleto check valida frontmatter de agents contra el adaptador y la canónica`
  **Estado:** aprobado

## Change Log

- 2026-11-03 — Amend in place (fuente: instrucción del usuario). El tier `gratis` tiene dos modelos
  conocidos; el check acepta cualquiera como estado esperado (`specs/skill-frontmatter-adapters`),
  se agrega el escenario de regresión legacy y el riesgo (viii).
