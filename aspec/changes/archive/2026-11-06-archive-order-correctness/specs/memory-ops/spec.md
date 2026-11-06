# Delta: archive-order-correctness

## MODIFIED Requirements

### Requirement: Promoción al archivar sólo de decisiones duraderas aprobadas

Al archivar un change, el rol que archiva SHALL promover a `.ancleto/memory.db` exclusivamente las
decisiones duraderas declaradas en `proposal ## Decisiones`, aplicando un gate determinístico antes
de cualquier escritura. El shape de `## Decisiones` SHALL referenciarse desde
`agents/spec-writer.md`, no re-enunciarse en la superficie de archive.

Un bloque es candidato sólo si tiene `memory_key` propia y `Estado: aprobado`. La forma de una línea
—decisión, alternativa descartada, por qué y fuente— NO SHALL ser promovible: no tiene `memory_key`
ni `Estado`. Sólo se promueven decisiones: una `rule` NO SHALL promoverse desde `## Decisiones`. La
`memory_key` SHALL ser la declarada en el bloque; el rol que archiva NO SHALL inventar ni derivar una
clave a partir del change.

El gate SHALL validar el lote completo antes de la primera escritura: claves propias, claves únicas
dentro del lote, `Estado: aprobado`, refs presentes y resolubles, y ausencia de candidatos de sesión
(transcripción, estado transitorio de tareas, resumen de sesión). Cualquier violación SHALL producir
cero escrituras y un reporte por bloque con su ubicación en el `proposal.md`; no SHALL existir
promoción parcial. Cuando dos bloques del lote comparten `memory_key` y difieren en contenido o refs,
el lote entero SHALL rechazarse reportando ambos bloques y su fuente.

Cero candidatos SHALL implicar cero escrituras de memoria y cero delegaciones a `@memory-keeper`: la
regla la aplica el rol que archiva y NO SHALL delegarse la decisión de "no hay nada" al agente de
memoria. Con candidatos válidos, la promoción SHALL escribir un nodo por decisión aprobada, con el
bloque `refs:` normalizado dentro de `content`. La explicación completa (Elección, Descartado,
Justificación y Refs) NO SHALL copiarse al nodo ni truncarse en el proposal: el nodo se limita a una
a tres oraciones y el artifact versionado conserva el detalle.

La secuencia de archive SHALL ser: (1) merge/sync de specs cuando hay delta; (2) preflight del lote de
promoción, read-only y fail-closed; (3) promoción de los bloques aprobados; (4) move del directorio del
change a `aspec/changes/archive/YYYY-MM-DD-<slug>/` sin modificarlo; (5) summary/commit. La promoción
SHALL ejecutarse después del merge y antes del move. La secuencia SHALL quedar codificada en las
superficies canónicas de archive (`agents/orchestrator.md`, `agents/documenter.md`,
`skills/ancleto-archive/SKILL.md`, `skills/ancleto-bulk-archive/SKILL.md`,
`skills/ancleto-onboard/SKILL.md`), y la release SHALL regenerar los mirrors instalados con `ancleto
upgrade` antes de cerrar. Esta secuencia NO SHALL alterar la paralelización de Automatic Record: ésa es
memoria episódica, una superficie disjunta.

Si el preflight o la promoción fallan antes del move, el change NO SHALL moverse y NO SHALL quedar
ninguna escritura por una violación del gate; el resultado SHALL reportarse con el literal canónico
**no archivado; memoria pendiente**, nombrando la `memory_key` y el motivo, con instrucción de
reintento. Si el move falla después de una promoción exitosa, el resultado SHALL reportarse con el
literal canónico **memoria promovida; NO archivado**, con instrucción de reintento. Las superficies de
producto en inglés SHALL usar los equivalentes exactos `not archived; memory pending` y `memory
promoted; NOT archived` respectivamente, sin otras variantes. El resultado **archivado, memoria
pendiente** NO SHALL usarse: presume un move anterior a la promoción y ya no describe la secuencia. El
sistema NO SHALL reportar "archivado y memorizado" si sólo se archivó. Dos `memory_key` distintas que
se contradicen NO SHALL resolverse por similitud textual: SHALL reportarse con sus fuentes y remitirse
a resolución humana o a `memory merge` cuando sean duplicados.

