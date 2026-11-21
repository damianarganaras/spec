# Proposal: Endurecimiento de la matriz de hosts

## Contexto y problema

CH-10 («matriz de hosts») es el ítem pendiente de prioridad 5 de la reingeniería P2 de colaboración
(`aspec/backlog.md:12`). Su condición medible es T15: «Update/upgrade/import en 8 hosts» con assets
canónicos, mirrors coherentes y `LOCKED`/`EXTENSIBLE` preservados
(`docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md:728`). El estado actual está declarado como
**parcial existente** (`docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md:595`).

La cobertura existe, pero está dispersa por comando y por host:

- Ocho hosts declarados en el modelo único de destinos nativos (`src/cli/index.js:1131-1177`) y
  resolución de host en `:808`.
- Destino MCP por host en `HOST_MCP_TARGETS`, con `null` para los hosts sin destino
  (`src/cli/index.js:974-983`; orden determinista en `:986`).
- Adaptación de frontmatter en un dueño único (`adaptFrontmatter`, `src/cli/index.js:1265`, `:1280`;
  `src/core/adapters/frontmatter.js`), instalación de assets en `installAgentAssets` (`:1316`) y MCP
  en `setupHostMcp` (`:1037`).
- `check` host-aware (`src/cli/index.js:3718-3727`) y hosts instalados derivados del manifiesto
  (`installedHostsFromPaths`, `:1379-1389`).
- Tests parciales: `test/adapters-frontmatter.test.js:67`, `:338`, `:357`; `test/cli.test.js:8401`,
  `:8552`, `:8570`, `:8673`, `:8808`.

No existe un contrato canónico que afirme el invariante **para todos los hosts declarados y todas
las operaciones del ciclo de vida**. En particular, `upgrade` e `import --repair` no están cubiertos
de forma sistemática. Sin esa matriz, una regresión en un host u operación puede pasar la suite sin
que nadie la vea.

La formulación histórica que trataba CH-10 como «no offline-testeable» (`aspec/backlog.md:218`)
cubría el eje hosts/versiones y el smoke; este change separa la parte offline-verificable —assets,
mirrors, templates y MCP— y difiere versión y smoke con triggers explícitos.

## Intención

1. Declarar el invariante como requirement canónico nuevo, sin redefinir los contratos existentes de
   destino, adaptación ni MCP.
2. Construir una matriz **offline** host × operación sobre los ocho hosts declarados para
   `init`, `install`, `update`, `upgrade` e `import --repair`.
3. Corregir **sólo** los defectos reales que la matriz exponga y que violen el contrato vigente. Si
   la matriz no expone defectos, el change cierra como contrato + tests, sin tocar `src/`.

## Requisito nuevo

Delta `ADDED` en `spec:agent-install-routing`:

- `spec:agent-install-routing#Matriz de hosts y operaciones de ciclo de vida`

El requirement fija, para los ocho hosts declarados y las cinco operaciones de proyecto:

- assets en el directorio y la convención de nombre que declara el modelo único por host;
- mirrors coherentes con la fuente canónica a través del dueño único de adaptación;
- bloques `LOCKED` actualizados y contenido `EXTENSIBLE` preservado;
- MCP de proyecto sólo en el destino declarado para el host activo;
- idempotencia y no destrucción de layouts previos;
- verificación posible sin un host real, sin binarios de host y sin red.

## Alcance

**In scope:**

- Matriz offline host × operación para `init`, `install`, `update`, `upgrade` e `import --repair`
  (sin bundle) sobre los ocho hosts declarados.
- Aserciones de assets, mirrors, `LOCKED`/`EXTENSIBLE`, MCP y no destrucción.
- Corrección de defectos confirmados que violen el contrato vigente, en la capa dueña existente.
- Delta `ADDED` en `agent-install-routing` y tests de la matriz.

**Out of scope (explícito):**

- **Eje versión de host.** Requiere un host real instalado y una versión objetivo declarada; la
  matriz offline no puede observar la versión. Se difiere con trigger falsable: se reabre cuando
  exista al menos un host real instalado en CI/local y una versión objetivo fijada para comparar.
- **Smoke end-to-end contra hosts reales.** No es verificable offline y no forma parte de T15.
- **Documentación de migración/rollback multi-host.** Requiere una release y hosts reales; se trata
  en el cierre de release, no en este change.
- **Compatibilidad legacy de bundles más allá de lo ya especificado.** La matriz cubre la
  preservación de `LOCKED`/`EXTENSIBLE` y el comportamiento vigente de `import --repair`; no agrega
  formatos de bundle, migraciones ni conversiones nuevas.
- **T30 permisos V1/V2.** Refutado: el adapter `opencode` es passthrough y no mezcla
  `bash`/`task` con `shell`/`subagent` (`aspec/backlog.md:218`, `:240`).
- **Refactor del descriptor de hosts o del adaptador.** `AGENT_TARGETS`, `HOST_MCP_TARGETS` y
  `adaptFrontmatter` conservan su forma y su contrato.
- Comandos, flags, schema de memoria, dependencias de runtime, `package.json` y release.

## Capability elegida

El delta va en **`agent-install-routing`**, no en `project-portability`, por una razón de propiedad:

