## ADDED Requirements

### Requirement: Conjunto crítico estable del working-context

La configuración del proyecto SHALL poder declarar un conjunto de `memory_key` críticas en
`.ancletorc`, bajo la clave aditiva `memory.criticalKeys`. El renderer del working-context SHALL leer
esa lista en sus dos puntos de render (`renderWorkingContextBlock` y `refreshWorkingContextOnWrite`)
y SHALL pasarla como `required` a `buildWorkingContext`. Las claves declaradas SHALL inyectarse
primero, en el orden declarado, sin que una regla no crítica pueda desplazarlas.

La lectura SHALL ser tolerante: si la clave está ausente, no es un array o contiene entradas que no
son strings, el valor efectivo SHALL ser la lista vacía y el comportamiento SHALL ser idéntico al
vigente.

Si una `memory_key` declarada no existe como `rule` activa del scope inyectado, o no entra en el
presupuesto, la generación SHALL fallar con un error que nombre la `memory_key`. En la superficie
explícita `ancleto memory context` (incluido `--out`) el proceso SHALL salir con código distinto de
cero y NO SHALL sobrescribir el archivo de working-context previo. El refresh de lifecycle (`init`,
`install`, `upgrade`) y la superficie on-write del MCP SHALL mantener el fallo visible con
`console.warn` nombrando la `memory_key` y NO SHALL escribir un bloque degradado; el refresh on-write
SHALL propagar el error de render a su llamador, y el llamador del MCP SHALL registrarlo con
`console.warn` y continuar best-effort. Las superficies que aplican una escritura y refrescan el
working-context como efecto derivado, `memory merge` y `memory consolidate --apply`, SHALL salir con
código distinto de cero cuando ese refresh falla por una clave crítica, y NO SHALL reportar éxito con
el bloque derivado desactualizado.

Este requirement NO SHALL alterar el contrato de `Aviso de overflow accionable para el orquestador`:
el texto, el conteo, el tope de claves y los consumidores de `<ContextOverflowWarning>` permanecen
iguales.

#### Scenario: Las claves críticas se inyectan siempre primero

- **WHEN** `.ancletorc` declara `memory.criticalKeys` con claves que son `rule` activas del scope inyectado
- **THEN** esas reglas se ordenan al frente del bloque, en el orden declarado
- **AND** se ordenan antes que cualquier regla no declarada, aunque la no declarada tenga mejor scope o mejor anclaje

#### Scenario: Una clave crítica inexistente, inactiva o fuera de presupuesto falla

- **WHEN** una `memory_key` declarada en `memory.criticalKeys` no existe como `rule` activa del scope inyectado, está inactiva o no entra en el presupuesto de la construcción
- **THEN** la generación falla con un error que nombra esa `memory_key`
- **AND** no se devuelve un bloque parcial

#### Scenario: La CLI explícita falla sin sobrescribir el archivo previo

- **WHEN** `ancleto memory context`, con o sin `--out`, encuentra el error de una clave crítica
- **THEN** el proceso termina con código distinto de cero
- **AND** el mensaje de error nombra la `memory_key`
- **AND** el archivo de working-context previo, si existía, queda sin cambios

#### Scenario: El lifecycle y el on-write advierten sin escribir un bloque degradado

- **WHEN** un refresh de lifecycle (`init`, `install`, `upgrade`) o el refresh on-write del MCP encuentra el error de una clave crítica
- **THEN** el refresh de lifecycle o el llamador del on-write emite `console.warn` nombrando la `memory_key`
- **AND** no se escribe un bloque degradado en el archivo de working-context

#### Scenario: Sin la clave de configuración el comportamiento no cambia

- **WHEN** `memory.criticalKeys` está ausente, no es un array o es inválida
- **THEN** el valor efectivo es la lista vacía
- **AND** el bloque generado es idéntico al vigente, incluido el orden, el corte y el `<ContextOverflowWarning>`

## MODIFIED Requirements

### Requirement: Orden determinístico de inyección de reglas

El orden de inyección de `rule` en `<ProjectMemoryRules>` SHALL ser determinístico y total. El
criterio SHALL aplicarse en este orden:

