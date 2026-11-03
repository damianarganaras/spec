# Tasks: align-agent-models-commandcode

> Implementación y tests quedan en fases separadas; cada fase es verificable por sí sola.

## Fase 1 — Canónica y tier `minimo` (implementación)

- [x] En los diez `agents/*.md`, reemplazar la línea `model:` por
      `model: commandcode/deepseek/deepseek-v4.1-flash`. Incluye los dos archivos que hoy declaran
      `opencode-go/minimax-m3` (`agents/coder.md:4`, `agents/technical-seed-writer.md:4`).
      Listo cuando los diez declaran el mismo valor y ninguna otra línea del frontmatter cambia.
- [x] En `src/cli/index.js`, actualizar los diez valores de `TIERS.minimo` (bloque en
      `src/cli/index.js:595-606`) a `commandcode/deepseek/deepseek-v4.1-flash`.
      NO tocar `TIERS.normal` (`582-594`) ni `TIERS.gratis` (`607-618`).
- [x] Mover el objeto `TIERS` (`src/cli/index.js:582-619`) a `src/core/tier-models.js`, exportarlo
      como `TIERS` e importarlo en `src/cli/index.js` (`import { TIERS } from '../core/tier-models.js'`).
      Listo cuando `src/cli/index.js` no declara `TIERS` y los valores de `normal` y `gratis` son
      idénticos byte a byte a los actuales.
- [x] Confirmar que `applyTier` (`src/cli/index.js:625-634`) queda sin cambios: ya evita escribir
      cuando el contenido resultante es igual. No agregar lógica nueva de no-op ni un gate de host.

## Fase 2 — Oráculo de `check` (implementación)

- [x] En `checkAgentsFrontmatter` (`src/cli/index.js:2939-2981`), calcular
      `esperado = adaptFrontmatter(origen, host, 'agents', name)` sin inyectar el tier, conservando
      las notas de host (`COPILOT_MODEL_NOTE`, `COMMANDCODE_MODEL_NOTE`, `CAVEMAN_USAGE_NOTE`).
- [x] En `checkAgentsFrontmatter`, cuando `.ancletorc` declare `profile: test`, leer la fuente
      esperada de `tester` y `reviewer` desde `profiles/test/agents/<n>.md` en lugar de
      `agents/<n>.md`; los otros ocho siguen contra `agents/<n>.md`. Ese origen produce el estado
      esperado `esperado`, sin tier.
- [x] Para `opencode` con tier conocido en `.opencode/.ancleto-tier`, calcular además `conTier` con
      el modelo del tier (misma sustitución de `^model: .*$` que usa `applyTier`) para **todos** los
      agentes del directorio, incluidos `tester` y `reviewer` cuando el overlay del perfil esté
      activo. No excluir el overlay del cálculo: `install`/`update` aplican el tier también a esos
      dos.
- [x] Reportar divergencia sólo cuando el instalado difiera de `esperado` y de `conTier`. Un
      instalado igual a `conTier` NO es divergencia, tampoco para los agentes del overlay.
- [x] Cuando el modelo de tier de al menos un agente difiera de su fuente esperada (la canónica o,
      para el overlay, el perfil), emitir un único aviso por directorio de agents, con el formato
      `⚠ <dirRel> (tier '<tier>' aplica un modelo distinto al de su fuente en <n> agentes; install/update reescribirá model:)`,
      donde `<n>` es la cantidad de agentes de ese directorio cuyo modelo de tier difiere de su
      fuente esperada. No emitir el aviso cuando ningún agente difiera (p. ej. `minimo` sin overlay).
- [x] Mantener el exit code de `check` sin cambios: ni la divergencia ni el aviso de tier lo alteran.
- [x] Verificar que el aviso de tier se emite tanto si el mirror está en estado esperado como si
      está en estado del tier (la diferencia nunca queda silenciosa), incluido el overlay.

## Fase 3 — Guard estructural (tests nuevos)

- [x] Crear `test/agent-model-coherence.test.js`. Debe derivar los nombres y el `model:` de cada
      `agents/*.md` versionado, sin codificar identificadores de proveedor.
