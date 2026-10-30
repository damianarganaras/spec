# Delta: memory-ops

## ADDED Requirements

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

Si una escritura falla después de mover el change, el resultado SHALL reportarse como **archivado,
memoria pendiente**, nombrando la `memory_key` y el motivo, con instrucción de reintento. El sistema
NO SHALL reportar "archivado y memorizado" si sólo se archivó. Dos `memory_key` distintas que se
contradicen NO SHALL resolverse por similitud textual: SHALL reportarse con sus fuentes y remitirse a
resolución humana o a `memory merge` cuando sean duplicados.

#### Scenario: Promoción con decisiones duraderas crea nodos con refs

- **WHEN** el `proposal ## Decisiones` de un change tiene bloques con `memory_key` propia,
  `Estado: aprobado` y refs resolubles
- **THEN** al archivar se crea un nodo activo por decisión
- **AND** cada nodo contiene su bloque `refs:` normalizado en `content`
- **AND** la `memory_key` de cada nodo es la declarada en el bloque

#### Scenario: Decisión no duradera no produce nodo ni delegación

- **WHEN** el `proposal ## Decisiones` está ausente, vacío, o todos sus bloques carecen de
  `memory_key` propia o de `Estado: aprobado`
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

#### Scenario: Fallo de promoción no se reporta como éxito

- **WHEN** el change ya se movió al archive y una escritura de memoria falla
- **THEN** el resultado se reporta como archivado con memoria pendiente
- **AND** se nombran la `memory_key` y el motivo
- **AND** no se afirma que el change quedó memorizado

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

_No-testeable-por-construcción: que el rol que archiva no delegue a `@memory-keeper` con cero
candidatos y que el detector de contradicciones cross-key no elija por similitud son no-acciones y
juicios sin salida observable. Se anclan en el contrato de prompt de la skill; la parte determinística
—una sola activa por `memory_key` y rechazo del lote con clave repetida— se verifica en el engine._

### Requirement: Backfill de las decisiones históricas únicas

Las cinco decisiones únicas detectadas en `design.md` históricos SHALL quedar (i) versionadas en Git
con su explicación completa —Elección, Descartado, Justificación y Refs— antes de que el flujo
elimine `design.md`, y (ii) promovidas a memoria con refs resolubles. La explicación completa SHALL
vivir en el artifact versionado —el `## Decisiones` del change que ejecuta el backfill, archivado
junto con él—, porque el nodo de memoria se limita a una a tres oraciones. La migración NO SHALL ser
ciega: cada decisión SHALL declarar la evidencia `file:line` de su `design.md` de origen. Cuando el
`design.md` de origen no enuncie una alternativa descartada formal, el artifact SHALL declararlo como
gap en lugar de inventar una.

El backfill SHALL limitarse a esas cinco decisiones y a los nodos críticos que el equipo marque
explícitamente; NO SHALL migrar los nodos existentes sin refs. Las cinco `memory_key` SHALL ser
claves de dominio estables, sin prefijo de fecha ni identificador de change; el origen del backfill
SHALL preservarse como ref `change:<slug>` al archive histórico, nunca dentro de la clave.

#### Scenario: Las cinco decisiones son recuperables desde una sesión nueva

- **WHEN** se consulta la memoria por cada una de las cinco decisiones históricas
- **THEN** cada una se recupera como nodo activo
- **AND** su bloque `refs:` contiene una ref `change:` que resuelve al archive histórico
- **AND** cada `path:` declarado existe en el repositorio

#### Scenario: La explicación completa sobrevive

- **WHEN** se lee el `proposal ## Decisiones` archivado del change de backfill
- **THEN** cada una de las cinco decisiones conserva Elección, Descartado, Justificación y Refs
- **AND** la explicación no depende del nodo de memoria, que puede ser más corto

#### Scenario: Evidencia de origen declarada

- **WHEN** se revisa una de las cinco decisiones
- **THEN** su Justificación nombra el `design.md` de origen con su rango de líneas

#### Scenario: Sin backfill masivo

- **WHEN** se ejecuta el backfill
- **THEN** sólo se escriben las cinco decisiones únicas y los nodos críticos marcados
- **AND** los nodos existentes sin refs no se reescriben ni se cuentan como migrados
