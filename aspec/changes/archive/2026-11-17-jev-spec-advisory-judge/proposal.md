# Proposal: Juez semántico opcional (JEV) para specs, opt-in y advisory

> **Estado:** artefactos completos (`proposal.md`, `design.md`, `tasks.md` y delta
> `specs/cli-diagnostics/spec.md`); decisiones aprobadas. **No implementada:** no hay cambios de código
> todavía.
>
> **Corrección respecto de la revisión previa:** este repositorio **sí tiene `.ancletorc`** (con
> `azure`, `discovery`, `memory`, `agent`, `language`, `profile`, `version`); la lectura tolerante sigue
> siendo necesaria por portabilidad, no porque el archivo falte. Las citas de código corregidas son
> `src/cli/index.js:2598-2617` para `runRepomix` y `src/cli/index.js:3829` para
> `process.exit(missing > 0 ? 1 : 0)`.

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

**No modifica ningún requirement existente.** Es un cambio funcional con **un** requirement nuevo bajo
`## ADDED Requirements` en `aspec/specs/cli-diagnostics/spec.md`: `Juez externo advisory opcional`. La
capability es `cli-diagnostics` y no una nueva `spec-judge` porque `ancleto specs merge` es fail-closed
con `canonical spec not found` para una capability sin spec canónica (`src/cli/index.js:4189-4192`), así
que una capability nueva no se podría archivar por el flujo. No se usa `MODIFIED`: reescribiría el
cuerpo y todos los escenarios de un requirement ajeno.

Los cuatro contratos vigentes que el change **NO puede violar** son:

- `spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional`
  (`aspec/specs/prompt-contracts/spec.md:1154-1241`): el archive NO agrega un segundo gate de
  verificación y la relevancia NO se presenta como mecánicamente demostrable.
- `path:aspec/specs/cli-diagnostics/spec.md` (contrato de diagnósticos): `check` conserva
  `missing > 0 ? 1 : 0`; el juez no cambia su salida ni su código de salida
  (`src/cli/index.js:3829`).
- `path:PRODUCT.md` y `path:package.json`: cero dependencias de runtime, Node ≥ 24, y `src/` no
  accede a la red en runtime (verificado: no hay un solo `fetch(` en `src/`).
- `path:src/core/specs-merge.js` y la regla de "un dueño por invariante": el adaptador vive en un
  módulo cohesivo, como el merge de specs.

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
  Repomix (`src/cli/index.js:2598-2617`).
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

- **`src/core/judge.js` (módulo cohesivo, sin red y sin escrituras):** lectura tolerante de
  `.ancletorc` → `judge.enabled` / `judge.timeoutMs` (archivo ausente o JSON inválido → `null`),
  resolución del binario, sonda de setup, spawn, mapeo de estados y armado del envelope `--json`. No
  hay `src/core/judge/` con cuatro archivos: no hay consumidor interno de las piezas y una API pública
  sin segundo consumidor es deuda. No importa helpers de `src/cli/index.js` porque ese archivo es un
  entrypoint ejecutable (su `switch` corre al importarse).
- **`src/cli/index.js`:** `judgeCommand` y el `case 'judge'` del dispatch; subcomando
  `ancleto judge [--dry-run] [--json] [--require]`, entrada de ayuda y sin escrituras (read-only). No
  acepta `--target` ni `--change`: v1 no pasa argumentos del usuario al binario.
- **Resolución del binario:** `jev-spec` por `PATH`; si falta, `npx -y jev-spec@0.4.1` (pin exacto en
  una constante del release, nunca `latest`). El adaptador reporta el origen (`path`/`npx`) y siempre
  la versión pinneada `0.4.1` del adaptador; v1 no inspecciona la versión real del binario. No reporta
  el modelo.
- **`.ancletorc` (schema aditivo):**
  ```json
  {
    "judge": {
      "enabled": false,
      "timeoutMs": 120000
    }
  }
  ```
  `init` no lo habilita. No hay `tool` ni `command` configurables: el pin es del release y un override
  de argv reintroduciría la superficie de inyección que v1 elimina.
