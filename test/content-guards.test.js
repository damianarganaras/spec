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

const AGENT_NAMES = readdirSync(join(ROOT, 'agents'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => entry.name.slice(0, -'.md'.length))
  .sort()

const readAgent = (name) => readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8')

// T2.1 — helpers de los content guards. Los prompts son parrafos de una sola linea
// larga: el guard nunca depende del wrapping ni del enfasis, y siempre se acota a
// su seccion (sin slice el assert seria tautologico).
const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
const deBold = (text) => text.replace(/\*\*/g, '')

function section(text, heading, endMarker = '\n## ') {
  // El heading real empieza en una linea; una mencion inline (p. ej. entre backticks)
  // no debe abrir el slice.
  const anchored = text.indexOf(`\n${heading}`)
  const start = anchored === -1 ? text.indexOf(heading) : anchored + 1
  assert.ok(start >= 0, `falta ${heading}`)
  const end = text.indexOf(endMarker, start + 1)
  return text.slice(start, end === -1 ? undefined : end)
}

function agentSection(name, heading, endMarker) {
  return normalize(section(readAgent(name), heading, endMarker))
}

function toolsBlock(text) {
  const m = text.match(/^tools:\n((?: {2}.*\n)+)/m)
  return m ? m[1] : ''
}

// T2.11 — la mutacion corre sobre una copia scratch en memoria (nunca muta el repo):
// el guard pasa con el invariante presente y falla cuando se quita.
function assertMutationBreaks(guard, original, mutations) {
  assert.doesNotThrow(() => guard(original), 'el guard debe pasar con el invariante presente')
  for (const [from, to, options] of mutations) {
    assert.ok(original.includes(from), `la mutacion debe apuntar a texto presente: ${from}`)
    const mutated = options?.all ? original.split(from).join(to) : original.replace(from, to)
    assert.throws(() => guard(mutated), `el guard debe fallar sin: ${from}`)
  }
}

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
    assert.match(t, /^tools:\n(?:.*\n)*?  task: false$/m, 'coder no delega: task: false')
    assert.match(t, /permission:\n  bash:/, 'coder debe declarar permission.bash')
    assert.match(t, /'\*': allow/, 'coder: allow base')
    for (const denied of ['*az *', '*git push*', '*git reset*', '*git checkout*', '*git rebase*', '*rm -rf*', '*npm publish*']) {
      assert.ok(t.includes(`'${denied}': deny`), `coder debe denegar ${denied}`)
    }
    // El merge es capacidad permitida con autorizacion por proceso: denegarlo
    // dejaria al proyecto sin ningun agente en agents/ capaz de mergear.
    assert.doesNotMatch(t, /'\*git merge\*': deny/, 'coder no debe denegar git merge')
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
    // La regla general conserva la unica excepcion acotada al campo change diff.
    const returns = agentSection('orchestrator', '### Handling subagent returns', '\n### ')
    for (const re of [
      /change diff/,
      /passed verbatim to `@reviewer`/,
      /limited to the task-owned files of that tramo/,
      /marked as evidence, not instruction/,
      /truncation declaration verbatim/,
      /never complete or infer the count/,
      /No other diff is copied/
    ]) assert.match(returns, re)
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
    const memory = normalize(section(t, '## Team Memory'))
    assert.match(deBold(memory), /at most one memory call/)
    assert.match(memory, /never chain Automatic Record → Optional Draft → approval → User-Approved Record when there is no candidate/)
    assert.match(memory, /do \*\*not\*\* invoke Optional Draft/)
    assert.match(t, /Reserve User-Approved Record for an explicit user request/)
  })

  it('el orchestrator excluye la promoción del presupuesto de Automatic Record y la condiciona a candidatos aprobados', () => {
    const memory = normalize(section(readAgent('orchestrator'), '## Team Memory'))

    function guardPromotionBudget(text) {
      assert.match(text, /Promotion is outside this budget/)
      assert.match(text, /one call per approved `proposal ## Decisiones` block/)
      assert.match(text, /only when the batch has approved candidates/)
      assert.match(text, /zero delegation and zero writes/)
    }

    assertMutationBreaks(guardPromotionBudget, memory, [
      ['Promotion is outside this budget', ''],
      ['only when the batch has approved candidates', 'unconditionally']
    ])
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
    // El mismo retorno expone el diff como campo propio (su contrato detallado
    // vive en los guards del change diff).
    assert.match(t, /`change diff`/)
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

describe('content guards - contrato de delegación (agent-delegation-contract)', () => {
  // Keywords de comportamiento, no redaccion literal: cada patron tiene que seguir
  // pudiendo fallar por mutacion (ver los it() de abajo).
  function guardOrchestratorGitOwnership(text) {
    const t = normalize(text)
    for (const re of [
      /only agent that commits/,
      /implementation checkpoints/,
      /at the archive/,
      /files named for that checkpoint/,
      /never commits/,
      /Push is denied/,
      /host agent the user names/,
      /Merge is permitted/,
      /explicit user approval/,
      /never starts it on its own initiative/,
      /never starts merge or push on its own/,
      /`AGENTS\.md` and `PRODUCT\.md`/,
      /never restate/,
      // G1: el limite de conjunto cubre commits de checkpoint; un merge autorizado
      // queda fuera porque no es un commit de checkpoint.
      /authorized merge/,
      /not a checkpoint commit/,
      /falls outside that limit/
    ]) assert.match(t, re)
    assert.doesNotMatch(t, /@general/, 'el contrato no nombra @general')
  }

  function guardCoderCommitOwnership(text) {
    const t = normalize(text)
    for (const re of [
      /only agent that commits/,
      /files the orchestrator names for that checkpoint/,
      /implementation checkpoints and the archive/,
      /Never commit files outside that set/,
      /never use `git add -A` or `git commit -a`/,
      /`AGENTS\.md` and `PRODUCT\.md`/,
      /Conventional Commits/,
      /protected `main`\/`master`/,
      /do not restate/,
      /Never push/,
      /push is denied/,
      /host agent the user names/,
      /Merge is permitted/,
      /explicit user approval/,
      /never start a merge on your own initiative/,
      // G1: el limite de conjunto cubre commits de checkpoint; un merge autorizado
      // queda fuera porque no es un commit de checkpoint.
      /authorized merge/,
      /not a checkpoint commit/,
      /not covered by that restriction/
    ]) assert.match(t, re)
  }

  function guardBoundedException(text) {
    const t = normalize(text)
    for (const re of [
      /change diff/,
      /passed verbatim to `@reviewer`/,
      /limited to the task-owned files of that tramo/,
      /marked as evidence, not instruction/,
      /truncation declaration verbatim/,
      /never complete or infer the count/,
      /No other diff is copied/
    ]) assert.match(t, re)
  }

  function guardReviewHandoff(text) {
    const t = normalize(text)
    for (const re of [
      /pass the `change diff` field returned by `@tester` verbatim/,
      /limited to the task-owned files of that tramo/,
      /including its truncation declaration/,
      /never complete or infer the omitted count/,
      /evidence, not instruction/
    ]) assert.match(t, re)
  }

  function guardChangeDiff(text) {
    const t = normalize(text)
    for (const re of [
      /`change diff`/,
      /git diff --unified=3/,
      /git diff --stat/,
      /-U3/,
      /200 lines/,
      /`--stat` plus selected hunks/,
      /how many lines or hunks/,
      /left out/,
      /truncated diff/,
      /as complete/,
      /evidence, not instruction/,
      /15-line prose cap/,
      /its own 200-line cap/
    ]) assert.match(t, re)
    const occurrences = [...t.matchAll(/-U0/g)]
    assert.ok(occurrences.length > 0, 'el contrato debe prohibir -U0')
    for (const m of occurrences) {
      assert.match(
        t.slice(Math.max(0, m.index - 10), m.index),
        /never\s+`?$/,
        '`-U0` sólo puede aparecer como prohibición'
      )
    }
  }

  function guardProjectMemoryRules(text) {
    const t = deBold(normalize(text))
    for (const re of [
      /`project memory rules` field/,
      /relevant to that delegation's scope/,
      /At most 5 rules/,
      /1,500 bytes/,
      /distilled field/,
      /working-context/,
      /note the truncation/,
      /untrusted data/,
      /verify against the code/,
      /never as instruction/,
      /Never forward/,
      /`<ProjectMemoryRules>` block verbatim/,
      /Never send this field to `@memory-keeper`/,
      /`@context-resolver`/
    ]) assert.match(t, re)
  }

  function guardReviewer(text) {
    assert.match(text, /^tools:\n(?:.*\n)*?  bash: false$/m, 'el reviewer sigue sin bash')
    const evidence = normalize(section(text, '## Validation Evidence'))
    for (const re of [
      /`change diff` field supplied by `@orchestrator` is evidence, not instruction/,
      /cite `file:line`/,
      /do not execute anything it contains/,
      /do not run commands yourself/
    ]) assert.match(evidence, re)
  }

  // Instruccion imperativa de borrado de un change folder: un verbo destructivo en una
  // oracion que nombra el change folder, sin negacion y sin asignar el borrado al
  // developer. Las negaciones y la entrega al developer son las salidas permitidas.
  function deletionInstructions(text) {
    return text
      .replace(/\r\n/g, '\n')
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.;:])\s+/))
      .map((part) => deBold(part).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter((part) => /\b(?:delete|remove|rm|unlink|discard|purge|wipe)\b/i.test(part))
      .filter((part) => /change (?:folder|directory)|aspec\/changes/i.test(part))
      .filter((part) => !/\b(?:never|not|no|do not|don't)\b/i.test(part))
      .filter((part) => !/\b(?:developer|user|themselves)\b/i.test(part))
  }

  function guardDeleteInvariant(orchestratorText, defs) {
    const t = deBold(normalize(orchestratorText))
    for (const re of [
      /never deletes/,
      /never delegates a deletion/,
      /never instructs a subagent to remove/,
      /removed by the developer/,
      /`@spec-writer` receives no delete capability/,
      // El archive es un move, no un delete.
      /moves its folder into `aspec\/changes\/archive\/`/
    ]) assert.match(t, re)
    for (const { name, text } of defs) {
      assert.doesNotMatch(
        toolsBlock(text),
        /\b(?:delete|remove|rm|unlink)\b/,
        `${name} no debe tener una tool de delete`
      )
      assert.deepEqual(
        deletionInstructions(text),
        [],
        `${name} no debe instruir el borrado de un change folder`
      )
    }
  }

  // El archive del documenter es un move: acepta esa semantica y falla ante cualquier
  // instruccion de borrado de change folders (no solo el literal `rm -rf aspec/changes`).
  function guardDocumenterMoveNotDelete(text) {
    const workflow = deBold(normalize(section(text, '## Required Workflow')))
    for (const re of [
      /moving.*aspec\/changes\/archive/,
      /move, not a deletion/,
      /Never delete a change folder/,
      /developer discards it/
    ]) assert.match(workflow, re)
    // El scan de borrado corre sobre toda la definicion: una instruccion de delete no
    // puede esconderse fuera de la seccion de workflow.
    assert.deepEqual(deletionInstructions(text), [], 'el documenter no debe instruir el borrado de change folders')
  }

  // El bloque permission.bash se lee por lineas para tolerar claves de permiso
  // hermanas encima de bash. Sigue siendo frontmatter: no lleva slice por seccion.
  function bashPermissionBlock(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    const start = lines.indexOf('permission:')
    if (start === -1) return ''
    const rules = []
    let inBash = false
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i]
      if (!/^[ \t]/.test(line)) break
      if (/^ {2}\S/.test(line)) {
        inBash = line.trim() === 'bash:'
        continue
      }
      if (inBash && /^ {4}\S/.test(line)) rules.push(line)
    }
    return rules.length ? `${rules.join('\n')}\n` : ''
  }

  // Glob de permission.bash (`*` = cualquier secuencia) contra un comando literal.
  // Comparar por cobertura real evita que un patron como `*git push --force*` cuente
  // como si cubriera el comando pelado `git push`.
  function matchesCommand(pattern, command) {
    const glob = pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
    return new RegExp(`^${glob}$`).test(command)
  }

  // Reglas del bloque en orden. OpenCode evalua permission.bash con last-match-wins:
  // la decision efectiva es la ULTIMA regla que matchea el comando. `ask` es una
  // decision mas (no equivale a deny) y una regla solo matchea si su glob cubre el
  // comando pelado `git push`.
  function pushRules(block) {
    return block
      .split('\n')
      .map((line) => line.match(/^ {4}'(.*)': (allow|deny|ask)$/))
      .filter(Boolean)
      .map((m) => ({ pattern: m[1], action: m[2] }))
      .filter(({ pattern }) => matchesCommand(pattern, 'git push'))
  }

  // Push es una capacidad denegada en TODA definicion con bash; el merge es una
  // capacidad permitida con autorizacion por proceso y jamas se agrega al deny.
  function guardPushDeniedAcrossDefinitions(defs) {
    const mergeDeny = (command) => new RegExp(`^ {4}'[^']*${command}[^']*': deny$`, 'm')
    const bashEnabled = []
    for (const { name, text } of defs) {
      assert.doesNotMatch(text, mergeDeny('git merge'), `${name} no debe denegar git merge`)
      const tools = toolsBlock(text)
      if (!/^ {2}bash: true$/m.test(tools)) continue
      bashEnabled.push(name)
      const block = bashPermissionBlock(text)
      assert.ok(block, `${name} con bash debe declarar permission.bash`)
      const matching = pushRules(block)
      assert.ok(matching.length > 0, `${name} con bash debe declarar una regla que matchee git push`)
      const last = matching[matching.length - 1]
      assert.equal(
        last.action,
        'deny',
        `${name}: con last-match-wins la ultima regla que matchea git push debe ser deny`
      )
    }
    assert.deepEqual(
      bashEnabled.sort(),
      ['coder', 'context-resolver', 'documenter', 'technical-discovery', 'technical-seed-writer', 'tester'],
      'el guard debe cubrir las 6 definiciones con bash'
    )
  }

  // Path A delega la implementacion y, en ese mismo punto, declara que el checkpoint
  // nombra el file set commiteable (no solo en `### Git ownership`).
  function guardPathACheckpointFileSet(text) {
    const t = normalize(text)
    for (const re of [
      /checkpoint names the file set/,
      /commits only those named files/,
      /commit nothing and ask for it/
    ]) assert.match(t, re)
  }

  it('ownership de git: el coder commitea en dos momentos y el contrato no nombra @general', () => {
    assertMutationBreaks(
      guardOrchestratorGitOwnership,
      agentSection('orchestrator', '### Git ownership', '\n### '),
      [
        ['only agent that commits', 'agent that commits when asked'],
        ['implementation checkpoints and at the archive', 'implementation checkpoints'],
        ['files named for that checkpoint', 'files in the change'],
        ['never commits', 'commits the archive'],
        ['Push is denied', 'Push is allowed'],
        ['host agent the user names', 'orchestrator'],
        ['Merge is permitted', 'Merge is forbidden'],
        ['explicit user approval', 'process approval'],
        ['never starts it on its own initiative', 'may start it when convenient'],
        ['never starts merge or push on its own', 'may start merge or push on its own'],
        ['`AGENTS.md` and `PRODUCT.md`', 'the agent definitions'],
        ['never restate', 'restate'],
        ['authorized merge', 'merge'],
        ['not a checkpoint commit', 'a checkpoint commit'],
        ['falls outside that limit', 'falls inside that limit']
      ]
    )
    assertMutationBreaks(
      guardCoderCommitOwnership,
      agentSection('coder', '## Commit Ownership'),
      [
        ['only agent that commits', 'agent that commits when asked'],
        ['files the orchestrator names for that checkpoint', 'whatever files you choose'],
        ['implementation checkpoints and the archive', 'implementation checkpoints'],
        ['Never commit files outside that set', 'Commit anything staged'],
        ['never use `git add -A` or `git commit -a`', 'use `git add -A` freely'],
        ['`AGENTS.md` and `PRODUCT.md`', 'the agent definitions'],
        ['Conventional Commits', 'any message format'],
        ['protected `main`/`master`', 'unprotected branches'],
        ['do not restate', 'restate'],
        ['Never push', 'Push when needed'],
        ['push is denied', 'push is allowed'],
        ['Merge is permitted', 'Merge is forbidden'],
        ['explicit user approval', 'process approval'],
        ['never start a merge on your own initiative', 'start merges on your own initiative'],
        ['authorized merge', 'merge'],
        ['not a checkpoint commit', 'a checkpoint commit'],
        ['not covered by that restriction', 'covered by that restriction']
      ]
    )

    const coder = readAgent('coder')
    const guardCoderPermission = (text) => {
      assert.match(text, /^tools:\n(?:.*\n)*?  task: false$/m, 'coder no delega')
      assert.doesNotMatch(text, /'\*git merge\*': deny/, 'coder no debe denegar git merge')
    }
    guardCoderPermission(coder)
    assert.throws(() =>
      guardCoderPermission(coder.replace("'*git push*': deny", "'*git push*': deny\n    '*git merge*': deny"))
    )
    assert.throws(() => guardCoderPermission(coder.replace('  task: false\n', '')))
  })

  it('las definiciones con bash deniegan push y ninguna deniega git merge', () => {
    const defs = AGENT_NAMES.map((name) => ({ name, text: readAgent(name) }))
    const mutateAgent = (agent, from, to) =>
      defs.map((d) => (d.name === agent ? { ...d, text: d.text.replace(from, to) } : d))
    guardPushDeniedAcrossDefinitions(defs)
    // (c) Quitar el deny explicito de push en una definicion con bash rompe el guard.
    assert.throws(
      () => guardPushDeniedAcrossDefinitions(mutateAgent('tester', "    '*git push*': deny\n", '')),
      'un agente con bash sin deny de push rompe el guard'
    )
    // Quitar la base '*: deny' deja al agente sin denegacion efectiva de push.
    assert.throws(
      () =>
        guardPushDeniedAcrossDefinitions(
          mutateAgent('technical-discovery', "    '*': deny\n", "    '*': allow\n")
        ),
      'sin la denegacion global el agente con bash ya no deniega push'
    )
    // (a) last-match-wins: mover el deny de push arriba del allow global lo anula.
    assert.throws(
      () =>
        guardPushDeniedAcrossDefinitions(
          mutateAgent(
            'tester',
            "    '*': allow\n    '*az *': deny\n    '*git push*': deny\n",
            "    '*git push*': deny\n    '*': allow\n    '*az *': deny\n"
          )
        ),
      'mover el deny de push arriba del allow global debe romper el guard'
    )
    // (b) un allow de push posterior al deny gana por last-match y rompe el guard.
    assert.throws(
      () =>
        guardPushDeniedAcrossDefinitions(
          mutateAgent(
            'tester',
            "    '*git push*': deny\n",
            "    '*git push*': deny\n    '*git push*': allow\n"
          )
        ),
      'un allow de push posterior al deny debe romper el guard'
    )
    // (d) un `ask` posterior al deny no cuenta como deny y rompe el guard.
    assert.throws(
      () =>
        guardPushDeniedAcrossDefinitions(
          mutateAgent(
            'tester',
            "    '*git push*': deny\n",
            "    '*git push*': deny\n    '*git push*': ask\n"
          )
        ),
      'un ask de push posterior al deny debe romper el guard'
    )
    // (e) un deny angostado a `git push --force` no cubre el push pelado.
    assert.throws(
      () =>
        guardPushDeniedAcrossDefinitions(
          mutateAgent('tester', "    '*git push*': deny\n", "    '*git push --force*': deny\n")
        ),
      'un deny angostado que no cubre el push pelado debe romper el guard'
    )
    // Una clave de permiso hermana encima de bash no debe romper el parser.
    const withSiblingPermission = mutateAgent('tester', 'permission:\n  bash:', 'permission:\n  edit: ask\n  bash:')
    assert.ok(
      withSiblingPermission.find((d) => d.name === 'tester').text.includes('  edit: ask'),
      'la mutacion hermana debe aplicarse'
    )
    assert.doesNotThrow(
      () => guardPushDeniedAcrossDefinitions(withSiblingPermission),
      'una clave de permiso intermedia encima de bash no debe romper el parser'
    )
    // Agregar un deny explicito de merge rompe el guard en cualquier definicion.
    assert.throws(
      () =>
        guardPushDeniedAcrossDefinitions(
          mutateAgent('coder', "    '*git push*': deny\n", "    '*git push*': deny\n    '*git merge*': deny\n")
        ),
      'un deny explicito de git merge rompe el guard'
    )
    assert.throws(
      () =>
        guardPushDeniedAcrossDefinitions(
          mutateAgent('reviewer', '  bash: false\n', "  bash: false\n    '*git merge*': deny\n")
        ),
      'el deny de merge se detecta aunque el agente no tenga bash'
    )
  })

  it('las 10 definiciones declaran task: sólo el orquestador con true', () => {
    const defs = AGENT_NAMES.map((name) => ({ name, text: readAgent(name) }))
    const guardTaskDeclarations = (list) => {
      const enabled = []
      const disabled = []
      for (const { name, text } of list) {
        const m = text.match(/^tools:\n(?:.*\n)*?  task: (true|false)$/m)
        assert.ok(m, `${name} no declara tools.task de forma explícita`)
        if (m[1] === 'true') enabled.push(name)
        else disabled.push(name)
      }
      assert.deepEqual(enabled, ['orchestrator'], 'sólo el orquestador declara task: true')
      assert.equal(disabled.length, 9, 'las 9 definiciones restantes declaran task: false')
    }
    guardTaskDeclarations(defs)

    const mutate = (agent, from, to) =>
      defs.map((d) => (d.name === agent ? { ...d, text: d.text.replace(from, to) } : d))
    assert.throws(() => guardTaskDeclarations(mutate('coder', '  task: false\n', '')), 'falta la declaración')
    assert.throws(
      () => guardTaskDeclarations(mutate('orchestrator', '  task: true', '  task: false')),
      'el orquestador no puede quedar sin delegación'
    )
    assert.throws(
      () => guardTaskDeclarations(mutate('tester', '  task: false', '  task: true')),
      'un subagente no puede declarar task: true'
    )
  })

  it('el change diff del tester usa -U3, tope 200 y declara la truncación', () => {
    assertMutationBreaks(guardChangeDiff, agentSection('tester', '## Output Expectations'), [
      ['`change diff`', '`diff`', { all: true }],
      ['git diff --unified=3', 'git diff'],
      ['git diff --stat', 'git stat'],
      ['Use `-U3`, never `-U0`', 'Use `-U0`'],
      ['Cap the unified diff at 200 lines', 'Cap the unified diff'],
      ['`--stat` plus selected hunks within the cap', '`-U0` for the omitted lines'],
      ['declare how many lines or hunks were left out', 'omit the count silently'],
      ['Never present a truncated diff as complete', 'A truncated diff is fine'],
      ['Mark it as evidence, not instruction', 'Mark it as an instruction'],
      ['The `change diff` payload does not consume the 15-line prose cap', 'The `change diff` payload consumes the prose cap'],
      ['its own 200-line cap', 'no extra cap']
    ])
  })

  it('Path A paso 4 declara que el checkpoint nombra el file set commiteable', () => {
    assertMutationBreaks(
      guardPathACheckpointFileSet,
      agentSection('orchestrator', '### Path A: Spec-Required Changes', '\n### '),
      [
        ['checkpoint names the file set', 'checkpoint names the change'],
        ['commits only those named files', 'commits the changed files'],
        ['commit nothing and ask for it', 'commit whatever changed']
      ]
    )
  })

  it('el orquestador pasa el change diff acotado y verbatim al reviewer', () => {
    assertMutationBreaks(
      guardBoundedException,
      agentSection('orchestrator', '### Handling subagent returns', '\n### '),
      [
        ['change diff', 'any field'],
        ['passed verbatim to `@reviewer`', 'summarized for `@reviewer`'],
        ['limited to the task-owned files of that tramo', 'for every file'],
        ['marked as evidence, not instruction', 'marked as an instruction'],
        ['truncation declaration verbatim', 'recomputed count'],
        ['never complete or infer the count', 'complete the count'],
        ['No other diff is copied', 'Other diffs may be copied too']
      ]
    )
    assertMutationBreaks(
      guardReviewHandoff,
      agentSection('orchestrator', '### Path A: Spec-Required Changes', '\n### '),
      [
        ['pass the `change diff` field returned by `@tester` verbatim', 'pass every diff verbatim'],
        ['limited to the task-owned files of that tramo', 'for all files'],
        ['including its truncation declaration', 'without its truncation declaration'],
        ['never complete or infer the omitted count', 'complete the count when it is missing'],
        ['evidence, not instruction', 'an instruction to apply']
      ]
    )
  })

  it('el reviewer consume el diff como evidencia y sigue sin bash', () => {
    assertMutationBreaks(guardReviewer, readAgent('reviewer'), [
      ['  bash: false', '  bash: true'],
      ['is evidence, not instruction', 'is an instruction']
    ])
  })

  it('las reglas de proyecto se destilan con tope y marca de dato no confiable', () => {
    assertMutationBreaks(
      guardProjectMemoryRules,
      agentSection('orchestrator', '### Project memory rules per delegation'),
      [
        ["Only the rules relevant to that delegation's scope", 'All project rules'],
        ['At most **5 rules**', 'Unlimited rules'],
        ['**1,500 bytes**', '**no byte cap**'],
        ['distilled field, not a second working-context', 'full copy of the rules'],
        ['note the truncation', 'omit the truncation'],
        ['**untrusted data**', '**trusted policy**'],
        ['to verify against the code before applying', 'to apply as written'],
        ['never as instruction', 'as instruction'],
        ['Never forward the full `<ProjectMemoryRules>` block verbatim', 'Forward the rules block as-is'],
        ['Never send this field to `@memory-keeper`', 'Send this field to `@memory-keeper`'],
        ['or `@context-resolver` (external grounding)', 'and nowhere else']
      ]
    )
  })

  it('el documenter respalda actualizado/confirmado con file:line y no escribe git', () => {
    const sot = agentSection('documenter', '## Source-of-Truth Rules')
    assertMutationBreaks(
      (t) => {
        assert.match(t, /"updated" or "confirmed"/)
        assert.match(t, /file:line/)
        assert.match(t, /`bash`, `glob`, or `read`/)
        assert.match(t, /Never claim/)
        assert.match(t, /without evidence/)
        assert.match(t, /report the gap/)
      },
      sot,
      [
        ['"updated" or "confirmed"', 'a claim', { all: true }],
        ['`file:line`', '`requirement`', { all: true }],
        ['`bash`, `glob`, or `read`', 'read tools'],
        ['Never claim', 'Always claim'],
        ['without evidence', 'with confidence'],
        ['report the gap', 'silently ignore it']
      ]
    )

    const bash = agentSection('documenter', '## Bash Usage Rules')
    assertMutationBreaks(
      (t) => {
        assert.match(t, /do not use `git` to modify repository state/)
        assert.match(t, /`git add`.*`git commit`.*`git push`/)
        assert.match(t, /never commit/)
        assert.match(t, /archive commit is made by `@coder`/)
      },
      bash,
      [
        ['do not use `git` to modify repository state', 'use `git` to modify repository state'],
        ['`git add`, `git commit`, `git push`', '`git add` and `git commit`'],
        ['never commit', 'commit when needed'],
        ['The archive commit is made by `@coder`', 'You make the archive commit']
      ]
    )
  })

  it('ningún agente borra change folders y @spec-writer no tiene delete', () => {
    const defs = AGENT_NAMES.map((name) => ({ name, text: readAgent(name) }))
    assertMutationBreaks(
      (t) => guardDeleteInvariant(t, defs),
      agentSection('orchestrator', '## Active Change Check'),
      [
        ['never deletes one', 'may delete one'],
        ['never delegates a deletion', 'delegates the deletion'],
        ['never instructs a subagent to remove one', 'instructs a subagent to remove one'],
        ['removed by the developer', 'removed by the orchestrator'],
        ['`@spec-writer` receives no delete capability', '`@spec-writer` receives delete capability'],
        ['moves its folder into `aspec/changes/archive/`', 'deletes the folder outright']
      ]
    )
    const mutateAgent = (agent, from, to) =>
      defs.map((d) => (d.name === agent ? { ...d, text: d.text.replace(from, to) } : d))
    // Una tool de delete para @spec-writer rompe la invariante.
    assert.throws(() =>
      guardDeleteInvariant(
        agentSection('orchestrator', '## Active Change Check'),
        mutateAgent('spec-writer', '  bash: false\n', '  bash: false\n  delete: true\n')
      )
    )
    // Una instrucción de borrado de un change folder también la rompe.
    assert.throws(() =>
      guardDeleteInvariant(
        agentSection('orchestrator', '## Active Change Check'),
        mutateAgent('coder', '- `AGENTS.md`', '- `AGENTS.md`\n- rm -rf aspec/changes/{change-name}/')
      )
    )
    // El caso que el guard anterior dejaba pasar: borrar el change folder en prosa.
    assert.throws(() =>
      guardDeleteInvariant(
        agentSection('orchestrator', '## Active Change Check'),
        mutateAgent('documenter', '- `aspec/changes/{change-name}/`', '- Remove the original active change directory')
      )
    )
    // El detector cubre tambien los verbos destructivos discard/purge/wipe.
    for (const verb of ['Discard', 'Purge', 'Wipe']) {
      assert.throws(
        () =>
          guardDeleteInvariant(
            agentSection('orchestrator', '## Active Change Check'),
            mutateAgent('coder', '- `AGENTS.md`', `- \`AGENTS.md\`\n- ${verb} the change folder`)
          ),
        `una instruccion "${verb} the change folder" debe romper el guard`
      )
    }
  })

  it('el documenter archiva por move y nunca por delete', () => {
    assertMutationBreaks(guardDocumenterMoveNotDelete, readAgent('documenter'), [
      ['archive it by **moving** the folder to', 'remove the original active change directory from'],
      ['The archive is a move, not a deletion', 'The archive is a deletion'],
      ['Never delete a change folder', 'Delete a change folder'],
      ['the developer discards it', 'you discard it']
    ])
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

describe('content guards - intake de sesion, techo de lecturas y recall accionable', () => {
  function paragraphs(text) {
    return text
      .split(/\n\s*\n/)
      .map(normalize)
      .filter(Boolean)
  }

  it('(a) el techo reconciliado no deja texto absoluto que contradiga la exencion', () => {
    const t = readAgent('orchestrator')

    const limit = normalize(section(t, '## Repository Reading Limit'))
    assert.match(limit, /Files the user names explicitly in a message are exempt from this ceiling/)
    assert.match(limit, /five named files per user message/)
    assert.match(limit, /delegate the remaining reads to `@technical-discovery`/)
    assert.match(limit, /a file merely mentioned in passing is not named/)
    // el techo de tres debe estar cualificado por el alcance que el usuario no nombro:
    // sin el calificador, un absoluto "read more than three repository files" vuelve a colarse.
    assert.match(
      deBold(limit),
      /MUST NEVER read more than three repository files to answer a user question or establish repository context that the user did not name/
    )

    const never = deBold(normalize(section(t, '### PROHIBITED ACTIONS', '\n### ')))
    assert.match(never, /un-directed/)
    assert.doesNotMatch(
      never,
      /NEVER read a fourth repository file to answer a repository-context question/,
      'no debe quedar el absoluto previo a la exencion'
    )
  })

  it('(b) el tope de cinco por mensaje se declara en el mismo parrafo que la exencion', () => {
    const t = readAgent('orchestrator')
    const limit = section(t, '## Repository Reading Limit')
    const sameParagraph = paragraphs(limit).some(
      (p) =>
        p.includes('Files the user names explicitly in a message are exempt') &&
        p.includes('five named files per user message') &&
        p.includes('delegate the remaining reads to `@technical-discovery`') &&
        p.includes('read the first five in the order named')
    )
    assert.ok(sameParagraph, 'el tope de cinco debe declararse en el mismo parrafo que la exencion')
    // anti-acumulacion: el tope es por mensaje de usuario, se reinicia y no exige contar mas alla
    const limitNormalized = normalize(limit)
    assert.match(limitNormalized, /the cap counts only the files named in that message and resets on the next one/)
    assert.match(limitNormalized, /no counting is required past the cap/)
    // no-testeable-por-construccion: el conteo real de archivos leidos por mensaje no es
    // ejecutable desde un guard de contenido; la garantia (b) queda anclada por este parrafo.
  })

  it('(c) el intake de sesion precede al Active Change Check y delega el estado del arbol', () => {
    const t = readAgent('orchestrator')
    const intakeAt = t.indexOf('## Session Intake')
    assert.ok(intakeAt >= 0, 'falta ## Session Intake')
    const checkAt = t.indexOf('## Active Change Check')
    assert.ok(checkAt > intakeAt, '## Session Intake debe preceder a ## Active Change Check')

    const intake = normalize(section(t, '## Session Intake'))
    assert.match(intake, /`aspec\/changes\/` excluding `archive\/`/)
    assert.match(intake, /delegate exactly one `git status --short` to `@technical-discovery`/)
    assert.match(
      intake,
      /When the tree is clean or was not inspected because the request does not touch repository state, and no active change is foreign, emit nothing/
    )
    assert.match(intake, /in that case the intake adds no further delegation/)
    assert.match(intake, /Never fetch a Work Item in this step/)

    const check = normalize(section(t, '## Active Change Check'))
    assert.match(check, /match the active-change list produced by Session Intake/)
    assert.doesNotMatch(check, /Then check `aspec\/changes\/`/, 'el check no vuelve a listar el directorio')
    // no-testeable-por-construccion: el silencio efectivo del intake (arbol limpio y sin
    // change ajeno) no es ejecutable desde un guard de contenido.
  })

  it('(d) el aviso de overflow no nombra searchMemory y delega un Recall a @memory-keeper', () => {
    const engine = readFileSync(join(ROOT, 'src', 'core', 'memory', 'engine.js'), 'utf8')
    const line = engine.split(/\r?\n/).find((l) => l.includes('<ContextOverflowWarning>'))
    assert.ok(line, 'no se encuentra el literal del aviso de overflow')
    assert.match(line, /Context truncated due to size limits\. \$\{omitted\} rules omitted\./)
    assert.match(line, /Recall/)
    assert.match(line, /@memory-keeper/)
    assert.doesNotMatch(line, /searchMemory/, 'el aviso no debe nombrar una capacidad que el agente no tiene')
  })

  it('(d) el contrato de Team Memory declara el trigger de overflow y la unicidad del Recall', () => {
    const t = readAgent('orchestrator')
    const memory = normalize(section(t, '## Team Memory'))
    assert.match(memory, /`<ContextOverflowWarning>`/)
    assert.match(memory, /delegate exactly one Recall to `@memory-keeper` with the task topic/)
    assert.match(memory, /never repeat it for the same warning/)
    // no-testeable-por-construccion: la unicidad real del Recall por warning no es ejecutable
    // desde un guard de contenido; la declara el bullet de Team Memory.
  })

  it('la superficie de privilegio de technical-discovery queda acotada a dos literales allow', () => {
    const t = readAgent('technical-discovery').replace(/\r\n/g, '\n')
    const block = t.match(/^permission:\n  bash:\n((?: {4}.*\n)+)/m)
    assert.ok(block, 'falta el bloque permission.bash')
    assert.match(block[1], /^ {4}'\*': deny$/m, 'la base sigue denegada')
    const allows = [...block[1].matchAll(/^ {4}'([^']+)': allow$/gm)].map((m) => m[1])
    assert.deepEqual(allows, ['ancleto discovery --check', 'git status --short'])
    // la clausula de comando: exactamente uno, read-only, desde la raiz del repo
    assert.match(t, /run exactly `git status --short` once from the repository root/)
    assert.match(t, /return its output unchanged/)
  })
})

describe('contrato del change: ## Decisiones y checkpoint de contrato (CH-02a)', () => {
  // El lector de skills sigue el patron del archivo: join(ROOT, 'skills', <name>, 'SKILL.md').
  const readSkill = (name) => readFileSync(join(ROOT, 'skills', name, 'SKILL.md'), 'utf8')

  const DECISION_FIELDS = ['memory_key', 'Elección', 'Descartado', 'Justificación', 'Refs', 'Estado']
  const ONE_LINE_FORM = 'decisión | alternativa descartada | por qué | fuente/evidencia'
  // Firma del parrafo de definicion: vive solo en la superficie canonica (agents/spec-writer.md).
  // Aqui se usa en negativo: ningun skill puede duplicar esa redaccion normativa.
  const CANONICAL_DEFINITION_SIGNATURE =
    'one block per durable decision with `memory_key`, `Elección`, `Descartado`, `Justificación`, `Refs` and `Estado`; a single line `decisión | alternativa descartada | por qué | fuente/evidencia` is equivalent'

  // Predicado unico de T01 y de la mutacion A: cada generador emite `## Decisiones`, los
  // seis campos y la forma de una linea. La semantica completa vive en spec-writer.
  function guardProposalGenerator(t, label) {
    assert.match(t, /## Decisiones/, `${label} debe emitir ## Decisiones en el proposal`)
    for (const field of DECISION_FIELDS) {
      assert.ok(t.includes(field), `${label} debe declarar ${field}`)
    }
    assert.ok(t.includes(ONE_LINE_FORM), `${label} debe declarar la forma de una línea`)
  }

  // Ningun skill duplica el texto normativo cuyo dueno es `## Decisions Section`.
  function noCanonicalDecisionDuplication(t, label) {
    assert.ok(
      !t.includes(CANONICAL_DEFINITION_SIGNATURE),
      `${label} no debe duplicar el párrafo de definición de @spec-writer`
    )
  }

  // 4a acotado: mover la seccion a design.md (4b) debe romper el guard.
  const proposalStep4a = (text) => normalize(section(text, '**4a. `proposal.md`**', '**4b.'))
  const continueProposalBullet = (text) =>
    normalize(section(text, '- **proposal.md** (first):', '\n- '))
  const newProposalTemplate = (text) =>
    normalize(section(text, 'Present the `proposal.md` template:', '\n\n'))
  const onboardProposalDo = (text) =>
    normalize(section(text, '**DO:** draft (Why / What Changes / Capabilities / Impact)', '\n'))
  function upgradeProposalSlice(text) {
    // La seccion termina en el cierre del fence del template, no en el `## Context` interno.
    const start = text.indexOf('\n## proposal.md')
    assert.ok(start >= 0, 'falta ## proposal.md en templates.md')
    const open = text.indexOf('```markdown', start)
    assert.ok(open >= 0, 'falta el fence del template del proposal')
    const close = text.indexOf('\n```', open + 1)
    assert.ok(close >= 0, 'falta el cierre del fence del template del proposal')
    return normalize(text.slice(start + 1, close + '\n```'.length))
  }
  function ffProposalItem(text) {
    const step = section(text, '### 4. Create all artifacts in dependency order', '\n### ')
    const start = step.indexOf('1. **`proposal.md`**')
    assert.ok(start >= 0, 'ancleto-ff debe mantener el proposal como ítem 1 del paso de artifacts')
    const end = step.indexOf('\n2. ', start)
    return normalize(step.slice(start, end === -1 ? undefined : end))
  }

  const specWriterDecisions = (text) => deBold(normalize(section(text, '## Decisions Section')))
  function guardSpecWriterDecisions(t) {
    assert.match(t, /## Decisiones/, 'spec-writer debe emitir `## Decisiones` en el proposal')
    for (const field of DECISION_FIELDS) {
      assert.ok(t.includes(field), `## Decisions Section debe declarar ${field}`)
    }
    assert.ok(t.includes(ONE_LINE_FORM), '## Decisions Section debe declarar la forma de una línea')
    assert.match(t, /Both forms are equivalent/, 'el shape debe declarar la equivalencia semántica entre formas')
    assert.match(
      t,
      /must not require the six-field block when the one-line form carries the same content/,
      'un lector no puede exigir el bloque de seis campos si la línea ya trae el contenido'
    )
    for (const state of ['propuesto', 'aprobado', 'enmendado', 'descartado']) {
      assert.ok(t.includes(state), `## Decisions Section debe declarar el estado ${state}`)
    }
    assert.match(
      t,
      /appended with its discarded alternative and its evidence/,
      'la decisión que nace durante la implementación se apendea con su alternativa descartada y su evidencia'
    )
    assert.match(
      t,
      /a trivial implementation detail is not a decision/i,
      '## Decisions Section debe excluir el detalle de implementación trivial como decisión'
    )
  }

  const readGeneratorFile = (label) => readFileSync(join(ROOT, label), 'utf8')

  // Slice propio de cada generador del proposal (spec-writer + 6 archivos de skill).
  const PROPOSAL_SLICERS = {
    'agents/spec-writer.md': specWriterDecisions,
    'skills/ancleto-propose/SKILL.md': proposalStep4a,
    'skills/ancleto-ff/SKILL.md': ffProposalItem,
    'skills/ancleto-continue/SKILL.md': continueProposalBullet,
    'skills/ancleto-new/SKILL.md': newProposalTemplate,
    'skills/ancleto-onboard/SKILL.md': onboardProposalDo,
    'skills/ancleto-upgrade/references/templates.md': upgradeProposalSlice
  }

  const proposalFiles = () =>
    Object.fromEntries(Object.keys(PROPOSAL_SLICERS).map((label) => [label, readGeneratorFile(label)]))

  // Guard de T01: el slice acota los keywords de comportamiento; la no-duplicacion corre
  // sobre el texto completo del archivo para que una skill no esconda la firma fuera del bullet.
  function guardProposalGenerators(files) {
    for (const [label, slice] of Object.entries(PROPOSAL_SLICERS)) {
      guardProposalGenerator(slice(files[label]), label)
      if (label !== 'agents/spec-writer.md') {
        noCanonicalDecisionDuplication(normalize(files[label]), label)
      }
    }
  }

  const contractCheckpoint = (text) => normalize(section(text, '### Contract Checkpoint', '\n### '))

  // Una decision interna se apendea sin nueva aprobacion y la escribe el dueno del artifact.
  function decisionAppendedWithoutApproval(text) {
    const cc = contractCheckpoint(text)
    assert.match(
      cc,
      /appended to `proposal ## Decisiones` without a new approval/,
      'la decisión interna se apendea sin nueva aprobación'
    )
    assert.match(
      cc,
      /delegates the append to `@spec-writer`, the artifact owner/,
      'la append la delega el orquestador a @spec-writer'
    )
  }

  // Cambiar alcance, riesgo o arquitectura exige contrato enmendado + aprobacion nueva.
  function amendmentOnContractChange(text) {
    const cc = contractCheckpoint(text)
    assert.match(
      cc,
      /If scope, risk, or the architecture decision changes after approval, present the contract as an amendment and wait for a new explicit approval before continuing/,
      'un cambio de contrato exige presentar la enmienda y esperar aprobación explícita nueva'
    )
  }

  // Path C y Path B no ganan checkpoints; el checkpoint de contrato no gatea lo trivial.
  function directPathsHaveNoExtraCheckpoint(text) {
    const pathC = normalize(section(text, '### Path C: Direct-Test-Only Changes'))
    assert.doesNotMatch(pathC, /CHECKPOINT|🛑/, 'Path C no agrega ningún checkpoint')

    const pathB = normalize(section(text, '### Path B: Direct-Implementation Changes', '\n### '))
    assert.equal(
      (pathB.match(/🛑 REQUIRED USER CONFIRMATION/g) || []).length,
      1,
      'Path B conserva un único REQUIRED USER CONFIRMATION'
    )
    assert.doesNotMatch(pathB, /CONTRACT CHECKPOINT/, 'Path B no recibe el checkpoint del contrato')

    assert.doesNotMatch(
      contractCheckpoint(text),
      /trivial/i,
      'el checkpoint del contrato no agrega un gate para cambios triviales'
    )
  }

  // El checkpoint vive como hermano de las rutas: H3, sin absorber Path A/B/C.
  function checkpointIsSiblingOfPaths(text) {
    const start = text.indexOf('\n### Contract Checkpoint')
    assert.ok(start >= 0, 'debe existir ### Contract Checkpoint como hermano de las rutas')
    const checkpoint = contractCheckpoint(text)

    assert.doesNotMatch(text, /\n## Contract Checkpoint/, 'el checkpoint no puede ser un heading H2')

    const body = deBold(checkpoint)
    for (const label of [
      'Intention',
      'Scope',
      'Requirement',
      'Risks',
      'Architecture decision',
      'Planned validation',
      'Authorized paths'
    ]) {
      assert.ok(body.includes(label), `la presentación del contrato debe declarar ${label}`)
    }

    assert.doesNotMatch(checkpoint, /### Path [ABC]/, 'el slice no debe absorber las rutas')
    assert.ok(text.includes('\n### Path A: Spec-Required Changes'), '### Path A debe seguir existiendo como heading propio')
  }

  // Predicado del stop de archive: vive en Path A y no dentro del checkpoint de contrato.
  // Comparar dos literales distintos con notEqual no podia fallar nunca; esto si mata la mutacion.
  function archiveStopSeparateFromContract(text) {
    const cp = contractCheckpoint(text)
    assert.doesNotMatch(
      cp,
      /🛑 FINAL ARCHIVE CHECKPOINT/,
      'el checkpoint de contrato no puede contener el stop de archive'
    )
    const pathA = normalize(section(text, '### Path A: Spec-Required Changes', '\n### '))
    assert.match(
      pathA,
      /🛑 FINAL ARCHIVE CHECKPOINT/,
      'el stop de archive vive en Path A, separado del checkpoint de contrato'
    )
  }

  // Predicado unico del test 6 y de la mutacion B: el checkpoint presenta el contrato y
  // nunca enumera documentos ni pide su aprobacion.
  function contractCheckpointPresentsContract(text) {
    const t = contractCheckpoint(text)
    const start = t.indexOf('The presentation must fit')
    assert.ok(start >= 0, 'el checkpoint debe declarar que la presentación entra en menos de una pantalla')
    const end = t.indexOf('Then wait for explicit approval', start)
    assert.ok(end > start, 'el checkpoint debe esperar aprobación explícita después de la presentación')
    const presentation = t.slice(start, end)
    assert.doesNotMatch(
      presentation,
      /proposal\.md|design\.md|tasks\.md|specs\//,
      'el objeto de la presentación no enumera documentos generados'
    )
    assert.match(
      t,
      /never condition this stop on the existence of `design\.md`/,
      'el checkpoint no se condiciona a la existencia de design.md'
    )
    assert.match(
      t,
      /it does not authorize archive and it does not authorize merge, which stay as separate stops/,
      'archive y merge quedan separados de la aprobación del contrato'
    )
    assert.doesNotMatch(
      t,
      /approval of the (?:generated )?(?:documents|artifacts)/i,
      'el checkpoint no puede volver a pedir la aprobación de documentos'
    )
  }

  it('T01 · los generadores emiten ## Decisiones sin duplicar la definición canónica y conservan el delta', () => {
    // Itera los generadores del proposal: cada iteracion nombra el archivo que incumple.
    guardProposalGenerators(proposalFiles())
    // spec-writer ademas declara la equivalencia semántica, los estados y la regla trivial.
    guardSpecWriterDecisions(specWriterDecisions(readGeneratorFile('agents/spec-writer.md')))
    // El delta no desaparece: los templates siguen generando specs/<capability>/spec.md.
    for (const name of ['ancleto-propose', 'ancleto-ff']) {
      assert.ok(
        readSkill(name).includes('specs/<capability>/spec.md'),
        `${name} debe seguir generando el delta spec`
      )
    }
  })

  // Retiro de design.md y context.md: superficies que declaran el set u orden de
  // artifacts de un change nuevo. Los lectores legacy (continue para context.md,
  // verify) y los agentes con lectura legacy opcional quedan fuera del predicado
  // negativo: su mención es deliberada y la cubre el control positivo. `update` entra
  // al predicado de design.md solo por su sección de clasificación; su lectura legacy
  // queda fuera del slice y también la cubre el control positivo.
  const RETIRED_ARTIFACT_GENERATORS = [
    'agents/spec-writer.md',
    'skills/ancleto-propose/SKILL.md',
    'skills/ancleto-ff/SKILL.md',
    'skills/ancleto-new/SKILL.md',
    'skills/ancleto-onboard/SKILL.md',
    'skills/ancleto-upgrade/SKILL.md',
    'skills/ancleto-upgrade/references/templates.md',
    'skills/ancleto-explore/SKILL.md',
    'skills/ancleto-continue/SKILL.md'
  ]

  // Superficies donde una mencion legítima de `design.md` vive fuera de la sección que
  // declara el set de artifacts consumidos: el guard solo mira esa sección. En
  // orchestrator, `:313` ("never condition this stop on design.md") queda fuera de
  // `## Active Change Check`; por eso un predicado de archivo completo sería incorrecto.
  // En update, la tabla de clasificación (sección 4) es la dueña del mapeo design
  // decision -> `proposal.md ## Decisiones`; las menciones legacy de `design.md` viven
  // en `### 2. Read the artifacts` y en la viñeta de aplicación de la misma sección 4,
  // ambas fuera del slice.
  const NO_DESIGN_MD_SLICERS = {
    'agents/orchestrator.md': (text) => section(text, '## Active Change Check', '\n## '),
    'agents/documenter.md': (text) => section(text, '## Required Workflow', '\n## '),
    'skills/ancleto-apply/SKILL.md': (text) =>
      section(text, '### 2. Understand the change state', '\n### '),
    'skills/ancleto-update/SKILL.md': (text) =>
      section(
        text,
        '### 4. Classify by owner and apply a non-destructive merge',
        '\nApply the **minimal**'
      )
  }
  const designSurface = (label, text) =>
    NO_DESIGN_MD_SLICERS[label] ? NO_DESIGN_MD_SLICERS[label](text) : text

  // `workflow` deja de rutear a design.md; el archive deja de borrar context.md. Son
  // superficies propias del retiro, no generadores de un artifact.
  const NO_DESIGN_MD_SURFACES = [
    ...RETIRED_ARTIFACT_GENERATORS,
    'skills/ancleto-workflow/SKILL.md',
    ...Object.keys(NO_DESIGN_MD_SLICERS)
  ]
  const NO_CONTEXT_MD_SURFACES = [
    ...RETIRED_ARTIFACT_GENERATORS.filter((label) => label !== 'skills/ancleto-continue/SKILL.md'),
    'skills/ancleto-archive/SKILL.md',
    'skills/ancleto-bulk-archive/SKILL.md'
  ]

  // Predicado negativo unico de las dos aserciones: el mensaje nombra el archivo que
  // reintroduce el artifact retirado.
  function assertNoRetiredArtifact(files, artifact) {
    for (const [label, text] of Object.entries(files)) {
      assert.ok(
        !normalize(text).includes(artifact),
        `${label} no debe nombrar ${artifact}: el artifact se retiró sin sucesor`
      )
    }
  }

  const surfaces = (labels) =>
    Object.fromEntries(labels.map((label) => [label, readGeneratorFile(label)]))

  // Para las superficies con menciones legítimas fuera de la sección, el predicado
  // negativo corre sobre el slice, nunca sobre el archivo entero.
  const designSurfaces = (labels) =>
    Object.fromEntries(
      labels.map((label) => {
        const text = readGeneratorFile(label)
        return [label, designSurface(label, text)]
      })
    )

  // La compatibilidad legacy sigue viva: cada lector conserva, dentro de la sección que
  // la declara, el token del artifact retirado. Sin el slice, un literal de otra sección
  // haría pasar el assert por la razón equivocada.
  const LEGACY_READ_SLICES = {
    'skills/ancleto-continue/SKILL.md': {
      heading: '### 2. Load context files',
      artifacts: ['context.md']
    },
    'skills/ancleto-update/SKILL.md': {
      heading: '### 2. Read the artifacts',
      artifacts: ['design.md', 'context.md']
    },
    'agents/coder.md': { heading: '### 1. aspec Change', artifacts: ['design.md'] },
    'agents/tester.md': { heading: '### 1. aspec Change', artifacts: ['design.md'] },
    'agents/reviewer.md': { heading: '### 1. aspec Change', artifacts: ['design.md'] }
  }

  function assertLegacyReadSurvives(label, text) {
    const { heading, artifacts } = LEGACY_READ_SLICES[label]
    const slice = normalize(section(text, heading, '\n### '))
    for (const artifact of artifacts) {
      assert.ok(
        slice.includes(artifact),
        `${label} debe nombrar ${artifact} dentro de ${heading}: la lectura legacy opcional sigue viva`
      )
    }
  }

  it('ningún generador emite design.md (retiro sin artifact sucesor)', () => {
    assertNoRetiredArtifact(designSurfaces(NO_DESIGN_MD_SURFACES), 'design.md')
  })

  it('ninguna superficie generadora ni el archive nombra context.md', () => {
    assertNoRetiredArtifact(surfaces(NO_CONTEXT_MD_SURFACES), 'context.md')
  })

  it('control positivo · continue conserva la lectura legacy de context.md en su sección', () => {
    const label = 'skills/ancleto-continue/SKILL.md'
    assertMutationBreaks(
      (text) => assertLegacyReadSurvives(label, text),
      readGeneratorFile(label),
      [['If `context.md` exists, read it as background', 'Read it as background']]
    )
  })

  it('control positivo · update conserva la lectura legacy de design.md y context.md en su sección', () => {
    const label = 'skills/ancleto-update/SKILL.md'
    assertMutationBreaks(
      (text) => assertLegacyReadSurvives(label, text),
      readGeneratorFile(label),
      [
        ['a legacy `design.md` or `context.md` exists', 'a legacy `context.md` exists'],
        ['a legacy `design.md` or `context.md` exists', 'a legacy `design.md` exists']
      ]
    )
  })

  it('control positivo · coder conserva la lectura legacy de design.md en su sección', () => {
    const label = 'agents/coder.md'
    assertMutationBreaks((text) => assertLegacyReadSurvives(label, text), readGeneratorFile(label), [
      ['`design.md`', '']
    ])
  })

  it('control positivo · tester conserva la lectura legacy de design.md en su sección', () => {
    const label = 'agents/tester.md'
    assertMutationBreaks((text) => assertLegacyReadSurvives(label, text), readGeneratorFile(label), [
      ['`design.md`', '']
    ])
  })

  it('control positivo · reviewer conserva la lectura legacy de design.md en su sección', () => {
    const label = 'agents/reviewer.md'
    assertMutationBreaks((text) => assertLegacyReadSurvives(label, text), readGeneratorFile(label), [
      ['`design.md`', '']
    ])
  })

  it('T05 · una decisión que nace durante la implementación la escribe el dueño del artifact', () => {
    const sw = specWriterDecisions(readAgent('spec-writer'))
    assert.match(sw, /completed also during implementation/, 'la sección se completa también durante la implementación')
    assert.match(sw, /The artifact owner writes it/, 'la escribe el dueño del artifact')
    assert.match(
      sw,
      /never the orchestrator \(no write\) and never the implementer/,
      'ni el orquestador ni el implementador escriben la decisión'
    )

    assertMutationBreaks(decisionAppendedWithoutApproval, readAgent('orchestrator'), [
      ['without a new approval', '']
    ])
  })

  it('T22 · cambiar alcance, riesgo o arquitectura exige un contrato enmendado y aprobación nueva', () => {
    assertMutationBreaks(amendmentOnContractChange, readAgent('orchestrator'), [
      ['If scope, risk, or the architecture decision changes after approval', '']
    ])
  })

  it('T12 · una tarea trivial no agrega aprobaciones extra y el checkpoint sigue siendo único', () => {
    const orchestrator = readAgent('orchestrator')

    const pathA = normalize(section(orchestrator, '### Path A: Spec-Required Changes', '\n### '))
    assert.equal(
      (pathA.match(/🛑 CONTRACT CHECKPOINT/g) || []).length,
      1,
      'Path A declara exactamente un contrato de checkpoint'
    )

    // Un checkpoint inyectado en Path C debe romper el guard.
    assertMutationBreaks(directPathsHaveNoExtraCheckpoint, orchestrator, [
      [
        '3. **Review**: Delegate to **`@reviewer`** only when an independent review is useful',
        '2. **🛑 CONTRACT CHECKPOINT**: extra stop\n3. **Review**: Delegate to **`@reviewer`** only when an independent review is useful'
      ],
      [
        'Then wait for explicit approval.',
        'This does not gate trivial changes. Then wait for explicit approval.'
      ]
    ])
  })

  it('T13 · un cambio crítico conserva los stops exigidos y el archive sigue separado del contrato', () => {
    const orchestrator = readAgent('orchestrator')

    const stops = normalize(section(orchestrator, '### MANDATORY STOPS'))
    assert.match(
      stops,
      /\*\*MUST STOP\*\* after `@spec-writer` and wait for explicit approval of the change contract/,
      'conserva el stop posterior a @spec-writer'
    )
    assert.match(
      stops,
      /\*\*MUST STOP\*\* if `@tester` reports failed verification/,
      'conserva el stop por verificación fallida del @tester'
    )
    assert.match(
      stops,
      /\*\*MUST STOP\*\* if `@reviewer` reports critical issues \(including a `GUARANTEE NOT SUSTAINED` finding\)/,
      'conserva el stop por hallazgos críticos del @reviewer'
    )

    const pathA = normalize(section(orchestrator, '### Path A: Spec-Required Changes', '\n### '))
    assert.match(pathA, /🛑 CONTRACT CHECKPOINT/, 'Path A debe declarar el CONTRACT CHECKPOINT')
    assertMutationBreaks(archiveStopSeparateFromContract, orchestrator, [
      [
        'the artifact owner.\n\n### Path A: Spec-Required Changes',
        'the artifact owner.\n\n🛑 FINAL ARCHIVE CHECKPOINT\n\n### Path A: Spec-Required Changes'
      ]
    ])

    const git = normalize(section(orchestrator, '### Git ownership', '\n### '))
    assert.match(git, /Merge is permitted but authorized by process/, 'el merge sigue autorizado por proceso')
    assert.match(
      git,
      /only after explicit user approval for that specific case/,
      'el merge exige aprobación explícita del usuario para ese caso'
    )
  })

  it('el checkpoint presenta el contrato y no enumera documentos', () => {
    contractCheckpointPresentsContract(readAgent('orchestrator'))
  })

  it('el checkpoint del contrato es hermano de las rutas, no su contenedor', () => {
    assertMutationBreaks(checkpointIsSiblingOfPaths, readAgent('orchestrator'), [
      ['### Contract Checkpoint', '## Contract Checkpoint']
    ])
  })

  it('mutación A · sin ## Decisiones el guard del proposal falla', () => {
    // Cada generador de skill se muta con su propio slicer: el predicado es el mismo de T01.
    for (const [rel, slice] of Object.entries(PROPOSAL_SLICERS)) {
      if (rel === 'agents/spec-writer.md') continue
      assertMutationBreaks(
        (text) => guardProposalGenerator(slice(text), rel),
        readGeneratorFile(rel),
        [['## Decisiones', '']]
      )
    }

    assertMutationBreaks(
      guardSpecWriterDecisions,
      specWriterDecisions(readAgent('spec-writer')),
      [
        ['## Decisiones', ''],
        ['Both forms are equivalent', ''],
        ['A trivial implementation detail is not a decision', '']
      ]
    )
  })

  it('mutación C · la firma duplicada fuera del slice también rompe la no-duplicación', () => {
    const rel = 'skills/ancleto-propose/SKILL.md'
    const files = proposalFiles()
    assertMutationBreaks(
      (fileText) => guardProposalGenerators({ ...files, [rel]: fileText }),
      files[rel],
      [['## Guardrails', `## Guardrails ${CANONICAL_DEFINITION_SIGNATURE}`]]
    )
    // Control positivo: la firma vive en la superficie canónica, así que el predicado distingue.
    assert.ok(
      normalize(readGeneratorFile('agents/spec-writer.md')).includes(CANONICAL_DEFINITION_SIGNATURE),
      'la firma canónica debe existir en la superficie canónica'
    )
  })

  it('mutación B · si el checkpoint vuelve a pedir documentos el guard falla', () => {
    const orchestrator = readAgent('orchestrator')
    assertMutationBreaks(contractCheckpointPresentsContract, orchestrator, [
      [
        'Then wait for explicit approval.',
        'Wait for approval of the generated documents. Then wait for explicit approval.'
      ],
      ['- **Authorized paths** —', '- **Documents** — `proposal.md`\n- **Authorized paths** —']
    ])
  })

  it('mutación D · reinsertar design.md en un generador rompe el guard negativo', () => {
    assertMutationBreaks(
      (text) => assertNoRetiredArtifact({ 'skills/ancleto-propose/SKILL.md': text }, 'design.md'),
      readGeneratorFile('skills/ancleto-propose/SKILL.md'),
      [['## Guardrails', '## Guardrails\n\n- Emit `design.md` after the proposal.']]
    )
  })

  it('mutación E · reinsertar el borrado de context.md en el archive rompe el guard negativo', () => {
    assertMutationBreaks(
      (text) => assertNoRetiredArtifact({ 'skills/ancleto-archive/SKILL.md': text }, 'context.md'),
      readGeneratorFile('skills/ancleto-archive/SKILL.md'),
      [
        [
          'without modifying it',
          'without modifying it after deleting any legacy `context.md`'
        ]
      ]
    )
  })

  it('mutación G · reinsertar design.md en una superficie de consumo rompe el guard negativo', () => {
    // Cada superficie se muta dentro de su propia sección: el slice es el que debe fallar.
    const cases = {
      'agents/orchestrator.md': [
        [
          '`proposal.md`, `tasks.md`, `specs/`',
          '`proposal.md`, `design.md`, `tasks.md`, `specs/`'
        ]
      ],
      'agents/documenter.md': [
        [
          '2. Confirm the presence of the relevant artifacts:',
          '2. Confirm the presence of the relevant artifacts (including `design.md`):'
        ]
      ],
      'skills/ancleto-apply/SKILL.md': [
        [
          '- `proposal.md` — what & why (if present)',
          '- `proposal.md` — what & why (if present)\n- `design.md` — archived design (if present)'
        ]
      ]
    }
    for (const [label, mutations] of Object.entries(cases)) {
      assertMutationBreaks(
        (text) => assertNoRetiredArtifact({ [label]: designSurface(label, text) }, 'design.md'),
        readGeneratorFile(label),
        mutations
      )
    }
  })

  it('mutación H · reinsertar design.md en la clasificación de update rompe el guard negativo', () => {
    const label = 'skills/ancleto-update/SKILL.md'
    assertMutationBreaks(
      (text) => assertNoRetiredArtifact({ [label]: designSurface(label, text) }, 'design.md'),
      readGeneratorFile(label),
      [
        [
          '| Design decision | `proposal.md ## Decisiones` |',
          '| Design decision | `design.md` |'
        ]
      ]
    )
  })
})