_No-testeable-por-construcción: que el rol que archiva no delegue a `@memory-keeper` con cero
candidatos y que el detector de contradicciones cross-key no elija por similitud son no-acciones y
juicios sin salida observable. Se anclan en el contrato de prompt de la skill; la parte determinística
—una sola activa por `memory_key` y rechazo del lote con clave repetida— se verifica en el engine._

#### Scenario: Promoción con decisiones duraderas crea nodos con refs

- **WHEN** el `proposal ## Decisiones` de un change tiene bloques con `memory_key` propia, `Estado: aprobado` y refs resolubles
- **THEN** al archivar se crea un nodo activo por decisión
- **AND** cada nodo contiene su bloque `refs:` normalizado en `content`
- **AND** la `memory_key` de cada nodo es la declarada en el bloque

#### Scenario: Decisión no duradera no produce nodo ni delegación

- **WHEN** el `proposal ## Decisiones` está ausente, vacío, o todos sus bloques carecen de `memory_key` propia o de `Estado: aprobado`
- **THEN** no se escribe ningún nodo
- **AND** no se delega `@memory-keeper`
- **AND** el resumen del archive informa que no hubo memorias promovidas

#### Scenario: La forma de una línea no se promueve

- **WHEN** una decisión está escrita en la forma `decisión | alternativa descartada | por qué | fuente`
- **THEN** no se selecciona como candidata
- **AND** no se inventa una `memory_key` para promoverla

#### Scenario: Una regla nunca se promueve desde `## Decisiones`

- **WHEN** un bloque de `## Decisiones` se clasifica como restricción permanente
- **THEN** no se escribe mediante `recordRule` desde el gate de promoción
- **AND** el resumen reporta que la promoción sólo admite decisiones

#### Scenario: Dos afirmaciones contradictorias no se publican ambas

- **WHEN** dos bloques del lote comparten `memory_key` y difieren en contenido o refs
- **THEN** el lote se rechaza completo sin escribir ningún nodo
- **AND** el reporte nombra ambas afirmaciones, sus refs y su ubicación en el proposal

#### Scenario: Un candidato de sesión no se guarda ni se inyecta

- **WHEN** el lote contiene una nota de sesión, un estado transitorio de tareas o un resumen de sesión
- **THEN** ese bloque no se selecciona como candidato
- **AND** si es lo único que hay, no se escribe ningún nodo ni se delega `@memory-keeper`
- **AND** su texto no aparece en el bloque `<ProjectMemoryRules>`

#### Scenario: Dos claves contradictorias se reportan sin publicar la nueva

- **WHEN** el gate identifica dos `memory_key` distintas que afirman posiciones contradictorias sobre
  el mismo tema
- **THEN** no se promueve la nueva afirmación
- **AND** el reporte nombra ambas `memory_key` con sus fuentes
- **AND** la resolución se remite a decisión humana o a `memory merge` si son duplicados

#### Scenario: La promoción corre antes del move

- **WHEN** un change con decisiones aprobadas se archiva y tiene delta o no lo tiene
- **THEN** el merge/sync de specs se completa primero
- **AND** la promoción de las decisiones aprobadas se completa antes de mover el directorio
- **AND** el directorio se mueve a `aspec/changes/archive/YYYY-MM-DD-<slug>/` sin modificarse

#### Scenario: Fallo de preflight o de promoción antes del move

- **WHEN** el preflight del lote o la promoción falla antes de mover el change
- **THEN** el change no se mueve
- **AND** no queda ninguna escritura por una violación del gate
- **AND** el reporte usa el literal canónico `no archivado; memoria pendiente` (en superficies en inglés, `not archived; memory pending`) y nombra la `memory_key` y el motivo con reintento

#### Scenario: Fallo del move después de una promoción exitosa

- **WHEN** la promoción de las decisiones aprobadas se completa y el move del directorio falla
- **THEN** el reporte usa el literal canónico `memoria promovida; NO archivado` (en superficies en inglés, `memory promoted; NOT archived`) con instrucción de reintento
- **AND** no se reporta como archivado ni como "archivado, memoria pendiente"
