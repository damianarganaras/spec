# Proposal: Juez semántico opcional (JEV) para specs, opt-in y advisory

> **Estado:** propuesta para review. **No implementada.** Este change declara sólo `proposal.md`:
> `design.md`, `tasks.md` y el delta `specs/spec-judge/spec.md` se escriben después de la aprobación
> (o incorporando lo que pida el review). No hay cambios de código en este directorio.

## Related Work Item

No aplica: este change no tiene Work Item asociado y no se inventa uno.

## Contexto y problema

Hoy la verificación semántica de un change ocurre una sola vez, al final, y la paga el agente:

```text
/cleto-apply ──────────► /cleto-verify ──────────► /cleto-archive
   (sin señal)            (juicio del agente:        (relevancia semántica
                           keywords + lectura)         = juicio humano/agent)
```

Tres hechos medidos en este repositorio definen el hueco:

1. **La compuerta léxica es la única automática.** `ancleto specs check` valida keywords canónicos;
   `skills/ancleto-verify/SKILL.md:37` resuelve la cobertura "searching the codebase for related
   keywords". Entre esa compuerta y el agente no hay nada intermedio.
2. **El salto de costo es de dos órdenes de magnitud.** La verificación del agente consume contexto
   y se ejecuta una vez por change; un juez de decisión (JEV) devuelve probabilidades calibradas en
   70–400 ms y ~$0.042 por millón de tokens de input, sin tokens de output (mediciones publicadas
   por `jev-spec`, no doc oficial de TypeSafe). Esa asimetría es la que permite correr la señal en
   cada tarea y no sólo al archivar.
3. **La relevancia de conformidad está declarada como no mecánica.** `prompt-contracts:1222-1228`
   dice que la relevancia "es un juicio semántico y NO SHALL presentarse como mecánicamente
   demostrable". Es un hueco reconocido por la spec vigente: hoy lo cubre `@reviewer` a mano, como
   `CRITICAL`.

El problema de producto no es "falta un verificador" — el agente ya verifica. Es que **cualquier repo
que use ancleto no tiene una señal semántica barata, repetible y offline-testeable** para decidir
cuándo vale la pena que el agente investigue. `jev-spec` existe y es barato, pero cada usuario tendría
que descubrirlo, escribir su config y cablearlo a mano, sin contrato de degradación, sin pin de versión
y sin que las skills de ancleto sepan usarlo.

## Requisito citado

**No cita un requirement existente:** `spec-judge` es una capability nueva y el delta se escribirá
después de la aprobación. Lo que sí se declara son los cuatro contratos vigentes que el change **NO
puede violar**:

- `spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional`
  (`aspec/specs/prompt-contracts/spec.md:1222-1228`): el archive NO agrega un segundo gate de
  verificación y la relevancia NO se presenta como mecánicamente demostrable.
- `path:aspec/specs/cli-diagnostics/spec.md` (contrato de diagnósticos): `check` conserva
  `missing > 0 ? 1 : 0`; el juez no cambia su salida ni su código de salida
  (`src/cli/index.js:3439`).
- `path:PRODUCT.md` y `path:package.json`: cero dependencias de runtime, Node ≥ 24, y `src/` no
  accede a la red en runtime (verificado: no hay un solo `fetch(` en `src/`).
- `spec:spec-sync#...` y la regla de "un dueño por invariante": el parseo y el mapeo del juez viven en
  un módulo puro, como `src/core/specs-merge.js`.

## Disparador evaluado

**No verificado, y se declara como tal.** No hay evidencia medida en este repositorio de demanda
multi-repo (varios proyectos con specs densos y CI). El disparador que sí está medido es el costo
manual: la verificación semántica hoy es una sola pasada del agente por change, y no existe una señal
intermedia reproducible.

Por eso la propuesta incluye un **spike de validación** (ver más abajo) con criterio de abandono
explícito: si las rubrics no fallan contra código roto a propósito, la feature no se implementa.

