# Design: presupuesto configurable del working-context

## Contexto

El bloque `<ProjectMemoryRules>` se renderiza en `buildWorkingContext`
(`src/core/memory/engine.js`) con `MAX_TOKENS = 2000` y `CHARS_PER_TOKEN = 4`. El único camino de
render del artefacto derivado es `renderWorkingContextBlock`
(`src/core/memory/working-context.js`), que hoy pasa `undefined` como `maxTokens` y concentra a todos
los consumidores: refresh on-write, `ancleto memory context --out`, chequeo de frescura y MCP.

El default nuevo rompe supuestos de tests que asumen 2.000 tokens (T7 y T12 de
`test/working-context.test.js`) y obliga a que el modo sin tope no caiga en la rama
`!Number.isFinite(maxChars)` que hoy devuelve el piso estructural.

## Resolución del presupuesto

La resolución vive en `working-context.js`, junto a la lectura de `memory.criticalKeys` y por la
misma razón: es el dueño de la configuración de proyecto y el punto por el que pasan todas las
superficies. El engine queda con un default de 4.000 tokens para llamadas directas, pero no lee
`.ancletorc`.

Una única función exportada (p. ej. `resolveWorkingContextMaxTokens(projectRoot)`) devuelve el
`maxTokens` efectivo y `renderWorkingContextBlock` lo pasa al engine en lugar de `undefined`.

### Precedencia

1. `ANCLETO_WORKING_CONTEXT_TOKENS` si está definida y no vacía (la variable de entorno es un
   override explícito: si está definida e inválida, resuelve al default y NO cae a `.ancletorc`).
2. `memory.maxTokens` de `.ancletorc`.
3. Default de 4000.

### Gramática y tolerancia

- Finito: entero positivo. En `.ancletorc` se acepta número JSON; en el entorno se acepta su forma
  decimal (`"4000"`).
- Sin tope: `0` (número o `"0"`) o el literal `"unlimited"`.
- Todo lo demás —vacío, `null`, negativo, decimal, `"12abc"`, booleano, JSON inválido, archivo
  ausente— resuelve al default de 4000. La función nunca lanza, igual que `readCriticalMemoryKeys`.
- No se valida contra un máximo: un valor finito grande es válido y el corte de reglas sigue
  gobernado por la aritmética existente.

## Modo sin tope

El engine recibe un valor centinela explícito (`Infinity`) y lo trata como un estado propio antes de
calcular `maxChars`, no como un presupuesto finito agotado:

- Incluye todas las reglas activas del scope, sin reserva para el aviso.
- No emite `<ContextOverflowWarning>` ni el `console.warn` de reglas omitidas.
- No pasa por la rama de piso estructural ni por el corte por regla.
- `required` sigue resolviéndose antes; en este modo ninguna requerida puede quedar fuera.

Descartado: limitarse a pasar `Infinity` como `maxTokens` y dejar que la rama
`!Number.isFinite(maxChars)` decida, porque esa rama devuelve el piso estructural y además falla si
hay `required`. La rama de finitezco se conserva intacta para presupuestos finitos.

## Por qué 4.000

- La medición con el path real da 11/50 reglas bajo 2.000 tokens; 4.000 lleva el techo a 16.000
  caracteres y deja entrar un conjunto sustancialmente mayor sin volver el bloque un volcado del
  corpus.
- Es el doble del default vigente, un salto acotado y reversible: cualquiera puede volver a 2.000
  con `memory.maxTokens` o con el entorno, y quien necesita el corpus completo usa `unlimited`.
- No se elige un valor mayor por default porque el bloque se inyecta en cada sesión: el costo de
  tokens es recurrente y crece con cada proyecto, mientras que el costo de configurar es único.

## Impacto en superficies existentes

- Refresh on-write, `memory context --out`, frescura y MCP comparten `renderWorkingContextBlock`, así
  que resuelven el mismo presupuesto y siguen determinísticos para configuración, entorno y BD fijos.
- Un cambio de configuración o de entorno cambia el bloque esperado: el chequeo de frescura puede
  reportar `desactualizado` hasta el próximo refresh. No se agrega lógica de invalidación.
- El aviso conserva su texto, su conteo, el tope de 40 claves, el sufijo `+N` y el orden de
  inyección; el literal `${omitted} rules omitted.` no cambia.
- `prompt-contracts` sólo actualiza el número de referencia del presupuesto del bloque; el tope de 5
  reglas y 1.500 bytes del campo destilado queda igual y sigue siendo una superficie distinta.
