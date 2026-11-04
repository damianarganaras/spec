# Delta: skill-frontmatter-adapters

## MODIFIED Requirements

### Requirement: `ancleto check` valida frontmatter de agents contra el adaptador y la canónica

`ancleto check` SHALL validar que el frontmatter de los agents instalados coincida con la salida del
adaptador aplicada a la **canónica versionada**, no a la salida con el tier aplicado. Para cada
archivo `.md` de un directorio de agents instalado, el check SHALL leer el contenido instalado, leer
el contenido de origen, calcular `esperado = adaptFrontmatter(origen, host, 'agents', name)` —más
las notas de host que ya correspondan— y comparar contra el instalado.

Para `opencode`, cuando el proyecto declare un tier conocido en `.opencode/.ancleto-tier`, el check
SHALL calcular además el conjunto de estados de tier aceptados para **todos** los agentes del
directorio, incluidos los que un overlay de perfil reemplaza: `install`/`update` aplican el tier
también a esos agentes, así que el tier es dueño de su `model:` en ese momento. Para los tiers sin
cadena, el conjunto contiene el estado resuelto-ahora. Para `minimo`, el conjunto contiene un estado
por cada candidato estático de `TIER_CHAINS.minimo` para ese agente, con el estado resuelto-ahora en
primer lugar. Los candidatos SHALL tomarse de la cadena estática, no del catálogo: un mirror escrito
cuando el catálogo tenía otro candidato sigue siendo un estado aceptado. Un instalado igual a
`esperado` o a cualquier estado del conjunto NO SHALL reportarse como divergencia. Sólo un instalado
que difiera de todos SHALL reportarse como warning (⚠), no como faltante (✖). Una instalación sana con
`profile: test` y cualquier tier NO SHALL reportarse como divergencia.

El conjunto de estados de tier y el aviso de tier SHALL calcularse sólo para un directorio cuyo host
sea `opencode`. Para un directorio de un host cuyo adaptador elimina `model:` (`commandcode`, `claude`,
`vscode`, `copilot`) o emite un valor propio (`antigravity`: `model: inherit`), el check NO SHALL
resolver el catálogo, NO SHALL construir estados de tier y NO SHALL emitir el aviso de tier: compara
sólo contra `esperado`, que ya refleja el `model:` del adaptador.

El contenido esperado (`esperado`) de cada agente SHALL derivarse de `profiles/test/agents/<n>.md`
(la fuente del overlay del perfil) cuando el perfil activo sea `test` y ese archivo exista, y de
`agents/<n>.md` en caso contrario. El perfil es dueño del contenido y del `model:` sólo en `upgrade`;
en `install`/`update` el tier se aplica también a los dos agentes del overlay.

Cuando el mirror de un agente difiera del estado resuelto-ahora del tier, o el estado resuelto-ahora
difiera de su fuente esperada —la canónica para los agentes base, el perfil para los agentes que el
overlay reemplaza—, el check SHALL emitir, por cada directorio de agents, exactamente un aviso
informativo no bloqueante de la forma
`⚠ <dirRel> (tier '<tier>' aplica un modelo distinto al de su fuente en <n> agentes; install/update
reescribirá model:)`, donde `<n>` es la cantidad de agentes de ese directorio que cumplen al menos una
de las dos condiciones. `tierDiff` se calcula con el modelo resuelto-ahora, no con el conjunto de
aceptación, de modo que el aviso siga siendo único por directorio. El aviso SHALL emitirse tanto si el
mirror está en estado esperado como si está en estado del tier: una diferencia de modelo introducida
por un tier o por un cambio de catálogo entre `install` y `check` NO SHALL quedar silenciosa.

Si en el momento del check ningún candidato de la cadena de `minimo` figura en el catálogo para un
directorio `opencode`, el check NO SHALL abortar: SHALL aceptar los candidatos estáticos como estados
válidos y SHALL emitir un aviso no bloqueante distinto que indique que no hay candidato resoluble. El
exit code NO SHALL cambiar por ese aviso.

Para el tier `gratis`, el check SHALL aceptar como estado esperado la adaptación con
`GRATIS_FALLBACK_MODEL`, único modelo gratis conocido. Un `.ancletorc.gratisModel` desconocido NO
SHALL producir divergencia ni error: el check resuelve el gratis con el fallback. NO SHALL existir un
segundo modelo gratis aceptado.

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
  todos los estados del tier)