- [x] Importar `{ TIERS }` desde `../src/core/tier-models.js` en el guard; no importar
      `src/cli/index.js` (su dispatch de `process.argv` se ejecuta al importar) ni parsear el literal
      con regex.
- [x] Afirmar que el test no contiene identificadores de proveedor como literales y que no lee
      `.opencode/**`.
- [x] Afirmar que el conjunto de nombres de `TIERS.minimo` es igual al conjunto de `agents/*.md`
      (ni faltantes ni sobrantes).
- [x] Afirmar que el valor de `TIERS.minimo` de cada agente es igual a su `model:` canónico.
- [x] Afirmar que la canónica declara un único modelo distinto entre los diez agentes.
- [x] El test NO SHALL leer `.opencode/**` ni escribir archivos; sus únicas entradas son archivos
      versionados.
- [x] Afirmar el dueño único de `TIERS`: escanear todos los `src/**/*.js` (tolerando `const`, `let`,
      `Object.freeze(` y declaraciones multilínea) y exigir que sólo `src/core/tier-models.js` lo
      declare y exporte; ningún otro archivo lo declara.
- [x] Afirmar que `profiles/test/agents/tester.md` y `profiles/test/agents/reviewer.md` existen como
      overlay deliberado del perfil `test`, y que el guard no los incluye en el conjunto canónico ni
      codifica su identificador de proveedor.

## Fase 4 — Tests existentes y comportamiento (tests)

- [x] En `test/cli.test.js:204-206`, `225-227` y `384-386`, dejar de asertar
      `^model: opencode-go/` sobre la canónica: asertar que la canónica declara un `model:` no vacío
      (el valor exacto lo cubre el guard estructural), sin duplicar el identificador de proveedor.
- [x] Revisar los asserts que quedan vacíos al desaparecer `opencode-go/` del origen
      (`test/cli.test.js:215`, `236`, `403`, `489`) y reemplazarlos por el invariante real del
      adaptador: el modelo se omite (claude/vscode) o es `inherit` (antigravity). No dejar asserts
      tautológicos.
- [x] En `test/cli.test.js:814-815`, `3041-3042` y `3099-3100`, reemplazar el literal
      `opencode-go/deepseek-v4.1-flash` por la igualdad byte a byte con `agents/orchestrator.md` más
      las notas de host que correspondan (tier `minimo` == canónica; p. ej. `CAVEMAN_USAGE_NOTE`
      cuando la compresión está habilitada), conservando la intención original.
- [x] Agregar un test de `check` con tier `gratis`: sin `frontmatter diverge del adaptador`, con el
      aviso de tier y exit 0.
- [x] Agregar un test de `check` con mirror canónico y tier distinto: aviso de tier presente y exit
      0 (diferencia nunca silenciosa).
- [x] Agregar un test de `check` con `model:` del mirror distinto de la canónica y del tier:
      divergencia `frontmatter diverge del adaptador` y exit 0.
- [x] Agregar un test de `check` con tier `minimo`: sin aviso de tier y sin divergencia (sin overlay
      de perfil).
- [x] Agregar un test de `upgrade`: editar el `model:` de un mirror, ejecutar `ancleto upgrade` y
      afirmar que el mirror vuelve a ser byte-idéntico a la adaptación de `agents/<n>.md` más las
      notas de host que correspondan (p. ej. `CAVEMAN_USAGE_NOTE` cuando la compresión está
      habilitada).
- [x] Ajustar el test `check pasa 100% despues de upgrade` (`test/cli.test.js:2925-2935`) si el nuevo
      aviso de tier aparece; con `minimo` no debe aparecer.
- [x] Agregar un test de caracterización con `profile: test`: tras `ancleto upgrade`,
      `.opencode/agents/tester.md` y `reviewer.md` son byte-idénticos a
      `profiles/test/agents/tester.md` y `reviewer.md` (el perfil se instala verbatim), y los otros
      ocho son byte-idénticos a la adaptación de `agents/<n>.md` más las notas de host que
      correspondan. La identidad con el perfil se afirma **sólo después de `upgrade`, sin tier**.
