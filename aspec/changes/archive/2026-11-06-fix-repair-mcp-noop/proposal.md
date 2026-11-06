# Proposal: fix-repair-mcp-noop

## Problema

`repairProjectMcp` (`src/cli/index.js:4248`) escribe siempre el destino MCP del host activo: ejecuta `mkdir` y `writeFile` sin condición (bloque `4286-4287`) y después informa `MCP sanos … sin cambios`. Con un destino ya sano la operación reescribe el mismo contenido: el hash no cambia, pero el mtime sí, se invalidan watchers y cachés de herramientas, y el árbol de trabajo se ensucia sin necesidad. El mensaje describe el contenido, pero no lo que el comando efectivamente hizo.

Comportamiento actual reproducido:

- A1 destino sano → reescrito, mismo hash, mtime distinto, mensaje "sin cambios".
- A2 entrada rota (`command` vacío) → corregida a `ancleto-memory`.
- A3 nombre intencionado ausente → agregado.
- A4 archivo ausente sin intención → se crea `{"mcp":{}}`.
- A5 JSON no parseable → aviso por stderr y reemplazo.
- A6 raíz arreglo/string/null → reset silencioso a `{"mcp":{}}`.
- A7 sin clave `mcp` → se agrega `{"mcp":{}}` conservando otras claves.

El defecto no está en el predicado de salud por entrada, que ya es correcto, sino en la decisión de escribir: hoy no existe.

## Propuesta

Condicionar la escritura del destino MCP a un predicado semántico único, sin mensajes nuevos ni cambios de exit code:

- Escribir sólo si el archivo no es parseable, si la estructura requiere normalización, o si hay al menos una entrada reparada o agregada.
- La estructura requiere normalización cuando el documento raíz no es un objeto JSON (`null`, arreglo, string, número o booleano), o cuando la clave de esquema del host está presente con un valor que no es un objeto JSON.
- Una clave de esquema ausente NO se agrega para normalizar: sólo se materializa si la reparación agrega entradas. Un destino inexistente sin entradas que reparar o agregar no se crea, ni como archivo ni como directorio.
- La creación del directorio del destino se mueve dentro de la rama de escritura.
- Se elimina la condición `!existed` como motivo de escritura: es un cambio de comportamiento deliberado y documentado (A4 deja de ocurrir).
- Se preserva el reemplazo ante error de parseo, la reparación de entradas rotas, la adición de nombres intencionados y la normalización de una raíz no-objeto. Un valor de esquema no-objeto presente sí se normaliza (reparación estructural).

Release objetivo: **0.20.1**. No ingresan mensajes ni avisos nuevos, por lo que el cambio es un patch acotado.

## Requisito de referencia

`spec:project-portability#Reparación in place sin bundle`

## Alcance

In scope:

- `repairProjectMcp` en `src/cli/index.js`: predicado de escritura y ubicación de `mkdir`.
- Tests en `test/cli.test.js` para las invariantes negativas y la preservación de los comportamientos vigentes.

Out of scope:

- B1: aviso de deriva de la ruta legacy de `opencode` (descartado; ver Decisiones).
- B2: aviso de intención MCP vacía en bundles legacy (descartado; ver Decisiones).
- Poda destructiva de entradas no intencionadas.
- Soporte de comentarios en `.jsonc`: un archivo con comentarios sigue fallando `JSON.parse` y se reemplaza. Limitación preexistente documentada; no se cambia el parser.
- Consumo en runtime de `copilot-mcp.json`.
- Presupuesto de working-context.
- Extensión de VS Code.
- Reingeniería P0/CH/T*.
- `.opencode/**` como superficie de cambio y cualquier superficie de modelo.

## Garantía acotada

La invariante de no-escritura aplica **sólo** al camino `import` / `import --repair` (`repairProjectMcp`): un destino MCP del proyecto sano no se reescribe (bytes y mtime intactos), y avisos y exit codes no cambian.

Quedan **excluidos** los demás writers del mismo destino, que lo reescriben sin el nuevo predicado y no se modifican en este cambio:

- `install` / `init` (`setupHostMcp` → `mergeMcp`), que reescribe el destino del host activo.
- `upgrade` (`refreshCopilotMcp` / `refreshCommandCodeMcp`), que reescribe `copilot-mcp.json` y `.mcp.json`.

No se declara una garantía universal de "ningún writer cambia".

## Riesgos

