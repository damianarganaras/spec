# Spec: memory-engine (delta)

## ADDED Requirements

### Requirement: Frescura del working-context tras escrituras de la CLI

El bloque `<ProjectMemoryRules>` de `.ancleto/working-context.md` SHALL regenerarse desde la
memoria activa cuando una operación de escritura del CLI altere los nodos que lo componen, sin
exigir un lifecycle point (`init`, `install --project`, `upgrade`) ni un comando manual. En
particular, `ancleto memory import` SHALL disparar la regeneración usando el mismo camino único
de render que el refresh de MCP (`writeWorkingContext` / `renderWorkingContextBlock`) sobre la
conexión ya abierta por el comando. La regeneración SHALL ser best-effort: si falla, la
importación persistida SHALL considerarse exitosa igualmente y el fallo SHALL reportarse por
stderr sin abortar.

#### Scenario: El import de una regla de proyecto refresca el working-context

- **WHEN** se importa por `ancleto memory import` un JSON con una `rule` activa de scope `project`
- **AND** se lee el working-context después del import
- **THEN** el working-context incluye la nueva regla

#### Scenario: Un import que no altera el bloque no lo reescribe

- **WHEN** se importa por `ancleto memory import` una `decision` de scope no proyectado que no
  supersede ninguna `rule` de proyecto
- **THEN** el working-context no se regenera por ese import

#### Scenario: Falla del refresh no pierde la escritura

- **WHEN** el import persiste los nodos en `memory.db` pero la regeneración del working-context falla
- **THEN** el comando reporta la importación como exitosa
- **AND** la memoria persistida contiene los nodos importados
- **AND** el fallo del refresh se reporta por stderr

### Requirement: Detección de staleness del working-context

El CLI SHALL poder reportar de forma read-only si `.ancleto/working-context.md` está al día
respecto de las reglas activas. El chequeo SHALL renderizar el bloque esperado con el mismo
camino de render que el refresh y compararlo (con normalización acotada de líneas y salto final)
contra el contenido actual del archivo, reportando uno de tres estados: `ok`, `ausente` o
`desactualizado`. El chequeo NO SHALL escribir el archivo; corregir el staleness queda a cargo
del refresh on-write o de `ancleto memory context --out`.

#### Scenario: Working-context al día

- **WHEN** el contenido de `.ancleto/working-context.md` coincide con el bloque renderizado desde
  la memoria activa
- **THEN** el chequeo reporta `ok`

#### Scenario: Working-context ausente

- **WHEN** existen reglas activas que componen el bloque pero `.ancleto/working-context.md` no existe
- **THEN** el chequeo reporta `ausente`

#### Scenario: Working-context desactualizado

- **WHEN** el contenido de `.ancleto/working-context.md` no coincide con el bloque renderizado
  desde la memoria activa
- **THEN** el chequeo reporta `desactualizado`

#### Scenario: El chequeo no muta el archivo

- **WHEN** se ejecuta el chequeo de staleness sobre un working-context desactualizado
- **THEN** el contenido del archivo no cambia