## Intención

Agregar una capa **opcional, opt-in y advisory** que cualquier repo que use ancleto pueda habilitar
con dos líneas de configuración:

```text
ancleto judge ──► [adaptador] ──► jev-spec (binario opcional, pinneado) ──► Jev ──► probabilidades
      │                                                                              │
      └── normaliza, degrada y reporta ◄────────────── assertions ◄──────────────────┘
```

Principios:

- **Nada de red en el core.** `src/` no habla HTTP. El adaptador **envuelve un binario externo**
  (`jev-spec`), resuelto por `PATH` o `npx` con versión pinneada, exactamente como hoy se resuelve
  Repomix (`src/cli/index.js:2589-2597`).
- **Deshabilitado por defecto.** Sin `judge.enabled` no hay comportamiento nuevo; `ancleto judge`
  reporta `skipped` con motivo y sale 0.
- **Advisory por defecto, gate sólo con `--require`.** Un repo sin red o sin API key no se rompe;
  un CI que quiera bloquear lo pide explícitamente.
- **Nunca en el archive.** La relevancia de conformidad sigue siendo juicio de `@reviewer`/humano;
  el juez puede aportar un score como evidencia, nunca como prueba.
- **Las rubrics son del usuario.** ancleto no genera preguntas: eso requiere un agente y un modelo.
  El repo usuario declara sus targets/rubrics en `jev-spec.config.ts` (formato de `jev-spec`).

## Alcance

### In scope

- **`src/core/judge/` (módulo puro, sin I/O):**
  - `config.js`: lectura tolerante de `.ancletorc` → `judge` (ausente, no-objeto o entradas inválidas
    → defaults, mismo criterio que `memory.criticalKeys`). `.ancletorc` puede **no existir**: este
    mismo repositorio no lo tiene y el comando debe seguir siendo usable.
  - `argv.js`: construcción de argv con **whitelist** de flags; `--target` validado por
    `^[A-Za-z0-9._-]+$`; nunca se interpola input del usuario en una cadena de shell.
  - `normalize.js`: mapeo de la salida JSON de `jev-spec` a una forma estable de ancleto
    (`passed`, `targets[]`, `rubrics[]`, `skipped`, `tool`, `model`, `cost`). Si el JSON no se
    reconoce → `judge-output-unrecognized`, exit 2, nunca "pass".
  - `verdict.js`: `pass | fail | skip` + exit code (`0` pass/skip, `1` assertion fallida, `2` error
    de setup); `--require` convierte `skip` en `2`.
- **`src/cli/index.js`:** subcomando `ancleto judge [--target <name>] [--dry-run] [--json]
  [--require] [--timeout <ms>]`, con entrada de ayuda y sin escrituras (read-only).
- **Resolución del binario:** `resolveBin('jev-spec')` → local; si falta, `npx -y jev-spec@<PIN>`;
  el adaptador reporta la versión y el modelo que respondieron. El pin vive en una sola constante.
- **`.ancletorc` (schema aditivo):**
  ```yaml
  judge:
    enabled: false        # default
    tool: jev-spec        # nombre en PATH o ruta
    command: []           # override opcional (argv list)
    timeoutMs: 120000
  ```