- **THEN** `ancleto check` reporta: `⚠ <dir>/<file> (frontmatter diverge del adaptador para host 'X')`
- **AND** el aviso es no bloqueante (exit code 0 si no hay faltantes)

#### Scenario: Un tier distinto no produce falso positivo de divergencia

- **WHEN** se instala con `--tier gratis` y luego se ejecuta `ancleto check`
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier con un `<n>` mayor que cero
- **AND** el comando completa con exit 0

#### Scenario: Un install `gratis` legacy no produce divergencia falsa

- **WHEN** un proyecto tiene instalado `opencode/big-pickle` y `.ancletorc.gratisModel` no está
  persistido o declara un valor desconocido
- **THEN** `ancleto check` NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: regresión del conjunto de aceptación — instala con el tier `gratis`
un proyecto sin `gratisModel` persistido, y otro con un valor legacy desconocido, y afirma ausencia de
divergencia, presencia del aviso de tier y exit code sin cambios._

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

- **WHEN** el `model:` del mirror no coincide ni con la canónica ni con ningún estado del tier
- **THEN** el check reporta `⚠ <dir>/<file> (frontmatter diverge del adaptador para host '<host>')`
- **AND** el comando completa con exit 0

#### Scenario: Check deriva el host del directorio instalado

- **WHEN** un proyecto tiene agents instalados para múltiples hosts (multi-host)
- **THEN** `ancleto check` SHALL derivar el host de cada directorio de agents con
  `hostForDir('agents', dirRel)`
- **AND** SHALL aplicar el adaptador de ese host para la validación
- **AND** `installedHostsFromPaths(ip)` sólo SHALL determinar la unión de hosts instalados usada para
  el conjunto esperado de skills, no el host de un directorio de agents

#### Scenario: Un directorio de un host que dropea `model:` no calcula estados de tier

- **WHEN** el proyecto tiene agents instalados para `claude` y el tier configurado es `minimo`, con un
  catálogo sin ningún candidato
- **THEN** el check NO SHALL resolver la cadena ni abortar
- **AND** NO SHALL emitir el aviso de tier
- **AND** NO SHALL reportar `frontmatter diverge` si el mirror coincide con la adaptación de la fuente
- **AND** el exit code NO SHALL cambiar

#### Scenario: `antigravity` se valida contra `model: inherit`

- **WHEN** el proyecto tiene agents instalados para `antigravity` y `.opencode/.ancleto-tier` declara
  un tier conocido
- **THEN** el check NO SHALL emitir el aviso de tier
- **AND** SHALL aceptar el frontmatter adaptado con `model: inherit` como estado esperado
- **AND** el check NO SHALL resolver el catálogo

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

- **WHEN** el tier configurado es `minimo`, la cabeza de la cadena está disponible y coincide con el
  modelo canónico, y no hay overlay de perfil
- **THEN** el check NO SHALL emitir el aviso de tier
- **AND** NO SHALL reportar divergencias de frontmatter

#### Scenario: La cadena de `minimo` no produce divergencia cuando la cabeza desaparece del catálogo

- **WHEN** se instaló `minimo` con la cabeza de la cadena disponible y luego se ejecuta `check` con un
  catálogo que ya no contiene la cabeza
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier porque el próximo `install`/`update` resolvería otro candidato
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: instalación con la cabeza, check con un catálogo inyectado sin la
cabeza; afirma ausencia de `frontmatter diverge`, presencia del aviso de tier y exit code sin cambios._

#### Scenario: La cadena de `minimo` no queda silenciosa cuando la cabeza reaparece

- **WHEN** se instaló `minimo` sin la cabeza (el mirror declara el segundo candidato) y luego se
  ejecuta `check` con un catálogo que vuelve a contener la cabeza
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier porque el mirror difiere del estado resuelto-ahora
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: instalación con un catálogo sin la cabeza, check con la cabeza
restaurada; afirma ausencia de `frontmatter diverge`, presencia del aviso de tier y exit code sin
cambios._

#### Scenario: `check` sin candidato resoluble no aborta

- **WHEN** se ejecuta `check` con tier `minimo` y el catálogo no contiene ningún candidato de la
  cadena
- **THEN** el check NO SHALL abortar ni reportar `frontmatter diverge` si el mirror coincide con un
  candidato estático
- **AND** SHALL emitir un aviso no bloqueante que indique que no hay candidato resoluble
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: instalación con la cabeza, check con un catálogo vacío para los
candidatos de la cadena; afirma la ausencia de divergencia, el aviso de catálogo no resoluble y exit
code sin cambios._
