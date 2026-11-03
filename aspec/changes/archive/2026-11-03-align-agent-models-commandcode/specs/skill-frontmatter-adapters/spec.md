# Delta: skill-frontmatter-adapters

## MODIFIED Requirements

### Requirement: `ancleto check` valida frontmatter de agents contra el adaptador y la canónica

`ancleto check` SHALL validar que el frontmatter de los agents instalados coincida con la salida del
adaptador aplicada a la **canónica versionada**, no a la salida con el tier aplicado. Para cada
archivo `.md` de un directorio de agents instalado, el check SHALL leer el contenido instalado, leer
el contenido de origen, calcular `esperado = adaptFrontmatter(origen, host, 'agents', name)` —más
las notas de host que ya correspondan— y comparar contra el instalado.

Para `opencode`, cuando el proyecto declare un tier conocido en `.opencode/.ancleto-tier`, el check
SHALL calcular además `conTier = adaptFrontmatter(origen con el modelo del tier, 'opencode',
'agents', name)` para **todos** los agentes del directorio, incluidos los que un overlay de perfil
reemplaza: `install`/`update` aplican el tier también a esos agentes, así que el tier es dueño de su
`model:` en ese momento. Un instalado igual a `esperado` o a `conTier` NO SHALL reportarse como
divergencia. Sólo un instalado que difiera de ambos SHALL reportarse como warning (⚠), no como
faltante (✖). Una instalación sana con `profile: test` y cualquier tier NO SHALL reportarse como
divergencia.

Para el tier `gratis`, el check SHALL aceptar como estado esperado la adaptación con CUALQUIERA de los
modelos gratis conocidos (`MUSE_SPARK_MODEL` y `GRATIS_FALLBACK_MODEL`), porque la resolución puede
diferir entre el momento del install y el del check cuando el proyecto no persistió `gratisModel`. NO
SHALL reportar divergencia si el mirror coincide con alguno de esos estados.

El contenido esperado (`esperado`) de cada agente SHALL derivarse de `profiles/test/agents/<n>.md`
(la fuente del overlay del perfil) cuando el perfil activo sea `test` y ese archivo exista, y de
`agents/<n>.md` en caso contrario. El perfil es dueño del contenido y del `model:` sólo en `upgrade`;
en `install`/`update` el tier se aplica también a los dos agentes del overlay.

Cuando el modelo de tier de un agente difiera de su fuente esperada —la canónica para los agentes
base, el perfil para los agentes que el overlay reemplaza— el check SHALL emitir, por cada directorio
de agents, exactamente un aviso informativo no bloqueante de la forma
`⚠ <dirRel> (tier '<tier>' aplica un modelo distinto al de su fuente en <n> agentes; install/update
reescribirá model:)`, donde `<n>` es la cantidad de agentes de ese directorio cuyo modelo de tier
difiere de su fuente esperada. `tierDiff` se calcula con el modelo resuelto (persistido o detectado),
no con el conjunto de estados aceptados, de modo que el aviso siga siendo único por directorio. El
aviso SHALL emitirse tanto si el mirror está en estado esperado
como si está en estado del tier: una diferencia de modelo introducida por un tier NO SHALL quedar
silenciosa.

El exit code NO SHALL cambiar por divergencias de frontmatter ni por el aviso de tier; sólo cambia
por faltantes de archivo. El check SHALL derivar el host de cada directorio de agents con
`hostForDir('agents', dirRel)` y SHALL aplicar el adaptador de ese host. `installedHostsFromPaths(ip)`
NO SHALL usarse para derivar el host de un directorio de agents: sólo SHALL usarse para calcular la
unión de hosts instalados que amplía el conjunto esperado de skills de un directorio que empaqueta
commands (`packagesCommandsHere`).

#### Scenario: Frontmatter instalado coincide con la canónica

- **WHEN** se ejecuta `ancleto check` en un proyecto con agents instalados correctamente desde la
  canónica y sin un tier que difiera de ella
- **THEN** el check NO reporta divergencias de frontmatter
- **AND** NO emite el aviso de tier
- **AND** el comando completa con exit 0