1. Reglas declaradas en `required`: primero, en el orden en que el llamador las declaró.
2. Jerarquía de scope: `task` antes que `feature` antes que `project`.
3. Anclaje declarado: las reglas que declaran al menos una ref `spec:`, `change:` o `path:` en su
   bloque `refs:` antes que las que no declaran ninguna.
4. `created_at` descendente.
5. `memory_key` lexicográfico ascendente.

`required` SHALL ser la clave `required` del cuarto argumento de opciones de
`buildWorkingContext`, con la firma `buildWorkingContext(scope, maxTokens, cwd, { required })`;
NO SHALL persistirse, NO SHALL ser una columna ni una tabla, y NO SHALL
formar parte del nodo devuelto por las superficies de lectura. Su efecto SHALL limitarse al orden y
al presupuesto de esa construcción.

El renderer del working-context SHALL obtener `required` del conjunto crítico declarado en la
configuración del proyecto (`.ancletorc` → `memory.criticalKeys`) y SHALL pasarlo como ese cuarto
argumento. Cuando la configuración no declara la clave, `required` SHALL ser `[]`.

Una regla no declarada en `required` NO SHALL desplazar a una requerida: mientras una requerida entre
en el presupuesto, ninguna no requerida se incluye si esa requerida queda fuera.

El anclaje SHALL determinarse únicamente parseando el bloque `refs:` del `content`. La evaluación
NO SHALL resolver las refs, NO SHALL consultar el filesystem ni la base de datos, y NO SHALL agregar
I/O al render. Una regla sin bloque `refs:`, con un bloque inválido o con un bloque que sólo declara
`commit:` o `workitem:` NO SHALL contar como anclada.

Dos corridas de `buildWorkingContext` sobre el mismo estado de memoria, el mismo `maxTokens` y las
mismas `required` SHALL producir el mismo bloque. Para un estado de DB fijo y la misma configuración
de claves críticas, el orden y el corte SHALL ser determinísticos.

#### Scenario: La regla requerida se inyecta primero

- **WHEN** dos reglas activas del scope inyectado compiten por el presupuesto
- **AND** una de ellas está declarada en `required` y la otra tiene mejor scope o mejor anclaje
- **THEN** la regla requerida se ordena antes
- **AND** si sólo entra una, entra la requerida

#### Scenario: Una regla anclada gana a una no anclada del mismo scope

- **WHEN** dos reglas activas del mismo scope compiten por el presupuesto
- **AND** una declara al menos una ref `spec:`, `change:` o `path:` y la otra no declara ninguna
- **THEN** la regla anclada se ordena antes
- **AND** si sólo entra una, entra la anclada

#### Scenario: El scope de mayor prioridad gana

- **WHEN** existe una regla activa de scope `task` y otra de scope `project` en un contexto `task`
- **THEN** la regla de scope `task` se ordena antes que la de scope `project`

#### Scenario: El empate se resuelve por recencia y luego por memory_key

- **WHEN** dos reglas comparten scope y anclaje pero tienen distinto `created_at`
- **THEN** se ordena primero la de `created_at` más reciente
- **AND** si además comparten `created_at`, se ordena primero la de `memory_key` lexicográficamente menor

#### Scenario: Dos corridas producen el mismo bloque

- **WHEN** se invoca `buildWorkingContext` dos veces consecutivas sin escrituras intermedias
- **THEN** los dos bloques son idénticos byte a byte

#### Scenario: El conjunto requerido proviene de la configuración del proyecto

- **WHEN** `.ancletorc` declara `memory.criticalKeys` con una lista de `memory_key`
- **THEN** el renderer del working-context pasa esas claves como `required`
- **AND** el orden declarado en la configuración es el orden de inyección

#### Scenario: Una regla no crítica no desplaza a una requerida

- **WHEN** el presupuesto no alcanza para todas las reglas activas del scope
- **AND** una regla requerida entra en el presupuesto
- **THEN** ninguna regla no requerida se incluye si esa requerida quedó fuera
- **AND** el corte no altera el orden determinístico de las reglas incluidas