- Consumidores que asumían una escritura en cada corrida: mitigación con la garantía acotada, mensajes intactos y tests de bytes y mtime.
- Pérdida de la creación implícita de un destino vacío (A4): es intencional; se documenta y se cubre con un escenario explícito de no-creación de archivo ni directorio.
- Divergencia entre el comportamiento nuevo y tests que sembraban el destino esperando creación: mitigación revisando los casos de `import --repair` y sembrando explícitamente las entradas rotas cuando el escenario lo requiera.
- Granularidad del mtime en algunos sistemas de archivos: mitigación comparando además bytes y hash, y verificando que no hubo escritura por el contenido intacto.
- `.jsonc` con comentarios sigue siendo reemplazado: limitación preexistente declarada como fuera de alcance.

## Decisión de arquitectura

Ninguna. El cambio se limita a un predicado de escritura dentro de la función existente; no crea capas, interfaces, servicios ni configuración.

## Decisiones

- **memory_key:** `repair-mcp-write-predicate`
  **Elección:** escribir sólo si `error || normalized || fixed.length > 0`; `normalized` es semántico (raíz no-objeto o valor de esquema presente no-objeto); una clave de esquema ausente no se normaliza; se elimina `!existed` como motivo de escritura y `mkdir` queda dentro de la rama de escritura.
  **Descartado:** mantener la escritura incondicional y limitarse a corregir el mensaje; usar `!existed` para crear el destino vacío.
  **Justificación:** un destino sano deja de reescribirse (bytes y mtime idénticos) sin cambiar mensajes ni exit codes, y los siete comportamientos reproducidos quedan cubiertos por el mismo predicado.
  **Refs:** src/cli/index.js; aspec/specs/project-portability/spec.md; change:fix-repair-mcp-noop
  **Estado:** aprobado

- **memory_key:** `repair-mcp-guarantee-scope`
  **Elección:** acotar la garantía de no-escritura a `import` / `import --repair` (`repairProjectMcp`); `install` / `init` (`setupHostMcp` → `mergeMcp`) y `upgrade` (`refreshCopilotMcp` / `refreshCommandCodeMcp`) reescriben el mismo destino y quedan excluidos.
  **Descartado:** declarar la garantía como universal para todos los writers del destino MCP.
  **Justificación:** `install` / `init` y `upgrade` escriben el destino de forma incondicional y no se modifican en este cambio, así que una garantía universal sería falsa bajo el modelo real.
  **Refs:** src/cli/index.js; aspec/changes/fix-repair-mcp-noop/proposal.md; change:fix-repair-mcp-noop
  **Estado:** aprobado

- **memory_key:** `legacy-opencode-path-drift-advisory`
  **Elección:** descartar el aviso de deriva de ruta legacy de `opencode`.
  **Descartado:** agregar un aviso de sólo lectura para una ruta legacy ausente.
  **Justificación:** `check` ya reporta un directorio `.opencode/*` declarado y ausente como `✖` con exit 1; un aviso de sólo lectura lo duplicaría o debilitaría el contrato de exit, y ubicarlo en `doctor` contradiría a `check`.
  **Refs:** src/cli/index.js; aspec/specs/cli-diagnostics/spec.md; change:fix-repair-mcp-noop
  **Estado:** descartado

- **memory_key:** `legacy-bundle-mcp-intent-advisory`
  **Elección:** descartar el aviso de intención MCP vacía en bundles legacy.
  **Descartado:** advertir cuando `manifest.mcp` está vacío o ausente con un `manifest.agent` distinto de `opencode`.
  **Justificación:** ese estado es legítimo en 0.20.0; el vacío intencional y el legacy vacío sólo se distinguen con una compuerta numérica de versión y el comportamiento de import es idéntico, así que no hay señal accionable y sí riesgo real de falso positivo.
  **Refs:** src/cli/index.js; aspec/specs/project-portability/spec.md; change:fix-repair-mcp-noop
  **Estado:** descartado

- **memory_key:** `jsonc-comments-not-supported`
  **Elección:** documentar que los `.jsonc` con comentarios no son seguros y no cambiar el parser.
  **Descartado:** tolerar comentarios en el destino `.jsonc` como parte de este fix.
  **Justificación:** el destino puede resolver a `.jsonc` pero se parsea con `JSON.parse`; un archivo con comentarios reales provoca su reemplazo. Es una limitación preexistente y ampliar el parser excede el alcance del predicado de escritura.
  **Refs:** src/cli/index.js; aspec/changes/fix-repair-mcp-noop/proposal.md; change:fix-repair-mcp-noop
  **Estado:** aprobado

- **memory_key:** `repair-mcp-release-version`
  **Elección:** publicar como 0.20.1.
  **Descartado:** una minor o major; incluir B1/B2 para justificar una minor.
  **Justificación:** no ingresan mensajes ni avisos nuevos y el cambio se limita al predicado de escritura; una versión patch refleja el alcance real.
  **Refs:** package.json; src/cli/index.js; change:fix-repair-mcp-noop
  **Estado:** aprobado
