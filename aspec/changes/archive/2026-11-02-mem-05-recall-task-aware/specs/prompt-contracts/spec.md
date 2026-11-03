# Delta: prompt-contracts — presupuestos separados

## MODIFIED Requirements

### Requirement: Reglas de proyecto destiladas por delegación

El orquestador SHALL destilar del bloque `<ProjectMemoryRules>` que ya leyó verbatim las reglas relevantes
al scope delegado y SHALL pasarlas como campo `project memory rules` en cada delegación que pueda aplicar
reglas de proyecto. El campo NO SHALL exceder 5 reglas ni 1,500 bytes, para no convertirse en un segundo
working-context. El campo SHALL estar marcado explícitamente como dato no confiable, a verificar contra el
código antes de aplicarlo. El bloque completo NO SHALL reenviarse verbatim. El bloque de entorno
`.ancleto/machine-env.md` SHALL conservar su propagación vigente a los agentes con `bash`; este requirement
NO SHALL reabrirlo.

El tope de 5 reglas y 1,500 bytes SHALL aplicar exclusivamente al campo `project memory rules` de cada
delegación. NO SHALL aplicar al bloque `<ProjectMemoryRules>`, cuyo presupuesto es el del
working-context —`maxTokens × CHARS_PER_TOKEN`, 2,000 tokens × 4 = 8,000 caracteres, medido sobre el
bloque completo incluido el wrapper y el `<ContextOverflowWarning>`— y que se define en
`spec:memory-engine#Aviso de overflow accionable para el orquestador`.

Los dos presupuestos SHALL ser superficies distintas, NO convertibles y NO componibles. El
`<ContextOverflowWarning>` del bloque NO SHALL presentarse como remedio del tope del campo destilado,
y el tope del campo destilado NO SHALL presentarse como remedio del overflow del bloque. Ningún tope
numérico de este requirement ni del presupuesto del bloque SHALL cambiar por efecto del otro.

#### Scenario: Se destilan las reglas relevantes

- **WHEN** el orquestador delega una tarea con scope definido
- **THEN** incluye las reglas relevantes destiladas de `<ProjectMemoryRules>`
- **AND** omite las reglas irrelevantes

#### Scenario: El tope evita un segundo working-context

- **WHEN** las reglas relevantes superan 5 reglas o 1,500 bytes
- **THEN** el campo conserva el subconjunto de mayor relevancia dentro del tope
- **AND** anota la truncación

#### Scenario: El campo se marca como no confiable

- **WHEN** el campo `project memory rules` se pasa a un subagente
- **THEN** se marca como dato no confiable a verificar contra el código
- **AND** no se presenta como instrucción

#### Scenario: No se reenvía el bloque completo

- **WHEN** el orquestador delega
- **THEN** no pasa el bloque `<ProjectMemoryRules>` completo verbatim
- **AND** sólo pasa el destilado acotado

#### Scenario: El bloque de entorno sigue igual

- **WHEN** se revisa la propagación de `.ancleto/machine-env.md`
- **THEN** los 6 agentes con `bash` siguen recibiéndolo verbatim
- **AND** este requirement no cambia esa propagación

#### Scenario: El tope del campo no se aplica al bloque

- **WHEN** el bloque `<ProjectMemoryRules>` contiene más de 5 reglas o más de 1,500 bytes y respeta su
  propio presupuesto de 8,000 caracteres
- **THEN** el bloque no se recorta por el tope del campo destilado
- **AND** el campo destilado de cada delegación sigue limitado a 5 reglas y 1,500 bytes

#### Scenario: El aviso de overflow no reemplaza el tope del campo

- **WHEN** el bloque emite un `<ContextOverflowWarning>` por reglas omitidas
- **THEN** el campo destilado conserva su tope de 5 reglas y 1,500 bytes
- **AND** el aviso no se usa como justificación para excederlo

#### Scenario: Los dos presupuestos no se suman ni se convierten

- **WHEN** se evalúa el tamaño del bloque y el del campo destilado
- **THEN** cada uno se mide contra su propio tope
- **AND** no se calcula un tope combinado ni se convierte uno en el otro