- `agent-install-routing` es la capability que ya declara el destino nativo por host y por asset
  (`Destino nativo por host con directorio y formato por asset`), la cobertura por host y la
  exclusión de assets no soportados, el manifiesto acumulativo y el destino MCP por host
  (`Configuración MCP específica de host fuera de alcance`, que ya nombra `init`, `install`/`update`,
  `import` e `import --repair`).
- `project-portability` es la capability de export/import de bundles y regeneración MCP; alojar ahí
  la matriz obligaría a duplicar la tabla de hosts y el descriptor MCP, y separaría el contrato del
  dueño que lo implementa.
- `prompt-contracts` es dueña del merge de bloques `LOCKED`; la matriz la referencia, no la
  reescribe.

La desviación respecto de la sugerencia inicial (`project-portability`) queda registrada en
`## Decisiones`.

## Evaluación de deltas

No hay `MODIFIED Requirements`. El requirement nuevo:

- no reescribe el destino, la convención de nombre, la cobertura por host ni el esquema MCP: los
  referencia;
- no cambia el contrato de `LOCKED`/`EXTENSIBLE`: lo aplica a las operaciones de la matriz y remite
  a `prompt-contracts`;
- no convierte en obligatorio ningún comportamiento nuevo de `upgrade` o `import --repair`; sólo
  fija el invariante que ya surge de los dueños existentes. Si la matriz expone una violación, se
  corrige en la capa dueña, no cambiando el contrato por conveniencia.

## Riesgos

- **La matriz puede no exponer defectos.** En ese caso el change es contrato + tests y no toca
  `src/`. Es un resultado válido, pero debe quedar explícito en el ledger para que no se lea como
  implementación faltante.
- **La matriz puede exponer un defecto que requiera cambiar el descriptor o el adaptador.** Ambos
  están fuera de alcance. Si ocurre, el change se detiene y reporta la necesidad de un change
  separado; no se ensancha el file-set.
- **Oráculo duplicado.** La tabla esperada se declara en el test y no se deriva del descriptor de
  producción. Es intencional: una deriva del descriptor debe fallar el contrato, no actualizar el
  oráculo en silencio. El costo es mantenimiento cuando se agrega un host.
- **`import --repair` sin bundle no reescribe assets ni templates.** La matriz lo trata como
  operación MCP-only. Leerlo como «debe re-materializar assets» sería un cambio de contrato y está
  descartado.
- **`upgrade` no refresca MCP en todos los hosts con destino.** La matriz sólo exige «no escribir
  fuera del destino declarado»; no exige reparar MCP en `upgrade`. Convertir eso en obligación sería
  un cambio de contrato.
- **Cobertura de versión de host diferida.** La matriz no detecta cambios de frontmatter o formato
  introducidos por una versión nueva de un host real.

## Validaciones declaradas

- Lint: `npm run lint`.
- Tests: `npm test`; para pasos acotados, `node --test test/host-matrix.test.js` y, si se toca un
  archivo existente, la ruta explícita correspondiente. Nunca `node --test` sin acotar.
- Format check: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (JavaScript ESM, sin `tsconfig.json`).

## Decisiones

- **memory_key:** host-matrix-capability-owner
  **Elección:** declarar el requirement nuevo como delta `ADDED` en `agent-install-routing`.
  **Descartado:** declararlo en `project-portability`, como sugería el encargo inicial.
  **Justificación:** `agent-install-routing` es dueña del descriptor de destinos nativos por host y
  del destino MCP por host, y ya nombra `init`, `install`/`update`, `import` e `import --repair`.
  `project-portability` sólo cubre export/import; alojar la matriz ahí duplicaría la tabla de hosts y
  separaría el contrato del dueño que lo implementa.
  **Refs:** spec:agent-install-routing#Destino nativo por host con directorio y formato por asset;
  spec:agent-install-routing#Configuración MCP específica de host fuera de alcance;
  spec:project-portability#Import regenera MCP locales
  **Estado:** propuesto

- **memory_key:** host-matrix-import-repair-no-assets
  **Elección:** la matriz trata `import --repair` sin bundle como operación MCP-only y afirma que
  assets y templates quedan byte-idénticos.
  **Descartado:** hacer que `import --repair` re-materialice assets para uniformar la matriz.
  **Justificación:** el contrato vigente dice que `import --repair` sin bundle no reescribe assets ni
  templates; cambiarlo ampliaría el alcance y duplicaría la responsabilidad de `install`. La matriz
  debe reflejar el contrato, no forzarlo.
  **Refs:** spec:project-portability#Reparación in place sin bundle;
  spec:agent-install-routing#Configuración MCP específica de host fuera de alcance
  **Estado:** propuesto

- **memory_key:** host-matrix-oracle-independent
  **Elección:** declarar la tabla esperada de hosts, assets y destinos MCP dentro del test de la
  matriz, sin derivarla de `AGENT_TARGETS` ni de `HOST_MCP_TARGETS`.
  **Descartado:** importar los descriptores de producción y calcular las expectativas en runtime.
  **Justificación:** un oráculo derivado del mismo dato que prueba no detecta una deriva del
  descriptor. La tabla independiente convierte cualquier cambio de host, ruta o esquema en un fallo
  visible que exige actualizar el contrato de forma deliberada.
  **Refs:** spec:agent-install-routing#Destino nativo por host con directorio y formato por asset;
  spec:agent-install-routing#Configuración MCP específica de host fuera de alcance
  **Estado:** propuesto
