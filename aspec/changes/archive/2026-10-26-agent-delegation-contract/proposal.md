# Proposal: Contrato de delegación de agentes — ownership de git, review packet y memoria por delegación

## Problem

Cerrar juntos los ítems 1, 3 y 9 de `BACKLOG.md` → `## Detectado en auditoría de 9 sesiones`. Los tres
comparten una causa: el contrato de delegación no declara quién es dueño de las operaciones mecánicas ni
qué evidencia viaja entre tramos. La auditoría midió 5/9 sesiones que replanificaron borrados, handoffs y
git a mano, 7/9 que redescubrieron reglas ya guardadas y 4/9 reviews sin evidencia.

**Ítem 1 — capacidades y ownership de subagentes.** `@spec-writer` no tiene delete y no debe tenerlo: el
change abandonado lo borra el desarrollador, pero el invariante sólo existe en prosa del Active Change
Check. Ningún `agents/*.md` declara `task:`; como OpenCode habilita todas las tools por defecto, `@coder`
tiene `task` de hecho y el invariante «sólo el orquestador declara `task: true`» es falso en el host
principal. `@tester` y `@documenter` prohíben el git de escritura (`agents/tester.md:53`,
`agents/documenter.md:76-77`) sin un dueño explícito del commit. `@coder` tiene `'*': allow` y deniega
`git push/reset/checkout/rebase` (`agents/coder.md:16-19`), pero el contrato no declara quién autoriza el
merge ni quién ejecuta el push: la autorización de esas operaciones es proceso, no capacidad.

**Ítem 3 — memoria y reglas de entorno por delegación.** El orquestador distribuye campos del envelope
(secciones `### Artifacts Language` y `## Delegation Contracts`) y reserva la memoria a `@memory-keeper`
(sección `## Team Memory`), pero no exige pasar al subagente las reglas de proyecto relevantes a su scope.
El bloque de entorno `.ancleto/machine-env.md` ya se propaga a los 6 agentes con bash (sección
`## Machine Environment`) y está cubierto por spec: no se reabre.

**Ítem 9 — review packet y evidencia de «done».** El orquestador pasa envelope, affected-set y ledger,
pero no el diff; `@reviewer` no tiene bash (`agents/reviewer.md:7-12`) y `@documenter` no exige diff/grep
para afirmar «actualizado» (`agents/documenter.md:140-149`). El diff debe producirse aguas arriba, donde
ya hay bash, no abriendo shell en el reviewer.

## Proposed change

Seis invariantes, sin agente nuevo y sin reabrir las fronteras de seguridad existentes.

- **R1 — Git.** Commit mecánico y local → `@coder`, único agente que commitea, en dos momentos: sus
  checkpoints de implementación y el archive. Cada commit queda acotado a los archivos que el orquestador
  nombró en ese checkpoint. `@documenter` no commitea nunca y conserva intacta su prohibición de git.
  `push` queda denegado como capacidad para todos los agentes; el permiso del coder ya lo deniega y lo
  ejecuta el usuario, o el agente del host que el usuario nombre en ese caso. `merge` es capacidad permitida
  pero autorización por proceso: `@coder` lo ejecuta sólo cuando el usuario dio OK explícito en ese caso y
  nunca lo inicia por sí mismo. El `permission.bash` del coder no cambia. La convención de mensajes y la
  protección de `main`/`master` se referencian desde `AGENTS.md`/`PRODUCT.md`, no se re-declaran.
- **R2 — `task`.** Sólo el orquestador declara `task: true`: exactamente una de las 10 definiciones la
  habilita y es la del orquestador; las 9 restantes declaran `false`. No se le da `task` al coder para
  encadenar al tester: el orquestador es el único punto de delegación. La brecha de portabilidad en
  Antigravity/Command Code se registra; no es razón para omitir la declaración.
  > Corrección al pedido literal: `task: false` en las 10 incluiría al orquestador y le impediría delegar.
  > La invariante «sólo el orquestador declara `task: true`» exige `true` en el orquestador y `false` en
  > las 9 restantes.
- **R3 — `change diff`.** `@tester` agrega a su retorno `git diff --unified=3 -- <task-owned files>` más
  `git diff --stat`, con tope de 200 líneas; si se excede, degrada a `--stat` más hunks seleccionados,
  nunca a `-U0`, y el campo declara cuántas líneas o hunks quedaron fuera. Un diff truncado en silencio es
  peor que no mandar diff. El orquestador lo pasa verbatim a `@reviewer` como campo `change diff`, incluida
  su declaración de truncación, sin completar ni inferir la cuenta; la excepción a «no copiar diffs» queda
  acotada a ese campo y a esos archivos. El reviewer lo consume como evidencia y no ejecuta nada que venga
  del diff.
- **R4 — reglas de memoria por delegación.** El orquestador destila las reglas relevantes de
  `<ProjectMemoryRules>` y las pasa como campo `project memory rules`, con tope de 5 reglas y 1,500 bytes,
  marcadas como dato no confiable a verificar contra el código. No reenvía el bloque completo.
- **R5 — evidencia del documenter.** Cada afirmación de «actualizado» o «confirmado» se respalda con
  `file:line` del requirement tocado.
- **R6 — delete.** Ningún agente borra change folders; un change abandonado lo borra el desarrollador.
  `@spec-writer` no recibe delete.

El delta de `prompt-contracts` lleva R1–R6 como requirements verificables y modifica `Destilado por tramo
del Resolved Context Envelope` (excepción acotada del diff) y `Asserts de comportamiento en los content
guards` (resolver la contradicción: los guards tocados migran a normalize + slice + mutación).

