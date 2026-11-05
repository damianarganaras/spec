## ADDED Requirements

### Requirement: El aviso de tier huérfano requiere una superficie de agentes locales

`ancleto check` SHALL emitir el aviso de tier huérfano sólo cuando el proyecto declare al menos una
superficie de agentes locales. La superficie SHALL derivarse con `localAgentDirs(rc)` —el target de
agentes del host resuelto en `rc.agent` más `installedPaths.agents`—; NO SHALL derivarse de una lista
de nombres de host ni de `.opencode/agents` fijo. La unión multi-host (`installedHostsFromPaths`) y
los escenarios multi-host de tier quedan FUERA de este requirement (diferidos, según H9).

Cuando `localAgentDirs(rc)` devuelva una lista vacía, el tier SHALL considerarse dormido: NO SHALL
emitirse el aviso, aunque `.opencode/.ancleto-tier` exista y declare un tier válido. Cuando exista al
menos un directorio declarado y la cantidad de archivos `.md` en los directorios existentes sea cero,
el aviso SHALL emitirse con el texto existente. La ausencia del archivo de tier o un tier que no
pertenezca a `TIERS` NO SHALL producir aviso.

Este change es exclusivamente de oráculo: `init`, `install` e `import` NO SHALL cambiar su escritura
de `.opencode/.ancleto-tier`, y `check` NO SHALL cambiar su exit code
(`missing > 0 ? 1 : 0`) ni sumar el aviso a `missing` u `orphans`.

#### Scenario: Un proyecto sano con un host sin superficie de agentes no advierte

- **WHEN** un proyecto instalado con `cursor` o `roo` tiene `.opencode/.ancleto-tier` con un tier
  válido y `ancleto check` se ejecuta
- **THEN** `localAgentDirs(rc)` devuelve una lista vacía
- **AND** `check` NO SHALL emitir el aviso `tier ... sin agentes locales`
- **AND** el exit code es 0

#### Scenario: Una superficie declarada sin archivos conserva el aviso

- **WHEN** el proyecto declara un directorio de agentes locales (`opencode` u `antigravity`) y ese
  directorio no contiene archivos `.md`
- **THEN** `check` SHALL emitir el aviso existente
  `tier "<t>" sin agentes locales donde aplicarlo — este proyecto usa los agentes globales. Corre 'ancleto install --project .' para que el tier aplique, o borra .opencode/.ancleto-tier.`
- **AND** el exit code es 0

#### Scenario: Sin archivo de tier o con un tier desconocido no hay aviso

- **WHEN** `.opencode/.ancleto-tier` no existe, o contiene un valor que no pertenece a `TIERS`
- **THEN** `check` NO SHALL emitir el aviso de tier huérfano
- **AND** el exit code no cambia por ese motivo

#### Scenario: Los escritores conservan la escritura del estado de tier

- **WHEN** se ejecutan `ancleto init`, `ancleto install` o `ancleto import` en un host que escribe
  `model:`
- **THEN** `.opencode/.ancleto-tier` se escribe con la misma semántica que antes del change
- **AND** ningún escritor consulta ni depende de la nueva condición del oráculo
