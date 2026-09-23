import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  'ancleto-upgrade'
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
  it('spec-writer exige artefactos en ingles', () => {
    const t = readFileSync(join(ROOT, 'agents', 'spec-writer.md'), 'utf8')
    assert.match(t, /All artifact content MUST be written in English/)
    assert.doesNotMatch(t, /artifact content MUST be written in Spanish/)
    assert.match(t, /MUST NOT be translated/)
  })

  it('documenter exige specs en ingles', () => {
    const t = readFileSync(join(ROOT, 'agents', 'documenter.md'), 'utf8')
    assert.match(t, /MUST NOT be translated/)
  })

  it('las skills que escriben artefactos declaran el idioma', () => {
    for (const s of ARTIFACT_SKILLS) {
      const p = join(ROOT, 'skills', s, 'SKILL.md')
      assert.ok(existsSync(p), `falta ${s}`)
      const t = readFileSync(p, 'utf8')
      assert.match(t, /\*\*Artifacts language\*\*/, `${s} sin linea de idioma`)
      assert.match(t, /MUST NOT be translated/, `${s} sin regla de keywords literales`)
    }
  })

  it('templates/AGENTS.md declara el idioma de los artifacts', () => {
    const t = readFileSync(join(ROOT, 'templates', 'AGENTS.md'), 'utf8')
    assert.match(t, /Idioma de los artifacts/)
    assert.match(t, /no se traducen/)
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
    assert.equal(commands.length, 12)
    for (const c of commands) {
      const t = readFileSync(join(ROOT, 'commands', c), 'utf8')
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
    for (const field of ['task-owned files', 'Validation Ledger', 'SPEC UPDATE RECOMMENDED', 'SEED_ACTION_REQUIRED']) {
      assert.ok(t.includes(field), `falta ${field} en el contrato de destilado`)
    }
  })
})

describe('content guards - frescura del seed al archivar (issue #17)', () => {
  it('la skill ancleto-archive chequea STALE y ofrece regenerar sin automatico', () => {
    const t = readFileSync(join(ROOT, 'skills', 'ancleto-archive', 'SKILL.md'), 'utf8')
    assert.match(t, /ancleto discovery --check/)
    assert.match(t, /Never regenerate automatically/)
    assert.match(t, /If the user declines, continue the archive/)
  })

  it('el orchestrator chequea la frescura del seed antes de archivar', () => {
    const t = readFileSync(join(ROOT, 'agents', 'orchestrator.md'), 'utf8')
    assert.match(t, /Check the seed freshness before closing/)
    assert.match(t, /state is `STALE`/)
    assert.match(t, /never automatic; if the user declines, continue the archive/)
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