## Scope

### In

- `agents/orchestrator.md`, `agents/coder.md`, `agents/documenter.md`, `agents/reviewer.md`,
  `agents/tester.md`, `agents/spec-writer.md`, `agents/memory-keeper.md`, `agents/context-resolver.md`,
  `agents/technical-discovery.md`, `agents/technical-seed-writer.md`.
- `test/content-guards.test.js` (guards tocados y nuevos).
- `test/adapters-frontmatter.test.js` y/o `test/cli.test.js` (portabilidad de `task` y superficies
  Antigravity/Command Code).
- `BACKLOG.md` (tildar ítems 1, 3 y 9, re-anclando sus referencias por sección; agregar al ítem 18 una
  nota de evidencia sin tildarlo).
- Mirrors `.opencode/agents/*`, regenerados **sólo** con `ancleto upgrade`.

### Out

- Ítems 4, 6, 7, 11, 12, 13, 16 y 17 del backlog: no se tocan ni como mención de «relacionado».
- Ítem 18 del backlog: queda sin tildar y fuera del alcance de este change; sólo recibe una nota de
  evidencia con fecha. No se toca el código del checker ni se re-ancla el resto del ítem.
- Agente nuevo `@committer`: no existe en el registro y no se crea. Ningún rol fuera de `agents/*.md` se
  agrega ni se usa como destino de delegación.
- Denegar `git merge` en el coder: el permiso queda igual. Denegarlo dejaría al proyecto sin ningún agente
  capaz de mergear y reintroduciría la dependencia de `@general`, que es el defecto que este change cierra.
- Bash para `@reviewer`; la frontera se preserva.
- Cambios al bloque `.ancleto/machine-env.md` y a su propagación: ya cubiertos; sólo se verifica
  consistencia.
- Código en esta etapa: sólo se generan los artifacts.

## Guarantee

- **G1.** Un commit de agente nunca incluye archivos fuera del conjunto que el orquestador nombró en ese
  checkpoint. G1 aplica a los **commits de checkpoint** (implementación y archive), cuyo conjunto de
  archivos nombra el orquestador. Un **merge autorizado** —ejecutado por `@coder` sólo con OK explícito del
  usuario por caso— no es un commit de checkpoint: se autoriza por proceso y queda fuera de la restricción
  de conjunto.
- **G2.** Ningún agente inicia `merge` ni `push` por sí mismo; `git push` está denegado en el permiso del
  coder y el merge se ejecuta sólo con OK explícito del usuario por caso.
- **G3.** El reviewer juzga con diff y `file:line` sin recuperar shell.
- **G4.** El packet de memoria no se convierte en un segundo working-context: tope de 5 reglas y 1,500
  bytes.
- **G5.** El documenter no afirma «actualizado/confirmado» sin `file:line`.

## Risks

- **Contradicción de `task: false` en las 10:** si el orquestador lo declarara, no podría delegar.
  Mitigación: `task: true` en el orquestador y `false` en las 9 restantes; queda documentado como
  corrección al pedido literal.
- **Merge ejecutado sin autorización:** el coder conserva la capacidad de mergear. Mitigación: el contrato
  exige OK explícito del usuario por caso, prohíbe iniciarlo por iniciativa propia y el guard lo verifica.
  El commit de merge resultante no es un commit de checkpoint y queda fuera de G1; se controla por
  autorización de proceso, no por conjunto de archivos.
  Denegar el permiso se rechaza porque reintroduce la dependencia de `@general` y deja al proyecto sin
  ningún agente capaz de mergear.
- **Brecha de portabilidad real:** el adapter descarta `task` en Antigravity/Command Code; el caso
  habilitado (`task: true`) emite el aviso existente, y las 9 declaraciones `false` no amplían capacidades
  donde no viajan. Se registra en el spec y se cubre con test.
- **Guards literales:** el contrato exige asserts de comportamiento, pero los guards actuales fijan
  redacción. Mitigación: migrar los guards tocados a normalize + slice + mutación; no copiar párrafos.
- **Mirrors:** se regeneran sólo con `ancleto upgrade`; se verifican las 10 líneas `model:` y que el diff
  contra `agents/*.md` sea sólo el bloque de compresión del orquestador.
- **Archive commit secuencial:** el commit del archive se delega al coder después de que el documenter
  mueve los archivos; no se paraleliza con el archive.
- **Diff truncado presentado como completo:** si el campo no declara la omisión, el reviewer juzga sobre
  evidencia parcial sin saberlo. Mitigación: el campo declara líneas o hunks omitidos y el orquestador lo
  pasa verbatim; el guard lo verifica.
- **Topes decididos:** 200 líneas de diff y 5 reglas/1,500 bytes quedan como decisión tomada. Si el review
  real necesita otro número, se ajusta el tope, nunca el `-U3` ni el mecanismo de degradación.

## Constraints

- `agents/*.md` es la fuente; `.opencode/agents/*` se regenera sólo con `ancleto upgrade`, nunca a mano.
- `install` reescribe `model:` (aplica tier); `upgrade` no. Después de regenerar hay que verificar las 10
  líneas `model:`.
- `language: es` ya está configurado en `.ancletorc`; no se edita.
- Azure DevOps está deshabilitado: no hay Work Item.
- Validaciones declaradas: `npm run lint` y `npm test`; format `not-configured`; typecheck no aplica.