- [x] Agregar un test de `check` **post-`install`** con `profile: test` y `--tier minimo` (no
      post-`upgrade`): NO reporta `frontmatter diverge del adaptador`, emite el aviso de tier con
      `n = 2` (tester y reviewer difieren de su fuente de perfil) y completa con exit 0.
- [x] Agregar un test de `check` **post-`install`** con `profile: test` y `--tier gratis`: NO reporta
      `frontmatter diverge del adaptador`, emite el aviso de tier con `n = 10` incluyendo a los dos
      agentes del overlay y completa con exit 0.
- [x] Eliminar los asserts duplicados de `model: inherit` en `test/cli.test.js:398/405` y
      `486/491`, dejando uno por bloque.
- [x] Ejecutar los tests acotados con rutas explícitas:
      `node --test test/agent-model-coherence.test.js test/cli.test.js`.

## Fase 5 — Documentación (implementación)

- [x] En `README.md:516-531`, actualizar la tabla de modelos: la columna `minimo` pasa a
      `commandcode/deepseek/deepseek-v4.1-flash` para los diez agentes; el texto introductorio deja de
      sugerir que el tier reescribe modelos en cada `update` sin aviso.
- [x] En `README.md`, aclarar que `commandcode/deepseek/deepseek-v4.1-flash` es el default publicado
      (canónica) y que `normal`/`gratis` quedan con sus proveedores actuales.
- [x] En `README.md` y `AGENTS.md`, hacer explícita la distinción: "default publicado" es el valor
      `model:` de los archivos canónicos `agents/*.md` (lo que materializa `upgrade`), NO el tier
      que un `install` sin `--tier` selecciona (`normal` es el tier por defecto).
- [x] En `AGENTS.md:118-146`, corregir la afirmación de que la instalación global gana: en este setup
      gana el mirror del proyecto (`.opencode/agents/*.md`), verificado con `opencode debug config`.
- [x] En `AGENTS.md`, actualizar la descripción de `ancleto check`: reporta divergencia cuando el
      mirror se aparta de la canónica y emite un aviso separado cuando el tier configurado aplicaría
      otro modelo. Mantener que `ancleto upgrade` no aplica tier.
- [x] Confirmar que `templates/AGENTS.md` no contiene la sección ni la afirmación obsoleta; si
      apareciera, reportarlo antes de agregarlo al file-set.

## Fase 6 — Regeneración del mirror (operación)

- [x] Ejecutar `node src/cli/index.js upgrade` en la raíz del repo. No editar `.opencode/**` a mano.
- [x] Verificar que los diez `.opencode/agents/*.md` declaran
      `model: commandcode/deepseek/deepseek-v4.1-flash` y coinciden con la adaptación de la canónica
      más las notas de host que correspondan (p. ej. `CAVEMAN_USAGE_NOTE` en `orchestrator` porque
      la compresión está habilitada).
- [x] Ejecutar `node src/cli/index.js check` y confirmar `0 faltantes`, sin
      `frontmatter diverge del adaptador` y sin aviso de tier (tier `minimo` == canónica).
- [x] Confirmar que `.opencode/**`, `.ancleto/**` y los artefactos locales regenerados no se
      commitean; sólo se conservan los paths autorizados.

## Fase 7 — Validación declarada

- [x] Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- [x] Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test`; para validación acotada,
      `node --test test/agent-model-coherence.test.js test/cli.test.js`, nunca `node --test` a secas.
- [x] Confirmar que `src/core/tier-models.js` es el único dueño de `TIERS` (ninguna otra declaración
      del objeto en el repo) y que los valores de `normal` y `gratis` no cambiaron.
- [x] Registrar Format como `not-configured` y Typecheck como no aplicable, según `PRODUCT.md` →
      `## Project Commands`.
- [x] Confirmar que `src/core/adapters/frontmatter.js`, `test/adapters-frontmatter.test.js`,
      `TIERS.normal`, `TIERS.gratis`, `.opencode/**` editado a mano, `~/.config/opencode/**` y
      `opencode.json` no fueron modificados.