- **Skills:** `ancleto-verify` gana un paso opcional ("si `judge.enabled`, corré `ancleto judge
  --json`; usá las probabilidades como evidencia, nunca como veredicto; si `skipped`, declaralo");
  `ancleto-apply` lo menciona como chequeo opcional por tarea; `ancleto-workflow` lo lista como
  opcional. `ancleto-archive` NO se toca.
- **Docs:** `README.md` (sección corta), `docs/guia-configuracion.md` (bloque `judge`) y
  `docs/jev-advisory-judge.md` (setup, protocolo de probes, límites, seguridad y calibración).
- **Tests offline:** `test/judge.test.js` con `test/fixtures/jev-spec-mock.mjs` (binario falso,
  determinista, sin red). Se commitea además una **grabación real** de `jev-spec check --format json`
  como fixture, para fijar el parser contra la forma efectiva del tool.

### Out of scope (con razón)

- **Cliente HTTP nativo a TypeSafe.** Duplicaría el root-jail, los delimitadores anti-inyección, los
  límites de 500 archivos / 2 MiB / 120k chars y el manejo de errores que `jev-spec` ya implementa;
  además metería red en `src/` y una superficie de seguridad propia. Se descarta.
- **Integrarse a `ancleto check` o cambiar su exit.** El contrato `missing > 0 ? 1 : 0` está pinneado
  en `cli-diagnostics`; mezclar un gate de red con un oráculo offline rompe ambos.
- **Gate en `ancleto-archive` / conformidad.** Contradice `prompt-contracts:1222-1228` y "Don't block
  archiving on warnings". El juez puede informar; el archive no lo consulta.
- **Targets sobre deltas de changes activos** (`aspec/changes/<slug>/specs/**`). Esas rutas se mueven
  al archivar (`aspec/changes/archive/<fecha>-<slug>/`) y romperían la config sola. v1 apunta sólo a
  specs canónicas. Un `--change` con config generada queda como follow-up con su propio diseño.
- **Generar rubrics automáticamente.** Requiere un agente y un modelo; no es determinístico y no
  pertenece al CLI.
- **Redacción/enmascarado de código.** `jev-spec` manda el código tal cual y lo documenta como
  limitación aceptada (enmascarar cambiaría el código juzgado y haría pasar rubrics de secretos).
  ancleto no promete una garantía que el tool no da; documenta exclusiones (`.ancleto/**`, `.env*`,
  claves) y deja la responsabilidad en `codePaths`.
- **Integración con curaduría de memoria, triage o frescura del seed.** Sin señal de valor y con
  riesgo de falso positivo destructivo.

## Evidencia medida citada

- `src/` no contiene `fetch(` en ningún archivo (búsqueda sobre `src/**/*.js`): el core es offline.
- `package.json` no declara `dependencies` (sólo `devDependencies`: `eslint`, `globals`) y exige
  Node ≥ 24 (`package.json:29-31`).
- Precedente exacto de binario opcional: `runRepomix` usa `resolveBin('repomix')`, cae a
  `npx -y repomix@1.18.0` y ejecuta con `spawnSync(..., { shell: true })`
  (`src/cli/index.js:2589-2597`). El juez sigue ese patrón, no uno nuevo.
- La verificación actual es léxica: `skills/ancleto-verify/SKILL.md:37` ("search the codebase for
  related keywords").
- La relevancia de conformidad es juicio semántico declarado y no mecánico:
  `aspec/specs/prompt-contracts/spec.md:1222-1228`.
- `check` cierra con `process.exit(missing > 0 ? 1 : 0)` (`src/cli/index.js:3439`): contrato que el
  juez no toca.
- Este repositorio **no tiene `.ancletorc`**: el adaptador debe funcionar con configuración ausente y
  reportar `skipped` (evita asumir que el manifiesto siempre existe).
- Límites y semántica de `jev-spec` (README, 2026): ≤500 archivos, ≤2 MiB por archivo, ≤120k chars por
  target; exit `0/1/2`; `--staged`/`--diff` eligen targets, no lo que ve el modelo; el config es
  TS/JS y **se ejecuta** (también en `--dry-run`); no hay redacción de secretos; el inglés es el
  idioma primario de entrenamiento.

## Riesgos con mitigación

- **Rubric que siempre pasa (gate de humo):** el spike exige que cada rubric falle contra un parche
  que rompe la invariante a propósito (protocolo de `jev-spec`: 29/29 probes). Sin probes, no se
  habilita `--require`.
- **Specs en español:** el inglés es el idioma primario de Jev. Mitigación: preguntas en inglés,
  umbrales calibrados localmente y un aviso explícito en la doc de que un umbral no es una prueba.
- **Falso `pass` por contenido adversarial:** un comentario que se declara compliant puede mover la
  respuesta (documentado por TypeSafe). Mitigación: el resultado se presenta como señal, nunca como
  prueba; el agente sigue siendo el responsable del veredicto.
- **Código fuera de la máquina:** `codePaths` puede incluir secretos. Mitigación: exclusiones
  documentadas, `.ancleto/**` y `.env*` fuera por defecto, y la clave **sólo** por variable de
  entorno (`TYPESAFE_AI_API_KEY`), nunca en `.ancletorc` ni en el bundle.
- **Deriva del tool o del modelo:** `jev-spec` cambia de forma de salida; sin pin, `jev-latest`
  cambia el modelo. Mitigación: pin de versión del tool en una constante, pin de `client.model`
  documentado, y fixture de JSON grabado que se actualiza al subir el pin.
- **Windows y `npx` (`.cmd`):** el precedente de Repomix usa `shell: true`. Mitigación: argv
  whitelist, `--target` validado, timeout, y un test que pinea que ningún argumento del usuario
  llega crudo al shell.
- **Config del usuario que se ejecuta:** `jev-spec.config.ts` corre código en `--dry-run`. Mitigación:
  documentar el modelo de amenaza de CI (fork PRs → sólo dry-run, sin secretos) y no ejecutar el
  juez desde comandos que instalan ni desde `check`.
- **Ruido de mantenimiento:** una integración que depende de un OSS de un solo mantenedor. Mitigación:
  el adaptador degrada a `skipped` si el tool falta o cambia; el pin se actualiza manualmente y los
  tests offline no dependen de la red.
- **Superficie de producto:** instalar una skill nueva o tocar `ancleto-verify` cambia lo que reciben
  todos los usuarios. Mitigación: el paso es opcional y condicionado a `judge.enabled`; sin config,
  el comportamiento es byte-idéntico.

## Decisiones

**memory_key:** judge-external-pinned-binary-no-runtime-dep

**Elección:** el juez es un adaptador a `jev-spec` resuelto por `PATH` o `npx` con versión pinneada,
sin cliente HTTP propio y sin agregar `dependencies`.

**Descartado:** implementar un cliente nativo de la API de TypeSafe dentro de `src/`.

**Justificación:** el cliente nativo duplicaría root-jail, delimitadores, límites y manejo de errores
que `jev-spec` ya mantiene, y metería red en el core offline. El precedente de Repomix
(`src/cli/index.js:2589-2597`) demuestra que el patrón de binario opcional ya es parte del producto.

**Refs:**
- path:src/cli/index.js
- path:package.json
- path:PRODUCT.md
- change:jev-spec-advisory-judge

**Estado:** propuesto

**memory_key:** judge-advisory-default-required-ci

**Elección:** `ancleto judge` sale `0` en pass y en skip; `1` si una assertion falla; `2` si el setup
está roto. `--require` convierte el skip en `2` para CI.

**Descartado:** bloquear por defecto cuando falta el tool o la API key.

**Justificación:** un comando advisory que rompe un repo offline contradice la postura del producto;
el gate se pide explícitamente. El skip nunca se reporta como pass: siempre nombra el motivo.

**Refs:**
- path:src/cli/index.js
- path:aspec/specs/cli-diagnostics/spec.md
- change:jev-spec-advisory-judge

**Estado:** propuesto

**memory_key:** judge-never-blocks-archive-relevance-stays-human

**Elección:** el juez se cablea a `ancleto-verify` y opcionalmente a `ancleto-apply`; nunca al
archive, y un `pass` no se presenta como prueba de conformidad.

**Descartado:** usarlo como compuerta de relevancia en el archive de conformidad.

**Justificación:** `prompt-contracts:1222-1228` prohíbe presentar la relevancia como mecánicamente
demostrable y prohíbe un segundo gate de verificación en el archive. Un score puede informar a
`@reviewer`, no reemplazarlo.

**Refs:**
- spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional
- path:aspec/specs/prompt-contracts/spec.md
- change:jev-spec-advisory-judge

**Estado:** propuesto

**memory_key:** judge-probes-required-before-require

**Elección:** ninguna rubric entra en un gate `--require` sin un probe que demuestre que pasa en el
código intacto y falla en una copia rota a propósito.

**Descartado:** habilitar el gate con rubrics validadas sólo por inspección.

**Justificación:** una rubric que siempre pasa es peor que no tener gate: agrega costo y falsa
tranquilidad. Es la lección explícita de `jev-spec` (29/29 probes) y coincide con la cultura del repo
de oráculos offline y riesgos aceptados.

**Refs:**
- path:test/
- spec:spec-sync#Validación estructural de delta specs de changes activos
- change:jev-spec-advisory-judge

**Estado:** propuesto

**memory_key:** judge-v1-canonical-specs-only

**Elección:** v1 apunta sólo a specs canónicas (`aspec/specs/<capability>/spec.md`); los deltas de
changes activos quedan fuera.

**Descartado:** `--change <slug>` con generación de config por change en v1.

**Justificación:** las rutas de un change se mueven al archivar y romperían la config del usuario;
un `--change` necesita su propio diseño (config efímera + derived codePaths desde el affected-set)
y no es necesario para probar valor.

**Refs:**
- path:src/core/affected-set.js
- path:aspec/changes/
- change:jev-spec-advisory-judge

**Estado:** propuesto

## Plan de validación (spike, antes de implementar)

Criterio de éxito/abandono explícito, con una sola capability (`cli-diagnostics` o `spec-sync`):

1. `npx jev-spec check --dry-run` con un target sobre una spec canónica: el wiring parsea el spec,
   matchea los archivos y enumera requirements sin rubric. **Si el dry-run no es limpio, se abandona.**
2. Escribir 5 rubrics en inglés sobre requirements literales y correr el check real una vez.
3. Escribir 2 probes (parche que rompe la invariante) y confirmar `FAIL`. **Si el probe no falla, el
   problema son las preguntas, no el umbral; se abandona o se reescriben.**
4. Medir: latencia, costo reportado, y si el resultado agrega información que `ancleto-verify` no
   tenía. **Si no agrega, no se implementa.**
5. Sólo con 1–4 verdes se habilita `--require` en este repo como dogfooding.

## Preguntas abiertas para el review

1. **Nombre del comando:** `ancleto judge` vs. `ancleto verify --judge` vs. un `/cleto-judge`. La
   propuesta elige `judge` (read-only, separado, no contamina `check`).
2. **Default de `judge.enabled`:** la propuesta dice `false`. ¿Se habilita en `ancleto init` cuando el
   repo ya tiene un `jev-spec.config.ts`? (Recomendación: no; sólo detectar y sugerir.)
3. **Pin:** ¿el pin de `jev-spec` vive en `src/core/judge/` (mantenido por el release de ancleto) o se
   deja `jev-latest` para no atar releases? La propuesta elige pin + actualización manual.
4. **Capability:** ¿`spec-judge` nueva, o un delta `MODIFIED` de `cli-diagnostics`? La propuesta crea
   `spec-judge`; el contrato de `--help`/exit podría ir a `cli-diagnostics` si el review prefiere.
5. **Alcance v1:** ¿alcanza con specs canónicas o el review exige `--change` desde el día uno? La
   propuesta lo difiere con razón técnica (rutas que se mueven).
6. **Costo/legal:** ¿el repo acepta que una feature del producto requiera una cuenta paga de un
   tercero? Si la respuesta es no, el juez queda como herramienta de usuario (skill + npx), no como
   feature instalada.