- **Skills:** `ancleto-verify` gana un paso opcional ("si `judge.enabled`, corré `ancleto judge
  --json`; usá las probabilidades como evidencia, nunca como veredicto; si `skipped`, declaralo") y
  `ancleto-workflow` lo lista como opcional. `ancleto-archive` NO se toca y no se agrega un comando
  `/cleto-*` nuevo.
- **Docs:** `README.md` (sección corta), `docs/guia-configuracion.md` (bloque `judge`) y
  `docs/jev-advisory-judge.md` (setup, egreso de código, límites, seguridad y criterio de valor).
- **Tests offline:** `test/judge.test.js` con `test/fixtures/jev-spec-mock.mjs` (binario falso,
  determinista, sin red) y PATH señuelo. No se commitea una grabación real: no hay cuenta ni
  `TYPESAFE_AI_API_KEY` en este entorno, y el adaptador no parsea el reporte (§ design 2), así que no
  hay forma que fijar contra el tool real.

### Out of scope (con razón)

- **Cliente HTTP nativo a TypeSafe.** Duplicaría el root-jail, los delimitadores anti-inyección, los
  límites de 500 archivos / 2 MiB / 120k chars y el manejo de errores que `jev-spec` ya implementa;
  además metería red en `src/` y una superficie de seguridad propia. Se descarta.
- **Integrarse a `ancleto check` o cambiar su exit.** El contrato `missing > 0 ? 1 : 0` está pinneado
  en `cli-diagnostics`; mezclar un gate de red con un oráculo offline rompe ambos.
- **Gate en `ancleto-archive` / conformidad.** Contradice
  `spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional`
  (`aspec/specs/prompt-contracts/spec.md:1222-1241`) y "Don't block archiving on warnings". El juez
  puede informar; el archive no lo consulta.
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
  (`src/cli/index.js:2598-2617`). El juez sigue ese patrón, no uno nuevo.
- La verificación actual es léxica: `skills/ancleto-verify/SKILL.md:37` ("search the codebase for
  related keywords").
- La relevancia de conformidad es juicio semántico declarado y no mecánico:
  `aspec/specs/prompt-contracts/spec.md:1222-1241`.
- `check` cierra con `process.exit(missing > 0 ? 1 : 0)` (`src/cli/index.js:3829`): contrato que el
  juez no toca.
- Este repositorio **sí tiene `.ancletorc`** (claves `azure`, `discovery`, `agent`, `language`,
  `profile`, `memory`, `version`). La lectura tolerante sigue siendo requisito para repos sin
  manifiesto: el adaptador degrada a `skipped` (no asume que el archivo siempre exista).
- `readAncletorc` (`src/cli/index.js:175-183`) tolera ausencia, BOM y JSON inválido → `null`;
  `writeManifest` (`:185-198`) preserva keys extra. No hay schema cerrado de keys.
- Límites y semántica de `jev-spec` (spike sobre `jev-spec@0.4.1`): ≤500 archivos, ≤2 MiB por archivo,
  ≤120k chars por target; exit `0/1/2`; `--staged`/`--diff` eligen targets, no lo que ve el modelo; el
  config es TS/JS y **se ejecuta** (también en el `--dry-run` del tool); no hay redacción de secretos;
  el inglés es el idioma primario de entrenamiento. Sin `TYPESAFE_AI_API_KEY`, `check` sale 2 con un
  mensaje explícito; `--dry-run` y `--mock` son offline pero no discriminan.

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
- **Deriva del tool o del modelo:** `jev-spec` cambia de forma de salida; sin pin, `latest` cambia el
  modelo. Mitigación: pin exacto `jev-spec@0.4.1` en una constante, y el adaptador **no parsea** el
  reporte: sólo consume exit codes y transporta stdout/stderr verbatim. Sin fixture de JSON que
  mantener.
- **Windows y `npx` (`.cmd`):** `shell: true` se usa en ambos caminos (binario resuelto y fallback
  `npx`), con argv constante que no deriva de input. Mitigación: no hay argumentos de usuario, así que
  no hay nada que escapar; un test verifica que no se pasa ningún argumento variable.
- **Config del usuario que se ejecuta:** `jev-spec.config.ts` corre código en el `--dry-run` del tool.
  Mitigación: el `--dry-run` de ancleto **no invoca el binario**, así que la config del usuario nunca
  se ejecuta en ese camino; la corrida real es explícita y anuncia el egreso de código. No se ejecuta
  el juez desde comandos que instalan ni desde `check`.
- **Ruido de mantenimiento:** una integración que depende de un OSS de un solo mantenedor. Mitigación:
  el adaptador degrada a `skipped` si el tool falta o cambia; el pin se actualiza manualmente y los
  tests offline no dependen de la red.
- **Superficie de producto:** instalar una skill nueva o tocar `ancleto-verify` cambia lo que reciben
  todos los usuarios. Mitigación: el paso es opcional y condicionado a `judge.enabled`; sin config,
  el comportamiento es byte-idéntico.

## Decisiones

### judge-external-pinned-binary-no-runtime-dep
- Elección: el juez es un adaptador a jev-spec con pin exacto 0.4.1, resuelto por PATH y, si falta, por npx -y jev-spec@0.4.1, sin cliente HTTP propio y sin agregar dependencies de runtime.
- Descartado: implementar un cliente nativo de la API de TypeSafe en src/ y usar latest como fallback.
- Justificación: el cliente nativo duplicaría root-jail, delimitadores, límites y manejo de errores que jev-spec mantiene, y metería red en el core offline; latest cambiaría el modelo sin que ningún release de ancleto lo declare. Repomix ya usa este patrón (src/cli/index.js:2598-2617).
- Refs:
- path:src/cli/index.js
- path:package.json
- spec:cli-diagnostics#Juez externo advisory opcional
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-advisory-default-required-ci
- Elección: pass sale 0, fail 1, broken 2, skipped 0 y unavailable 0; con --require skipped y unavailable salen 2 sin reescribir el estado; el exit del tool mapea 0 a pass, 1 a fail, 2 a broken y cualquier otro a broken; con --json el envelope estable se emite en todos los caminos, incluido exit 2, sin schemaVersion.
- Descartado: bloquear por defecto cuando falta el tool o la credencial, y omitir el JSON en el camino de error.
- Justificación: un comando advisory que rompe un repo offline contradice la postura del producto; el gate se pide explícitamente y un CI distingue no corrió de falló leyendo state, no el exit. Sin JSON en el error el consumidor no puede clasificar el fallo.
- Refs:
- path:src/cli/index.js
- spec:cli-diagnostics#Juez externo advisory opcional
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-probes-required-before-require
- Elección: --require exige una sonda de setup verde (spawn del binario con su flag de versión, que no requiere credenciales ni envía código del repo; con binario local no hay red y el fallback npx sí consulta el registry) antes de la corrida live; una sonda rota produce unavailable con exit 2.
- Descartado: exigir el gate sin probar el setup, o convertir una sonda rota en fail.
- Justificación: fail significaría que la aserción corrió y falló, y una sonda rota no juzgó nada; un gate cuyo setup no se verificó es peor que no tener gate.
- Refs:
- path:test/affected-tests.json
- spec:cli-diagnostics#Juez externo advisory opcional
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-never-blocks-archive-relevance-stays-human
- Elección: el juez es opt-in y advisory, default off; se cablea sólo como paso opcional de ancleto-verify y mención en ancleto-workflow; nunca gatea el archive ni presenta un pass como prueba de conformidad; su valor se documenta como criterio falsable de AUC mayor o igual a 0.75 y hoy no está medido.
- Descartado: presentarlo como compuerta de relevancia en el archive o afirmar valor probado sin medirlo.
- Justificación: el requirement prohíbe presentar la relevancia como mecánicamente demostrable y prohíbe un segundo gate de verificación en el archive; el juez es semántico y devuelve probabilidades calibradas, distinto del keyword search léxico, pero sin cuenta no hay medición y una afirmación de valor sin AUC es marketing, no evidencia.
- Refs:
- spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional
- path:aspec/specs/prompt-contracts/spec.md
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-subcommand-surface
- Elección: la superficie es el subcomando ancleto judge, con integración sólo como paso opcional en ancleto-verify y mención en ancleto-workflow.
- Descartado: ancleto verify --judge y un comando /cleto-judge nuevo.
- Justificación: ancleto verify no existe; y un comando nuevo toca el pin del número de archivos de commands/ en content-guards sin necesidad. El subcomando es read-only y no contamina check.
- Refs:
- path:src/cli/index.js
- path:test/content-guards.test.js
- spec:cli-diagnostics#Juez externo advisory opcional
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-config-default-off
- Elección: judge.enabled default false; .ancletorc ausente, JSON inválido o un valor distinto de true dejan el juez deshabilitado y reportan skipped; init no lo habilita.
- Descartado: habilitarlo automáticamente en init cuando el repo ya tiene jev-spec.config.ts.
- Justificación: habilitar por detección haría que el código salga de la máquina sin una decisión explícita del usuario; el default off mantiene el comportamiento previo byte-idéntico.
- Refs:
- path:src/cli/index.js
- spec:cli-diagnostics#Juez externo advisory opcional
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-key-env-only-egress-announced
- Elección: la credencial se lee sólo del entorno (TYPESAFE_AI_API_KEY), nunca desde .ancletorc, el envelope --json, logs o mensajes; cada corrida humana que invoca el binario externo anuncia el egreso de código a un servicio externo de terceros; src/ no accede a la red.
- Descartado: aceptar la credencial en .ancletorc o imprimirla para diagnóstico.
- Justificación: export empaqueta .ancletorc, así que una credencial ahí viaja con el bundle; el egreso silencioso es una sorpresa inaceptable para código propietario.
- Refs:
- path:src/cli/index.js
- path:PRODUCT.md
- spec:cli-diagnostics#Juez externo advisory opcional
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-dry-run-never-executes-config
- Elección: --dry-run imprime el comando resuelto y no spawnea el binario ni ejecuta jev-spec.config.ts; con --require sale 2 porque no corrió ninguna aserción.
- Descartado: reenviar --dry-run al tool, que ejecuta su config igual.
- Justificación: el dry-run del tool ejecuta el archivo de config del usuario; reenviarlo convertiría un comando de inspección en ejecución de código. No spawnear es la única garantía verificable.
- Refs:
- path:src/cli/index.js
- spec:cli-diagnostics#Juez externo advisory opcional
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-v1-canonical-specs-only
- Elección: v1 apunta sólo a specs canónicas y no acepta --target ni --change: los targets y rúbricas los declara jev-spec.config.ts y el adaptador no pasa argumentos del usuario al binario.
- Descartado: --change con generación de config por change y un --target validado por regex en v1.
- Justificación: las rutas de un change se mueven al archivar y romperían la config; sin argumentos de usuario se elimina toda superficie de inyección y no hay nada que validar en el shell.
- Refs:
- path:src/core/affected-set.js
- path:aspec/changes/jev-spec-advisory-judge/proposal.md
- spec:cli-diagnostics#Juez externo advisory opcional
- change:jev-spec-advisory-judge

Estado: aprobado

### judge-delta-added-cli-diagnostics
- Elección: el cambio funcional entra como un único requirement ADDED (Juez externo advisory opcional) en aspec/specs/cli-diagnostics/spec.md.
- Descartado: una capability nueva spec-judge o un MODIFIED de un requirement existente.
- Justificación: specs merge es fail-closed con canonical spec not found para una capability sin spec canónica, así que spec-judge no se podría archivar por el flujo; MODIFIED reescribiría cuerpo y todos los escenarios de un requirement ajeno.
- Refs:
- spec:cli-diagnostics#Juez externo advisory opcional
- path:aspec/specs/cli-diagnostics/spec.md
- path:src/cli/index.js
- change:jev-spec-advisory-judge

Estado: aprobado

## Criterio de valor (spike)

El criterio falsable completo vive en `design.md` §10: AUC ≥ 0.75 sobre 5 requirements correctos, 5
saboteados, 2 refactors y 1 caso donde el keyword search de `ancleto-verify` falla; una rubric que
pasa sobre un saboteado se invalida.

**Estado actual: no medible.** El spike confirmó que `jev-spec@0.4.1` existe (npm, bin `jev-spec`,
MIT), requiere `TYPESAFE_AI_API_KEY` y sin key `check` sale 2; `--dry-run` y `--mock` son offline pero
no discriminan. En este entorno no hay cuenta. Por eso: default off, advisory, `--require` fuera del
CI de este repo hasta medir.

## Preguntas abiertas (resueltas)

1. **Nombre del comando:** resuelto en `ancleto judge`; `verify --judge` no existe y `/cleto-judge`
   tocaría el pin de `commands/` (D2).
2. **Default de `judge.enabled`:** `false`; `init` no lo habilita ni cuando detecta
   `jev-spec.config.ts` (D3).
3. **Pin:** exacto `jev-spec@0.4.1`, mantenido por el release de ancleto, nunca `latest` (D4).
4. **Capability:** delta `ADDED` de `cli-diagnostics`, no `spec-judge` ni `MODIFIED` (D5). Una
   capability nueva no es archivable por el flujo.
5. **Alcance v1:** sólo specs canónicas, sin `--target` ni `--change`; sin argumentos de usuario al
   binario (D6).
6. **Costo/legal:** el producto acepta la dependencia de una cuenta paga de un tercero **como opt-in
   advisory**, no como requisito: sin cuenta el comando degrada y el repo sigue funcionando (D1, D7,
   D8).