#### Scenario: Frontmatter editado manualmente se reporta como divergencia

- **WHEN** un agent instalado tiene su frontmatter editado manualmente (difiere de la canónica y de
  la salida del tier)
- **THEN** `ancleto check` reporta: `⚠ <dir>/<file> (frontmatter diverge del adaptador para host 'X')`
- **AND** el aviso es no bloqueante (exit code 0 si no hay faltantes)

#### Scenario: Un tier distinto no produce falso positivo de divergencia

- **WHEN** se instala con `--tier gratis` y luego se ejecuta `ancleto check`
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier con un `<n>` mayor que cero
- **AND** el comando completa con exit 0

#### Scenario: Un install `gratis` legacy no produce divergencia falsa

- **WHEN** un proyecto tiene instalado uno de los modelos gratis conocidos y `.ancletorc.gratisModel`
  no está persistido o no es reconocido
- **THEN** `ancleto check` NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: regresión del conjunto de aceptación — instala con el tier `gratis`
un proyecto sin `gratisModel` persistido y afirma ausencia de divergencia, presencia del aviso de tier
y exit code sin cambios._

#### Scenario: La diferencia de tier nunca queda silenciosa

- **WHEN** el mirror coincide con la canónica y el tier configurado aplica un modelo distinto
- **THEN** el check SHALL emitir el aviso de tier
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: instala en estado canónico con un tier que difiere y afirma la
presencia del aviso de tier junto con la ausencia de divergencia._

#### Scenario: Un mirror en estado de tier tampoco es silencioso

- **WHEN** el mirror coincide con la salida del tier configurado y ese tier difiere de la canónica
- **THEN** el check NO SHALL reportar divergencia
- **AND** SHALL emitir el aviso de tier
- **AND** el exit code NO SHALL cambiar

#### Scenario: Un mirror que difiere de la canónica y del tier se reporta como divergencia

- **WHEN** el `model:` del mirror no coincide ni con la canónica ni con la salida del tier
- **THEN** el check reporta `⚠ <dir>/<file> (frontmatter diverge del adaptador para host '<host>')`
- **AND** el comando completa con exit 0

#### Scenario: Check deriva el host del directorio instalado

- **WHEN** un proyecto tiene agents instalados para múltiples hosts (multi-host)
- **THEN** `ancleto check` SHALL derivar el host de cada directorio de agents con
  `hostForDir('agents', dirRel)`
- **AND** SHALL aplicar el adaptador de ese host para la validación
- **AND** `installedHostsFromPaths(ip)` sólo SHALL determinar la unión de hosts instalados usada para
  el conjunto esperado de skills, no el host de un directorio de agents

#### Scenario: Un `profile: test` sano no se reporta como divergencia

- **WHEN** se ejecuta `ancleto check` en un proyecto con `profile: test` cuyos agents se instalaron
  correctamente y cuyo tier no difiere de la fuente esperada de cada agente
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador` para `tester` ni `reviewer`
- **AND** SHALL comparar esos dos archivos contra `profiles/test/agents/<n>.md` y los otros ocho
  contra `agents/<n>.md`
- **AND** el comando completa con exit 0

#### Scenario: `profile: test` con `minimo` no reporta divergencia y avisa por el overlay

- **WHEN** se instala con `profile: test` y `--tier minimo` y luego se ejecuta `ancleto check`
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier con `n = 2` (los dos agentes del overlay, `tester` y
  `reviewer`, difieren de su fuente de perfil)
- **AND** el comando completa con exit 0

#### Scenario: `profile: test` con `gratis` no reporta divergencia y avisa por los diez agentes

- **WHEN** se instala con `profile: test` y `--tier gratis` y luego se ejecuta `ancleto check`
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier con `n = 10`, incluyendo a los dos agentes del overlay
- **AND** el comando completa con exit 0

#### Scenario: `minimo` sin overlay no emite aviso de tier

- **WHEN** el tier configurado es `minimo`, coincide con el modelo canónico y no hay overlay de perfil
- **THEN** el check NO SHALL emitir el aviso de tier
- **AND** NO SHALL reportar divergencias de frontmatter
