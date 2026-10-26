import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMachineEnv } from '../src/core/machine-env.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ARTIFACT_SKILLS = [
  'ancleto-propose',
  'ancleto-new',
  'ancleto-continue',
  'ancleto-ff',
  'ancleto-archive',
  'ancleto-sync-specs',
  'ancleto-bulk-archive',
  'ancleto-explore',
  'ancleto-onboard',
  'ancleto-upgrade',
  'ancleto-update'
]

function mdFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...mdFiles(p))
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

const CONTENT_FILES = [
  ...mdFiles(join(ROOT, 'skills')),
  ...mdFiles(join(ROOT, 'commands')),
  ...mdFiles(join(ROOT, 'agents'))
]

describe('content guards — idioma de artefactos', () => {
  it('spec-writer referencia la fuente unica del idioma (no redeclara el literal)', () => {
    const t = readFileSync(join(ROOT, 'agents', 'spec-writer.md'), 'utf8')
    assert.match(t, /LOCKED: artifacts-language/)
    assert.match(t, /AGENTS\.md/)
    assert.doesNotMatch(t, /All artifact content MUST be written in English/, 'no debe quedar la regla vieja')
  })

  it('documenter referencia la fuente unica del idioma (no redeclara el literal)', () => {
    const t = readFileSync(join(ROOT, 'agents', 'documenter.md'), 'utf8')
    assert.match(t, /LOCKED: artifacts-language/)
    assert.match(t, /AGENTS\.md/)
    assert.doesNotMatch(t, /spec artifacts are written in English/, 'no debe quedar la regla vieja')
  })

  it('las skills que escriben artefactos referencian la fuente unica del idioma', () => {
    for (const s of ARTIFACT_SKILLS) {
      const p = join(ROOT, 'skills', s, 'SKILL.md')
      assert.ok(existsSync(p), `falta ${s}`)
      const t = readFileSync(p, 'utf8')
      assert.match(t, /\*\*Artifacts language\*\*/, `${s} sin linea de idioma`)
      assert.match(t, /LOCKED: artifacts-language/, `${s} no referencia la fuente unica`)
      assert.match(t, /AGENTS\.md/, `${s} no referencia AGENTS.md`)
      assert.doesNotMatch(t, /write every artifact in English/, `${s} con la regla vieja`)
    }
  })

  it('templates/AGENTS.md declara el idioma en un bloque LOCKED', () => {
    const t = readFileSync(join(ROOT, 'templates', 'AGENTS.md'), 'utf8')
    assert.match(t, /Idioma de los artifacts/)
    assert.match(t, /no se traducen/)
    assert.match(t, /<!-- LOCKED: artifacts-language -->/)
  })

  it('el orchestrator resuelve y propaga el idioma de los artifacts', () => {
    const t = readFileSync(join(ROOT, 'agents', 'orchestrator.md'), 'utf8')
    assert.match(t, /### Artifacts Language/)
    assert.match(t, /first up to 3 messages/)
    assert.match(t, /Resolved Context Envelope/)
  })

  it('templates/AGENTS.md define la frontera memoria del repo vs del agente (issue #16)', () => {
    const t = readFileSync(join(ROOT, 'templates', 'AGENTS.md'), 'utf8')
    assert.match(t, /Frontera: memoria del repo vs memoria del agente/)
    assert.match(t, /una entrada vive en una sola memoria/i)
    assert.match(t, /\.ancleto\/memory\.db/)
    assert.match(t, /engram/)
  })

  it('memory-keeper referencia la frontera de memoria (issue #16)', () => {
    const t = readFileSync(join(ROOT, 'agents', 'memory-keeper.md'), 'utf8')
    assert.match(t, /\*\*Boundary:\*\*/)
    assert.match(t, /never duplicated there/)
    assert.match(t, /engram/)
  })
})

describe('content guards — referencias validas', () => {
  it('ningun archivo invoca un CLI aspec inexistente', () => {
    const backticked = /`aspec (list|show|validate|archive|new|update|view|diff)\b/
    const lineStart = /^\s*aspec (list|show|validate|archive|new|update|view|diff)\b/m
    for (const f of CONTENT_FILES) {
      const t = readFileSync(f, 'utf8')
      const rel = f.replace(ROOT, '')
      assert.doesNotMatch(t, backticked, `CLI inexistente en ${rel}`)
      assert.doesNotMatch(t, lineStart, `CLI inexistente en ${rel}`)
    }
  })

  it('ningun archivo referencia tools de otro runtime', () => {
    for (const f of CONTENT_FILES) {
      const t = readFileSync(f, 'utf8')
      assert.doesNotMatch(t, /AskUserQuestion/, `tool ajeno en ${f.replace(ROOT, '')}`)
    }
  })

  it('cada comando wrapper apunta a una skill existente', () => {
    const skills = readdirSync(join(ROOT, 'skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    const commands = readdirSync(join(ROOT, 'commands')).filter((n) => n.endsWith('.md'))
    // Excepcion documentada (cross-machine-export-import): cleto-transplant no
    // envuelve una skill — instruye al agente a correr el CLI (export/import),
    // cuya logica requiere spawnear procesos y no vive en markdown.
    const NON_SKILL_COMMANDS = ['cleto-transplant.md']
    assert.equal(commands.length, 15 + NON_SKILL_COMMANDS.length)
    for (const c of commands) {
      const t = readFileSync(join(ROOT, 'commands', c), 'utf8')
      if (NON_SKILL_COMMANDS.includes(c)) {
        assert.match(t, /ancleto (export|import)/, `${c} debe instruir el CLI export/import`)
        continue
      }
      const m = t.match(/Invoke the `(ancleto-[\w-]+)` skill/)
      assert.ok(m, `${c} no es un wrapper valido`)
      assert.ok(skills.includes(m[1]), `${c} apunta a skill inexistente: ${m[1]}`)
    }
  })
})

describe('content guards - matriz de permisos de agentes (issue #13)', () => {
  const readAgent = (name) => readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8')

  it('coder tiene bash con allowlist y deny de lo destructivo', () => {
    const t = readAgent('coder')
    assert.match(t, /^tools:\n(?:.*\n)*?  bash: true$/m, 'coder debe tener bash: true')
    assert.match(t, /permission:\n  bash:/, 'coder debe declarar permission.bash')
    assert.match(t, /'\*': allow/, 'coder: allow base')
    for (const denied of ['*az *', '*git push*', '*git reset*', '*git checkout*', '*git rebase*', '*rm -rf*', '*npm publish*']) {
      assert.ok(t.includes(`'${denied}': deny`), `coder debe denegar ${denied}`)
    }
  })

  it('coder documenta el uso de bash y sus limites', () => {
    const t = readAgent('coder')
    assert.match(t, /You have Bash for \*\*building and validating/)
    assert.match(t, /Do \*\*not\*\* use Bash for:/)
    assert.doesNotMatch(t, /You do not have Bash/, 'no debe quedar la regla vieja')
  })

  it('orchestrator, reviewer y spec-writer siguen sin bash', () => {
    for (const name of ['orchestrator', 'reviewer', 'spec-writer']) {
      const t = readAgent(name)
      assert.match(t, /^tools:\n(?:.*\n)*?  bash: false$/m, `${name} debe seguir sin bash`)
    }
  })

  it('el orchestrator refleja que el coder self-valida sin reemplazar al tester', () => {
    const t = readAgent('orchestrator')
    assert.match(t, /`@coder` owns feature implementation and may build\/validate its own work/)
    assert.match(t, /does not replace the `@tester` stage/)
  })
})

describe('content guards - tope de output y destilado del retorno (issues #25 y #26)', () => {
  const readAgent = (name) => readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8')

  const OUTPUT_CONTRACT_AGENTS = [
    'coder',
    'tester',
    'reviewer',
    'spec-writer',
    'documenter',
    'memory-keeper',
    'context-resolver',
    'technical-discovery',
    'technical-seed-writer'
  ]

  it('cada contrato de salida declara un tope explicito con cifras (D1)', () => {
    for (const name of OUTPUT_CONTRACT_AGENTS) {
      const t = readAgent(name)
      const m = t.match(/\*\*Output cap\*\*:([^\n]*)/)
      assert.ok(m, `${name} no declara **Output cap**`)
      assert.match(m[1], /\d/, `${name}: el tope debe incluir al menos una cifra`)
    }
  })

  it('el tope vive dentro de la seccion de output de cada agente (D1)', () => {
    for (const name of OUTPUT_CONTRACT_AGENTS) {
      const t = readAgent(name)
      const section = t.search(/^## Output( Expectations)?$/m)
      assert.ok(section >= 0, `${name} no tiene seccion de output`)
      const cap = t.indexOf('**Output cap**')
      assert.ok(cap > section, `${name}: **Output cap** debe estar dentro de la seccion de output`)
    }
  })

  it('el orchestrator destila el retorno de subagentes antes de reinyectarlo (D2)', () => {
    const t = readAgent('orchestrator')
    assert.match(t, /### Handling subagent returns/)
    assert.match(t, /Never copy a subagent's raw return/)
    assert.match(t, /distilled fields only/)
    assert.match(t, /\*\*Output cap\*\*/)
  })

  it('el destilado preserva los campos criticos del flujo (D2)', () => {
    const t = readAgent('orchestrator')
    for (const field of ['task-owned files', 'Validation Ledger', 'SPEC UPDATE RECOMMENDED', 'SEED_ACTION_REQUIRED', 'GUARANTEE NOT SUSTAINED']) {
      assert.ok(t.includes(field), `falta ${field} en el contrato de destilado`)
    }
  })
})

describe('content guards - frescura del seed al archivar (issue #17)', () => {
  it('templates/AGENTS.md es la fuente unica de la frescura del seed', () => {
    const t = readFileSync(join(ROOT, 'templates', 'AGENTS.md'), 'utf8')
    assert.match(t, /<!-- LOCKED: seed-freshness -->/)
    assert.match(t, /impact: material/)
    assert.match(t, /impact: minor/)
    assert.match(t, /nunca de forma automática/i)
  })

  it('la skill ancleto-archive delega la regla a su fuente unica y corre el check', () => {
    const t = readFileSync(join(ROOT, 'skills', 'ancleto-archive', 'SKILL.md'), 'utf8')
    assert.match(t, /ancleto discovery --check/)
    assert.match(t, /LOCKED: seed-freshness/)
    assert.match(t, /AGENTS\.md/)
  })

  it('el orchestrator delega la frescura del seed a la fuente unica', () => {
    const t = readFileSync(join(ROOT, 'agents', 'orchestrator.md'), 'utf8')
    assert.match(t, /Check the seed freshness before closing/)
    assert.match(t, /LOCKED: seed-freshness/)
    assert.match(t, /AGENTS\.md/)
  })
})

describe('content guards - guia de .gitignore (issue #18)', () => {
  it('README documenta la guia y que la decision es del proyecto', () => {
    const t = readFileSync(join(ROOT, 'README.md'), 'utf8')
    assert.match(t, /## Guía de \.gitignore/)
    assert.match(t, /es una decisión del proyecto/i)
    assert.match(t, /`aspec\/`/)
    assert.match(t, /`\.ancleto\/`/)
  })
})

describe('content guards - keywords canonicos en specs (issue #21)', () => {
  it('verify detecta specs no canonicos al verificar', () => {
    const t = readFileSync(join(ROOT, 'skills', 'ancleto-verify', 'SKILL.md'), 'utf8')
    assert.match(t, /ancleto specs check --change <name> --json/)
    assert.match(t, /Non-canonical spec:/)
    assert.match(t, /WARNING with the same recommendation/)
  })

  it('archive chequea keywords antes de sincronizar deltas', () => {
    const t = readFileSync(join(ROOT, 'skills', 'ancleto-archive', 'SKILL.md'), 'utf8')
    assert.match(t, /ancleto specs check --change <name> --json/)
    assert.match(t, /Never merge into a non-canonical spec silently/)
  })

  it('documenter corre el chequeo antes de mergear deltas', () => {
    const t = readFileSync(join(ROOT, 'agents', 'documenter.md'), 'utf8')
    assert.match(t, /ancleto specs check --change \{change-name\} --json/)
    assert.match(t, /stop and report it instead of merging into it/)
  })

  it('spec-writer se autoverifica antes de devolver', () => {
    const t = readFileSync(join(ROOT, 'agents', 'spec-writer.md'), 'utf8')
    assert.match(t, /verify every generated spec uses the canonical keywords/)
  })
})

describe('content guards - telemetria de tokens (issue #27)', () => {
  it('README documenta ancleto stats y su alcance (opencode)', () => {
    const t = readFileSync(join(ROOT, 'README.md'), 'utf8')
    assert.match(t, /ancleto stats/)
    assert.match(t, /tokens de entrada\/salida\/razonamiento\/cache/)
    assert.match(t, /Solo funciona con opencode/)
  })
})

describe('content guards - seed: sin oferta con impact minor (Release 1)', () => {
  it('el orchestrator no ofrece regenerar con impact minor (tabla de estado del seed)', () => {
    const t = readFileSync(join(ROOT, 'agents', 'orchestrator.md'), 'utf8')
    assert.match(t, /`STALE` \(minor\)/)
    assert.match(t, /do not offer regeneration/)
  })

  it('la fuente unica distingue minor de material y no regenera automatico', () => {
    const t = readFileSync(join(ROOT, 'templates', 'AGENTS.md'), 'utf8')
    assert.match(t, /impact: minor/)
    assert.match(t, /impact: material/)
    assert.match(t, /nunca de forma automática/i)
  })

  it('la skill technical-discovery distingue minor de material', () => {
    const t = readFileSync(join(ROOT, 'skills', 'ancleto-technical-discovery', 'SKILL.md'), 'utf8')
    assert.match(t, /`STALE` with `impact: minor`/)
    assert.match(t, /`STALE` with `impact: material`/)
  })

  it('technical-discovery emite el marker solo con impacto material', () => {
    const t = readFileSync(join(ROOT, 'agents', 'technical-discovery.md'), 'utf8')
    assert.match(t, /stale with material impact/)
    assert.match(t, /`STALE` with `impact: minor`/)
    assert.match(t, /with its `impact` and `affectedDocs`/)
  })
})

describe('content guards - regeneracion parcial (Release 2)', () => {
  it('seed-writer reescribe solo affectedDocs con impact minor y escribe seed-map', () => {
    const t = readFileSync(join(ROOT, 'agents', 'technical-seed-writer.md'), 'utf8')
    assert.match(t, /`impact: minor` with a non-empty `affectedDocs` list, rewrite ONLY those documents/)
    assert.match(t, /Write `seed-map\.json` in `config\.outputDir`/)
  })

  it('la pipeline exige seed-map.json tras generar', () => {
    const t = readFileSync(join(ROOT, 'skills', 'ancleto-technical-discovery', 'references', 'generation-pipeline.md'), 'utf8')
    assert.match(t, /when the check report lists `affectedDocs`, those are the only documents to rewrite/)
    assert.match(t, /write `seed-map\.json` in `config\.outputDir`/)
  })

  it('el checklist valida seed-map.json', () => {
    const t = readFileSync(join(ROOT, 'skills', 'ancleto-technical-discovery', 'references', 'validation-checklist.md'), 'utf8')
    assert.match(t, /`seed-map\.json` exists and maps each seed document to its source areas/)
  })

  it('el orchestrator pasa affectedDocs en la regeneracion aprobada', () => {
    const t = readFileSync(join(ROOT, 'agents', 'orchestrator.md'), 'utf8')
    assert.match(t, /pass them so an approved regeneration stays scoped to those documents/)
  })
})

describe('content guards - registro de proyectos', () => {
  it('README documenta ancleto projects y su registro local', () => {
    const t = readFileSync(join(ROOT, 'README.md'), 'utf8')
    assert.match(t, /## Proyectos con ancleto/)
    assert.match(t, /ancleto projects scan/)
    assert.match(t, /ancleto projects prune/)
    assert.match(t, /~\/\.config\/ancleto\/projects\.json/)
  })
})

describe('content guards - discovery --check devuelve config', () => {
  it('README documenta el estado completo del check', () => {
    const t = readFileSync(join(ROOT, 'README.md'), 'utf8')
    assert.match(t, /ancleto discovery --check # Estado del technical seed \(READY \/ STALE \/ PARTIAL \/ MISSING\) \+ config/)
  })

  it('la skill technical-discovery usa la config del check report', () => {
    const t = readFileSync(join(ROOT, 'skills', 'ancleto-technical-discovery', 'SKILL.md'), 'utf8')
    assert.match(t, /ancleto discovery --check/)
  })
})

describe('content guards - garantía del proposal vs modelo real (reviewer-guarantee-vs-model)', () => {
  const readAgent = (name) => readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8')

  it('el reviewer declara el flag GUARANTEE NOT SUSTAINED como CRITICAL y nombra garantía, operación y estado', () => {
    const t = readAgent('reviewer')
    assert.match(t, /## Guarantee Verification Under the Real Model/)
    assert.match(t, /`GUARANTEE NOT SUSTAINED` at severity `CRITICAL`/)
    assert.match(
      t,
      /the proposal's guarantee, \(b\) the operation that falsifies it, and \(c\) the protected state/
    )
  })

  it('el flag no se degrada a WARNING ni se omite por quedar fuera del diff o de los task-owned files', () => {
    const t = readAgent('reviewer')
    assert.match(t, /Do not downgrade it to `WARNING`/)
    assert.match(
      t,
      /do not omit it because the falsifying operation falls outside the diff or the `task-owned files`/
    )
    assert.match(t, /This scope limit does not apply to a `GUARANTEE NOT SUSTAINED` finding/)
  })

  it('el reviewer declara la señal S1 ∧ S2 con ambas condiciones y que S1 sola no alcanza', () => {
    const t = readAgent('reviewer')
    assert.match(t, /### Applicability signal: `S1 ∧ S2`/)
    assert.match(t, /`S1` alone over-fires and is \*\*not\*\* sufficient/)
    assert.match(t, /writes or acts by an identity \*\*not bounded\*\*/)
    assert.match(t, /on a store whose read-model is a filtered or ordered projection/)
  })

  it('el invariante negativo excluye changes simples, doc-only y cosmeticos', () => {
    const t = readAgent('reviewer')
    assert.match(t, /Without `S1 ∧ S2` you MUST NOT run the model analysis/)
    assert.match(t, /simple, doc-only, and cosmetic changes are excluded and pay no extra reading cost/)
  })

  it('el analisis aplica solo en modo aspec Change y es adicional a la consistencia con el delta spec', () => {
    const t = readAgent('reviewer')
    assert.match(t, /This section applies \*\*only\*\* in `aspec Change` mode/)
    assert.match(t, /Do not run it for `direct-implementation` or `direct-test-only` work/)
    assert.match(
      t,
      /This verification is \*\*additional\*\* to the implementation↔delta-spec consistency check and does not replace it/
    )
  })

  it('el reviewer exige leer más allá del diff y reportar el contexto faltante', () => {
    const t = readAgent('reviewer')
    assert.match(t, /not limited\*\* to the diff/)
    assert.match(t, /report the missing context to `@orchestrator`/)
  })

  it('el orchestrator propaga la garantía y el estado protegido solo cuando el change declara garantías', () => {
    const t = readAgent('orchestrator')
    assert.match(
      t,
      /When the change declares effect guarantees, additionally include, as separate fields, the guarantee extracted from the proposal, the protected state, and the affected capability/
    )
  })

  it('el orchestrator trata GUARANTEE NOT SUSTAINED como bloqueo y delega el contrato de salida', () => {
    const t = readAgent('orchestrator')
    assert.match(
      t,
      /\*\*MUST STOP\*\* if `@reviewer` reports critical issues \(including a `GUARANTEE NOT SUSTAINED` finding\)/
    )
    assert.match(t, /do not advance toward archive while it is present/)
    assert.match(t, /flags \(`SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED`, `GUARANTEE NOT SUSTAINED`\)/)
    assert.match(t, /### Expected output — owned by each agent/)
  })
})

describe('content guards - dedupe del orquestador (token-budget)', () => {
  it('Runtime Safety tiene un único hogar y el Workflow sólo lo referencia', () => {
    const t = readFileSync(join(ROOT, 'agents', 'orchestrator.md'), 'utf8')
    const declarations = t.match(/runtime environment indicates plan mode, read-only mode/g) || []
    assert.equal(declarations.length, 1, 'la regla de plan/read-only debe declararse una sola vez')
    assert.match(t, /apply the \*\*Runtime Safety\*\* rule declared once in Enforcement Rules/)
  })
})

describe('content guards - compresión host-scoped (token-budget)', () => {
  it('la directiva existe en su fuente y se materializa sólo por la compuerta de compresión', () => {
    const cli = readFileSync(join(ROOT, 'src', 'cli', 'index.js'), 'utf8')
    // Positivo: donde hay tool, hay instrucción — la directiva existe en su fuente.
    assert.match(cli, /Compresión de contexto \(tool del host\)/)
    assert.match(cli, /caveman_\*/)
    // Acotada a los hosts de la excepción vigente (opencode/antigravity)...
    assert.match(cli, /COMPRESSION_HOSTS = new Set\(\['opencode', 'antigravity'\]\)/)
    // ...y con la compresión del tramo como única compuerta de materialización.
    assert.match(cli, /if \(compression[^\n]*\)[^\n]*CAVEMAN_USAGE_NOTE/)
  })

  it('ningún asset compartido entre hosts contiene la directiva de compresión', () => {
    const shared = [
      join(ROOT, 'AGENTS.md'),
      ...mdFiles(join(ROOT, 'templates')),
      ...mdFiles(join(ROOT, 'agents')),
      ...mdFiles(join(ROOT, 'skills')),
      ...mdFiles(join(ROOT, 'commands'))
    ]
    for (const f of shared) {
      const rel = f.replace(ROOT, '')
      const t = readFileSync(f, 'utf8')
      assert.doesNotMatch(t, /caveman_\*/, `directiva de compresión filtrada a ${rel}`)
      assert.doesNotMatch(t, /Compresión de contexto \(tool del host\)/, `directiva de compresión filtrada a ${rel}`)
    }
  })
})

describe('content guards - contrato de validaciones declarativo', () => {
  const readAgent = (name) => readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8')
  const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8')

  it('templates/AGENTS.md declara la política declarativa en un bloque LOCKED', () => {
    const t = read('templates', 'AGENTS.md')
    assert.match(t, /<!-- LOCKED: validation-commands -->/)
    assert.match(t, /<!-- \/LOCKED: validation-commands -->/)
    assert.match(t, /PRODUCT\.md/)
    assert.match(t, /## Project Commands/)
    assert.match(t, /not-configured/)
    assert.match(t, /nunca se\s+inventa/i)
  })

  it('templates/AGENTS.md no fija un typecheck ni un formatter concreto', () => {
    const t = read('templates', 'AGENTS.md')
    assert.doesNotMatch(t, /npm run typecheck/)
    assert.doesNotMatch(t, /npx tsc --noEmit/)
    assert.doesNotMatch(t, /Prettier/)
  })

  it('coder y tester usan el formatter/linter declarado y no hardcodean Prettier', () => {
    for (const name of ['coder', 'tester']) {
      const t = readAgent(name)
      assert.doesNotMatch(t, /Prettier/, `${name} no debe hardcodear Prettier`)
      assert.match(t, /PRODUCT\.md/, `${name} debe referenciar los comandos declarados`)
      assert.match(t, /## Project Commands/, `${name} debe referenciar ## Project Commands`)
    }
  })

  it('los templates de upgrade referencian los comandos declarados y no fijan comandos npm', () => {
    const t = read('skills', 'ancleto-upgrade', 'references', 'templates.md')
    assert.match(t, /PRODUCT\.md/)
    assert.match(t, /## Project Commands/)
    assert.doesNotMatch(t, /npx tsc --noEmit/)
    assert.doesNotMatch(t, /npm run build/)
    assert.doesNotMatch(t, /npm run lint/)
    assert.doesNotMatch(t, /npm run test:ci/)
    assert.doesNotMatch(t, /npm test/)
  })

  it('la skill ancleto-pr usa el comando de test declarado y no fija npm test', () => {
    const t = read('skills', 'ancleto-pr', 'SKILL.md')
    assert.doesNotMatch(t, /npm test/)
    assert.match(t, /PRODUCT\.md/)
    assert.match(t, /## Project Commands/)
  })

  it('PRODUCT.md alinea las validaciones con ## Project Commands sin typecheck ni nota stale', () => {
    const t = read('PRODUCT.md')
    assert.match(t, /## Project Commands/)
    assert.doesNotMatch(t, /npm run typecheck/)
    assert.doesNotMatch(t, /npx tsc --noEmit/)
    assert.doesNotMatch(t, /no define esos scripts/i)
  })

  it('security y upgrade (SKILL) referencian los comandos declarados y no fijan comandos concretos', () => {
    const sec = read('skills', 'ancleto-security', 'SKILL.md')
    assert.doesNotMatch(sec, /npm run lint/)
    assert.doesNotMatch(sec, /Prettier|ESLint/)
    assert.match(sec, /PRODUCT\.md/)
    assert.match(sec, /## Project Commands/)
    const up = read('skills', 'ancleto-upgrade', 'SKILL.md')
    assert.doesNotMatch(up, /build\/lint\/test\/test:ci\/typecheck/)
    assert.match(up, /PRODUCT\.md/)
    assert.match(up, /## Project Commands/)
  })

  it('templates/AGENTS.md acota la invocación de la suite (rutas explícitas, nunca node --test pelado)', () => {
    const t = read('templates', 'AGENTS.md')
    assert.match(t, /rutas explícitas/i)
    assert.match(t, /node --test/)
    assert.match(t, /sin acotar/i)
  })

  it('upgrade templates.md condiciona typecheck y la variante Nx a que el proyecto los declare', () => {
    const t = read('skills', 'ancleto-upgrade', 'references', 'templates.md')
    assert.match(t, /only if the project declares a typecheck command/)
    assert.match(t, /only when declared/i)
    assert.match(t, /declared target/i)
    assert.doesNotMatch(t, /npx nx affected/)
  })

  it('PRODUCT.md no duplica la lista de validaciones ni arrastra un conteo stale de la suite', () => {
    const t = read('PRODUCT.md')
    assert.match(t, /## Project Commands/)
    // El conteo de la suite no debe fijarse (evita staleness respecto de test/*.test.js).
    assert.doesNotMatch(t, /\d+\s+archivos de suite/i)
    // La seccion de guardrails referencia la fuente unica y NO reenumera comandos.
    const guardrails = t.split('## Critical Files & Guardrails')[1].split(/\n## /)[0]
    assert.match(guardrails, /## Project Commands/)
    assert.match(guardrails, /validation-commands/)
    assert.doesNotMatch(guardrails, /npm run lint|npm test/)
  })

  it('tester conserva la prioridad de verificación y el affected-set (dependientes)', () => {
    const t = readAgent('tester')
    assert.match(t, /Verification priority/)
    assert.match(t, /code the change AFFECTS/)
    assert.match(t, /affected set/)
  })
})

describe('content guards - throughput-pipeline', () => {
  const readAgent = (name) => readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8')

  it('el orchestrator declara la delegación paralela de finalización y memoria (sin serializar)', () => {
    const t = readAgent('orchestrator')
    assert.match(t, /Finalization \/ Archive ∥ Memory Record/)
    assert.match(t, /in parallel/)
    assert.match(t, /disjoint surfaces/)
    assert.match(t, /do not wait for one to finish before starting the other/)
    assert.match(t, /With no real candidate, delegate only `@documenter`/)
  })

  it('el orchestrator declara la memoria en un solo paso sin ping-pong Optional Draft sin candidato', () => {
    const t = readAgent('orchestrator')
    assert.match(t, /at most \*\*one\*\* memory call/)
    assert.match(t, /never chain Automatic Record → Optional Draft → approval → User-Approved Record when there is no candidate/)
    assert.match(t, /do \*\*not\*\* invoke Optional Draft/)
    assert.match(t, /Reserve User-Approved Record for an explicit user request/)
  })

  it('el tester declara el affected-set determinístico por grafo de imports con dependientes', () => {
    const t = readAgent('tester')
    assert.match(t, /deterministic `affected-set`/)
    assert.match(t, /transitive closure of \*\*dependents\*\* on the project's import graph/)
    assert.match(t, /ancleto affected/)
    assert.match(t, /same repository state plus the same seed yields the same set/)
    // Clasificador conservador por argumento: una llamada `import(`/`require(` es estática sólo si
    // su argumento es un string literal puro (tras espacios y comentarios) seguido de `)`; cualquier
    // otro argumento es `inconclusive`. El relativo irresoluble también es `inconclusive`; los
    // specifiers no relativos (paquetes/builtins/alias) son externos y NUNCA inconclusos.
    assert.match(t, /classifies each \*\*by its argument\*\*/)
    assert.match(t, /\*\*pure string literal followed by `\)`\*\*/)
    assert.match(t, /\*\*conservative by design\*\*/)
    // La frontera se fija en ambos lados: el argumento no literal es inconcluso…
    assert.match(t, /\*\*any other argument\*\*[\s\S]*?is `inconclusive`/)
    // …y el relativo irresoluble también lo es.
    assert.match(t, /An \*\*unresolved relative\*\* specifier is also `inconclusive`/)
    assert.match(t, /external by construction/)
    assert.match(t, /never `inconclusive`/)
  })

  it('el tester devuelve un Validation Ledger completo y cerrado con clasificación terminal', () => {
    const t = readAgent('tester')
    assert.match(t, /complete and closed\*\* Validation Ledger/)
    assert.match(t, /registered non-failure that closes that command/)
    assert.match(t, /`not-configured`/)
  })

  it('el reviewer consume el ledger prearmado cerrado y el affected-set como scope sin re-verificación dentro del scope', () => {
    const t = readAgent('reviewer')
    assert.match(t, /prearmed, closed Validation Ledger/)
    assert.match(t, /Review scope is the `affected-set` supplied by `@orchestrator`/)
    assert.match(t, /consume it as-is/)
    assert.match(t, /Do not request a re-delegation to `@tester`/)
    assert.match(t, /`not-configured` entry is a registered non-failure/)
    assert.match(t, /missing \*\*context\*\*/)
  })

  it('el orchestrator arma/verifica el cierre del ledger antes de delegar el review', () => {
    const t = readAgent('orchestrator')
    assert.match(t, /arm\/verify the prearmed Validation Ledger is closed/)
    assert.match(t, /do NOT delegate the review — stop at `@tester`/)
    assert.match(t, /`not-configured` entry closes that command/)
  })

  it('el memory-keeper declara el cierre paralelo sin depender del archive y Optional Draft solo a pedido', () => {
    const t = readAgent('memory-keeper')
    assert.match(t, /in parallel/)
    assert.match(t, /never need the archive's output/)
    assert.match(t, /Called only when the user explicitly requests an optional draft/)
  })
})

describe('content guards - machine environment block', () => {
  const readAgent = (name) => readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8')
  const AGENT_DEFS = readdirSync(join(ROOT, 'agents'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -'.md'.length))
    .sort()
  const BASH_AGENTS = ['coder', 'tester', 'documenter', 'context-resolver', 'technical-discovery', 'technical-seed-writer']
  const NO_BASH_AGENTS = ['reviewer', 'spec-writer', 'memory-keeper']
  const DELEGATABLE_AGENTS = AGENT_DEFS.filter((name) => name !== 'orchestrator')
  const CANONICAL = 'Before running any command, read `.ancleto/machine-env.md` if it exists and use it as the environment hint for shell, line endings, and tool availability.'
  const normalize = (text) => text.replace(/\s+/g, ' ')

  function machineSection() {
    const text = readAgent('orchestrator')
    // El heading real, no la mencion inline en `## Repository Reading Limit`.
    const start = text.indexOf('\n## Machine Environment')
    assert.ok(start >= 0, 'falta ## Machine Environment como heading')
    const end = text.indexOf('\n## ', start + 1)
    return text.slice(start + 1, end === -1 ? undefined : end)
  }

  const PRECEDENCE = /This hint prevails over generic shell guidance in `AGENTS\.md`, `PRODUCT\.md`, or an agent prompt, but never overrides security, authorization, validation, permissions, or explicit user instructions/

  it('las 10 definiciones de agente referencian el artefacto y su conducta ante ausencia', () => {
    assert.ok(AGENT_DEFS.length >= 10, 'se esperan al menos las 10 definiciones instalables')
    for (const name of AGENT_DEFS) {
      const text = normalize(readAgent(name))
      assert.ok(text.includes('.ancleto/machine-env.md'), `${name} no referencia el artefacto`)
      assert.ok(text.includes(CANONICAL), `${name} no declara la instruccion canonica`)
      assert.match(text, PRECEDENCE, `${name} no declara la precedencia generica`)
      assert.match(text, /If it does not exist, continue with the generic guidance and report its absence/, `${name} no declara la conducta ante ausencia`)
      assert.match(text, /report the declared shell and the exact command/, `${name} no declara el reporte por fallo de entorno`)
    }
  })

  it('la seccion Hint del bloque declara la misma precedencia sin valores de maquina', () => {
    const hint = renderMachineEnv({}).split('## Hint')[1]
    const text = normalize(hint)
    assert.match(text, /prevalece sobre indicaciones genericas de shell/)
    assert.match(text, /nunca sobre seguridad, autorizacion, validacion, permisos ni instrucciones explicitas del usuario/)
    assert.doesNotMatch(hint, /\bwin32\b|\bcrlf\b/i)
    assert.doesNotMatch(hint, /\bWindows PowerShell 5\.1\b|\bbash\/WSL\b|\b(?:x64|arm64)\b/)
  })

  it('ninguna definicion de agente contiene valores de la maquina', () => {
    for (const name of AGENT_DEFS) {
      const text = readAgent(name)
      assert.doesNotMatch(text, /\bwin32\b/, `${name} contiene la plataforma`)
      assert.doesNotMatch(text, /\bcrlf\b/i, `${name} contiene el EOL`)
      assert.doesNotMatch(text, /\bWindows PowerShell 5\.1\b/, `${name} contiene la variante de shell`)
      assert.doesNotMatch(text, /\bbash\/WSL\b/, `${name} contiene la variante WSL`)
      assert.doesNotMatch(text, /\b(?:x64|arm64)\b/, `${name} contiene la arquitectura`)
      assert.doesNotMatch(text, /\bno disponible — fallback:/, `${name} contiene la disponibilidad detectada`)
    }
  })

  it('el orquestador declara la seccion, la exencion del techo y la lista real de agentes con bash', () => {
    const section = machineSection()
    assert.match(section, /does not count against the three-repository-file reading ceiling/)
    for (const name of BASH_AGENTS) {
      assert.ok(section.includes(`@${name}`), `el orquestador no lista a @${name}`)
    }
    for (const name of NO_BASH_AGENTS) {
      assert.ok(section.includes(`@${name}`), `el orquestador no excluye a @${name}`)
    }
    assert.match(section, /verbatim/)
    assert.match(section, /read at runtime/)
  })

  it('el techo de lecturas exime Project Memory Rules y Machine Environment en ambas declaraciones', () => {
    const text = readAgent('orchestrator')
    const limitStart = text.indexOf('## Repository Reading Limit')
    assert.ok(limitStart >= 0, 'falta ## Repository Reading Limit')
    const limitEnd = text.indexOf('\n## ', limitStart + 1)
    const limit = text.slice(limitStart, limitEnd === -1 ? undefined : limitEnd)
    assert.match(limit, /`## Project Memory Rules`/)
    assert.match(limit, /`## Machine Environment`/)
    assert.match(limit, /do NOT consume this ceiling/)

    const neverStart = text.indexOf('### PROHIBITED ACTIONS')
    assert.ok(neverStart >= 0, 'falta ### PROHIBITED ACTIONS')
    const neverEnd = text.indexOf('\n### ', neverStart + 1)
    const never = text.slice(neverStart, neverEnd === -1 ? undefined : neverEnd)
    assert.match(never, /`## Project Memory Rules`/)
    assert.match(never, /`## Machine Environment`/)
    assert.match(never, /do not consume the ceiling/)
  })

  it('la lista de agentes con bash del orquestador coincide con las definiciones', () => {
    const enabled = DELEGATABLE_AGENTS.filter((name) => /^tools:\n(?:.*\n)*?  bash: true$/m.test(readAgent(name)))
    assert.deepEqual(enabled, [...BASH_AGENTS].sort())
    assert.deepEqual([...enabled, ...NO_BASH_AGENTS].sort(), DELEGATABLE_AGENTS)
    assert.match(readAgent('orchestrator'), /^tools:\n(?:.*\n)*?  bash: false$/m, 'el orquestador no ejecuta bash')
  })

  it('ninguna definicion de agente ordena escribir .gitignore', () => {
    for (const name of AGENT_DEFS) {
      assert.doesNotMatch(readAgent(name), /\.gitignore/, `${name} menciona .gitignore`)
    }
  })

  it('templates/AGENTS.md no incorpora el bloque de entorno', () => {
    const t = readFileSync(join(ROOT, 'templates', 'AGENTS.md'), 'utf8')
    assert.doesNotMatch(t, /machine-env\.md/)
    assert.doesNotMatch(t, /## Machine Environment/)
  })
})
