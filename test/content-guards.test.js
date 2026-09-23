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
