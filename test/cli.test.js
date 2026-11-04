import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync, cpSync, copyFileSync, linkSync, readdirSync, chmodSync, statSync, symlinkSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, delimiter, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { createMemoryEngine } from '../src/core/memory/engine.js'
import { TIER_CHAINS } from '../src/core/tier-models.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CLI = join(TEST_DIR, '..', 'src', 'cli', 'index.js')
const PKG = JSON.parse(readFileSync(join(TEST_DIR, '..', 'package.json'), 'utf8'))

function run(args, cwd, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-cli-'))
  try {
    return fn(dir)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort
    }
  }
}

function readRc(dir) {
  return JSON.parse(readFileSync(join(dir, '.ancletorc'), 'utf8'))
}

// Catálogo alternativo por `ANCLETO_MODEL_CATALOG`: seam de test/manual, mismo
// precedente que `ANCLETO_PROJECTS_FILE`. Se arma desde el snapshot commiteado
// quitándole los IDs indicados; nunca se muta el snapshot versionado.
function catalogWithout(dir, ids, name = 'catalog.json') {
  const base = JSON.parse(readFileSync(join(TEST_DIR, '..', 'src', 'core', 'model-catalog.json'), 'utf8'))
  const providers = Object.fromEntries(
    Object.entries(base.providers).map(([provider, entries]) => [
      provider,
      entries.filter((entry) => !ids.includes(entry.id))
    ])
  )
  const path = join(dir, name)
  writeFileSync(path, JSON.stringify({ ...base, providers }))
  return path
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Snapshot inyectable por `ANCLETO_MODEL_CATALOG` con fecha y IDs controlados: la base
// es el snapshot commiteado (nunca se muta), del que se quitan IDs opcionales.
function catalogSnapshot(dir, { removeIds = [], generatedAt = daysAgo(0), name = 'catalog-snapshot.json' } = {}) {
  const base = JSON.parse(readFileSync(join(TEST_DIR, '..', 'src', 'core', 'model-catalog.json'), 'utf8'))
  const providers = Object.fromEntries(
    Object.entries(base.providers).map(([provider, entries]) => [
      provider,
      entries.filter((entry) => !removeIds.includes(entry.id))
    ])
  )
  const path = join(dir, name)
  writeFileSync(path, JSON.stringify({ ...base, generated_at: generatedAt, providers }))
  return path
}

describe('CLI init (G6 manifest)', () => {
  it('crea el .ancletorc con el manifiesto completo', () => {
    withDir((dir) => {
      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      const rc = readRc(dir)
      assert.equal(rc.schemaVersion, 1)
      assert.equal(rc.version, PKG.version)
      assert.ok(!Number.isNaN(Date.parse(rc.installedAt)))
      assert.deepEqual(rc.azure, { enabled: false })
      assert.deepEqual(rc.discovery, { outputDir: 'docs/technical-discovery', exclude: [] })
      // init materializa el layout del host (default opencode) y lo registra (D10/1.7).
      assert.deepEqual(rc.installedPaths, {
        templates: ['AGENTS.md', 'PRODUCT.md'],
        agents: ['.opencode/agents'],
        commands: ['.opencode/commands'],
        skills: ['.opencode/skills']
      })
    })
  })

  it('init --with-azure habilita azure', () => {
    withDir((dir) => {
      const r = run(['init', '--with-azure'], dir)
      assert.equal(r.status, 0)
      assert.deepEqual(readRc(dir).azure, { enabled: true })
    })
  })

  it('init re-ejecutado preserva config existente y campos de usuario', () => {
    withDir((dir) => {
      run(['init'], dir)
      const rcPath = join(dir, '.ancletorc')
      const rc = readRc(dir)
      rc.customField = 'no-tocar'
      rc.discovery.exclude = ['vendor']
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))

      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      const rc2 = readRc(dir)
      assert.equal(rc2.customField, 'no-tocar')
      assert.deepEqual(rc2.discovery.exclude, ['vendor'])
      assert.equal(rc2.version, PKG.version)
    })
  })
})

describe('CLI agent (S1)', () => {
  it('init --agent cursor guarda "agent": "cursor"', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'cursor'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).agent, 'cursor')
    })
  })

  it('agente no soportado falla con exit 1', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'invalid'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /agente invalido/)
    })
  })

  it('install --project guarda "agent": "opencode" por defecto sin prompt', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).agent, 'opencode')
    })
  })

  it('ejecuciones subsecuentes preservan "agent" preexistente', () => {
    withDir((dir) => {
      run(['init', '--agent', 'cursor'], dir)
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).agent, 'cursor')
    })
  })
})

describe('CLI multi-host routing y adapters (add-multi-agent-cli-support)', () => {
  const REPO = join(TEST_DIR, '..')
  const SKILL_SRC = (n) => join(REPO, 'skills', n, 'SKILL.md')
  const AGENT_SRC = (n) => join(REPO, 'agents', `${n}.md`)
  const COMMAND_SRC = (n) => join(REPO, 'commands', `${n}.md`)

  it('5.1 init --agent vscode rutea a .github con sufijos .agent.md/.prompt.md', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'vscode'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.github', 'skills', 'triage-clarifier', 'SKILL.md')))
      assert.ok(existsSync(join(dir, '.github', 'agents', 'orchestrator.agent.md')))
      assert.ok(existsSync(join(dir, '.github', 'prompts', 'cleto-new.prompt.md')))
      assert.equal(existsSync(join(dir, '.opencode', 'agents')), false, 'no escribe agents en otro base')
      assert.equal(existsSync(join(dir, '.vscode')), false, 'no usa la ruta vieja .vscode/skills')
      const rc = readRc(dir)
      assert.deepEqual(rc.installedPaths.skills, ['.github/skills'])
      assert.deepEqual(rc.installedPaths.agents, ['.github/agents'])
      assert.deepEqual(rc.installedPaths.commands, ['.github/prompts'])
    })
  })

  it('6.1 init --agent antigravity escribe skills y agents adaptados sin avisos de skip (D10)', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'antigravity', '--no-mcp'], dir, { ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') })
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.agents', 'skills', 'triage-clarifier', 'SKILL.md')))
      assert.equal(existsSync(join(dir, '.antigravity', 'skills')), false, 'no usa la ruta vieja')
      assert.ok(existsSync(join(dir, '.agents', 'agents', 'orchestrator.md')))
      assert.equal(existsSync(join(dir, '.agents', 'commands')), false)
      assert.doesNotMatch(r.stderr, /skip agents: not supported by host 'antigravity'/)
      assert.doesNotMatch(r.stderr, /skip commands: not supported by host 'antigravity'/)
      const rc = readRc(dir)
      assert.equal(rc.agent, 'antigravity')
      assert.deepEqual(rc.installedPaths.skills, ['.agents/skills'])
      assert.deepEqual(rc.installedPaths.agents, ['.agents/agents'])
      assert.deepEqual(rc.installedPaths.commands, [])
    })
  })

  it('5.3 opencode conserva .opencode/* y <n>.md (sin regresión)', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'commands', 'cleto-new.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'skills', 'triage-clarifier', 'SKILL.md')))
      const rc = readRc(dir)
      assert.deepEqual(rc.installedPaths.agents, ['.opencode/agents'])
      assert.deepEqual(rc.installedPaths.commands, ['.opencode/commands'])
      assert.deepEqual(rc.installedPaths.skills, ['.opencode/skills'])
    })
  })

  it('5.4 multi-agente acumula la unión de destinos y check valida ambos sin huérfanos', () => {
    withDir((dir) => {
      assert.equal(run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir).status, 0)
      assert.equal(run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'vscode'], dir).status, 0)
      const rc = readRc(dir)
      assert.deepEqual(rc.installedPaths.agents, ['.opencode/agents', '.github/agents'])
      assert.deepEqual(rc.installedPaths.commands, ['.opencode/commands', '.github/prompts'])
      assert.deepEqual(rc.installedPaths.skills, ['.opencode/skills', '.github/skills'])
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      assert.match(r.stdout, /0 huerfanos/)
      assert.match(r.stdout, /✔ \.opencode\/agents/)
      assert.match(r.stdout, /✔ \.github\/agents/)
      // Con `minimo` el tier coincide con la canónica: no hay aviso de tier.
      assert.doesNotMatch(r.stdout, /aplica un modelo distinto/)
    })
  })

  it('5.5 adaptador Claude: agents sin claves opencode/model/tools y skills byte-idénticas', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'claude'], dir)
      assert.equal(r.status, 0)

      const skillSrc = readFileSync(SKILL_SRC('triage-clarifier'))
      const skillOut = readFileSync(join(dir, '.claude', 'skills', 'triage-clarifier', 'SKILL.md'))
      assert.ok(skillOut.equals(skillSrc), 'SKILL.md byte-idéntica')

      const coderSrc = readFileSync(AGENT_SRC('coder'), 'utf8')
      assert.match(coderSrc, /^mode: /m)
      assert.match(coderSrc, /^model: .+$/m)
      assert.match(coderSrc, /^tools:/m)

      const coderOut = readFileSync(join(dir, '.claude', 'agents', 'coder.md'), 'utf8')
      assert.doesNotMatch(coderOut, /^mode:/m)
      assert.doesNotMatch(coderOut, /^color:/m)
      assert.doesNotMatch(coderOut, /^temperature:/m)
      assert.doesNotMatch(coderOut, /^permission:/m)
      assert.doesNotMatch(coderOut, /^tools:/m)
      assert.doesNotMatch(coderOut, /^model:/m)
      assert.match(coderOut, /^description: Implements approved changes/m)
    })
  })

  it('5.12 adaptador vscode: .agent.md adaptado (no verbatim), sin claves opencode/model/tools', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'vscode'], dir)
      assert.equal(r.status, 0)

      const coderSrc = readFileSync(AGENT_SRC('coder'), 'utf8')
      assert.match(coderSrc, /^mode: /m)
      assert.match(coderSrc, /^model: .+$/m)
      assert.match(coderSrc, /^tools:/m)

      const coderOut = readFileSync(join(dir, '.github', 'agents', 'coder.agent.md'), 'utf8')
      assert.doesNotMatch(coderOut, /^mode:/m)
      assert.doesNotMatch(coderOut, /^color:/m)
      assert.doesNotMatch(coderOut, /^temperature:/m)
      assert.doesNotMatch(coderOut, /^permission:/m)
      assert.doesNotMatch(coderOut, /^tools:/m)
      assert.doesNotMatch(coderOut, /^model:/m)
      assert.match(coderOut, /^description: Implements approved changes/m)
    })
  })

  it('5.12 los commands de vscode se copian verbatim (sólo description, sin adaptación)', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'vscode'], dir)
      assert.equal(r.status, 0)
      const out = readFileSync(join(dir, '.github', 'prompts', 'cleto-new.prompt.md'))
      assert.ok(out.equals(readFileSync(COMMAND_SRC('cleto-new'))), 'command vscode byte-idéntico')
    })
  })

  it('5.5 hosts sin adaptación preservan verbatim (skills op/cursor/roo/antigravity; opencode agent no adaptado)', () => {
    withDir((dir) => {
      assert.equal(run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir).status, 0)
      assert.ok(
        readFileSync(join(dir, '.opencode', 'skills', 'triage-clarifier', 'SKILL.md')).equals(readFileSync(SKILL_SRC('triage-clarifier'))),
        'skill opencode byte-idéntica'
      )
      // opencode no está en el set de adapters: conserva las claves de opencode
      // (el tier puede reescribir `model`, por eso no se compara byte a byte).
      const opencodeAgent = readFileSync(join(dir, '.opencode', 'agents', 'coder.md'), 'utf8')
      assert.match(opencodeAgent, /^mode:/m, 'agent opencode no adaptado')
      assert.match(opencodeAgent, /^tools:/m)

      for (const [agent, base] of [
        ['cursor', '.cursor'],
        ['roo', '.roo'],
        ['antigravity', '.agents']
      ]) {
        const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', agent], dir)
        assert.equal(r.status, 0)
        assert.ok(
          readFileSync(join(dir, base, 'skills', 'triage-clarifier', 'SKILL.md')).equals(readFileSync(SKILL_SRC('triage-clarifier'))),
          `skill de ${agent} byte-idéntica`
        )
      }
    })
  })

  it('5.6 init --agent claude exit 0, persiste agent y escribe bajo .claude/*', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'claude'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).agent, 'claude')
      assert.ok(existsSync(join(dir, '.claude', 'skills', 'triage-clarifier', 'SKILL.md')))
      assert.ok(existsSync(join(dir, '.claude', 'agents', 'orchestrator.md')))
      assert.ok(existsSync(join(dir, '.claude', 'commands', 'cleto-new.md')))
      const rc = readRc(dir)
      assert.deepEqual(rc.installedPaths.skills, ['.claude/skills'])
      assert.deepEqual(rc.installedPaths.agents, ['.claude/agents'])
      assert.deepEqual(rc.installedPaths.commands, ['.claude/commands'])
    })
  })

  it('5.6 claude se preserva en un install posterior sin --agent', () => {
    withDir((dir) => {
      run(['init', '--agent', 'claude'], dir)
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).agent, 'claude')
    })
  })

  it('5.7 --agent claude no crea archivos MCP de host', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'claude'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.mcp.json')), false)
      assert.equal(existsSync(join(dir, 'mcp_config.json')), false)
      assert.equal(existsSync(join(dir, '.vscode', 'mcp.json')), false)
    })
  })

  it('5.7 un .mcp.json preexistente se conserva intacto', () => {
    withDir((dir) => {
      const prev = JSON.stringify({ mcpServers: { custom: { command: 'x' } } }, null, 2) + '\n'
      writeFileSync(join(dir, '.mcp.json'), prev)
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'claude'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dir, '.mcp.json'), 'utf8'), prev)
    })
  })

  it('5.9 instalar --agent claude tras opencode deja .opencode/* intacto', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const before = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'claude'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8'), before)
      assert.ok(existsSync(join(dir, '.claude', 'agents', 'orchestrator.md')))
      assert.deepEqual(readRc(dir).installedPaths.agents, ['.opencode/agents', '.claude/agents'])
    })
  })

  it('5.11 cursor rutea a .cursor/skills y roo a .roo/skills (roo: evidencia 3rd-party)', () => {
    withDir((dir) => {
      const c = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'cursor'], dir)
      assert.equal(c.status, 0)
      assert.ok(existsSync(join(dir, '.cursor', 'skills', 'triage-clarifier', 'SKILL.md')))
      assert.equal(existsSync(join(dir, '.cursor', 'agents')), false)
      const rr = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'roo'], dir)
      assert.equal(rr.status, 0)
      assert.ok(existsSync(join(dir, '.roo', 'skills', 'triage-clarifier', 'SKILL.md')))
      assert.equal(existsSync(join(dir, '.roo', 'agents')), false)
      assert.deepEqual(readRc(dir).installedPaths.skills, ['.cursor/skills', '.roo/skills'])
    })
  })

  it('5.12 install cursor/roo avisa passthrough de frontmatter (sin formato documentado)', () => {
    withDir((dir) => {
      const c = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'cursor'], dir)
      assert.equal(c.status, 0)
      assert.match(c.stderr, /no documented frontmatter adaptation for host 'cursor'/)
      const rr = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'roo'], dir)
      assert.equal(rr.status, 0)
      assert.match(rr.stderr, /no documented frontmatter adaptation for host 'roo'/)
    })
  })
})

describe('CLI antigravity full support (add-antigravity-full-support)', () => {
  const REPO = join(TEST_DIR, '..')
  const AGENT_SRC = (n) => join(REPO, 'agents', `${n}.md`)
  const regEnv = (dir) => ({ ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') })

  it('6.2 init --agent antigravity rutea skills/agents a .agents y no crea .agents/commands', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'antigravity', '--no-mcp'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.agents', 'skills', 'triage-clarifier', 'SKILL.md')))
      assert.ok(existsSync(join(dir, '.agents', 'agents', 'orchestrator.md')))
      assert.equal(existsSync(join(dir, '.agents', 'commands')), false)
      assert.doesNotMatch(r.stderr, /skip (agents|commands): not supported/)
      const rc = readRc(dir)
      assert.deepEqual(rc.installedPaths.skills, ['.agents/skills'])
      assert.deepEqual(rc.installedPaths.agents, ['.agents/agents'])
      assert.deepEqual(rc.installedPaths.commands, [])
    })
  })

  it('6.3 adaptador antigravity: name, description, tools lista, model inherit y sin claves opencode', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const src = readFileSync(AGENT_SRC('coder'), 'utf8')
      assert.match(src, /^mode: subagent$/m)
      assert.match(src, /^model: .+$/m)
      assert.match(src, /^tools:$/m)

      const out = readFileSync(join(dir, '.agents', 'agents', 'coder.md'), 'utf8')
      assert.match(out, /^name: coder$/m)
      assert.match(out, /^description: Implements approved changes from aspec artifacts or orchestrator instructions$/m)
      // D3: sólo ids de la columna (A). `write` no tiene id confirmado -> se omite.
      assert.match(out, /^tools: \[view_file, replace_file_content, run_command\]$/m)
      assert.doesNotMatch(out, /write_to_file/)
      assert.match(r.stderr, /skip tool 'write': no verified Antigravity id for agent 'coder'/)
      assert.match(out, /^model: inherit$/m)
      assert.match(out, /^mainAgent: false$/m)
      assert.match(out, /^subagent: true$/m)
      assert.doesNotMatch(out, /^mode:/m)
      assert.doesNotMatch(out, /^color:/m)
      assert.doesNotMatch(out, /^temperature:/m)
      assert.doesNotMatch(out, /^permission:/m)
      // task: false no viaja: no hay aviso y la lista no cambia.
      assert.doesNotMatch(r.stderr, /skip tool 'task': no verified Antigravity id for agent 'coder'/)

      // El task: true real del orquestador no es portable: se descarta con aviso
      // visible y la salida conserva la lista de tools esperada para el host.
      const orch = readFileSync(join(dir, '.agents', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orch, /^tools: \[view_file\]$/m)
      assert.match(r.stderr, /skip tool 'task': no verified Antigravity id for agent 'orchestrator'/)
    })
  })

  it('6.3 dedupe: cada clave gestionada se emite una sola vez, en orden determinista', () => {
    const AGENT = 'fixture-dedupe'
    withDir((dir) => {
      const root = mkdtempSync(join(tmpdir(), 'ancleto-cli-src-'))
      try {
        for (const d of ['src', 'agents', 'commands', 'skills', 'templates']) {
          cpSync(join(REPO, d), join(root, d), { recursive: true })
        }
        copyFileSync(join(REPO, 'package.json'), join(root, 'package.json'))
        // Fuente con claves gestionadas repetidas y con claves que el adaptador dropea:
        // el adaptador debe filtrarlas TODAS y re-emitirlas una sola vez (ordinal fijo),
        // sin importar cuántas veces ni dónde las declare el origen.
        writeFileSync(
          join(root, 'agents', `${AGENT}.md`),
          [
            '---',
            'name: nombre-declarado-en-la-fuente',
            'description: Primera description gestionada',
            'mode: subagent',
            'tools:',
            '  read: true',
            'mainAgent: true',
            'subagent: false',
            'model: opencode-go/algo',
            'color: red',
            'temperature: 0.1',
            'permission: allow',
            'tools:',
            '  grep: true',
            'description: Segunda description gestionada (duplicada en la fuente)',
            'skills: [ancleto-new]',
            'mcpServers:',
            '  custom:',
            '    command: custom-cmd',
            '---',
            '',
            '# Fixture dedupe',
            ''
          ].join('\n')
        )
        const r = spawnSync(
          process.execPath,
          [join(root, 'src', 'cli', 'index.js'), 'install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'],
          { cwd: dir, encoding: 'utf8',     env: { ...process.env, ...regEnv(dir) } }
        )
        assert.equal(r.status, 0)
        const out = readFileSync(join(dir, '.agents', 'agents', `${AGENT}.md`), 'utf8')
        const count = (key) => (out.match(new RegExp(`^${key}:`, 'gm')) || []).length

        // Cada clave gestionada aparece exactamente una vez pese a los duplicados del origen.
        const managed = ['name', 'description', 'tools', 'mainAgent', 'subagent', 'model', 'commandExecutionPolicy', 'mcpServers', 'skills']
        for (const key of managed) {
          assert.equal(count(key), 1, `${key} emitido una sola vez`)
        }
        // Las claves dropeadas no sobreviven, ni siquiera duplicadas.
        for (const key of ['mode', 'color', 'temperature', 'permission']) {
          assert.equal(count(key), 0, `${key} no se emite`)
        }
        // Orden determinista del adaptador (D2).
        const positions = managed.map((k) => out.search(new RegExp(`^${k}:`, 'm')))
        for (let i = 1; i < positions.length; i++) {
          assert.ok(positions[i] > positions[i - 1], `${managed[i]} va despues de ${managed[i - 1]}`)
        }
        // Los valores derivados pisan a los declarados en la fuente.
        assert.match(out, /^name: fixture-dedupe$/m)
        assert.match(out, /^description: Primera description gestionada$/m)
        assert.match(out, /^tools: \[view_file\]$/m)
        assert.match(out, /^mainAgent: false$/m)
        assert.match(out, /^subagent: true$/m)
        assert.match(out, /^model: inherit$/m)
        assert.match(out, /^commandExecutionPolicy: sandbox$/m)
        assert.match(out, /^  custom:$/m)
        assert.doesNotMatch(out, /nombre-declarado-en-la-fuente/)
        assert.doesNotMatch(out, /Segunda description gestionada/)
      } finally {
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      }
    })
  })

  it('6.4 memory-keeper no emite ids MCP: sólo (A) y aviso por clave sin id verificado', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const mk = readFileSync(join(dir, '.agents', 'agents', 'memory-keeper.md'), 'utf8')
      // Sólo ids de (A): read->view_file, grep->grep_search.
      assert.match(mk, /^tools: \[view_file, grep_search\]$/m)
      // MCP no es tool: nunca se emite un id de MCP (`call_mcp_tool` prohibido, D3/D5).
      assert.doesNotMatch(mk, /call_mcp_tool/)
      // (d) las claves MCP del mapa `tools` no tienen id verificado -> avisan (tensión con D5: flag).
      for (const k of ['searchMemory', 'recordRule', 'recordDecision']) {
        assert.match(r.stderr, new RegExp(`skip tool '${k}': no verified Antigravity id for agent 'memory-keeper'`))
      }
      // (e) `write: false`/`edit: false` no avisan (se distinguen del aviso de la clave `write: true` de otros agents).
      assert.doesNotMatch(r.stderr, /skip tool '(write|edit)': no verified Antigravity id for agent 'memory-keeper'/)
    })
  })

  it('6.4 skill: true no emite un id de tool, no crea campo skills y no avisa', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const orch = readFileSync(join(dir, '.agents', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orch, /^tools: \[view_file\]$/m)
      assert.doesNotMatch(orch, /^skills:/m)
      assert.match(orch, /^mainAgent: true$/m)
      assert.match(orch, /^subagent: false$/m)
      // (b) `skill` no es tool: no cae en el aviso de tool sin id.
      assert.doesNotMatch(r.stderr, /skip tool 'skill'/)
    })
  })

  it('6.4 una tool sin id verificado se omite con aviso a stderr y exit 0 (sin inferir MCP)', () => {
    withDir((dir) => {
      const root = mkdtempSync(join(tmpdir(), 'ancleto-cli-src-'))
      try {
        for (const d of ['src', 'agents', 'commands', 'skills', 'templates']) {
          cpSync(join(REPO, d), join(root, d), { recursive: true })
        }
        copyFileSync(join(REPO, 'package.json'), join(root, 'package.json'))
        writeFileSync(
          join(root, 'agents', 'fixture-unknown-tool.md'),
          ['---', 'description: Fixture agent with an unverified tool', 'mode: subagent', 'tools:', '  read: true', '  unknown_tool: true', '---', '', '# Fixture', ''].join('\n')
        )
        const cli = join(root, 'src', 'cli', 'index.js')
        const r = spawnSync(
          process.execPath,
          [cli, 'install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'],
          { cwd: dir, encoding: 'utf8',     env: { ...process.env, ...regEnv(dir) } }
        )
        assert.equal(r.status, 0)
        assert.match(r.stderr, /skip tool 'unknown_tool': no verified Antigravity id for agent 'fixture-unknown-tool'/)
        const out = readFileSync(join(dir, '.agents', 'agents', 'fixture-unknown-tool.md'), 'utf8')
        assert.match(out, /^tools: \[view_file\]$/m)
        assert.doesNotMatch(out, /unknown_tool/)
        // MCP no se infiere desde una clave desconocida del mapa `tools`.
        assert.doesNotMatch(out, /call_mcp_tool/)
      } finally {
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      }
    })
  })

  it('6.5 los commands se materializan como skills y el manifiesto no registra commands', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'antigravity', '--no-mcp'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.agents', 'skills', 'cleto-new', 'SKILL.md')))
      const sk = readFileSync(join(dir, '.agents', 'skills', 'cleto-new', 'SKILL.md'), 'utf8')
      assert.match(sk, /^name: cleto-new$/m)
      assert.match(sk, /^description: Start a new change using the experimental artifact workflow$/m)
      assert.match(sk, /Invoke the `ancleto-new` skill/)
      assert.deepEqual(readRc(dir).installedPaths.commands, [])
    })
  })

  it('6.6 init antigravity crea .agents/mcp_config.json con el esquema del host (sin type/enabled)', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'antigravity', '--tier', 'minimo'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.agents', 'mcp_config.json'), 'utf8'))
      assert.ok(cfg.mcpServers['ancleto-memory'], 'ancleto-memory presente')
      assert.equal(cfg.mcpServers['ancleto-memory'].command, process.execPath)
      assert.deepEqual(cfg.mcpServers['ancleto-memory'].args.slice(-1), ['mcp'])
      assert.equal('type' in cfg.mcpServers['ancleto-memory'], false)
      assert.equal('enabled' in cfg.mcpServers['ancleto-memory'], false)
    })
  })

  it('6.6 el merge de mcp_config.json preserva homonimos y claves preexistentes', () => {
    withDir((dir) => {
      mkdirSync(join(dir, '.agents'), { recursive: true })
      const prev = {
        mcpServers: {
          propio: { command: 'propio-cmd', args: ['--x'] },
          'ancleto-memory': { command: 'memoria-propia', args: ['--keep'] }
        },
        customTop: 1
      }
      writeFileSync(join(dir, '.agents', 'mcp_config.json'), JSON.stringify(prev, null, 2) + '\n')
      const r = run(['init', '--agent', 'antigravity', '--tier', 'minimo'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.agents', 'mcp_config.json'), 'utf8'))
      assert.deepEqual(cfg.mcpServers.propio, { command: 'propio-cmd', args: ['--x'] })
      assert.deepEqual(cfg.mcpServers['ancleto-memory'], { command: 'memoria-propia', args: ['--keep'] })
      assert.equal(cfg.customTop, 1)
    })
  })

  it('6.6 un mcp_config.json invalido se avisa y no se sobrescribe', () => {
    withDir((dir) => {
      mkdirSync(join(dir, '.agents'), { recursive: true })
      writeFileSync(join(dir, '.agents', 'mcp_config.json'), '{ no es json')
      const r = run(['init', '--agent', 'antigravity', '--tier', 'minimo'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.match(r.stderr, /no se pudo leer mcp_config\.json como JSON/)
      assert.equal(readFileSync(join(dir, '.agents', 'mcp_config.json'), 'utf8'), '{ no es json')
    })
  })

  it('6.6 --no-mcp omite el MCP sin afectar el resto de los assets', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'antigravity', '--no-mcp'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.agents', 'mcp_config.json')), false)
      assert.equal(existsSync(join(dir, '.opencode')), false)
      assert.ok(existsSync(join(dir, '.agents', 'agents', 'coder.md')))
      assert.ok(existsSync(join(dir, '.agents', 'skills', 'cleto-new', 'SKILL.md')))
    })
  })

  it('6.7 check valida el layout antigravity sin faltantes/huerfanos ni falso tier huerfano', () => {
    withDir((dir) => {
      run(['init', '--agent', 'antigravity', '--tier', 'minimo'], dir, regEnv(dir))
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      assert.match(r.stdout, /0 huerfanos/)
      assert.match(r.stdout, /✔ \.agents\/agents/)
      assert.match(r.stdout, /✔ \.agents\/skills/)
      assert.doesNotMatch(r.stdout, /tier .* sin agentes locales/)
    })
  })

  it('6.7 el proyecto antigravity figura scoped en projects list', () => {
    withDir((dir) => {
      run(['init', '--agent', 'antigravity', '--tier', 'minimo'], dir, regEnv(dir))
      const r = run(['projects', 'list', '--json'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.projects[0].agent, 'antigravity')
      assert.equal(j.projects[0].scoped, true)
    })
  })

  it('6.8 opencode conserva .opencode/* y configura su MCP en opencode.json', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--tier', 'gratis', '--agent', 'opencode'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'commands', 'cleto-new.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'skills', 'triage-clarifier', 'SKILL.md')))
      const cfg = JSON.parse(readFileSync(join(dir, '.opencode', 'opencode.json'), 'utf8'))
      assert.ok(cfg.mcp['ancleto-memory'])
      assert.match(readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8'), /^mode:/m)
      assert.equal(existsSync(join(dir, '.agents', 'mcp_config.json')), false)
      assert.equal(existsSync(join(dir, '.agents')), false)
    })
  })

  it('6.8 claude y vscode no crean MCP de host ni el layout de antigravity', () => {
    withDir((dir) => {
      const c = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'claude'], dir, regEnv(dir))
      assert.equal(c.status, 0)
      const claudeCoder = readFileSync(join(dir, '.claude', 'agents', 'coder.md'), 'utf8')
      assert.doesNotMatch(claudeCoder, /^tools:/m)
      assert.doesNotMatch(claudeCoder, /^mode:/m)
      const v = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'vscode'], dir, regEnv(dir))
      assert.equal(v.status, 0)
      assert.ok(existsSync(join(dir, '.github', 'agents', 'coder.agent.md')))
      assert.equal(existsSync(join(dir, '.mcp.json')), false)
      assert.equal(existsSync(join(dir, '.vscode', 'mcp.json')), false)
      assert.equal(existsSync(join(dir, '.agents')), false)
    })
  })

  it('6.8 cursor sigue siendo solo-skills sin agents ni layout antigravity', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'cursor'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.cursor', 'skills', 'triage-clarifier', 'SKILL.md')))
      assert.equal(existsSync(join(dir, '.cursor', 'agents')), false)
      assert.equal(existsSync(join(dir, '.agents')), false)
    })
  })

  it('6.9 grep se mapea a grep_search y nunca a search_directory ni find_file', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const td = readFileSync(join(dir, '.agents', 'agents', 'technical-discovery.md'), 'utf8')
      // Sólo (A): read->view_file, bash->run_command, grep->grep_search. `glob` se omite con aviso.
      assert.match(td, /^tools: \[view_file, run_command, grep_search\]$/m)
      assert.doesNotMatch(td, /search_directory/)
      assert.doesNotMatch(td, /find_file/)
      assert.match(r.stderr, /skip tool 'glob': no verified Antigravity id for agent 'technical-discovery'/)
    })
  })

  it('CRITICAL: agent con tools no mapeadas arranca (exit 0) y avisa cada omisión', () => {
    // Verificación ESTRUCTURAL (en CI no hay Antigravity real, así que no se observa el
    // runtime del host): se comprueba que el frontmatter emitido contiene SOLO ids de la
    // columna (A) y que cada tool omitida deja su línea de aviso (D3/D5). Es la mitigación
    // del Known Issue: un id no verificado cuelga el subagente, por lo que el conjunto
    // emitible debe ser el cerrado y verificado.
    const VERIFIED = ['view_file', 'replace_file_content', 'grep_search', 'run_command', 'manage_task']
    const AGENT = 'fixture-no-mapped-tools'
    const UNMAPPED = ['write', 'glob', 'task', 'webfetch', 'websearch', 'find_file', 'call_mcp_tool', 'invoke_subagent', 'searchMemory', 'unknown_tool']
    withDir((dir) => {
      const root = mkdtempSync(join(tmpdir(), 'ancleto-cli-src-'))
      try {
        for (const d of ['src', 'agents', 'commands', 'skills', 'templates']) {
          cpSync(join(REPO, d), join(root, d), { recursive: true })
        }
        copyFileSync(join(REPO, 'package.json'), join(root, 'package.json'))
        writeFileSync(
          join(root, 'agents', `${AGENT}.md`),
          ['---', 'description: Fixture con tools mapeadas y no mapeadas', 'mode: subagent', 'tools:', '  read: true', '  edit: true', '  grep: true', '  bash: true', '  todowrite: true', ...UNMAPPED.map((k) => `  ${k}: true`), '---', '', '# Fixture', ''].join('\n')
        )
        const r = spawnSync(
          process.execPath,
          [join(root, 'src', 'cli', 'index.js'), 'install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'],
          { cwd: dir, encoding: 'utf8',     env: { ...process.env, ...regEnv(dir) } }
        )
        // (a) arranca sin colgar: exit 0 pese a las tools sin id verificado.
        assert.equal(r.status, 0)
        const out = readFileSync(join(dir, '.agents', 'agents', `${AGENT}.md`), 'utf8')
        const line = out.match(/^tools: \[(.*)\]$/m)
        assert.ok(line, 'frontmatter con lista tools')
        const emitted = line[1] ? line[1].split(', ') : []
        // Estructural: SOLO ids de (A), en el orden de declaración de las claves mapeadas.
        assert.deepEqual(emitted, VERIFIED)
        for (const id of emitted) assert.ok(VERIFIED.includes(id), `id verificado: ${id}`)
        // (c) formato del aviso D5: uno por cada tool omitida, nombrando tool y agent.
        for (const k of UNMAPPED) {
          assert.match(r.stderr, new RegExp(`skip tool '${k}': no verified Antigravity id for agent '${AGENT}'`))
        }
        // Ningún id de (B) solo-SDK, (C) comunidad ni (D) delegación se filtra al frontmatter.
        assert.doesNotMatch(out, /find_file|call_mcp_tool|invoke_subagent|write_to_file|start_subagent|define_subagent/)
      } finally {
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      }
    })
  })

  it('6.10 multi-host: antigravity + opencode con rc.agent opencode no reporta huérfanos falsos', () => {
    withDir((dir) => {
      assert.equal(run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'], dir, regEnv(dir)).status, 0)
      // Segundo install con --agent opencode acumula destinos y fija rc.agent=opencode.
      assert.equal(run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'opencode'], dir, regEnv(dir)).status, 0)
      assert.ok(existsSync(join(dir, '.agents', 'skills', 'cleto-new', 'SKILL.md')), 'command-skill de antigravity presente')
      assert.equal(readRc(dir).agent, 'opencode')
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      // El conjunto esperado de `.agents/skills` sale de la unión de hosts instalados,
      // no de rc.agent: si saliera sólo de opencode, los command-skills serían huérfanos.
      assert.match(r.stdout, /0 faltantes/)
      assert.match(r.stdout, /0 huerfanos/)
      assert.match(r.stdout, /✔ \.agents\/skills/)
      assert.match(r.stdout, /✔ \.opencode\/skills/)
    })
  })
})

describe('CLI documentación multi-host (R2/R3)', () => {
  const README = readFileSync(join(TEST_DIR, '..', 'README.md'), 'utf8')

  it('5.10 README documenta .agents/skills como punto de lectura compartido', () => {
    assert.match(README, /\.agents\/skills/)
    // El README envuelve la línea; se tolera el salto entre "lectura" y "compartido".
    assert.match(README, /punto de lectura\s+compartido/)
  })

  it('5.10 README documenta la semántica de --agent (layout nativo + pipeline de adaptación)', () => {
    assert.match(README, /layout nativo a materializar/)
    assert.match(README, /pipeline de adaptación de frontmatter/)
  })

  it('1.10 --help lista claude y explica que --agent no arbitra el descubrimiento', () => {
    withDir((dir) => {
      const r = run(['--help'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /claude/)
      assert.match(r.stdout, /layout nativo a materializar/)
      assert.match(r.stdout, /NO arbitra/)
    })
  })
})

describe('CLI install', () => {
  it('instala assets y templates, aplica tier y actualiza el manifiesto', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, 'AGENTS.md')))
      assert.ok(existsSync(join(dir, 'PRODUCT.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'commands', 'cleto-new.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'skills', 'triage-clarifier', 'SKILL.md')))

      const rc = readRc(dir)
      assert.equal(rc.version, PKG.version)
      assert.ok(!Number.isNaN(Date.parse(rc.installedAt)))
      assert.deepEqual(rc.installedPaths.templates, ['AGENTS.md', 'PRODUCT.md'])
      assert.deepEqual(rc.installedPaths.agents, ['.opencode/agents'])
      assert.deepEqual(rc.installedPaths.commands, ['.opencode/commands'])
      assert.deepEqual(rc.installedPaths.skills, ['.opencode/skills'])

      for (const f of readdirSync(join(TEST_DIR, '..', 'agents'))) {
        assert.ok(
          readFileSync(join(dir, '.opencode', 'agents', f)).equals(readFileSync(join(TEST_DIR, '..', 'agents', f))),
          `tier minimo deja ${f} byte-idéntico a la canónica`
        )
      }

      assert.equal(readFileSync(join(dir, '.opencode', '.ancleto-tier'), 'utf8').trim(), 'minimo')
    })
  })

  it('update --tier minimo deja los diez mirrors byte-idénticos sin duplicar el campo model:', () => {
    withDir((dir) => {
      assert.equal(run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir).status, 0)
      const r = run(['update', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      for (const f of readdirSync(join(TEST_DIR, '..', 'agents'))) {
        const mirror = readFileSync(join(dir, '.opencode', 'agents', f), 'utf8')
        assert.ok(
          readFileSync(join(dir, '.opencode', 'agents', f)).equals(readFileSync(join(TEST_DIR, '..', 'agents', f))),
          `update con minimo deja ${f} byte-idéntico a la canónica`
        )
        assert.equal((mirror.match(/^model: /gm) || []).length, 1, `${f}: una sola línea model:`)
      }
    })
  })

  it('--no-mcp no crea config de MCP', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.opencode', 'opencode.json')), false)
    })
  })

  it('fusiona MCP de forma no destructiva', () => {
    withDir((dir) => {
      mkdirSync(join(dir, '.opencode'), { recursive: true })
      writeFileSync(join(dir, '.opencode', 'opencode.json'), JSON.stringify({
        mcp: { custom: { type: 'local', enabled: true, command: ['custom-mcp'] } }
      }))
      const r = run(['install', '--project', dir, '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.opencode', 'opencode.json'), 'utf8'))
      assert.ok(cfg.mcp.custom, 'mcp custom preservado')
    })
  })

  it('configura el MCP de memoria propia y deja engram como opcional', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.opencode', 'opencode.json'), 'utf8'))
      assert.ok(cfg.mcp['ancleto-memory'], 'ancleto-memory presente')
      assert.equal(cfg.mcp['ancleto-memory'].type, 'local')
      assert.equal(cfg.mcp['ancleto-memory'].enabled, true)
      assert.deepEqual(cfg.mcp['ancleto-memory'].command.slice(-1), ['mcp'])
      assert.equal(cfg.mcp.engram, undefined, 'engram no se agrega sin --with-engram')
    })
  })

  it('install --with-engram agrega el MCP externo', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--tier', 'gratis', '--with-engram'], dir)
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.opencode', 'opencode.json'), 'utf8'))
      assert.ok(cfg.mcp['ancleto-memory'], 'ancleto-memory presente')
      if (cfg.mcp.engram) {
        assert.deepEqual(cfg.mcp.engram.command.slice(1), ['mcp', '--tools=agent'])
      } else {
        assert.match(r.stderr + r.stdout, /no se encontro engram/)
      }
    })
  })

  it('install global respeta XDG_CONFIG_HOME', () => {
    withDir((dir) => {
      const xdg = join(dir, 'xdg')
      const r = run(['install', '--no-mcp', '--tier', 'normal'], dir, { XDG_CONFIG_HOME: xdg })
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(xdg, 'opencode', 'agents', 'orchestrator.md')))
    })
  })

  it('init despues de install --project preserva installedPaths', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      const rc = readRc(dir)
      assert.deepEqual(rc.installedPaths.agents, ['.opencode/agents'])
      assert.deepEqual(rc.installedPaths.templates, ['AGENTS.md', 'PRODUCT.md'])
    })
  })
})


describe('CLI test profile (test-automation-profile)', () => {
  it('install --project --profile test instala overlay, testspec y persiste el perfil', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--profile', 'test', '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).profile, 'test')
      assert.ok(existsSync(join(dir, 'testspec', 'specs')))
      assert.ok(existsSync(join(dir, 'testspec', 'changes')))
      const tester = readFileSync(join(dir, '.opencode', 'agents', 'tester.md'), 'utf8')
      assert.match(tester, /healing/, 'tester ampliado con workflows')
      assert.ok(existsSync(join(dir, '.opencode', 'commands', 'cleto-test-heal.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'commands', 'cleto-test-coverage.md')))
      const rootAgents = readFileSync(join(dir, 'AGENTS.md'), 'utf8')
      assert.match(rootAgents, /Test automation profile/, 'bloque LOCKED del perfil en AGENTS.md')
    })
  })

  it('perfil general no cambia nada (no-regresion)', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).profile, 'general')
      assert.equal(existsSync(join(dir, 'testspec')), false, 'sin testspec/')
      assert.equal(existsSync(join(dir, '.opencode', 'commands', 'cleto-test-heal.md')), false, 'sin comandos del perfil')
      const tester = readFileSync(join(dir, '.opencode', 'agents', 'tester.md'), 'utf8')
      assert.doesNotMatch(tester, /healing/, 'tester base intacto')
    })
  })

  it('perfil invalido falla con exit 1', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--profile', 'noexiste', '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /perfil invalido/)
    })
  })

  it('upgrade preserva el perfil guardado', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--profile', 'test', '--no-mcp', '--tier', 'minimo'], dir)
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).profile, 'test')
      assert.ok(existsSync(join(dir, '.opencode', 'commands', 'cleto-test-heal.md')), 'overlay sobrevive upgrade')
    })
  })

  it('upgrade materializa la canónica base y reemplaza tester/reviewer por el overlay', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--profile', 'test', '--no-mcp', '--tier', 'minimo'], dir)
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const overlayDir = join(TEST_DIR, '..', 'profiles', 'test', 'agents')
      for (const name of ['tester', 'reviewer']) {
        const installed = readFileSync(join(dir, '.opencode', 'agents', `${name}.md`))
        assert.ok(
          installed.equals(readFileSync(join(overlayDir, `${name}.md`))),
          `${name} coincide byte a byte con el overlay del perfil`
        )
      }
      for (const f of readdirSync(join(TEST_DIR, '..', 'agents'))) {
        const name = f.replace(/\.md$/, '')
        if (name === 'tester' || name === 'reviewer') continue
        const installed = readFileSync(join(dir, '.opencode', 'agents', f))
        assert.ok(
          installed.equals(readFileSync(join(TEST_DIR, '..', 'agents', f))),
          `${f} coincide byte a byte con la canónica`
        )
      }
    })
  })

  it('check con profile test: tester/reviewer no divergen del overlay y exit 0', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--profile', 'test', '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(run(['upgrade'], dir).status, 0)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      assert.doesNotMatch(r.stdout, /\.opencode\/agents\/(tester|reviewer)\.md \(frontmatter diverge del adaptador/)
      // Tras upgrade el overlay conserva el modelo del perfil; install/update lo
      // reescribiria con el tier, asi que el aviso es cierto para esos 2 agentes.
      assert.match(
        r.stdout,
        /⚠ \.opencode\/agents \(tier 'minimo' aplica un modelo distinto al de su fuente en 2 agentes; install\/update reescribirá model:\)/
      )
    })
  })

  it('check sin upgrade: profile test + gratis no diverge y anuncia los 10 agentes del tier', () => {
    withDir((dir) => {
      assert.equal(run(['init', '--profile', 'test', '--tier', 'gratis'], dir).status, 0)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      // Un install sano aplica el tier tambien al overlay: no hay falso positivo.
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      assert.match(
        r.stdout,
        /⚠ \.opencode\/agents \(tier 'gratis' aplica un modelo distinto al de su fuente en 10 agentes; install\/update reescribirá model:\)/
      )
    })
  })

  it('check sin upgrade: profile test + minimo solo reescribiria el modelo del overlay (2 agentes)', () => {
    withDir((dir) => {
      assert.equal(run(['init', '--profile', 'test', '--tier', 'minimo'], dir).status, 0)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      // `minimo` coincide con la canónica: solo el overlay del perfil difiere.
      assert.match(
        r.stdout,
        /⚠ \.opencode\/agents \(tier 'minimo' aplica un modelo distinto al de su fuente en 2 agentes; install\/update reescribirá model:\)/
      )
    })
  })

  it('init --profile test persiste el perfil y crea testspec', () => {
    withDir((dir) => {
      const r = run(['init', '--profile', 'test'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).profile, 'test')
      assert.ok(existsSync(join(dir, 'testspec', 'changes')))
    })
  })

  it('perfil y agente son ortogonales (assets del agente + overlay del perfil)', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--profile', 'test', '--agent', 'claude', '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      const rc = readRc(dir)
      assert.equal(rc.profile, 'test')
      assert.equal(rc.agent, 'claude')
      assert.ok(existsSync(join(dir, '.claude', 'skills', 'ancleto-new', 'SKILL.md')), 'skills del agente')
      assert.ok(existsSync(join(dir, '.claude', 'commands', 'cleto-test-heal.md')), 'overlay del perfil en el layout del host')
    })
  })
})

describe('CLI export/import (cross-machine-export-import)', () => {
  function seedProject(dir) {
    // Instala primero; los señuelos que NO deben exportarse se plantan despues
    // (un memory.db falso rompería el install, que lo abre como SQLite).
    const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
    assert.equal(r.status, 0)
    // MCP local sano + señuelos que NO deben exportarse.
    mkdirSync(join(dir, '.opencode'), { recursive: true })
    writeFileSync(join(dir, '.opencode', 'opencode.json'), JSON.stringify({
      mcp: {
        'ancleto-memory': { type: 'local', enabled: true, command: [process.execPath, join(dir, 'fake-mcp.js')] },
        custom: { type: 'local', enabled: true, command: ['custom-mcp'] }
      }
    }))
    writeFileSync(join(dir, 'service.json'), JSON.stringify({ token: 'SECRETO-NO-EXPORTAR' }))
    mkdirSync(join(dir, '.ancleto'), { recursive: true })
    writeFileSync(join(dir, '.ancleto', 'memory.db'), 'BINARIO-SIMULADO')
  }

  it('export genera bundle sin absolutos ni secretos y excluye sesion', () => {
    withDir((dir) => {
      seedProject(dir)
      const r = run(['export'], dir)
      assert.equal(r.status, 0)
      const out = join(dir, 'ancleto-export')
      const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))
      assert.equal(manifest.format, 'ancleto-export/1')
      assert.ok(manifest.mcp.some((m) => m.name === 'ancleto-memory' && m.type === 'local'), 'intencion MCP')
      const serialized = JSON.stringify(manifest)
      assert.equal(serialized.includes(dir), false, 'sin paths absolutos')
      assert.equal(serialized.includes('SECRETO'), false, 'sin secretos')
      assert.equal(serialized.includes('C:\\'), false, 'sin rutas Windows')
      assert.ok(existsSync(join(out, '.ancletorc')), 'rc portable')
      assert.ok(existsSync(join(out, 'aspec', 'config.yaml')), 'aspec portable')
      assert.equal(existsSync(join(out, '.opencode', 'opencode.json')), false, 'opencode.json excluido')
      assert.equal(existsSync(join(out, 'service.json')), false, 'service.json excluido')
      assert.equal(existsSync(join(out, '.ancleto')), false, '.ancleto excluido')
    })
  })

  it('export --tar genera tarball valido', () => {
    withDir((dir) => {
      seedProject(dir)
      const tar = join(dir, 'bundle.tgz')
      const r = run(['export', '--tar', tar], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(tar), 'tarball creado')
      assert.ok(readFileSync(tar).length > 100, 'tarball con contenido')
    })
  })

  it('import --repair regenera entradas rotas y deja sanas intactas (repro T480)', () => {
    withDir((dir) => {
      mkdirSync(join(dir, '.opencode'), { recursive: true })
      writeFileSync(join(dir, '.opencode', 'opencode.json'), JSON.stringify({
        mcp: {
          'ancleto-memory': { type: 'local', enabled: true, command: ['C:\\Program Files\\nodejs\\node.exe', 'C:\\x\\index.js', 'mcp'] },
          custom: { type: 'local', enabled: true, command: ['custom-mcp'] }
        }
      }))
      const r = run(['import', '--repair'], dir)
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.opencode', 'opencode.json'), 'utf8'))
      assert.deepEqual(cfg.mcp.custom, { type: 'local', enabled: true, command: ['custom-mcp'] }, 'sana intacta')
      assert.equal(cfg.mcp['ancleto-memory'].command[0], process.execPath, 'rota regenerada con node local')
      assert.deepEqual(cfg.mcp['ancleto-memory'].command.slice(-1), ['mcp'], 'subcomando mcp preservado')
    })
  })

  it('import de bundle aplica portables y regenera MCP (roundtrip)', () => {
    withDir((dir) => {
      const src = join(dir, 'origen')
      mkdirSync(src, { recursive: true })
      seedProject(src)
      assert.equal(run(['export', '--tar', join(dir, 'b.tgz')], src).status, 0)
      const dst = join(dir, 'destino')
      mkdirSync(dst, { recursive: true })
      mkdirSync(join(dst, '.opencode'), { recursive: true })
      writeFileSync(join(dst, '.opencode', 'opencode.json'), JSON.stringify({
        mcp: { 'ancleto-memory': { type: 'local', enabled: true, command: ['C:\\viejo\\node.exe', 'x', 'mcp'] } }
      }))
      const r = run(['import', join(dir, 'b.tgz')], dst)
      assert.equal(r.status, 0)
      assert.equal(readRc(dst).profile, 'general', 'rc del bundle aplicada')
      assert.ok(existsSync(join(dst, 'aspec', 'config.yaml')), 'aspec del bundle aplicado')
      const cfg = JSON.parse(readFileSync(join(dst, '.opencode', 'opencode.json'), 'utf8'))
      assert.equal(cfg.mcp['ancleto-memory'].command[0], process.execPath, 'MCP regenerado local')
    })
  })

  // Bundle mínimo armado a mano (manifest + .ancletorc portables): fija tier y
  // `gratisModel` del escenario sin depender del export del proyecto origen.
  function writeBundle(dir, { tier = 'minimo', agent = 'opencode', gratisModel, template = false } = {}) {
    const bundle = join(dir, 'bundle')
    mkdirSync(bundle, { recursive: true })
    const rc = { agent, language: 'auto', profile: 'general' }
    if (gratisModel !== undefined) rc.gratisModel = gratisModel
    writeFileSync(join(bundle, '.ancletorc'), JSON.stringify(rc, null, 2))
    const manifest = {
      format: 'ancleto-export/1',
      ancletoVersion: PKG.version,
      exportedAt: new Date().toISOString(),
      agent,
      tier,
      language: 'auto',
      profile: 'general',
      ...(gratisModel !== undefined ? { gratisModel } : {}),
      flags: { azure: false, engram: false },
      mcp: []
    }
    writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(manifest, null, 2))
    if (template) writeFileSync(join(bundle, 'AGENTS.md'), '# plantilla del bundle\n')
    return bundle
  }

  it('import escribe .opencode/.ancleto-tier y el check posterior no diverge', () => {
    withDir((dir) => {
      const dst = join(dir, 'destino')
      mkdirSync(dst)
      const r = run(['import', writeBundle(dir)], dst)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dst, '.opencode', '.ancleto-tier'), 'utf8').trim(), 'minimo')
      assert.equal(readRc(dst).gratisModel, undefined, 'no agrega la clave ausente')
      const check = run(['check'], dst)
      assert.equal(check.status, 0)
      assert.doesNotMatch(check.stdout, /frontmatter diverge del adaptador/)
    })
  })

  it('import sobre un proyecto ya inicializado actualiza el tier (evita divergencia falsa)', () => {
    withDir((dir) => {
      const dst = join(dir, 'destino')
      mkdirSync(dst)
      // Sin `--no-mcp`: la compresion queda consistente entre install, import y
      // check (si el binario de caveman existe, la nota del orchestrator tambien).
      assert.equal(run(['install', '--project', dst, '--tier', 'normal'], dst).status, 0)
      const r = run(['import', writeBundle(dir)], dst)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dst, '.opencode', '.ancleto-tier'), 'utf8').trim(), 'minimo')
      const check = run(['check'], dst)
      assert.equal(check.status, 0)
      assert.doesNotMatch(check.stdout, /frontmatter diverge del adaptador/)
    })
  })

  it('import normaliza un gratisModel desconocido del bundle', () => {
    withDir((dir) => {
      const bundle = writeBundle(dir, { tier: 'gratis', gratisModel: 'opencode/muse-spark-1.3-contributor-free' })
      const dst = join(dir, 'destino')
      mkdirSync(dst)
      const r = run(['import', bundle], dst)
      assert.equal(r.status, 0)
      assert.equal(readRc(dst).gratisModel, 'opencode/big-pickle')
      assert.match(
        readFileSync(join(dst, '.opencode', 'agents', 'orchestrator.md'), 'utf8'),
        /model: opencode\/big-pickle/
      )
    })
  })

  it('import que no puede resolver el tier aborta antes de escribir (sin estado parcial)', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      const catalog = catalogWithout(dir, chain)
      const dst = join(dir, 'destino')
      mkdirSync(dst)
      const r = run(['import', writeBundle(dir, { template: true })], dst, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 1)
      assert.match(r.stderr, /no hay ningún candidato disponible/)
      assert.equal(existsSync(join(dst, '.ancletorc')), false, 'sin manifiesto escrito')
      assert.equal(existsSync(join(dst, 'AGENTS.md')), false, 'sin template escrito')
      assert.equal(existsSync(join(dst, '.opencode', 'agents', 'orchestrator.md')), false, 'sin agents escritos')
    })
  })

  it('import con un host que no escribe model: no resuelve el catálogo ni escribe tier', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      const catalog = catalogWithout(dir, chain)
      const dst = join(dir, 'destino')
      mkdirSync(dst)
      const r = run(['import', writeBundle(dir, { agent: 'claude' })], dst, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0, 'claude: import no aborta')
      assert.doesNotMatch(r.stderr, /no hay ningún candidato disponible/)
      assert.ok(existsSync(join(dst, '.claude', 'agents', 'orchestrator.md')), 'layout del host instalado')
      assert.equal(existsSync(join(dst, '.opencode', '.ancleto-tier')), false, 'sin tier aplicado')
    })
  })
})

describe('CLI import openspec externo (import-legacy-openspec)', () => {
  function seedExternalOpenspec(dir, { agentsSignature = false } = {}) {
    mkdirSync(join(dir, 'openspec', 'specs', 'pagos'), { recursive: true })
    writeFileSync(join(dir, 'openspec', 'specs', 'pagos', 'spec.md'), '# Spec: pagos\n')
    mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
    writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')
    if (agentsSignature) {
      writeFileSync(join(dir, 'AGENTS.md'), '# Contexto OpenSpec del proyecto\n')
    }
  }

  it('init --yes importa specs+changes, conserva backup y escribe marcador', () => {
    withDir((dir) => {
      seedExternalOpenspec(dir)
      const r = run(['init', '--yes', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dir, 'aspec', 'specs', 'pagos', 'spec.md'), 'utf8'), '# Spec: pagos\n', 'spec importada')
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n', 'change importado')
      assert.equal(readFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n', 'openspec intacto')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), 'marcador escrito')
    })
  })

  it('sin --yes (no-TTY) no importa por default', () => {
    withDir((dir) => {
      seedExternalOpenspec(dir)
      const r = run(['init', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, 'aspec', 'specs', 'pagos', 'spec.md')), false, 'no importa sin confirmacion')
      assert.equal(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), false, 'sin marcador')
      assert.ok(existsSync(join(dir, 'openspec', 'specs', 'pagos', 'spec.md')), 'openspec intacto')
    })
  })

  it('aspec/ con contenido real no se pisa aunque haya --yes', () => {
    withDir((dir) => {
      seedExternalOpenspec(dir)
      mkdirSync(join(dir, 'aspec', 'changes', 'mio'), { recursive: true })
      writeFileSync(join(dir, 'aspec', 'changes', 'mio', 'proposal.md'), '# mio\n')
      const r = run(['init', '--yes', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, 'aspec', 'specs', 'pagos', 'spec.md')), false, 'no copia contenido externo')
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'mio', 'proposal.md'), 'utf8'), '# mio\n', 'contenido real intacto')
    })
  })

  it('openspec/ vacio es no-op silencioso (no-falso-positivo)', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'openspec'), { recursive: true })
      const r = run(['init', '--yes', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), false, 'sin marcador')
    })
  })

  it('AGENTS.md de OpenSpec no se pisa: se adopta si falta, se conserva el local si existe', () => {
    withDir((dir) => {
      seedExternalOpenspec(dir)
      writeFileSync(join(dir, 'openspec', 'AGENTS.md'), '# Guia OpenSpec\n')
      assert.equal(run(['init', '--yes', '--tier', 'minimo'], dir).status, 0)
      assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /# Guia OpenSpec/, 'adoptado como base')
    })
    withDir((dir) => {
      seedExternalOpenspec(dir)
      writeFileSync(join(dir, 'openspec', 'AGENTS.md'), '# Guia OpenSpec\n')
      writeFileSync(join(dir, 'AGENTS.md'), '# Guia local\n')
      assert.equal(run(['init', '--yes', '--tier', 'minimo'], dir).status, 0)
      assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /# Guia local/, 'local conservado')
      assert.match(readFileSync(join(dir, 'openspec', 'AGENTS.md'), 'utf8'), /# Guia OpenSpec/, 'backup intacto')
    })
  })

  it('install --project detecta e importa con --yes', () => {
    withDir((dir) => {
      seedExternalOpenspec(dir)
      const r = run(['install', '--project', dir, '--yes', '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, 'aspec', 'specs', 'pagos', 'spec.md')), 'install importa')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), 'marcador escrito')
    })
  })

  it('upgrade sin .ancletorc migra en lugar de exigir init', () => {
    withDir((dir) => {
      seedExternalOpenspec(dir)
      const r = run(['upgrade', '--yes'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, 'aspec', 'specs', 'pagos', 'spec.md')), 'upgrade migra')
      assert.match(r.stdout, /Corré 'ancleto init'/, 'indica el siguiente paso')
    })
  })

  it('upgrade sin .ancletorc y sin openspec sigue exigiendo init', () => {
    withDir((dir) => {
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /Ejecuta 'ancleto init' primero/)
    })
  })
})

describe('CLI copilot support (add-copilot-support)', () => {
  function promptFiles(dir) {
    return readdirSync(join(dir, '.github', 'prompts')).filter((n) => n.endsWith('.prompt.md'))
  }

  it('install --project --agent copilot genera prompts sin model: y persiste el agente', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--agent', 'copilot', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      const rc = readRc(dir)
      assert.equal(rc.agent, 'copilot')
      assert.ok(rc.installedPaths.agents.includes('.github/prompts'), 'agents en prompts')
      assert.ok(rc.installedPaths.commands.includes('.github/prompts'), 'commands en prompts')
      const files = promptFiles(dir)
      assert.ok(files.includes('orchestrator.prompt.md'), 'prompt del orchestrator')
      assert.ok(files.includes('coder.prompt.md'), 'prompt de coder')
      assert.ok(files.includes('cleto-new.prompt.md'), 'comando como prompt')
      const orch = readFileSync(join(dir, '.github', 'prompts', 'orchestrator.prompt.md'), 'utf8')
      assert.match(orch, /^description: Orchestrates tasks/m, 'description preservada por el adapter')
      assert.match(orch, /picker de Copilot/, 'nota de modelo en orchestrator')
      assert.match(orch, /implement code directly/, 'instrucciones identicas al origen')
      for (const f of files) {
        const content = readFileSync(join(dir, '.github', 'prompts', f), 'utf8')
        assert.doesNotMatch(content, /^model: /m, `${f} sin model: (el tier no toca prompts)`)
      }
    })
  })

  it('install --agent copilot crea copilot-mcp.json con merge no destructivo', () => {
    withDir((dir) => {
      writeFileSync(join(dir, 'presetup'), '')
      mkdirSync(join(dir, '.github'), { recursive: true })
      writeFileSync(join(dir, 'copilot-mcp.json'), JSON.stringify({ mcp: { custom: { type: 'local', command: ['x'] } } }))
      const r = run(['install', '--project', dir, '--agent', 'copilot', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, 'copilot-mcp.json'), 'utf8'))
      assert.deepEqual(cfg.mcp.custom, { type: 'local', command: ['x'] }, 'custom preservado')
      assert.ok(cfg.mcp['ancleto-memory'], 'ancleto-memory agregado')
      assert.equal(cfg.mcp['ancleto-memory'].command[0], process.execPath, 'ruta local del host')
    })
  })

  it('upgrade --agent copilot regenera prompts sin truncar customs', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--agent', 'copilot', '--no-mcp', '--tier', 'minimo'], dir)
      writeFileSync(join(dir, '.github', 'copilot-instructions.md'), '# Customs del equipo\n')
      writeFileSync(join(dir, '.github', 'prompts', 'coder.prompt.md'), 'BORRADO-A-PROPOSITO')
      const r = run(['upgrade', '--agent', 'copilot'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dir, '.github', 'copilot-instructions.md'), 'utf8'), '# Customs del equipo\n', 'custom intacto')
      assert.match(readFileSync(join(dir, '.github', 'prompts', 'coder.prompt.md'), 'utf8'), /^description: /m, 'prompt regenerado con adapter')
    })
  })

  it('init --agent copilot persiste el agente', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'copilot', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).agent, 'copilot')
    })
  })

  it('--profile test --agent copilot combina overlay del perfil en prompts', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--profile', 'test', '--agent', 'copilot', '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.github', 'prompts', 'cleto-test-heal.prompt.md')), 'comando del perfil como prompt')
      assert.match(readFileSync(join(dir, '.github', 'prompts', 'tester.prompt.md'), 'utf8'), /healing/, 'tester ampliado en prompts')
    })
  })

  it('cada agente del paquete trae description (adapter de Copilot la preserva)', () => {
    const names = readdirSync(join(TEST_DIR, '..', 'agents')).filter((n) => n.endsWith('.md'))
    assert.ok(names.length > 0, 'hay agentes en el paquete')
    for (const name of names) {
      const content = readFileSync(join(TEST_DIR, '..', 'agents', name), 'utf8')
      assert.match(content, /^description: .+/m, `${name} sin description`)
    }
  })
})

describe('CLI check (G3)', () => {
  it('exit 0 en instalacion sana', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /✔/)
      assert.match(r.stdout, /0 faltantes/)
      // El frontmatter instalado coincide con la salida del adaptador: sin falso positivo.
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
    })
  })

  it('frontmatter editado a mano se reporta como divergencia no bloqueante (warning, exit 0)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const agentPath = join(dir, '.opencode', 'agents', 'orchestrator.md')
      const edited = readFileSync(agentPath, 'utf8').replace(/^description: .*$/m, 'description: editado a mano')
      writeFileSync(agentPath, edited)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(
        r.stdout,
        /⚠ \.opencode\/agents\/orchestrator\.md \(frontmatter diverge del adaptador para host 'opencode'\)/
      )
      assert.match(r.stdout, /0 faltantes/)
    })
  })

  it('deriva el host por directorio en multi-host (divergencia solo del host editado)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'vscode'], dir)
      const vscodeAgent = join(dir, '.github', 'agents', 'orchestrator.agent.md')
      const edited = readFileSync(vscodeAgent, 'utf8').replace(/^description: .*$/m, 'description: editado a mano')
      writeFileSync(vscodeAgent, edited)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(
        r.stdout,
        /⚠ \.github\/agents\/orchestrator\.agent\.md \(frontmatter diverge del adaptador para host 'vscode'\)/
      )
      // La copia de opencode (identity, no editada) no debe reportar divergencia.
      assert.doesNotMatch(r.stdout, /\.opencode\/agents\/.*diverge del adaptador/)
    })
  })

  it('tier gratis: acepta el estado del tier sin falso positivo y anuncia la diferencia (exit 0)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      assert.match(
        r.stdout,
        /⚠ \.opencode\/agents \(tier 'gratis' aplica un modelo distinto al de su fuente en [1-9]\d* agentes; install\/update reescribirá model:\)/
      )
    })
  })

  it('tier gratis legacy: un gratisModel desconocido no produce divergencia y avisa el tier', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      // Estado legacy: `.ancletorc` persiste un muse-spark inexistente. El check lo
      // ignora, resuelve el unico gratis conocido y no lo trata como divergencia.
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.gratisModel = 'opencode/muse-spark-1.3-contributor-free'
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      assert.match(
        r.stdout,
        /⚠ \.opencode\/agents \(tier 'gratis' aplica un modelo distinto al de su fuente en [1-9]\d* agentes; install\/update reescribirá model:\)/
      )
    })
  })

  it('install normaliza un gratisModel desconocido al unico modelo gratis', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.gratisModel = 'opencode/muse-spark-1.3-contributor-free'
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).gratisModel, 'opencode/big-pickle')
      assert.match(readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8'), /model: opencode\/big-pickle/)
    })
  })

  it('install con tier normal normaliza un gratisModel desconocido', () => {
    withDir((dir) => {
      assert.equal(run(['install', '--project', dir, '--no-mcp', '--tier', 'normal'], dir).status, 0)
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.gratisModel = 'opencode/muse-spark-1.3-contributor-free'
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'normal'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).gratisModel, 'opencode/big-pickle')
    })
  })

  it('init con tier normal normaliza un gratisModel desconocido', () => {
    withDir((dir) => {
      assert.equal(run(['init', '--tier', 'normal'], dir).status, 0)
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.gratisModel = 'opencode/muse-spark-1.3-contributor-free'
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['init', '--tier', 'normal'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).gratisModel, 'opencode/big-pickle')
    })
  })

  it('mirror canónico con tier distinto: anuncia la diferencia aunque no haya divergencia', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      for (const f of readdirSync(join(TEST_DIR, '..', 'agents'))) {
        copyFileSync(join(TEST_DIR, '..', 'agents', f), join(dir, '.opencode', 'agents', f))
      }
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      assert.match(r.stdout, /⚠ \.opencode\/agents \(tier 'gratis' aplica un modelo distinto al de su fuente en [1-9]\d* agentes/)
    })
  })

  it('mirror distinto de la canónica y del tier se reporta como divergencia (exit 0)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const agentPath = join(dir, '.opencode', 'agents', 'orchestrator.md')
      const edited = readFileSync(agentPath, 'utf8').replace(/^model: .*$/m, 'model: proveedor/modelo-ajeno')
      writeFileSync(agentPath, edited)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(
        r.stdout,
        /⚠ \.opencode\/agents\/orchestrator\.md \(frontmatter diverge del adaptador para host 'opencode'\)/
      )
      assert.match(r.stdout, /tier 'gratis' aplica un modelo distinto/)
    })
  })

  it('tier minimo: sin aviso de tier y sin divergencia', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      assert.doesNotMatch(r.stdout, /aplica un modelo distinto/)
    })
  })

  // Catálogo alternativo por `ANCLETO_MODEL_CATALOG`: ver `catalogWithout` arriba.
  it('minimo con la cabeza disponible en install y ausente en check: sin divergencia, con aviso', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const catalog = catalogWithout(dir, [chain[0]])
      const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      assert.match(r.stdout, /tier 'minimo' aplica un modelo distinto al de su fuente en [1-9]\d* agentes/)
      assert.equal((r.stdout.match(/aplica un modelo distinto al de su fuente en/g) || []).length, 1)
    })
  })

  it('minimo sin la cabeza en install y con la cabeza en check: sin divergencia, con aviso', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      const catalog = catalogWithout(dir, [chain[0]])
      const inst = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(inst.status, 0)
      for (const f of readdirSync(join(TEST_DIR, '..', 'agents'))) {
        assert.match(
          readFileSync(join(dir, '.opencode', 'agents', f), 'utf8'),
          new RegExp(`model: ${chain[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          `${f}: escribe el segundo candidato`
        )
      }
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      assert.match(r.stdout, /tier 'minimo' aplica un modelo distinto al de su fuente en [1-9]\d* agentes/)
      assert.equal((r.stdout.match(/aplica un modelo distinto al de su fuente en/g) || []).length, 1)
    })
  })

  it('minimo sin candidato resoluble en check: no aborta y avisa sin cambiar el exit code', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const catalog = catalogWithout(dir, chain)
      const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
      assert.match(r.stdout, /no tiene ningún candidato resoluble/)
    })
  })

  it('check no crashea cuando el catálogo falta o es ilegible: avisa y no diverge', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const inexistente = join(dir, 'no-existe.json')
      const corrupto = join(dir, 'corrupto.json')
      writeFileSync(corrupto, '{ esto no es JSON')
      for (const catalog of [inexistente, corrupto]) {
        const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
        assert.equal(r.status, 0, `exit 0 con catálogo ${catalog}`)
        assert.doesNotMatch(r.stderr, /\n\s+at /, `sin stack trace con catálogo ${catalog}`)
        assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
        assert.match(r.stdout, /no se pudo verificar el catálogo de modelos/)
      }
    })
  })

  it('install minimo sin la cabeza ni el segundo candidato escribe el tercero', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      const catalog = catalogWithout(dir, [chain[0], chain[1]])
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0)
      for (const f of readdirSync(join(TEST_DIR, '..', 'agents'))) {
        assert.match(
          readFileSync(join(dir, '.opencode', 'agents', f), 'utf8'),
          new RegExp(`model: ${chain[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          `${f}: escribe el tercer candidato`
        )
      }
    })
  })

  it('install minimo sin ningún candidato aborta con error explícito y no escribe agents', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      const catalog = catalogWithout(dir, chain)
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 1)
      assert.match(r.stderr, /no hay ningún candidato disponible/)
      assert.match(r.stderr, /commandcode\/deepseek\/deepseek-v4\.1-flash/)
      assert.equal(existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')), false)
    })
  })

  it('install/init con un host que no escribe model: no resuelve el catálogo ni aborta', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      const catalog = catalogWithout(dir, chain)
      const inst = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'claude'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(inst.status, 0)
      assert.doesNotMatch(inst.stderr, /no hay ningún candidato disponible/)
      assert.ok(existsSync(join(dir, '.claude', 'agents', 'orchestrator.md')), 'layout del host instalado')
      const initDir = join(dir, 'init')
      mkdirSync(initDir)
      const ini = run(['init', '--tier', 'minimo', '--agent', 'claude', '--no-mcp'], initDir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(ini.status, 0)
      assert.doesNotMatch(ini.stderr, /no hay ningún candidato disponible/)
    })
  })

  it('install con antigravity/vscode/copilot no resuelve el catálogo ni aborta', () => {
    const layouts = {
      antigravity: ['.agents', 'agents', 'orchestrator.md'],
      vscode: ['.github', 'agents', 'orchestrator.agent.md'],
      copilot: ['.github', 'prompts', 'orchestrator.prompt.md']
    }
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      const catalog = catalogWithout(dir, chain)
      for (const [agent, segments] of Object.entries(layouts)) {
        const target = join(dir, agent)
        mkdirSync(target)
        const r = run(['install', '--project', target, '--no-mcp', '--tier', 'minimo', '--agent', agent], target, { ANCLETO_MODEL_CATALOG: catalog })
        assert.equal(r.status, 0, `${agent}: install no aborta`)
        assert.doesNotMatch(r.stderr, /no hay ningún candidato disponible/)
        assert.ok(existsSync(join(target, ...segments)), `${agent}: layout del host instalado`)
      }
    })
  })

  it('init con opencode y sin candidatos aborta con error explícito sin escribir agents ni tier', () => {
    withDir((dir) => {
      const chain = TIER_CHAINS.minimo.orchestrator
      const catalog = catalogWithout(dir, chain)
      const r = run(['init', '--tier', 'minimo'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 1)
      assert.match(r.stderr, /no hay ningún candidato disponible/)
      assert.equal(existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')), false)
      assert.equal(existsSync(join(dir, '.opencode', '.ancleto-tier')), false)
    })
  })

  it('exit 1 y ✖ cuando falta un template', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      rmSync(join(dir, 'AGENTS.md'))
      const r = run(['check'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stdout, /✖/)
      assert.match(r.stdout, /AGENTS\.md \(faltante\)/)
    })
  })

  it('warning por huerfano sin fallar (exit 0)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      writeFileSync(join(dir, '.opencode', 'agents', 'stray.md'), '# stray')
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /⚠/)
      assert.match(r.stdout, /stray\.md \(huerfano\)/)
    })
  })

  it('exit 1 sin .ancletorc', () => {
    withDir((dir) => {
      const r = run(['check'], dir)
      assert.equal(r.status, 1)
    })
  })

  it('sano con agentes locales NO avisa tier huerfano', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /tier .* sin agentes locales/)
    })
  })

  it('avisa tier huerfano sin fallar cuando no hay agentes locales', () => {
    withDir((dir) => {
      run(['init', '--tier', 'gratis'], dir)
      // escenario de riesgo: el tier quedo pero los agentes locales ya no estan.
      // Se limpia tambien el manifiesto para aislar el aviso de tier huerfano: con
      // el manifiesto veraz (D10), borrar .opencode/agents seria un faltante, no un
      // tier huerfano.
      rmSync(join(dir, '.opencode', 'agents'), { recursive: true, force: true })
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.installedPaths.agents = []
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /⚠ tier "gratis" sin agentes locales/)
      assert.match(r.stdout, /0 faltantes/)
    })
  })

  it('init deja agentes locales, asi que el tier NO queda huerfano', () => {
    withDir((dir) => {
      run(['init', '--tier', 'gratis'], dir)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /sin agentes locales/)
    })
  })

  // ch-12: deriva y antigüedad del catálogo de modelos (Fase 7).
  it('un model: del mirror ausente del catálogo produce un warning con archivo e ID y exit 0', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const catalog = catalogSnapshot(dir, { removeIds: ['opencode/big-pickle'] })
      const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0)
      assert.match(
        r.stdout,
        /⚠ \.opencode\/agents\/orchestrator\.md \(model 'opencode\/big-pickle' ausente del catálogo de modelos; refrescalo con `node scripts\/refresh-model-catalog\.mjs`\)/
      )
      const installed = readdirSync(join(dir, '.opencode', 'agents')).filter((f) => f.endsWith('.md'))
      assert.equal((r.stdout.match(/ausente del catálogo de modelos/g) || []).length, installed.length)
      // El aviso de deriva no altera el conjunto de aceptación del oráculo.
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
    })
  })

  it('la ausencia en el catálogo no agrega un frontmatter diverge si el tier instalado es aceptado', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const clean = run(['check'], dir)
      const catalog = catalogSnapshot(dir, { removeIds: [TIER_CHAINS.minimo.orchestrator[0]] })
      const drifted = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(clean.status, 0)
      assert.equal(drifted.status, 0)
      assert.doesNotMatch(clean.stdout, /frontmatter diverge del adaptador/)
      assert.doesNotMatch(drifted.stdout, /frontmatter diverge del adaptador/)
      assert.match(drifted.stdout, /ausente del catálogo de modelos/)
    })
  })

  it('un catálogo ilegible conserva el aviso de catálogo no verificable y no evalúa deriva', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const corrupto = join(dir, 'corrupto.json')
      writeFileSync(corrupto, '{ esto no es JSON')
      for (const catalog of [join(dir, 'no-existe.json'), corrupto]) {
        const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
        assert.equal(r.status, 0, `exit 0 con catálogo ${catalog}`)
        assert.match(r.stdout, /no se pudo verificar el catálogo de modelos/)
        assert.doesNotMatch(r.stdout, /ausente del catálogo de modelos/)
      }
    })
  })

  it('un catálogo con más de 90 días emite un único aviso informativo sin cambiar la resolución', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const catalog = catalogSnapshot(dir, { generatedAt: daysAgo(120) })
      const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0)
      assert.match(r.stdout, /catálogo de modelos con 120 días de antigüedad \(/)
      assert.equal((r.stdout.match(/días de antigüedad/g) || []).length, 1)
      assert.doesNotMatch(r.stdout, /ausente del catálogo de modelos/)
      assert.doesNotMatch(r.stdout, /aplica un modelo distinto/)
      assert.doesNotMatch(r.stdout, /frontmatter diverge del adaptador/)
    })
  })

  it('un catálogo fresco no emite aviso de antigüedad', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const catalog = catalogSnapshot(dir, { generatedAt: daysAgo(0) })
      const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /días de antigüedad/)
    })
  })

  it('un host que emite model: inherit no evalúa deriva', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'], dir)
      assert.match(readFileSync(join(dir, '.agents', 'agents', 'orchestrator.md'), 'utf8'), /^model: inherit$/m)
      const catalog = catalogSnapshot(dir, { removeIds: ['opencode/big-pickle'] })
      const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /ausente del catálogo de modelos/)
    })
  })

  it('un mirror opencode con model: inherit no reporta deriva para ese archivo', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const agentPath = join(dir, '.opencode', 'agents', 'orchestrator.md')
      writeFileSync(agentPath, readFileSync(agentPath, 'utf8').replace(/^model: .*$/m, 'model: inherit'))
      const catalog = catalogSnapshot(dir, { removeIds: TIER_CHAINS.minimo.orchestrator })
      const r = run(['check'], dir, { ANCLETO_MODEL_CATALOG: catalog })
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /orchestrator\.md \(model 'inherit' ausente del catálogo/)
    })
  })
})

describe('CLI doctor (G4)', () => {
  it('exit 0 con entorno sano y opencode.json valido', () => {
    withDir((dir) => {
      const xdg = join(dir, 'xdg')
      mkdirSync(join(xdg, 'opencode'), { recursive: true })
      writeFileSync(join(xdg, 'opencode', 'opencode.json'), JSON.stringify({ mcp: {} }))
      const r = run(['doctor'], dir, { XDG_CONFIG_HOME: xdg })
      assert.equal(r.status, 0)
      assert.match(r.stdout, /✔ Node\.js/)
      assert.match(r.stdout, /node:sqlite importable/)
      assert.match(r.stdout, /opencode\.json valido/)
    })
  })

  it('reporta opencode.json invalido sin fallar', () => {
    withDir((dir) => {
      const xdg = join(dir, 'xdg')
      mkdirSync(join(xdg, 'opencode'), { recursive: true })
      writeFileSync(join(xdg, 'opencode', 'opencode.json'), '{ invalido')
      const r = run(['doctor'], dir, { XDG_CONFIG_HOME: xdg })
      assert.equal(r.status, 0)
      assert.match(r.stdout, /JSON invalido/)
    })
  })

  it('reporta opencode.json ausente como warning (exit 0)', () => {
    withDir((dir) => {
      const r = run(['doctor'], dir, { XDG_CONFIG_HOME: join(dir, 'xdg-vacio') })
      assert.equal(r.status, 0)
      assert.match(r.stdout, /no encontrado/)
    })
  })
})

describe('CLI scaffold aspec (G5)', () => {
  it('init crea aspec/changes y config.yaml', () => {
    withDir((dir) => {
      run(['init'], dir)
      assert.ok(existsSync(join(dir, 'aspec', 'config.yaml')))
      assert.ok(existsSync(join(dir, 'aspec', 'changes')))
    })
  })

  it('no pisa un config.yaml preexistente', () => {
    withDir((dir) => {
      run(['init'], dir)
      const cfgPath = join(dir, 'aspec', 'config.yaml')
      writeFileSync(cfgPath, '# config custom del equipo\n')
      run(['init'], dir)
      assert.equal(readFileSync(cfgPath, 'utf8'), '# config custom del equipo\n')
    })
  })

  it('install --project tambien crea el scaffold', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.ok(existsSync(join(dir, 'aspec', 'config.yaml')))
      assert.ok(existsSync(join(dir, 'aspec', 'changes')))
    })
  })

  it('el config.yaml generado menciona aspec, no OpenSpec', () => {
    withDir((dir) => {
      run(['init'], dir)
      const cfg = readFileSync(join(dir, 'aspec', 'config.yaml'), 'utf8')
      assert.match(cfg, /aspec project configuration/)
      assert.doesNotMatch(cfg, /OpenSpec/)
    })
  })
})

describe('CLI init + templates y working-context (v0.6.18 / issues #15 y #10)', () => {
  it('init crea AGENTS.md y PRODUCT.md', () => {
    withDir((dir) => {
      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, 'AGENTS.md')), 'AGENTS.md')
      assert.ok(existsSync(join(dir, 'PRODUCT.md')), 'PRODUCT.md')
    })
  })

  it('init NO pisa un AGENTS.md propio del proyecto', () => {
    withDir((dir) => {
      const custom = '# Mis convenciones\n\nContenido del equipo que no se debe perder.\n'
      writeFileSync(join(dir, 'AGENTS.md'), custom)
      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      const after = readFileSync(join(dir, 'AGENTS.md'), 'utf8')
      assert.match(after, /Contenido del equipo que no se debe perder/)
      assert.equal(after.includes('## Context Hierarchy'), false, 'no se pisó con el template')
    })
  })

  it('init NO crea working-context.md si el repo no tiene memoria', () => {
    withDir((dir) => {
      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.ancleto', 'working-context.md')), false)
    })
  })

  it('init materializa la topología día-cero sin memory.db (token-budget)', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.discovery-map.json'), JSON.stringify({
        last_updated: '2020-01-01T00:00:00.000Z',
        total_files: 3,
        tree_summary: { src: 2, test: 1 },
        root_files: []
      }) + '\n')
      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.ancleto', 'memory.db')), false, 'no hay base de memoria')
      const wc = readFileSync(join(dir, '.ancleto', 'working-context.md'), 'utf8')
      assert.match(wc, /<ProjectTopology>/)
      assert.match(wc, /Total files: 3/)
      assert.match(wc, /- src: 2/)
    })
  })

  it('init materializa las reglas del proyecto en working-context.md', () => {
    withDir((dir) => {
      run(['init'], dir)
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const engine = createMemoryEngine(dbPath)
      engine.recordNode({ memory_key: 'regla-de-prueba', type: 'rule', scope: 'project', content: 'Siempre validar la entrada.' })
      engine.close()

      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      const wc = readFileSync(join(dir, '.ancleto', 'working-context.md'), 'utf8')
      assert.match(wc, /<ProjectMemoryRules>/)
      assert.match(wc, /regla-de-prueba/)
      assert.match(wc, /Siempre validar la entrada/)
    })
  })

  it('init deja working-context.md vacio si hay memoria pero ninguna regla activa', () => {
    withDir((dir) => {
      run(['init'], dir)
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const engine = createMemoryEngine(dbPath)
      engine.recordNode({ memory_key: 'solo-decision', type: 'decision', scope: 'project', content: 'No es regla.' })
      engine.close()

      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.ancleto', 'working-context.md')), 'archivo creado')
      assert.equal(readFileSync(join(dir, '.ancleto', 'working-context.md'), 'utf8'), '')
    })
  })

  it('upgrade regenera el working-context', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const engine = createMemoryEngine(dbPath)
      engine.recordNode({ memory_key: 'regla-upgrade', type: 'rule', scope: 'project', content: 'Regla para el upgrade.' })
      engine.close()
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /working-context\.md regenerado/)
      assert.match(readFileSync(join(dir, '.ancleto', 'working-context.md'), 'utf8'), /regla-upgrade/)
    })
  })
})

describe('CLI memory context día-cero (token-budget)', () => {
  const MAP = JSON.stringify({
    last_updated: '2020-01-01T00:00:00.000Z',
    total_files: 4,
    tree_summary: { src: 2, test: 2 },
    root_files: []
  }) + '\n'

  it('--out materializa la topología sin memory.db y crea .ancleto/ si falta', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.discovery-map.json'), MAP)
      assert.equal(existsSync(join(dir, '.ancleto')), false, 'no hay .ancleto/ de partida')

      const r = run(['memory', 'context', '--scope', 'project', '--out', '.ancleto/working-context.md'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.ancleto', 'memory.db')), false, 'no se abre ni crea base de memoria')
      const wc = readFileSync(join(dir, '.ancleto', 'working-context.md'), 'utf8')
      assert.match(wc, /<ProjectTopology>/)
      assert.match(wc, /Total files: 4/)
      assert.match(wc, /- src: 2/)
      assert.equal(wc.endsWith('\n'), true)
    })
  })

  it('--out crea directorios anidados inexistentes', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.discovery-map.json'), MAP)
      const r = run(['memory', 'context', '--scope', 'project', '--out', 'out/nested/ctx.md'], dir)
      assert.equal(r.status, 0)
      assert.match(readFileSync(join(dir, 'out', 'nested', 'ctx.md'), 'utf8'), /<ProjectTopology>/)
    })
  })

  it('sin DB ni discovery-map deja el archivo vacío y avisa (no fabrica contenido)', () => {
    withDir((dir) => {
      const r = run(['memory', 'context', '--scope', 'project', '--out', '.ancleto/working-context.md'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stderr, /sin reglas activas/)
      assert.doesNotMatch(r.stdout, /<ProjectTopology>/)
      assert.equal(readFileSync(join(dir, '.ancleto', 'working-context.md'), 'utf8'), '')
    })
  })

  it('sin DB imprime la topología día-cero a stdout', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.discovery-map.json'), MAP)
      const r = run(['memory', 'context', '--scope', 'project'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /<ProjectTopology>/)
      assert.match(r.stdout, /Total files: 4/)
      assert.doesNotMatch(r.stderr, /sin reglas activas/)
    })
  })

  it('con memoria mantiene el bloque y el render compartido (stdout == --out)', () => {
    withDir((dir) => {
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      engine.recordNode({ memory_key: 'ctx-rule', type: 'rule', scope: 'project', content: 'Regla de proyecto.' })
      engine.close()

      const stdout = run(['memory', 'context', '--scope', 'project'], dir)
      assert.equal(stdout.status, 0)
      assert.match(stdout.stdout, /<ProjectMemoryRules>/)
      assert.match(stdout.stdout, /\[ctx-rule\] Regla de proyecto\./)

      const out = run(['memory', 'context', '--scope', 'project', '--out', '.ancleto/working-context.md'], dir)
      assert.equal(out.status, 0)
      assert.equal(readFileSync(join(dir, '.ancleto', 'working-context.md'), 'utf8'), stdout.stdout)
    })
  })
})

describe('CLI memory import refresca el working-context', () => {
  const entry = (over = {}) => ({
    memory_key: 'imp-rule',
    type: 'rule',
    scope: 'project',
    content: 'Regla importada por CLI.',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...over
  })

  it('importar una rule de proyecto materializa e incluye la regla en el working-context', () => {
    withDir((dir) => {
      writeFileSync(join(dir, 'rules.json'), JSON.stringify([entry()]) + '\n')
      const r = run(['memory', 'import', 'rules.json'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /import OK/)
      const out = join(dir, '.ancleto', 'working-context.md')
      assert.equal(existsSync(out), true)
      const wc = readFileSync(out, 'utf8')
      assert.match(wc, /<ProjectMemoryRules>/)
      assert.match(wc, /\[imp-rule\] Regla importada por CLI\./)
    })
  })

  it('importar solo una decision no proyectada no crea el working-context', () => {
    withDir((dir) => {
      writeFileSync(
        join(dir, 'rules.json'),
        JSON.stringify([entry({ memory_key: 'imp-dec', type: 'decision', scope: 'feature' })]) + '\n'
      )
      const r = run(['memory', 'import', 'rules.json'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /import OK/)
      assert.equal(existsSync(join(dir, '.ancleto', 'working-context.md')), false)
    })
  })

  it('si el refresh falla, la importación persiste y solo se avisa por stderr', () => {
    withDir((dir) => {
      // `.ancleto/working-context.md` como directorio: leer/escribir el artefacto falla
      mkdirSync(join(dir, '.ancleto', 'working-context.md'), { recursive: true })
      writeFileSync(join(dir, 'rules.json'), JSON.stringify([entry()]) + '\n')
      const r = run(['memory', 'import', 'rules.json'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /import OK/)
      assert.match(r.stderr, /no se pudo refrescar el working-context/)
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        assert.equal(engine.listNodes({ scope: 'project' }).length, 1, 'el nodo queda persistido')
      } finally {
        engine.close()
      }
    })
  })

  it('memory doctor reporta staleness del working-context sin alterar el exit code', () => {
    withDir((dir) => {
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'doc-rule', type: 'rule', scope: 'project', content: 'regla sin materializar' })
      } finally {
        engine.close()
      }
      const r = run(['memory', 'doctor'], dir)
      assert.equal(r.status, 0, 'el staleness es advisory: no rompe el exit code')
      assert.match(r.stdout, /Working-context: ausente/)
    })
  })
})

// Guarda (Fase 7): la ayuda de `memory doctor` enumera el quinto check. Aserto
// estrecho sobre la mencion, no sobre la oracion completa.
describe('CLI memory doctor (MEM-04)', () => {
  it('la ayuda menciona el check "refs de nodos activos"', () => {
    withDir((dir) => {
      const r = run(['--help'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /refs de nodos activos/i)
    })
  })
})

describe('CLI directiva de compresión host-scoped (token-budget)', () => {
  const CAVEMAN_MCP = JSON.stringify({
    mcp: { caveman: { type: 'local', enabled: true, command: ['caveman-mcp'] } }
  }) + '\n'

  it('materializa la directiva sólo en las superficies del host con la tool', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      writeFileSync(join(dir, '.opencode', 'opencode.json'), CAVEMAN_MCP)
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const orch = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orch, /Compresión de contexto \(tool del host\)/)
      assert.match(orch, /caveman_\*/)
    })
  })

  it('NO materializa la directiva en un host sin la tool (texto compartido intacto)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'claude'], dir)
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const orch = readFileSync(join(dir, '.claude', 'agents', 'orchestrator.md'), 'utf8')
      assert.doesNotMatch(orch, /Compresión de contexto \(tool del host\)/)
      assert.doesNotMatch(orch, /caveman_\*/)
    })
  })

  it('default ON: con el binario de caveman disponible configura su MCP y materializa la directiva', () => {
    withDir((dir) => {
      // Stub del seam de deteccion de binario: `resolveBin` resuelve `caveman-mcp` por PATH.
      const binDir = join(dir, 'fake-path')
      mkdirSync(binDir, { recursive: true })
      const binFile = join(binDir, process.platform === 'win32' ? 'caveman-mcp.cmd' : 'caveman-mcp')
      writeFileSync(binFile, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n')
      if (process.platform !== 'win32') chmodSync(binFile, 0o755)

      const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') || 'PATH'
      const env = {
        ANCLETO_PROJECTS_FILE: join(dir, 'registry.json'),
        [pathKey]: `${binDir}${delimiter}${process.env[pathKey] || ''}`
      }

      const r = run(['install', '--project', dir, '--tier', 'minimo'], dir, env)
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.opencode', 'opencode.json'), 'utf8'))
      assert.ok(cfg.mcp && cfg.mcp.caveman, 'el MCP de compresión se configura por defecto con el binario presente')
      const orch = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orch, /Compresión de contexto \(tool del host\)/)
    })
  })

  it('materializa la directiva en la superficie de antigravity (host con la tool)', () => {
    withDir((dir) => {
      const env = { ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') }
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'antigravity'], dir, env)
      writeFileSync(join(dir, '.agents', 'mcp_config.json'), JSON.stringify({
        mcpServers: { caveman: { command: 'caveman-mcp', args: [] } }
      }) + '\n')
      const r = run(['upgrade'], dir, env)
      assert.equal(r.status, 0)
      const orch = readFileSync(join(dir, '.agents', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orch, /Compresión de contexto \(tool del host\)/)
      assert.match(orch, /caveman_\*/)
    })
  })

  it('reversible a opt-in: si el host deja de incluir la tool, la directiva se revierte', () => {
    withDir((dir) => {
      const env = { ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') }
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir, env)
      const cfgPath = join(dir, '.opencode', 'opencode.json')
      const orchPath = join(dir, '.opencode', 'agents', 'orchestrator.md')

      // Estado ON: la config del host incluye la tool. (Compuerta de medición: si el
      // neto de `ancleto stats` no baja, se revierte a opt-in quitando la tool.)
      writeFileSync(cfgPath, CAVEMAN_MCP)
      assert.equal(run(['upgrade'], dir, env).status, 0)
      assert.match(readFileSync(orchPath, 'utf8'), /Compresión de contexto \(tool del host\)/)

      // Reversión: el host deja de incluir la tool -> vuelve a opt-in (sin directiva).
      writeFileSync(cfgPath, JSON.stringify({ mcp: {} }) + '\n')
      assert.equal(run(['upgrade'], dir, env).status, 0)
      assert.doesNotMatch(readFileSync(orchPath, 'utf8'), /Compresión de contexto \(tool del host\)/)
    })
  })
})

describe('CLI migracion openspec -> aspec (copia no destructiva)', () => {
  it('upgrade migra openspec/ a aspec/ preservando contenido y conserva openspec/ como backup', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n')
      assert.equal(readFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n', 'openspec/ se conserva como backup')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), 'marcador escrito')
      assert.match(r.stdout, /migrado/)
    })
  })

  it('aspec/ con contenido real coexiste con openspec/: no migra y advierte', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'old.txt'), 'viejo\n')
      mkdirSync(join(dir, 'aspec', 'changes', 'existing'), { recursive: true })
      writeFileSync(join(dir, 'aspec', 'changes', 'existing', 'spec.md'), '# existente\n')
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stderr, /no se migro/)
      assert.equal(existsSync(join(dir, 'aspec', 'old.txt')), false, 'no copia contenido legacy')
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'existing', 'spec.md'), 'utf8'), '# existente\n')
      assert.equal(readFileSync(join(dir, 'openspec', 'old.txt'), 'utf8'), 'viejo\n', 'openspec/ intacta')
      assert.equal(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), false, 'sin marcador')
    })
  })

  it('aspec/ solo-scaffold se migra encima y conserva el config.yaml previo', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')
      mkdirSync(join(dir, 'aspec', 'changes'), { recursive: true })
      writeFileSync(join(dir, 'aspec', 'config.yaml'), '# config previo del equipo\n')
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /migrado/)
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n')
      assert.equal(readFileSync(join(dir, 'aspec', 'config.yaml'), 'utf8'), '# config previo del equipo\n', 'config.yaml no se pisa')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')))
      assert.ok(existsSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md')), 'openspec/ se conserva')
    })
  })

  it('aspec/ con solo config.yaml (sin changes/) se trata como scaffold y migra', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')
      mkdirSync(join(dir, 'aspec'), { recursive: true })
      writeFileSync(join(dir, 'aspec', 'config.yaml'), '# config previo\n')
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /migrado/)
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n')
      assert.equal(readFileSync(join(dir, 'aspec', 'config.yaml'), 'utf8'), '# config previo\n', 'config.yaml no se pisa')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')))
    })
  })

  it('segunda corrida tras migrar es no-op silenciosa (idempotencia por marcador)', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')

      const first = run(['upgrade'], dir)
      assert.equal(first.status, 0)
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), 'marcador escrito')

      // Sentinel nuevo: con el marcador presente NO debe recopiarse a aspec/.
      writeFileSync(join(dir, 'openspec', 'extra.txt'), 'no copiar\n')
      const second = run(['upgrade'], dir)
      assert.equal(second.status, 0)
      assert.doesNotMatch(second.stderr, /no se migro/, 'sin advertencia')
      assert.doesNotMatch(second.stdout, /contenido migrado/, 'sin reporte de recopia')
      assert.equal(existsSync(join(dir, 'aspec', 'extra.txt')), false, 'no recopia')
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n')
      assert.equal(readFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n', 'openspec/ se conserva')
    })
  })

  it('init con openspec/ preexistente migra por copia antes del scaffold', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')
      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /migrado/)
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n')
      assert.ok(existsSync(join(dir, 'aspec', 'config.yaml')), 'scaffold posterior')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')))
      assert.ok(existsSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md')), 'backup')
    })
  })

  it('install --project con openspec/ preexistente migra por copia antes del scaffold', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /migrado/)
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n')
      assert.ok(existsSync(join(dir, 'aspec', 'config.yaml')), 'scaffold posterior')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), 'marcador escrito')
      assert.equal(readFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n', 'openspec/ se conserva como backup')
    })
  })

  it('install --project con aspec/ real advierte, no migra y conserva openspec/', () => {
    withDir((dir) => {
      mkdirSync(join(dir, 'openspec'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'old.txt'), 'viejo\n')
      mkdirSync(join(dir, 'aspec', 'changes', 'existing'), { recursive: true })
      writeFileSync(join(dir, 'aspec', 'changes', 'existing', 'spec.md'), '# existente\n')
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stderr, /no se migro/)
      assert.equal(existsSync(join(dir, 'aspec', 'old.txt')), false, 'no migra')
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'existing', 'spec.md'), 'utf8'), '# existente\n', 'aspec/ real intacto')
      assert.equal(readFileSync(join(dir, 'openspec', 'old.txt'), 'utf8'), 'viejo\n', 'openspec/ se conserva')
      assert.equal(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), false, 'sin marcador')
    })
  })

  it('un directorio vacio bajo aspec/changes cuenta como contenido real (conservador)', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'old.txt'), 'viejo\n')
      mkdirSync(join(dir, 'aspec', 'changes', 'placeholder'), { recursive: true })
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stderr, /no se migro/)
      assert.equal(existsSync(join(dir, 'aspec', 'old.txt')), false, 'no migra')
      assert.equal(readFileSync(join(dir, 'openspec', 'old.txt'), 'utf8'), 'viejo\n')
      assert.equal(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), false, 'sin marcador')
    })
  })

  // (b) Verificacion: openspec/config.yaml legacy sin aspec/ previo.
  it('init migra openspec/config.yaml cuando aspec/ no existe y el scaffold no lo pisa', () => {
    withDir((dir) => {
      const legacyCfg = 'schema: legacy-openspec\nversion: 1\n'
      mkdirSync(join(dir, 'openspec'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'config.yaml'), legacyCfg)

      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /migrado/)
      const cfgPath = join(dir, 'aspec', 'config.yaml')
      assert.equal(readFileSync(cfgPath, 'utf8'), legacyCfg, 'config legacy preservado (no el default)')
      assert.doesNotMatch(readFileSync(cfgPath, 'utf8'), /aspec project configuration/, 'no es el default del scaffold')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), 'marcador escrito')
      assert.equal(readFileSync(join(dir, 'openspec', 'config.yaml'), 'utf8'), legacyCfg, 'openspec/ conserva backup')

      // El scaffold posterior (segunda corrida) sigue sin pisarlo.
      const r2 = run(['init'], dir)
      assert.equal(r2.status, 0)
      assert.equal(readFileSync(cfgPath, 'utf8'), legacyCfg, 'scaffold posterior no pisa config migrado')
    })
  })

  // W1: el skip de cp force:false omite un archivo homonimo ya presente en aspec/.
  it('cp force:false omite archivos existentes en aspec/ con el mismo nombre', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      // aspec/ solo-scaffold: config.yaml propio y changes/ vacio (sin contenido real).
      mkdirSync(join(dir, 'aspec', 'changes'), { recursive: true })
      writeFileSync(join(dir, 'aspec', 'config.yaml'), '# config equipo\n')
      // legacy con un config.yaml homonimo (contenido distinto) y contenido nuevo.
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'config.yaml'), '# config legacy\n')
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /migrado/)
      assert.equal(readFileSync(join(dir, 'aspec', 'config.yaml'), 'utf8'), '# config equipo\n', 'homonimo existente se omite')
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n', 'contenido nuevo si se copia')
      assert.ok(existsSync(join(dir, 'aspec', '.migrated-from-openspec')))
      assert.equal(readFileSync(join(dir, 'openspec', 'config.yaml'), 'utf8'), '# config legacy\n', 'openspec/ intacta')
    })
  })

  // W1 (variante bajo changes/): mismo path en ambas ramas no se pisa de forma destructiva.
  it('un archivo homonimo bajo changes/ en aspec/ no se pisa (coexistencia)', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# legacy distinto\n')
      mkdirSync(join(dir, 'aspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), '# propio del equipo\n')

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stderr, /no se migro/)
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# propio del equipo\n', 'homonimo en aspec/ intacto')
      assert.equal(readFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# legacy distinto\n', 'openspec/ intacta')
      assert.equal(existsSync(join(dir, 'aspec', '.migrated-from-openspec')), false, 'sin marcador')
    })
  })
})

describe('CLI LOCKED blocks (G7)', () => {
  it('re-aplica bloques LOCKED y preserva contenido EXTENSIBLE', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      let content = readFileSync(path, 'utf8')
      assert.match(content, /LOCKED: test-block/)

      content = content.replace('## Tools de Soporte', '## MIS_HERRAMIENTAS_PERSONALIZADAS')
      content = content.replace(/Contexto gestionado por @ancleto\/spec[^\n]*/, 'MODIFICADO_DENTRO_DEL_BLOQUE')
      writeFileSync(path, content)

      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /MIS_HERRAMIENTAS_PERSONALIZADAS/)
      assert.match(updated, /Contexto gestionado por @ancleto\/spec/)
      assert.doesNotMatch(updated, /MODIFICADO_DENTRO_DEL_BLOQUE/)
    })
  })

  it('no altera el archivo si falta el tag de cierre (escape seguro)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      let content = readFileSync(path, 'utf8')
      content = content.replace('<!-- /LOCKED: test-block -->', '')
      content = content.replace('## Tools de Soporte', '## CABECERA_PERSONAL')
      writeFileSync(path, content)

      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /CABECERA_PERSONAL/)
      assert.match(r.stderr, /no se pudo actualizar el bloque LOCKED "test-block"/)
    })
  })

  it('inserta un bloque LOCKED nuevo del template sin tocar el resto (issue #16)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      // simular version anterior: sin el bloque memory-boundary
      const withBoundary = readFileSync(path, 'utf8')
      const stripped = withBoundary.replace(/<!-- LOCKED: memory-boundary -->[\s\S]*?<!-- \/LOCKED: memory-boundary -->\r?\n?/, '')
      assert.notEqual(stripped, withBoundary, 'precondicion: se quito el bloque')
      writeFileSync(path, stripped)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /<!-- LOCKED: memory-boundary -->/)
      assert.match(updated, /Frontera: memoria del repo vs memoria del agente/)
      assert.match(updated, /<!-- \/LOCKED: memory-boundary -->/)
      // no duplica y conserva el otro bloque LOCKED
      assert.equal((updated.match(/LOCKED: memory-boundary -->/g) || []).length, 2) // apertura + cierre
      assert.match(updated, /<!-- LOCKED: test-block -->/)
    })
  })

  it('inserta el bloque validation-commands antes de memory-boundary sin tocar el resto', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      // simular version anterior: sin el bloque validation-commands
      const withBlock = readFileSync(path, 'utf8')
      const stripped = withBlock.replace(/<!-- LOCKED: validation-commands -->[\s\S]*?<!-- \/LOCKED: validation-commands -->\r?\n?/, '')
      assert.notEqual(stripped, withBlock, 'precondicion: se quito el bloque')
      writeFileSync(path, stripped)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /<!-- LOCKED: validation-commands -->/)
      // no duplica: apertura + cierre
      assert.equal((updated.match(/LOCKED: validation-commands -->/g) || []).length, 2)
      // se inserta antes de memory-boundary (orden del template)
      assert.ok(
        updated.indexOf('LOCKED: validation-commands -->') < updated.indexOf('<!-- LOCKED: memory-boundary -->'),
        'validation-commands debe quedar antes de memory-boundary'
      )
      assert.match(updated, /<!-- LOCKED: test-block -->/)
      assert.match(updated, /Contexto gestionado por @ancleto\/spec/)
    })
  })

  it('inserta bloques LOCKED nuevos en el orden del template aunque falte el siguiente en local', () => {
    withDir((dir) => {
      const dst = join(dir, 'destino')
      mkdirSync(dst, { recursive: true })
      run(['install', '--project', dst, '--no-mcp', '--tier', 'gratis'], dst)
      const path = join(dst, 'AGENTS.md')
      const local = readFileSync(path, 'utf8')
      // Template fuente con DOS bloques nuevos antes de test-block: el siguiente
      // inmediato (new-b) no existe en local, pero test-block si. El ancla debe
      // saltar el ausente y seguir el orden del template.
      const marker = '<!-- LOCKED: test-block -->'
      assert.ok(local.includes(marker), 'precondicion: test-block en local')
      const source = local.replace(
        marker,
        '<!-- LOCKED: new-a -->\nA\n<!-- /LOCKED: new-a -->\n\n<!-- LOCKED: new-b -->\nB\n<!-- /LOCKED: new-b -->\n\n' + marker
      )

      const bundle = join(dir, 'bundle')
      mkdirSync(bundle, { recursive: true })
      writeFileSync(join(bundle, 'manifest.json'), JSON.stringify({
        format: 'ancleto-export/1',
        ancletoVersion: PKG.version,
        exportedAt: new Date().toISOString(),
        agent: 'opencode',
        tier: 'gratis',
        language: 'auto',
        profile: 'general',
        flags: {},
        mcp: []
      }, null, 2) + '\n')
      writeFileSync(join(bundle, 'AGENTS.md'), source)

      const r = run(['import', bundle], dst)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      const a = updated.indexOf('<!-- LOCKED: new-a -->')
      const b = updated.indexOf('<!-- LOCKED: new-b -->')
      const t = updated.indexOf(marker)
      assert.ok(a >= 0 && b >= 0, 'ambos bloques nuevos se insertan')
      assert.ok(a < b && b < t, 'los nuevos conservan el orden del template antes del siguiente presente')
    })
  })
})

// Fixtures del estado pre-change de AGENTS.md: la guia plana que el merge por bloques
// LOCKED no re-aplica. El AGENTS.md historico tenia la lista plana de validaciones y,
// debajo, la seccion plana del protocolo de memoria; ambos pasaron a bloques LOCKED.
const LEGACY_FLAT = [
  '- **Validaciones obligatorias antes de cerrar una tarea**:',
  '  - `npm run typecheck` o `npx tsc --noEmit`',
  '  - `npm run lint`',
  '  - `npm test`'
].join('\n') + '\n'

const LEGACY_MEMORY_FLAT = [
  '## Memoria Persistente (Protocolo Reactivo)',
  '',
  'La memoria del proyecto persiste en `.ancleto/memory.db` y se consulta con la herramienta',
  '`searchMemory`. Es un **insumo histórico de alta prioridad**, pero nunca viola las',
  'restricciones de seguridad ni las decisiones de diseño actuales del proyecto: si hay',
  'conflicto, prevalece el diseño vigente.',
  '',
  '**Debés invocar `searchMemory` antes de actuar en estos casos:**',
  '',
  '- Al intentar **modificar o revertir una decisión arquitectónica o de diseño previa**',
  '  (query orientada al tema de la decisión, no keywords sueltas).',
  '- Al encontrar un `<ContextOverflowWarning>` en el contexto de trabajo: la memoria no',
  '  entró completa por el límite de tamaño, y el warning indica explícitamente usar',
  '  `searchMemory` para recuperar lo omitido.',
  '- Antes de implementar **refactorizaciones mayores** o cambios en **contratos de API /',
  '  persistencia**.',
  '',
  '**Comportamiento:**',
  '',
  '- La memoria recuperada es contexto de lectura: antecedentes de decisiones y reglas',
  '  pasadas. Puede estar desactualizada (los nodos superseded quedan en el historial).',
  '- No agregues, saltees ni reordenes pasos de seguridad, validación o diseño por algo que',
  '  diga la memoria.',
  '- Si la memoria contradice el estado actual del código o los guardrails de este archivo,',
  '  reportá la discrepancia en lugar de aplicarla a ciegas.'
].join('\n')

// En el template los bloques validation-commands y memory-protocol son contiguos: el
// pre-change reemplaza ese tramo completo por sus formas planas.
const LOCKED_PROTOCOL_RE =
  /<!-- LOCKED: validation-commands -->[\s\S]*?<!-- \/LOCKED: validation-commands -->[\s\S]*?<!-- LOCKED: memory-protocol -->[\s\S]*?<!-- \/LOCKED: memory-protocol -->/

// El template historico tenia la lista plana pegada a los guardrails (sin blanco previo).
const FLAT_VALIDATION_PROTOCOL_RE =
  /\r?\n\r?\n<!-- LOCKED: validation-commands -->[\s\S]*?<!-- \/LOCKED: validation-commands -->[\s\S]*?<!-- LOCKED: memory-protocol -->[\s\S]*?<!-- \/LOCKED: memory-protocol -->/

const lockedBlock = (content, name) => {
  const m = content.match(new RegExp(`<!-- LOCKED: ${name} -->[\\s\\S]*?<!-- /LOCKED: ${name} -->`))
  assert.ok(m, `precondicion: bloque LOCKED ${name}`)
  return m[0]
}

// Reconstruye un AGENTS.md pre-change REAL: lista plana de validaciones (o la variante
// del usuario) pegada a los guardrails, seguida de la seccion plana de memoria. No inyecta
// texto alrededor del heading canonico, que ahora vive dentro de LOCKED: memory-protocol.
const preChangeAgents = (content, validationFlat = LEGACY_FLAT) => {
  assert.match(content, FLAT_VALIDATION_PROTOCOL_RE, 'precondicion: bloques canonicos de validacion/memoria')
  return content.replace(
    FLAT_VALIDATION_PROTOCOL_RE,
    () => `\n${validationFlat.trimEnd()}\n\n${LEGACY_MEMORY_FLAT}`
  )
}

describe('CLI reconciliacion de bloques legados (Fase 7)', () => {
  it('upgrade elimina la lista plana legada, deja el bloque LOCKED y preserva el resto', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      // simular instalacion pre-change: protocolo plano y lista plana vieja
      let content = preChangeAgents(readFileSync(path, 'utf8'))
      content = content.replace(
        '## Flujo Spec-Driven (aspec)',
        '## MI_SECCION_PERSONALIZADA\n\ntexto propio del usuario\n\n## Flujo Spec-Driven (aspec)'
      )
      writeFileSync(path, content)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'la lista plana legada se elimina')
      assert.doesNotMatch(updated, /npm run typecheck/, 'no queda el item legado')
      assert.match(updated, /<!-- LOCKED: validation-commands -->/, 'queda el bloque canonico')
      assert.equal((updated.match(/LOCKED: validation-commands -->/g) || []).length, 2, 'sin duplicar')
      assert.match(updated, /MI_SECCION_PERSONALIZADA/, 'preserva contenido personalizado')
      assert.match(updated, /<!-- LOCKED: test-block -->/, 'resto intacto')
    })
  })

  it('la reconciliacion es idempotente: upgrade dos veces no duplica ni rompe', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8')))

      const first = run(['upgrade'], dir)
      assert.equal(first.status, 0)
      const afterFirst = readFileSync(path, 'utf8')
      const second = run(['upgrade'], dir)
      assert.equal(second.status, 0)
      const afterSecond = readFileSync(path, 'utf8')
      assert.equal(afterSecond, afterFirst, 'el segundo upgrade no cambia el archivo')
      assert.equal((afterSecond.match(/LOCKED: validation-commands -->/g) || []).length, 2)
      assert.doesNotMatch(afterSecond, /Validaciones obligatorias antes de cerrar una tarea/)
    })
  })

  it('tolera CRLF en la firma legada', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8')).replace(/\r?\n/g, '\r\n'))

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Validaciones obligatorias antes de cerrar una tarea/)
      assert.match(updated, /<!-- LOCKED: validation-commands -->/)
    })
  })

  it('una lista legada personalizada no se elimina y emite aviso', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const personalized = [
        '- **Validaciones obligatorias antes de cerrar una tarea**:',
        '  - `npm run typecheck` o `npx tsc --noEmit`',
        '  - `npm run lint`',
        '  - `npm test`',
        '  - `npm run build` (agregado por el usuario)'
      ].join('\n') + '\n'
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8'), personalized))

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'conserva el bloque personalizado')
      assert.match(updated, /npm run build/, 'no elimina contenido personalizado')
      assert.match(r.stderr, /ancleto: bloque legado de validaciones no reconocido en AGENTS\.md; revisar/)
    })
  })

  it('una firma legada no reconocida (items distintos) no se elimina y emite aviso', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const unknown = [
        '- **Validaciones obligatorias antes de cerrar una tarea**:',
        '  - `make check`',
        '  - `npm run format`',
        '  - `pytest`'
      ].join('\n') + '\n'
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8'), unknown))

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /make check/, 'conserva la firma no reconocida')
      assert.match(updated, /pytest/, 'no elimina contenido ajeno a la firma')
      assert.match(r.stderr, /ancleto: bloque legado de validaciones no reconocido en AGENTS\.md; revisar/)
      assert.match(updated, /<!-- LOCKED: validation-commands -->/, 'igual inserta el bloque canonico')
    })
  })

  it('install --project reconcilia la lista plana legada (edge de migracion)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8')))

      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'install tambien reconcilia')
      assert.doesNotMatch(updated, /npm run typecheck/)
      assert.match(updated, /<!-- LOCKED: validation-commands -->/)
      assert.equal((updated.match(/LOCKED: validation-commands -->/g) || []).length, 2, 'sin duplicar')
    })
  })

  it('la remocion de la firma legada no deja lineas huerfanas ni blancos colgando', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      // Reconstruccion fiel del estado pre-change: lista plana de validaciones y seccion
      // plana de memoria, tal como estaban en el template viejo.
      const preChange = preChangeAgents(readFileSync(path, 'utf8'))
      assert.match(preChange, /Validaciones obligatorias antes de cerrar una tarea/, 'precondicion: estado pre-change')
      writeFileSync(path, preChange)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Validaciones obligatorias antes de cerrar una tarea/)
      assert.match(updated, /<!-- LOCKED: validation-commands -->/)
      assert.equal((updated.match(/LOCKED: validation-commands -->/g) || []).length, 2)
      assert.doesNotMatch(updated, /\r?\n[ \t]*\r?\n[ \t]*\r?\n/, 'no deben quedar blancos colgando tras la remocion')
    })
  })

  it('PRODUCT.md sin firma legada: la reconciliacion es un no-op', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'PRODUCT.md')
      writeFileSync(path, `${readFileSync(path, 'utf8')}\n## Seccion del usuario\n\ntexto propio\n`)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /## Seccion del usuario/, 'PRODUCT.md del usuario se preserva')
      assert.doesNotMatch(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'no inyecta lista legada')
      assert.doesNotMatch(updated, /LOCKED: validation-commands/, 'el bloque canonico no vive en PRODUCT.md')
    })
  })

  it('PRODUCT.md con contenido cercano a la firma legada: la reconciliacion es un no-op', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'PRODUCT.md')
      // Estado pre-change de PRODUCT.md: heading con el mismo texto de la firma legada
      // pero items DISTINTOS. La firma esta acotada por filename a AGENTS.md, asi que
      // PRODUCT.md nunca se reconcilia: no se borra ni se inserta nada, y no se emite
      // un aviso espurio. El bloque canonico no vive en PRODUCT.md.
      const closeToSignature = [
        '',
        '- **Validaciones obligatorias antes de cerrar una tarea**:',
        '  - `make check`',
        '  - `npm run lint`',
        '  - `pytest`'
      ].join('\n') + '\n'
      writeFileSync(path, `${readFileSync(path, 'utf8')}${closeToSignature}`)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'conserva el heading (no-op)')
      assert.match(updated, /make check/, 'no borra el contenido cercano a la firma')
      assert.match(updated, /pytest/, 'no borra items del usuario')
      assert.doesNotMatch(updated, /LOCKED: validation-commands/, 'el bloque canonico no vive en PRODUCT.md')
      assert.doesNotMatch(r.stderr, /bloque legado de validaciones no reconocido/, 'PRODUCT.md no entra en la reconciliacion')
    })
  })

  it('import de bundle reconcilia la lista plana legada del destino (sin coexistencia)', () => {
    withDir((dir) => {
      // Bundle de origen con el bloque canonico.
      const src = join(dir, 'origen')
      mkdirSync(src, { recursive: true })
      run(['install', '--project', src, '--no-mcp', '--tier', 'gratis'], src)
      assert.equal(run(['export', '--tar', join(dir, 'b.tgz')], src).status, 0)

      // Destino en estado pre-change: protocolo plano y lista plana vieja.
      const dst = join(dir, 'destino')
      mkdirSync(dst, { recursive: true })
      run(['install', '--project', dst, '--no-mcp', '--tier', 'gratis'], dst)
      const path = join(dst, 'AGENTS.md')
      let content = preChangeAgents(readFileSync(path, 'utf8'))
      content = content.replace(
        '## Flujo Spec-Driven (aspec)',
        '## MI_SECCION_IMPORT\n\ntexto propio del usuario\n\n## Flujo Spec-Driven (aspec)'
      )
      writeFileSync(path, content)

      const r = run(['import', join(dir, 'b.tgz')], dst)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'import reconcilia la lista plana legada')
      assert.doesNotMatch(updated, /npm run typecheck/, 'no queda el item legado')
      assert.match(updated, /<!-- LOCKED: validation-commands -->/, 'queda el bloque canonico del bundle')
      assert.equal((updated.match(/LOCKED: validation-commands -->/g) || []).length, 2, 'sin duplicar')
      assert.match(updated, /MI_SECCION_IMPORT/, 'preserva contenido personalizado')
    })
  })

  for (const marker of ['*', '+']) {
    it(`un bloque legado extendido con marcador ${marker} no se elimina y avisa (no deja huerfanas)`, () => {
      withDir((dir) => {
        run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
        const path = join(dir, 'AGENTS.md')
        const extended = [
          '- **Validaciones obligatorias antes de cerrar una tarea**:',
          '  - `npm run typecheck` o `npx tsc --noEmit`',
          '  - `npm run lint`',
          '  - `npm test`',
          `${marker} item extra agregado por el usuario`
        ].join('\n') + '\n'
        writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8'), extended))

        const r = run(['upgrade'], dir)
        assert.equal(r.status, 0)
        const updated = readFileSync(path, 'utf8')
        assert.match(updated, /item extra agregado por el usuario/, 'el item extra no queda huerfano')
        assert.match(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'no borra la firma extendida')
        assert.match(r.stderr, /ancleto: bloque legado de validaciones no reconocido en AGENTS\.md; revisar/)
      })
    })
  }

  it('un bloque legado con linea de continuacion indentada no se elimina y avisa', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const extended = [
        '- **Validaciones obligatorias antes de cerrar una tarea**:',
        '  - `npm run typecheck` o `npx tsc --noEmit`',
        '  - `npm run lint`',
        '  - `npm test`',
        '    (continuacion del ultimo item)'
      ].join('\n') + '\n'
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8'), extended))

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /continuacion del ultimo item/, 'la continuacion no queda huerfana')
      assert.match(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'no borra la firma extendida')
      assert.match(r.stderr, /ancleto: bloque legado de validaciones no reconocido en AGENTS\.md; revisar/)
    })
  })

  it('un bloque legado con continuaciones anidadas de varios niveles no se elimina y avisa', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const extended = [
        '- **Validaciones obligatorias antes de cerrar una tarea**:',
        '  - `npm run typecheck` o `npx tsc --noEmit`',
        '  - `npm run lint`',
        '  - `npm test`',
        '    - sub item anidado',
        '      - sub sub item anidado'
      ].join('\n') + '\n'
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8'), extended))

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /sub sub item anidado/, 'la continuacion anidada no queda huerfana')
      assert.match(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'no borra la firma extendida')
      assert.match(r.stderr, /ancleto: bloque legado de validaciones no reconocido en AGENTS\.md; revisar/)
    })
  })

  it('import de bundle es idempotente: correr dos veces no cambia el AGENTS.md', () => {
    withDir((dir) => {
      // Bundle de origen con el bloque canonico.
      const src = join(dir, 'origen')
      mkdirSync(src, { recursive: true })
      run(['install', '--project', src, '--no-mcp', '--tier', 'gratis'], src)
      assert.equal(run(['export', '--tar', join(dir, 'b.tgz')], src).status, 0)

      // Destino en estado pre-change: protocolo plano y lista plana vieja.
      const dst = join(dir, 'destino')
      mkdirSync(dst, { recursive: true })
      run(['install', '--project', dst, '--no-mcp', '--tier', 'gratis'], dst)
      const path = join(dst, 'AGENTS.md')
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8')))

      const first = run(['import', join(dir, 'b.tgz')], dst)
      assert.equal(first.status, 0)
      const afterFirst = readFileSync(path, 'utf8')
      const second = run(['import', join(dir, 'b.tgz')], dst)
      assert.equal(second.status, 0)
      const afterSecond = readFileSync(path, 'utf8')
      assert.equal(afterSecond, afterFirst, 'el segundo import no cambia el AGENTS.md')
      assert.equal((afterSecond.match(/LOCKED: validation-commands -->/g) || []).length, 2, 'sin duplicar')
      assert.doesNotMatch(afterSecond, /Validaciones obligatorias antes de cerrar una tarea/)
    })
  })

  it('import de bundle sin AGENTS.md no toca el AGENTS.md del destino', () => {
    withDir((dir) => {
      // Destino pre-change con el protocolo plano y la lista plana legada.
      const dst = join(dir, 'destino')
      mkdirSync(dst, { recursive: true })
      run(['install', '--project', dst, '--no-mcp', '--tier', 'gratis'], dst)
      const path = join(dst, 'AGENTS.md')
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8')))
      const before = readFileSync(path, 'utf8')

      // Bundle minimo sin AGENTS.md (solo manifest + PRODUCT.md): no hay bloque canonico
      // que mergear, asi que la ruta no invoca el merge sobre AGENTS.md y no lo toca.
      const bundle = join(dir, 'bundle')
      mkdirSync(bundle, { recursive: true })
      writeFileSync(join(bundle, 'manifest.json'), JSON.stringify({
        format: 'ancleto-export/1',
        ancletoVersion: PKG.version,
        exportedAt: new Date().toISOString(),
        agent: 'opencode',
        tier: 'gratis',
        language: 'auto',
        profile: 'general',
        flags: {},
        mcp: []
      }, null, 2) + '\n')
      writeFileSync(join(bundle, 'PRODUCT.md'), '# PRODUCT\n\n## Project Commands\n\n- Lint: `npm run lint`\n')

      const r = run(['import', bundle], dst)
      assert.equal(r.status, 0)
      const after = readFileSync(path, 'utf8')
      assert.equal(after, before, 'sin AGENTS.md en el bundle, el AGENTS.md del destino no se toca')
      assert.doesNotMatch(after, /LOCKED: validation-commands/, 'el bundle no aporta el bloque canonico')
    })
  })
})

describe('CLI reconciliacion del protocolo de memoria (MEM-05a)', () => {
  // Pre-change con el protocolo plano. Con memoryFirst reproduce el orden del AGENTS.md
  // raiz historico (plano, validation-commands, memory-boundary); si no, el del template.
  const preChangeMemory = (content, { memoryFirst = false, memoryFlat = LEGACY_MEMORY_FLAT } = {}) => {
    assert.match(content, LOCKED_PROTOCOL_RE, 'precondicion: bloques canonicos de validacion/memoria')
    const validationBlock = lockedBlock(content, 'validation-commands')
    const replacement = memoryFirst
      ? `${memoryFlat}\n\n${validationBlock}`
      : `${validationBlock}\n\n${memoryFlat}`
    return content.replace(LOCKED_PROTOCOL_RE, () => replacement)
  }

  const countBlock = (content, name) =>
    (content.match(new RegExp(`<!-- LOCKED: ${name} -->`, 'g')) || []).length
  const blockStart = (content, name) => content.indexOf(`<!-- LOCKED: ${name} -->`)

  it('upgrade elimina el protocolo plano y deja el bloque canonico sin duplicar (T5.2)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const pre = preChangeMemory(readFileSync(path, 'utf8'))
      assert.match(pre, /Debés invocar `searchMemory`/, 'precondicion: protocolo plano')
      writeFileSync(path, pre)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Debés invocar `searchMemory`/, 'se elimina el protocolo plano')
      assert.doesNotMatch(updated, /el warning indica explícitamente usar/, 'no queda la guia vieja del warning')
      assert.equal(countBlock(updated, 'memory-protocol'), 1, 'bloque canonico sin duplicar')
      assert.equal(countBlock(updated, 'memory-boundary'), 1, 'memory-boundary se conserva')
      assert.ok(blockStart(updated, 'validation-commands') < blockStart(updated, 'memory-protocol'))
      assert.ok(blockStart(updated, 'memory-protocol') < blockStart(updated, 'memory-boundary'))
      assert.match(updated, /prefijo literal de hasta 240 caracteres/, 'bloque canonico con el contrato vigente')
      assert.doesNotMatch(r.stderr, /bloque legado de protocolo de memoria no reconocido/)
    })
  })

  it('upgrade elimina el protocolo plano aunque validation-commands lo separe de memory-boundary (T5.3)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const pre = preChangeMemory(readFileSync(path, 'utf8'), { memoryFirst: true })
      assert.match(pre, /Debés invocar `searchMemory`/)
      assert.ok(
        pre.indexOf('Debés invocar `searchMemory`') < blockStart(pre, 'validation-commands'),
        'precondicion: plano antes de validation-commands'
      )
      assert.ok(blockStart(pre, 'validation-commands') < blockStart(pre, 'memory-boundary'))
      writeFileSync(path, pre)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Debés invocar `searchMemory`/, 'se elimina el protocolo plano')
      assert.equal(countBlock(updated, 'validation-commands'), 1, 'validation-commands se conserva')
      assert.equal(countBlock(updated, 'memory-protocol'), 1, 'memory-protocol sin duplicar')
      assert.equal(countBlock(updated, 'memory-boundary'), 1, 'memory-boundary se conserva')
      assert.ok(blockStart(updated, 'validation-commands') < blockStart(updated, 'memory-protocol'))
      assert.ok(blockStart(updated, 'memory-protocol') < blockStart(updated, 'memory-boundary'))
      assert.doesNotMatch(r.stderr, /bloque legado de protocolo de memoria no reconocido/)
    })
  })

  it('PRODUCT.md pierde el blockquote legado y preserva las secciones del usuario (T5.4)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'PRODUCT.md')
      const fresh = readFileSync(path, 'utf8')
      assert.match(fresh, /see the `LOCKED: memory-protocol` block in `AGENTS\.md`/, 'instalacion nueva: puntero de una linea')
      assert.doesNotMatch(fresh, /Memory for this repository is persisted locally/)

      const legacyBlockquote = [
        '> Memory for this repository is persisted locally in `.ancleto/memory.db` (SQLite + FTS5).',
        '> Agents store architectural decisions and rules here automatically. It never leaves the repo.',
        '> Consult via the `searchMemory` tool when modifying prior decisions, after a',
        '> `<ContextOverflowWarning>`, or before major refactors / contract changes.'
      ].join('\n')
      let content = fresh.replace(/> Usage and recovery contract:[^\n]*/, legacyBlockquote)
      content += '\n## Seccion del usuario\n\ntexto propio que debe sobrevivir\n'
      writeFileSync(path, content)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Memory for this repository is persisted locally/, 'blockquote legado eliminado')
      assert.doesNotMatch(updated, /Consult via the `searchMemory` tool/, 'no queda la guia vieja')
      assert.match(updated, /## Seccion del usuario/, 'seccion del usuario preservada')
      assert.match(updated, /texto propio que debe sobrevivir/)
      assert.match(updated, /- \*\*Repository App ID\*\*: ancleto\.\[Product Name\]/, 'linea project-specific intacta')
      assert.match(updated, /- \*\*Scope\*\*: `project:\[Product Name\]`/, 'linea project-specific intacta')
      assert.doesNotMatch(r.stderr, /bloque legado de blockquote de memoria no reconocido/)
    })
  })

  it('el protocolo personalizado no se elimina, avisa y el segundo upgrade es no-op (T5.5)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const personalized = LEGACY_MEMORY_FLAT.replace(
        'conflicto, prevalece el diseño vigente.',
        'conflicto, prevalece el criterio del usuario.'
      )
      assert.notEqual(personalized, LEGACY_MEMORY_FLAT, 'precondicion: run editado')
      writeFileSync(path, preChangeMemory(readFileSync(path, 'utf8'), { memoryFlat: personalized }))

      const first = run(['upgrade'], dir)
      assert.equal(first.status, 0)
      const afterFirst = readFileSync(path, 'utf8')
      assert.match(afterFirst, /prevalece el criterio del usuario/, 'no elimina el run personalizado')
      assert.match(first.stderr, /ancleto: bloque legado de protocolo de memoria no reconocido en AGENTS\.md; revisar/)
      assert.equal(countBlock(afterFirst, 'memory-protocol'), 1, 'inserta el bloque canonico sin duplicar')
      assert.equal(countBlock(afterFirst, 'memory-boundary'), 1, 'memory-boundary se conserva')

      const second = run(['upgrade'], dir)
      assert.equal(second.status, 0)
      const afterSecond = readFileSync(path, 'utf8')
      assert.equal(afterSecond, afterFirst, 'el segundo upgrade no cambia el archivo')
      assert.match(second.stderr, /ancleto: bloque legado de protocolo de memoria no reconocido en AGENTS\.md; revisar/, 'el aviso es por el run personalizado')
      assert.equal(countBlock(afterSecond, 'memory-protocol'), 1, 'el bloque canonico no se duplica')
    })
  })

  it('el bloque canonico no dispara avisos en un segundo upgrade (idempotencia)', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      writeFileSync(path, preChangeMemory(readFileSync(path, 'utf8')))

      const first = run(['upgrade'], dir)
      assert.equal(first.status, 0)
      assert.doesNotMatch(first.stderr, /bloque legado de/, 'la migracion no emite avisos')
      const afterFirst = readFileSync(path, 'utf8')

      const second = run(['upgrade'], dir)
      assert.equal(second.status, 0)
      assert.equal(readFileSync(path, 'utf8'), afterFirst, 'segundo upgrade no-op')
      assert.doesNotMatch(second.stderr, /bloque legado de protocolo de memoria no reconocido/, 'el heading canonico dentro de LOCKED no es firma legada')
      assert.doesNotMatch(second.stderr, /bloque legado de validaciones no reconocido/)
    })
  })

  it('import de bundle reconcilia el protocolo plano del destino (T5.6)', () => {
    withDir((dir) => {
      const src = join(dir, 'origen')
      mkdirSync(src, { recursive: true })
      run(['install', '--project', src, '--no-mcp', '--tier', 'gratis'], src)
      assert.equal(run(['export', '--tar', join(dir, 'b.tgz')], src).status, 0)

      const dst = join(dir, 'destino')
      mkdirSync(dst, { recursive: true })
      run(['install', '--project', dst, '--no-mcp', '--tier', 'gratis'], dst)
      const path = join(dst, 'AGENTS.md')
      let content = preChangeMemory(readFileSync(path, 'utf8'))
      content = content.replace(
        '## Flujo Spec-Driven (aspec)',
        '## MI_SECCION_IMPORT\n\ntexto propio del usuario\n\n## Flujo Spec-Driven (aspec)'
      )
      writeFileSync(path, content)

      const r = run(['import', join(dir, 'b.tgz')], dst)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Debés invocar `searchMemory`/, 'import elimina el protocolo plano')
      assert.equal(countBlock(updated, 'memory-protocol'), 1, 'queda solo el bloque canonico')
      assert.equal(countBlock(updated, 'memory-boundary'), 1, 'memory-boundary se conserva')
      assert.match(updated, /MI_SECCION_IMPORT/, 'preserva contenido personalizado')
      assert.doesNotMatch(r.stderr, /bloque legado de protocolo de memoria no reconocido/)
    })
  })
})

describe('CLI merge y reconciliacion (parche de bordes)', () => {
  const countBlock = (content, name) =>
    (content.match(new RegExp(`<!-- LOCKED: ${name} -->`, 'g')) || []).length

  const writeBundle = (dir, files) => {
    const bundle = join(dir, 'bundle')
    mkdirSync(bundle, { recursive: true })
    writeFileSync(join(bundle, 'manifest.json'), JSON.stringify({
      format: 'ancleto-export/1',
      ancletoVersion: PKG.version,
      exportedAt: new Date().toISOString(),
      agent: 'opencode',
      tier: 'gratis',
      language: 'auto',
      profile: 'general',
      flags: {},
      mcp: []
    }, null, 2) + '\n')
    for (const [name, body] of Object.entries(files)) writeFileSync(join(bundle, name), body)
    return bundle
  }

  it('inserta un bloque LOCKED al final de un archivo sin newline sin incrustar el marcador', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const fresh = readFileSync(path, 'utf8')
      const head = fresh.slice(0, fresh.indexOf('<!-- LOCKED: validation-commands -->')).replace(/\s+$/, '')
      writeFileSync(path, head)

      const first = run(['upgrade'], dir)
      assert.equal(first.status, 0, first.stderr)
      const updated = readFileSync(path, 'utf8')
      const lines = updated.split('\n')
      assert.ok(lines.includes('<!-- LOCKED: validation-commands -->'), 'el marcador queda al inicio de linea')
      assert.ok(lines.includes('<!-- LOCKED: memory-protocol -->'), 'el siguiente bloque tambien')

      const second = run(['upgrade'], dir)
      assert.equal(second.status, 0, second.stderr)
      assert.doesNotMatch(second.stderr, /bloque legado de/, 'un segundo upgrade no emite avisos falsos')
    })
  })

  it('un source sin los bloques canonicos preserva los runs planos del destino', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8')))
      // Source sintetico minimo: solo el bloque LOCKED del perfil. Desacopla el test
      // de profiles/test/templates/AGENTS.md si el perfil gana bloques en el futuro.
      const profileAgents = '<!-- LOCKED: test-profile -->\nperfil sintetico\n<!-- /LOCKED: test-profile -->\n'
      const bundle = writeBundle(dir, { 'AGENTS.md': profileAgents })

      const r = run(['import', bundle], dir)
      assert.equal(r.status, 0, r.stderr)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'el run plano se conserva')
      assert.match(updated, /Debés invocar `searchMemory`/, 'el protocolo plano se conserva')
      assert.equal(countBlock(updated, 'validation-commands'), 0, 'el source no trae el bloque canonico')
      assert.match(updated, /LOCKED: test-profile/, 'el bloque del source si se mergea')
      assert.doesNotMatch(r.stderr, /bloque legado de/, 'un source sin los bloques canonicos no emite aviso')
    })
  })

  it('un source raiz sigue reconciliando los runs planos del destino', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      writeFileSync(path, preChangeAgents(readFileSync(path, 'utf8')))
      const rootAgents = readFileSync(join(TEST_DIR, '..', 'templates', 'AGENTS.md'), 'utf8')
      const bundle = writeBundle(dir, { 'AGENTS.md': rootAgents })

      const r = run(['import', bundle], dir)
      assert.equal(r.status, 0, r.stderr)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'run plano eliminado')
      assert.doesNotMatch(updated, /Debés invocar `searchMemory`/, 'protocolo plano eliminado')
      assert.equal(countBlock(updated, 'validation-commands'), 1)
      assert.equal(countBlock(updated, 'memory-protocol'), 1)
    })
  })

  it('sin run legado y con EOL mixto, el archivo se devuelve byte a byte', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--profile', 'test', '--no-mcp', '--tier', 'minimo'], dir)
      const path = join(dir, 'AGENTS.md')
      const before = readFileSync(path, 'utf8') + '\n## Seccion del usuario\r\n\r\nlinea CRLF\r\nlinea LF\n'
      writeFileSync(path, before)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0, r.stderr)
      assert.equal(readFileSync(path, 'utf8'), before, 'no se normaliza el EOL mixto')
    })
  })

  it('no borra un run legado documentado dentro de un code fence', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const fresh = readFileSync(path, 'utf8')
      const fenced = [
        '## Documentacion de la migracion',
        '',
        '```markdown',
        LEGACY_FLAT.trimEnd(),
        '',
        LEGACY_MEMORY_FLAT,
        '```'
      ].join('\n')
      const content = fresh.replace(LOCKED_PROTOCOL_RE, () => fenced)
      assert.notEqual(content, fresh, 'precondicion: snippet en fence')
      writeFileSync(path, content)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0, r.stderr)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /Validaciones obligatorias antes de cerrar una tarea/, 'el snippet documentado sobrevive')
      assert.match(updated, /Debés invocar `searchMemory`/, 'el protocolo documentado sobrevive')
      assert.equal(countBlock(updated, 'validation-commands'), 1, 'igual se inserta el bloque canonico')
      assert.equal(countBlock(updated, 'memory-protocol'), 1)
      assert.doesNotMatch(r.stderr, /bloque legado de/, 'un snippet en fence no avisa')
    })
  })

  it('reconcilia un archivo que termina con el protocolo plano', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const path = join(dir, 'AGENTS.md')
      const fresh = readFileSync(path, 'utf8')
      const head = fresh.slice(0, fresh.indexOf('<!-- LOCKED: validation-commands -->')).replace(/\s+$/, '')
      writeFileSync(path, `${head}\n\n${LEGACY_FLAT.trimEnd()}\n\n${LEGACY_MEMORY_FLAT}`)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0, r.stderr)
      const updated = readFileSync(path, 'utf8')
      assert.doesNotMatch(updated, /Debés invocar `searchMemory`/, 'el run plano final se elimina')
      assert.doesNotMatch(updated, /Validaciones obligatorias antes de cerrar una tarea/)
      assert.equal(countBlock(updated, 'memory-protocol'), 1, 'queda el bloque canonico')
      assert.doesNotMatch(r.stderr, /bloque legado de/, 'sin aviso de firma no reconocida')
    })
  })
})

describe('CLI azure MCP (G8)', () => {
  it('init --with-azure + install inyecta azure-devops y muestra aviso', () => {
    withDir((dir) => {
      run(['init', '--with-azure'], dir)
      const r = run(['install', '--project', dir, '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.opencode', 'opencode.json'), 'utf8'))
      assert.ok(cfg.mcp['azure-devops'], 'azure-devops presente')
      assert.equal(cfg.mcp['azure-devops'].command[0], 'npx')
      assert.match(r.stdout, /AZURE_DEVOPS_ORG_URL/)
    })
  })

  it('sin --with-azure no inyecta azure-devops', () => {
    withDir((dir) => {
      run(['init'], dir)
      const r = run(['install', '--project', dir, '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      const cfgPath = join(dir, '.opencode', 'opencode.json')
      if (existsSync(cfgPath)) {
        const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
        assert.equal(cfg.mcp['azure-devops'], undefined)
      }
    })
  })
})

describe('CLI aspec skills Pack 1 (S2)', () => {
  const PACK1 = ['ancleto-new', 'ancleto-propose', 'ancleto-apply', 'ancleto-verify', 'ancleto-archive']

  it('install --project instala las 5 skills en el directorio del agente', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      for (const name of PACK1) {
        assert.ok(existsSync(join(dir, '.opencode', 'skills', name, 'SKILL.md')), name)
      }
      const rc = readRc(dir)
      assert.deepEqual(rc.installedPaths.skills, ['.opencode/skills'])
    })
  })

  it('check valida las 5 skills sin faltantes ni huerfanos', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      assert.match(r.stdout, /0 huerfanos/)
    })
  })
})

describe('CLI aspec skills catálogo completo (S2)', () => {
  const ALL11 = ['ancleto-new', 'ancleto-propose', 'ancleto-apply', 'ancleto-verify', 'ancleto-archive', 'ancleto-bulk-archive', 'ancleto-continue', 'ancleto-explore', 'ancleto-ff', 'ancleto-onboard', 'ancleto-workflow']

  it('install --project instala las 11 skills en el directorio del agente', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      for (const name of ALL11) {
        assert.ok(existsSync(join(dir, '.opencode', 'skills', name, 'SKILL.md')), name)
      }
    })
  })

  it('check valida las 11 skills sin faltantes ni huerfanos', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      assert.match(r.stdout, /0 huerfanos/)
    })
  })
})

describe('CLI upgrade (S3)', () => {
  it('upgrade sin .ancletorc falla con exit 1', () => {
    withDir((dir) => {
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /No se encontro \.ancletorc/)
    })
  })

  it('upgrade actualiza LOCKED y mantiene EXTENSIBLE', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const path = join(dir, 'AGENTS.md')
      let content = readFileSync(path, 'utf8')
      content = content.replace('## Tools de Soporte', '## MIS_HERRAMIENTAS')
      content = content.replace(/Contexto gestionado por @ancleto\/spec[^\n]*/, 'BLOQUE_VIEJO')
      writeFileSync(path, content)

      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      const updated = readFileSync(path, 'utf8')
      assert.match(updated, /MIS_HERRAMIENTAS/)
      assert.match(updated, /Contexto gestionado por @ancleto\/spec/)
      assert.doesNotMatch(updated, /BLOQUE_VIEJO/)
      assert.match(r.stdout, /upgrade completo/)
    })
  })

  it('check pasa 100% despues de upgrade', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const up = run(['upgrade'], dir)
      assert.equal(up.status, 0)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      assert.match(r.stdout, /0 huerfanos/)
      // Con `minimo` el tier coincide con la canónica: no hay aviso de tier.
      assert.doesNotMatch(r.stdout, /aplica un modelo distinto/)
    })
  })

  it('upgrade revierte un model: editado en el mirror a la canónica', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      const agentPath = join(dir, '.opencode', 'agents', 'orchestrator.md')
      const edited = readFileSync(agentPath, 'utf8').replace(/^model: .*$/m, 'model: proveedor/modelo-ajeno')
      writeFileSync(agentPath, edited)
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      for (const f of readdirSync(join(TEST_DIR, '..', 'agents'))) {
        assert.ok(
          readFileSync(join(dir, '.opencode', 'agents', f)).equals(readFileSync(join(TEST_DIR, '..', 'agents', f))),
          `upgrade materializa la canónica en ${f}`
        )
      }
    })
  })
})

describe('CLI ui (v0.6.2) — fallback sin TTY', () => {
  const UI = pathToFileURL(join(TEST_DIR, '..', 'src', 'cli', 'ui.js')).href

  function runUi(code, cwd) {
    return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd,
      encoding: 'utf8',
      timeout: 15000
    })
  }

  it('selectOption sin TTY devuelve la opcion inicial sin colgar', () => {
    withDir((dir) => {
      const code = `import(${JSON.stringify(UI)}).then(async (m) => { const r = await m.selectOption('x', ['a', 'b', 'c'], 1); process.stdout.write('RESULT:' + r) })`
      const r = runUi(code, dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /RESULT:b/)
    })
  })

  it('showBanner sin TTY muestra el arte cyan estatico sin animacion', () => {
    withDir((dir) => {
      const code = `import(${JSON.stringify(UI)}).then(async (m) => { await m.showBanner(1); m.stopBanner(); process.stdout.write('OK') })`
      const r = runUi(code, dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /\u2588/)
      assert.ok(r.stdout.includes('\x1b[36m'))
      assert.doesNotMatch(r.stdout, /\x1b\[\d+A/)
      assert.doesNotMatch(r.stdout, /\x1b\[\?25/)
    })
  })

  it('animacion de fondo se detiene limpia y redibuja sin romper el menu', () => {
    withDir((dir) => {
      const code = [
        `const m = await import(${JSON.stringify(UI)})`,
        `const out = process.stdout`,
        `Object.defineProperty(out, 'isTTY', { value: true })`,
        `let buf = ''`,
        `const orig = out.write.bind(out)`,
        `out.write = (c) => { buf += String(c); return true }`,
        `Object.defineProperty(process.stdin, 'isTTY', { value: true })`,
        `let handler = null`,
        `process.stdin.setRawMode = () => {}`,
        `process.stdin.resume = () => {}`,
        `process.stdin.pause = () => {}`,
        `process.stdin.on = (ev, fn) => { if (ev === 'data') handler = fn; return process.stdin }`,
        `process.stdin.removeListener = () => process.stdin`,
        `m.showBanner(1, 5000)`,
        `await new Promise((r) => setTimeout(r, 40))`,
        `const p = m.selectOption('Agente', ['a', 'b', 'c'])`,
        `await new Promise((r) => setTimeout(r, 40))`,
        `handler(Buffer.from('\\u001b[B'))`,
        `await new Promise((r) => setTimeout(r, 40))`,
        `handler(Buffer.from('\\r'))`,
        `const result = await p`,
        `m.stopBanner()`,
        `const at = buf.length`,
        `await new Promise((r) => setTimeout(r, 40))`,
        `out.write = orig`,
        `const ups = [...new Set([...buf.matchAll(/\\x1b\\[(\\d+)A/g)].map((x) => +x[1]))].sort((a, b) => a - b)`,
        `process.stdout.write(JSON.stringify({ result, quiet: buf.length === at, ups, hide: buf.includes('\\x1b[?25l'), show: buf.includes('\\x1b[?25h') }))`
      ].join('\n')
      const r = runUi(code, dir)
      assert.equal(r.status, 0)
      const summary = JSON.parse(r.stdout)
      assert.equal(summary.result, 'b')
      assert.equal(summary.hide, true)
      assert.equal(summary.show, true)
      assert.equal(summary.quiet, true)
      assert.ok(summary.ups.includes(3), 'redraw del menu')
      assert.ok(summary.ups.includes(18), 'tick del banner sin menu')
      assert.ok(summary.ups.includes(22), 'tick del banner con menu debajo (18 + 4)')
    })
  })
})

describe('CLI init --tier (v0.6.2)', () => {
  it('init --tier persiste el tier y install lo aplica sin preguntar', () => {
    withDir((dir) => {
      const r = run(['init', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dir, '.opencode', '.ancleto-tier'), 'utf8').trim(), 'gratis')

      const inst = run(['install', '--project', dir, '--no-mcp'], dir)
      assert.equal(inst.status, 0)
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/big-pickle/)
    })
  })

  it('init --tier invalido falla con exit 1', () => {
    withDir((dir) => {
      const r = run(['init', '--tier', 'premium'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /tier invalido/)
    })
  })

  it('init --tier minimo aplica los modelos del tier a los agentes locales', () => {
    withDir((dir) => {
      const r = run(['init', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      // `coder` no recibe la nota de host que init agrega al orchestrator con compresión,
      // así que el mirror queda byte-idéntico a la canónica.
      const coder = readFileSync(join(dir, '.opencode', 'agents', 'coder.md'))
      assert.ok(
        coder.equals(readFileSync(join(TEST_DIR, '..', 'agents', 'coder.md'))),
        'tier minimo deja el mirror byte-idéntico a la canónica'
      )
    })
  })

  it('init --tier gratis aplica el modelo gratis sin agregar la clave si no existía', () => {
    withDir((dir) => {
      const r = run(['init', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/big-pickle/)
      assert.match(r.stdout, /modelo gratis: opencode\/big-pickle/)
      // Una clave ausente no se agrega al manifiesto.
      assert.equal(readRc(dir).gratisModel, undefined)
    })
  })

  it('init --tier gratis reutiliza un gratisModel conocido y lo conserva', () => {
    withDir((dir) => {
      assert.equal(run(['init', '--tier', 'gratis'], dir).status, 0)
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.gratisModel = 'opencode/big-pickle'
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['init', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /modelo gratis: opencode\/big-pickle/)
      assert.equal(readRc(dir).gratisModel, 'opencode/big-pickle')
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/big-pickle/)
    })
  })

  it('init --tier gratis normaliza un gratisModel desconocido', () => {
    withDir((dir) => {
      assert.equal(run(['init', '--tier', 'gratis'], dir).status, 0)
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.gratisModel = 'opencode/muse-spark-1.3-contributor-free'
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['init', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /modelo gratis: opencode\/big-pickle/)
      assert.equal(readRc(dir).gratisModel, 'opencode/big-pickle')
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/big-pickle/)
    })
  })

  it('init sin tier no escribe .ancleto-tier (fallback silencioso)', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'opencode'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.opencode', '.ancleto-tier')), false)
    })
  })

  it('init sin tier respeta el tier guardado y no pierde los modelos aplicados', () => {
    withDir((dir) => {
      assert.equal(run(['init', '--tier', 'minimo'], dir).status, 0)
      const r = run(['init'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /Tier: minimo/)
      const coder = readFileSync(join(dir, '.opencode', 'agents', 'coder.md'))
      assert.ok(
        coder.equals(readFileSync(join(TEST_DIR, '..', 'agents', 'coder.md'))),
        'el tier guardado (minimo) no altera el modelo canónico'
      )
    })
  })
})

describe('CLI install wizard (v0.6.6)', () => {
  it('install no interactivo no emite banner ni secuencias ANSI', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.doesNotMatch(r.stdout, /\u2588/)
      assert.doesNotMatch(r.stdout, /\x1b\[/)
    })
  })

  it('install sin --tier ni tier guardado cae en normal sin colgar', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dir, '.opencode', '.ancleto-tier'), 'utf8').trim(), 'normal')
    })
  })

  it('install --tier gratis aplica el unico modelo gratis y no detecta Muse Spark', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, { ANCLETO_MUSE_SPARK: '1' })
      assert.equal(r.status, 0)
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/big-pickle/)
      assert.doesNotMatch(orchestrator, /muse-spark/)
      assert.match(r.stdout, /modelo gratis: opencode\/big-pickle/)
      // La variable de entorno ya no altera el modelo resuelto.
      assert.equal(readRc(dir).gratisModel, undefined)
    })
  })

  it('install --tier gratis reutiliza un gratisModel conocido sin preguntar', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.gratisModel = 'opencode/big-pickle'
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /modelo gratis: opencode\/big-pickle/)
      assert.equal(readRc(dir).gratisModel, 'opencode/big-pickle')
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/big-pickle/)
    })
  })
})

describe('CLI specs check (issue #21)', () => {
  const writeSpec = (dir, rel, content) => {
    const p = join(dir, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }

  const CANONICAL = `# Reset Order

## ADDED Requirements

### Requirement: Reset order

The system SHALL reset the order.

#### Scenario: Basic reset

- **WHEN** the user resets
- **THEN** the order is cleared
`

  const TRANSLATED = `# Reset Order

#### RF1: Reset del pedido

- **Dado** un pedido activo
- **Cuando** el usuario resetea
- **Entonces** el pedido se limpia
`

  it('detecta un spec traducido y sale con exit 1', () => {
    withDir((dir) => {
      writeSpec(dir, join('aspec', 'specs', 'reset-order', 'spec.md'), TRANSLATED)
      const r = run(['specs', 'check', '--json'], dir)
      assert.equal(r.status, 1)
      const j = JSON.parse(r.stdout)
      assert.equal(j.ok, false)
      assert.equal(j.nonCanonical.length, 1)
      assert.match(j.nonCanonical[0].file, /reset-order\/spec\.md/)
      assert.ok(j.nonCanonical[0].missing.includes('### Requirement:'))
      assert.ok(j.nonCanonical[0].unexpected.some((h) => h.includes('RF1')))
    })
  })

  it('pasa con specs canonicos', () => {
    withDir((dir) => {
      writeSpec(dir, join('aspec', 'specs', 'reset-order', 'spec.md'), CANONICAL)
      const r = run(['specs', 'check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /canonicos/)
    })
  })

  it('--change revisa tambien los deltas del change', () => {
    withDir((dir) => {
      writeSpec(dir, join('aspec', 'specs', 'reset-order', 'spec.md'), CANONICAL)
      writeSpec(dir, join('aspec', 'changes', 'reset-flow', 'specs', 'reset-order', 'spec.md'), TRANSLATED)
      const r = run(['specs', 'check', '--change', 'reset-flow', '--json'], dir)
      assert.equal(r.status, 1)
      const j = JSON.parse(r.stdout)
      assert.equal(j.scanned, 2)
      assert.match(j.nonCanonical[0].file, /changes\/reset-flow/)
    })
  })

  it('--change inexistente falla claro', () => {
    withDir((dir) => {
      const r = run(['specs', 'check', '--change', 'nope'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /no existe el change/)
    })
  })

  it('un delta REMOVED/RENAMED-only es canonico (sin scenarios)', () => {
    withDir((dir) => {
      writeSpec(dir, join('aspec', 'specs', 'reset-order', 'spec.md'), CANONICAL)
      writeSpec(
        dir,
        join('aspec', 'changes', 'drop-legacy', 'specs', 'reset-order', 'spec.md'),
        '## REMOVED Requirements\n\n### Requirement: Legacy reset\n\n## RENAMED Requirements\n\n- FROM: `### Requirement: Old Name`\n- TO: `### Requirement: New Name`\n'
      )
      const r = run(['specs', 'check', '--change', 'drop-legacy'], dir)
      assert.equal(r.status, 0)
    })
  })
})

describe('CLI stats (issue #27)', () => {
  const NOW = Date.parse('2026-09-20T12:00:00')
  const MODEL = JSON.stringify({ id: 'test-model', providerID: 'test' })

  function makeStatsDb(dir) {
    const dbPath = join(dir, 'opencode-fixture.db')
    const db = new DatabaseSync(dbPath)
    db.exec(`CREATE TABLE session (
      id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, directory TEXT, agent TEXT, model TEXT,
      cost REAL, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
      tokens_cache_read INTEGER, tokens_cache_write INTEGER, time_created INTEGER, time_updated INTEGER
    )`)
    db.exec('CREATE TABLE message (id TEXT, session_id TEXT, data TEXT)')
    return { db, dbPath }
  }

  function addSession(db, s) {
    db.prepare(
      `INSERT INTO session (id, parent_id, title, directory, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created, time_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      s.id,
      s.parent_id ?? null,
      s.title ?? null,
      s.directory ?? null,
      s.agent ?? null,
      s.model ?? null,
      s.cost ?? 0,
      s.tokens_input ?? 0,
      s.tokens_output ?? 0,
      s.tokens_reasoning ?? 0,
      s.tokens_cache_read ?? 0,
      s.tokens_cache_write ?? 0,
      s.time_created ?? NOW,
      s.time_updated ?? NOW
    )
  }

  function addMessage(db, sessionId, agent, tokens) {
    db.prepare('INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)').run(
      `msg_${Math.random().toString(36).slice(2)}`,
      sessionId,
      JSON.stringify({
        role: 'assistant',
        agent,
        tokens: { input: tokens.input, output: tokens.output, reasoning: tokens.reasoning ?? 0, cache: { read: tokens.cacheRead ?? 0, write: 0 } }
      })
    )
  }

  it('lista sesiones del directorio con rollup de subagentes', () => {
    withDir((dir) => {
      const { db, dbPath } = makeStatsDb(dir)
      addSession(db, { id: 'ses_root', title: 'Sesion principal', directory: dir, agent: 'build', model: MODEL, tokens_input: 1000, tokens_output: 100, cost: 0.5 })
      addSession(db, { id: 'ses_child', parent_id: 'ses_root', title: 'Subagente', directory: dir, agent: 'coder', tokens_input: 500, tokens_output: 50, cost: 0.1 })
      addSession(db, { id: 'ses_other', title: 'Otra', directory: 'D:/otro/lado', agent: 'build', tokens_input: 9999 })
      db.close()
      const r = run(['stats', '--json'], dir, { ANCLETO_OPENCODE_DB: dbPath })
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.scope, 'directory')
      assert.equal(j.sessions.length, 1)
      assert.equal(j.sessions[0].id, 'ses_root')
      assert.equal(j.sessions[0].tokens.input, 1500)
      assert.equal(j.sessions[0].tokens.output, 150)
      assert.equal(j.sessions[0].subagentSessions, 1)
      assert.equal(j.totals.input, 1500)
    })
  })

  it('--session desglosa tokens por agente (ignora mensajes de usuario)', () => {
    withDir((dir) => {
      const { db, dbPath } = makeStatsDb(dir)
      addSession(db, { id: 'ses_root', directory: dir, agent: 'build', model: MODEL, tokens_input: 300 })
      addSession(db, { id: 'ses_child', parent_id: 'ses_root', directory: dir, agent: 'coder' })
      addMessage(db, 'ses_root', 'build', { input: 100, output: 10, reasoning: 5, cacheRead: 50 })
      addMessage(db, 'ses_root', 'build', { input: 100, output: 10 })
      addMessage(db, 'ses_child', 'coder', { input: 200, output: 20, cacheRead: 80 })
      db.prepare('INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)').run('msg_user', 'ses_root', JSON.stringify({ role: 'user' }))
      db.close()
      const r = run(['stats', '--session', 'ses_root', '--json'], dir, { ANCLETO_OPENCODE_DB: dbPath })
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.scope, 'session')
      assert.equal(j.session.subagentSessions, 1)
      const build = j.byAgent.find((a) => a.agent === 'build')
      const coder = j.byAgent.find((a) => a.agent === 'coder')
      assert.equal(build.input, 200)
      assert.equal(build.messages, 2)
      assert.equal(build.cacheRead, 50)
      assert.equal(coder.input, 200)
      assert.equal(coder.messages, 1)
      assert.equal(j.byAgent.length, 2)
    })
  })

  it('--since filtra por fecha de creacion', () => {
    withDir((dir) => {
      const { db, dbPath } = makeStatsDb(dir)
      addSession(db, { id: 'ses_old', directory: dir, time_created: Date.parse('2026-08-01T10:00:00'), tokens_input: 10 })
      addSession(db, { id: 'ses_new', directory: dir, time_created: Date.parse('2026-09-21T10:00:00'), tokens_input: 20 })
      db.close()
      const r = run(['stats', '--json', '--since', '2026-09-01'], dir, { ANCLETO_OPENCODE_DB: dbPath })
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.sessions.length, 1)
      assert.equal(j.sessions[0].id, 'ses_new')
    })
  })

  it('sin base de opencode falla claro', () => {
    withDir((dir) => {
      const r = run(['stats'], dir, { ANCLETO_OPENCODE_DB: join(dir, 'no-existe.db') })
      assert.equal(r.status, 1)
      assert.match(r.stderr, /no se encontro la base de sesiones/)
    })
  })
})

describe('CLI projects (registro de proyectos)', () => {
  const regEnv = (dir) => ({ ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') })

  it('install --project registra el proyecto en el registro global', () => {
    withDir((dir) => {
      const proj = join(dir, 'alpha')
      mkdirSync(proj, { recursive: true })
      const r = run(['install', '--project', proj, '--no-mcp', '--tier', 'minimo'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const reg = JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8'))
      const entry = Object.values(reg.projects)[0]
      assert.ok(entry, 'debe haber una entrada')
      assert.equal(entry.tier, 'minimo')
      assert.equal(entry.agent, 'opencode')
      assert.equal(entry.scoped, true)
    })
  })

  it('init registra el proyecto', () => {
    withDir((dir) => {
      const proj = join(dir, 'beta')
      mkdirSync(proj, { recursive: true })
      const r = run(['init', '--agent', 'opencode'], proj, regEnv(dir))
      assert.equal(r.status, 0)
      const reg = JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8'))
      assert.equal(Object.keys(reg.projects).length, 1)
    })
  })

  it('re-instalar actualiza la entrada, no duplica', () => {
    withDir((dir) => {
      const proj = join(dir, 'alpha')
      mkdirSync(proj, { recursive: true })
      run(['install', '--project', proj, '--no-mcp', '--tier', 'minimo'], dir, regEnv(dir))
      run(['install', '--project', proj, '--no-mcp', '--tier', 'normal'], dir, regEnv(dir))
      const reg = JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8'))
      assert.equal(Object.keys(reg.projects).length, 1)
      assert.equal(Object.values(reg.projects)[0].tier, 'normal')
      assert.ok(Object.values(reg.projects)[0].registeredAt, 'conserva registeredAt')
    })
  })

  it('projects lista con --json y detecta el directorio actual', () => {
    withDir((dir) => {
      const proj = join(dir, 'alpha')
      mkdirSync(proj, { recursive: true })
      run(['install', '--project', proj, '--no-mcp', '--tier', 'minimo'], dir, regEnv(dir))
      const r = run(['projects', 'list', '--json'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.count, 1)
      assert.equal(j.projects[0].exists, true)
      assert.equal(j.projects[0].tier, 'minimo')
    })
  })

  it('list --projects es alias de projects list', () => {
    withDir((dir) => {
      const r = run(['list', '--projects', '--json'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.equal(JSON.parse(r.stdout).ok, true)
    })
  })

  it('projects scan descubre y registra, con --dry-run no escribe', () => {
    withDir((dir) => {
      const a = join(dir, 'root', 'alpha')
      const b = join(dir, 'root', 'nested', 'beta')
      mkdirSync(a, { recursive: true })
      mkdirSync(b, { recursive: true })
      run(['install', '--project', a, '--no-mcp'], dir, regEnv(dir))
      run(['install', '--project', b, '--no-mcp'], dir, regEnv(dir))
      rmSync(join(dir, 'registry.json'), { force: true })
      const dry = run(['projects', 'scan', join(dir, 'root'), '--dry-run', '--json'], dir, regEnv(dir))
      const dj = JSON.parse(dry.stdout)
      assert.equal(dj.added.length, 2)
      assert.equal(existsSync(join(dir, 'registry.json')), false, 'dry-run no escribe')
      const real = run(['projects', 'scan', join(dir, 'root'), '--json'], dir, regEnv(dir))
      assert.equal(JSON.parse(real.stdout).added.length, 2)
      assert.equal(JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8')).projects
        ? Object.keys(JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8')).projects).length
        : 0, 2)
    })
  })

  it('projects prune quita entradas muertas', () => {
    withDir((dir) => {
      const proj = join(dir, 'gone')
      mkdirSync(proj, { recursive: true })
      run(['init', '--agent', 'opencode'], proj, regEnv(dir))
      rmSync(proj, { recursive: true, force: true })
      const dry = run(['projects', 'prune', '--dry-run', '--json'], dir, regEnv(dir))
      assert.equal(JSON.parse(dry.stdout).pruned, 1)
      assert.equal(Object.keys(JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8')).projects).length, 1)
      const real = run(['projects', 'prune', '--json'], dir, regEnv(dir))
      assert.equal(JSON.parse(real.stdout).pruned, 1)
      assert.equal(Object.keys(JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8')).projects).length, 0)
    })
  })

  it('projects info reporta estado del proyecto', () => {
    withDir((dir) => {
      const proj = join(dir, 'alpha')
      mkdirSync(proj, { recursive: true })
      run(['install', '--project', proj, '--no-mcp', '--tier', 'minimo'], dir, regEnv(dir))
      const r = run(['projects', 'info', proj, '--json'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.agent, 'opencode')
      assert.equal(j.tier, 'minimo')
      assert.equal(j.scoped, true)
      assert.equal(j.activeChanges, 0)
    })
  })

  it('projects info sin .ancletorc falla claro', () => {
    withDir((dir) => {
      const r = run(['projects', 'info', dir, '--json'], dir, regEnv(dir))
      assert.equal(r.status, 1)
      assert.match(r.stderr, /no parece un proyecto ancleto/)
    })
  })
})

describe('CLI projects update (actualizacion desde la lista)', () => {
  const regEnv = (dir) => ({ ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') })

  const makeOutdated = (dir, name) => {
    const proj = join(dir, name)
    mkdirSync(proj, { recursive: true })
    run(['install', '--project', proj, '--no-mcp', '--tier', 'minimo'], dir, regEnv(dir))
    const regPath = join(dir, 'registry.json')
    const r = JSON.parse(readFileSync(regPath, 'utf8'))
    const key = Object.keys(r.projects).find((k) => k.endsWith(`/${name}`))
    r.projects[key].version = '0.0.1'
    writeFileSync(regPath, JSON.stringify(r, null, 2))
    const rcPath = join(proj, '.ancletorc')
    const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
    rc.version = '0.0.1'
    writeFileSync(rcPath, JSON.stringify(rc, null, 2))
    return proj
  }

  it('sin TTY lista los desactualizados y sugiere --all', () => {
    withDir((dir) => {
      makeOutdated(dir, 'alpha')
      const r = run(['projects', 'update'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.match(r.stdout, /proyectos desactualizados/)
      assert.match(r.stdout, /--all/)
    })
  })

  it('--all actualiza los desactualizados y deja la version al dia', () => {
    withDir((dir) => {
      const proj = makeOutdated(dir, 'alpha')
      const r = run(['projects', 'update', '--all'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.match(r.stdout, /1\/1 proyectos actualizados/)
      assert.equal(JSON.parse(readFileSync(join(proj, '.ancletorc'), 'utf8')).version, PKG.version)
    })
  })

  it('--all no toca lo que ya esta al dia', () => {
    withDir((dir) => {
      const proj = join(dir, 'fresh')
      mkdirSync(proj, { recursive: true })
      run(['install', '--project', proj, '--no-mcp'], dir, regEnv(dir))
      const r = run(['projects', 'update', '--all'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.match(r.stdout, /al dia/)
    })
  })

  it('--json reporta los desactualizados', () => {
    withDir((dir) => {
      makeOutdated(dir, 'alpha')
      const r = run(['projects', 'update', '--json'], dir, regEnv(dir))
      const j = JSON.parse(r.stdout)
      assert.equal(j.outdated.length, 1)
      assert.equal(j.outdated[0].version, '0.0.1')
    })
  })

  it('un proyecto muerto no rompe el update de los vivos', () => {
    withDir((dir) => {
      const proj = makeOutdated(dir, 'alpha')
      const dead = join(dir, 'dead')
      mkdirSync(dead, { recursive: true })
      run(['install', '--project', dead, '--no-mcp'], dir, regEnv(dir))
      rmSync(join(dead, '.ancletorc'), { force: true })
      const r = run(['projects', 'update', '--all'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.match(r.stdout, /1\/1 proyectos actualizados/)
      assert.equal(JSON.parse(readFileSync(join(proj, '.ancletorc'), 'utf8')).version, PKG.version)
    })
  })

  it('list --update es equivalente a projects update', () => {
    withDir((dir) => {
      makeOutdated(dir, 'alpha')
      const r = run(['projects', 'list', '--update', '--all'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.match(r.stdout, /proyectos actualizados/)
    })
  })
})

describe('CLI discovery --help y --check config', () => {
  it('discovery --help muestra ayuda y NO genera pack', () => {
    withDir((dir) => {
      run(['init', '--agent', 'opencode'], dir)
      const r = run(['discovery', '--help'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /ancleto discovery/)
      assert.match(r.stdout, /--check/)
      assert.match(r.stdout, /El seed en si lo genera la skill/)
      assert.doesNotMatch(r.stdout, /pack generado/)
    })
  })

  it('discovery --check devuelve config (outputDir, exclude, tier)', () => {
    withDir((dir) => {
      run(['init', '--agent', 'opencode'], dir)
      const r = run(['discovery', '--check'], dir)
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.schemaVersion, 2)
      assert.ok(j.state)
      assert.equal(j.config.outputDir, 'docs/technical-discovery')
      assert.deepEqual(j.config.exclude, [])
      assert.ok('tier' in j.config)
    })
  })

  it('--check respeta outputDir de .ancletorc', () => {
    withDir((dir) => {
      run(['init', '--agent', 'opencode'], dir)
      const rcPath = join(dir, '.ancletorc')
      const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
      rc.discovery = { outputDir: 'docs/seed-custom', exclude: ['tmp/**'] }
      writeFileSync(rcPath, JSON.stringify(rc, null, 2))
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.config.outputDir, 'docs/seed-custom')
      assert.deepEqual(j.config.exclude, ['tmp/**'])
    })
  })
})

describe('CLI update scoped por cwd (regresion)', () => {
  const regEnv = (dir) => ({ ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') })

  it('update parado en un proyecto con .ancletorc lo actualiza y registra (no global)', () => {
    withDir((dir) => {
      const proj = join(dir, 'proj')
      mkdirSync(proj, { recursive: true })
      run(['init', '--agent', 'opencode'], proj, regEnv(dir))
      const before = readRc(proj).version
      const r = run(['update', '--no-mcp'], proj, regEnv(dir))
      assert.equal(r.status, 0)
      assert.match(r.stdout, /instalado en .*proj/)
      assert.doesNotMatch(r.stdout, /disponible en todos tus proyectos/)
      assert.equal(readRc(proj).version, PKG.version)
      assert.notEqual(readRc(proj).version, undefined)
      const reg = JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8'))
      assert.equal(Object.keys(reg.projects).length, 1)
      assert.equal(Object.values(reg.projects)[0].path.endsWith('/proj'), true)
      void before
    })
  })

  it('update fuera de un proyecto sigue siendo global', () => {
    withDir((dir) => {
      const empty = join(dir, 'empty')
      mkdirSync(empty, { recursive: true })
      const r = run(['update', '--no-mcp'], empty, { ...regEnv(dir), XDG_CONFIG_HOME: join(dir, 'xdg') })
      assert.equal(r.status, 0)
      assert.match(r.stdout, /disponible en todos tus proyectos/)
      assert.equal(existsSync(join(dir, 'registry.json')), false, 'no registra nada')
    })
  })

  it('--global fuerza alcance global aunque haya .ancletorc', () => {
    withDir((dir) => {
      const proj = join(dir, 'proj')
      mkdirSync(proj, { recursive: true })
      run(['init', '--agent', 'opencode'], proj, regEnv(dir))
      const r = run(['update', '--no-mcp', '--global'], proj, { ...regEnv(dir), XDG_CONFIG_HOME: join(dir, 'xdg') })
      assert.equal(r.status, 0)
      assert.match(r.stdout, /disponible en todos tus proyectos/)
    })
  })
})

describe('CLI idioma de artifacts (--lang)', () => {
  it('--lang invalido falla claro', () => {
    withDir((dir) => {
      const r = run(['install', '--lang', 'de'], dir)
      assert.equal(r.status, 1)
      assert.match(r.stderr, /idioma invalido/)
    })
  })

  it('init --lang es persiste language en .ancletorc', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'opencode', '--lang', 'es'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).language, 'es')
      assert.match(r.stdout, /Idioma: es/)
    })
  })

  it('init sin --lang ni TTY usa auto', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'opencode'], dir)
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).language, 'auto')
    })
  })

  it('install --project --lang respeta el codigo y no pregunta si ya existe', () => {
    withDir((dir) => {
      const proj = join(dir, 'proj')
      mkdirSync(proj, { recursive: true })
      run(['install', '--project', proj, '--no-mcp', '--lang', 'pt'], dir)
      assert.equal(readRc(proj).language, 'pt')
      run(['install', '--project', proj, '--no-mcp'], dir)
      assert.equal(readRc(proj).language, 'pt')
    })
  })
})

describe('CLI discovery --check impact (minor vs material)', () => {
  const DOCS = ['index.md', 'overview.md', 'setup.md', 'inventory.md', 'integrations.md', 'decisions.md', 'unknowns.md', 'units/_map.md']

  function seedFixture(dir, files, { withHashes = true, hash = null, seedMap = null } = {}) {
    const docsDir = join(dir, 'docs', 'technical-discovery')
    mkdirSync(join(docsDir, 'units'), { recursive: true })
    for (const d of DOCS) writeFileSync(join(docsDir, d), '# doc\n')
    writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, discovery: { outputDir: 'docs/technical-discovery', exclude: [] } }, null, 2))
    for (const [rel, content] of Object.entries(files)) {
      const p = join(dir, rel)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, content)
    }
    const sources = ['.ancletorc', ...Object.keys(files)].sort()
    const h = createHash('sha256')
    const fileHashes = {}
    for (const rel of sources) {
      const content = readFileSync(join(dir, rel))
      fileHashes[rel] = createHash('sha256').update(content).digest('hex').slice(0, 16)
      h.update(rel)
      h.update('\0')
      h.update(String(content.length))
      h.update('\0')
      h.update(content)
      h.update('\n')
    }
    const state = {
      version: 1,
      generatedAt: new Date().toISOString(),
      sources,
      hash: hash || h.digest('hex'),
      packTokens: 1
    }
    if (withHashes) state.fileHashes = fileHashes
    writeFileSync(join(docsDir, '.discovery-state.json'), JSON.stringify(state, null, 2))
    if (seedMap) writeFileSync(join(docsDir, 'seed-map.json'), typeof seedMap === 'string' ? seedMap : JSON.stringify(seedMap, null, 2))
    return docsDir
  }

  const BASE = { 'src/app.js': 'console.log(1)\n', 'package.json': '{"name":"x"}\n' }

  it('sin cambios: READY, impact none', () => {
    withDir((dir) => {
      seedFixture(dir, BASE)
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.state, 'READY')
      assert.equal(j.impact, 'none')
      assert.equal(j.recommendedAction, 'continue')
    })
  })

  it('cambio de contenido en src: STALE minor, no ofrece regenerar', () => {
    withDir((dir) => {
      seedFixture(dir, BASE)
      writeFileSync(join(dir, 'src', 'app.js'), 'console.log(2)\n')
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.state, 'STALE')
      assert.equal(j.impact, 'minor')
      assert.deepEqual(j.changedAreas, ['src'])
      assert.equal(j.recommendedAction, 'continue')
    })
  })

  it('package.json modificado: STALE material', () => {
    withDir((dir) => {
      seedFixture(dir, BASE)
      writeFileSync(join(dir, 'package.json'), '{"name":"x","version":"1.0.0"}\n')
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.impact, 'material')
      assert.equal(j.recommendedAction, 'regenerate')
      assert.ok(j.materialReasons.some((m) => m.includes('package.json')))
    })
  })

  it('directorio raiz nuevo: STALE material', () => {
    withDir((dir) => {
      seedFixture(dir, BASE)
      mkdirSync(join(dir, 'tools'), { recursive: true })
      writeFileSync(join(dir, 'tools', 'x.js'), 'x\n')
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.impact, 'material')
      assert.ok(j.materialReasons.some((m) => m.includes('area raiz nueva: tools')))
    })
  })

  it('archivo nuevo dentro de un area existente: minor', () => {
    withDir((dir) => {
      seedFixture(dir, BASE)
      writeFileSync(join(dir, 'src', 'util.js'), 'x\n')
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.impact, 'minor')
      assert.deepEqual(j.changedAreas, ['src'])
    })
  })

  it('estado viejo sin fileHashes: minor con nota, no material', () => {
    withDir((dir) => {
      seedFixture(dir, BASE, { withHashes: false, hash: 'deadbeef' })
      writeFileSync(join(dir, 'src', 'app.js'), 'console.log(3)\n')
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.impact, 'minor')
      assert.equal(j.recommendedAction, 'continue')
      assert.ok(j.notes.some((n) => n.includes('sin hashes por archivo')))
    })
  })

  it('con seed-map: affectedDocs cruza areas cambiadas con documentos', () => {
    withDir((dir) => {
      seedFixture(dir, BASE, {
        seedMap: { version: 1, generatedAt: 'x', docs: { 'overview.md': ['src', 'package.json'], 'units/palette.md': ['src'], 'setup.md': ['package.json'] } }
      })
      writeFileSync(join(dir, 'src', 'app.js'), 'console.log(2)\n')
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.impact, 'minor')
      assert.equal(j.seedMapPresent, true)
      assert.deepEqual(j.affectedDocs, ['overview.md', 'units/palette.md'])
      assert.equal(j.recommendedAction, 'continue')
    })
  })

  it('sin seed-map: affectedDocs vacio', () => {
    withDir((dir) => {
      seedFixture(dir, BASE)
      writeFileSync(join(dir, 'src', 'app.js'), 'console.log(2)\n')
      const r = run(['discovery', '--check'], dir)
      const j = JSON.parse(r.stdout)
      assert.equal(j.seedMapPresent, false)
      assert.deepEqual(j.affectedDocs, [])
    })
  })

  it('seed-map malformado: se ignora sin romper el check', () => {
    withDir((dir) => {
      seedFixture(dir, BASE, { seedMap: 'esto no es json{' })
      writeFileSync(join(dir, 'src', 'app.js'), 'console.log(2)\n')
      const r = run(['discovery', '--check'], dir)
      assert.equal(r.status, 0)
      const j = JSON.parse(r.stdout)
      assert.equal(j.seedMapPresent, false)
      assert.deepEqual(j.affectedDocs, [])
    })
  })
})

describe('CLI exclusiones del discovery (--exclude)', () => {
  const regEnv = (dir) => ({ ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') })

  it('init --exclude persiste los globs en .ancletorc', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'opencode', '--exclude', '**/*.png,docs'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.deepEqual(readRc(dir).discovery.exclude, ['**/*.png', 'docs'])
      assert.equal(readRc(dir).discovery.outputDir, 'docs/technical-discovery')
    })
  })

  it('install --project --exclude persiste sin pisar outputDir', () => {
    withDir((dir) => {
      const proj = join(dir, 'proj')
      mkdirSync(proj, { recursive: true })
      run(['init', '--agent', 'opencode'], proj, regEnv(dir))
      const r = run(['install', '--project', proj, '--no-mcp', '--exclude', 'yarn.lock'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const d = readRc(proj).discovery
      assert.deepEqual(d.exclude, ['yarn.lock'])
      assert.equal(d.outputDir, 'docs/technical-discovery')
    })
  })

  it('sin --exclude conserva el exclude existente', () => {
    withDir((dir) => {
      const proj = join(dir, 'proj')
      mkdirSync(proj, { recursive: true })
      run(['init', '--agent', 'opencode', '--exclude', 'docs'], proj, regEnv(dir))
      run(['install', '--project', proj, '--no-mcp'], dir, regEnv(dir))
      assert.deepEqual(readRc(proj).discovery.exclude, ['docs'])
    })
  })

  it('exclude vacio explicito limpia la lista', () => {
    withDir((dir) => {
      run(['init', '--agent', 'opencode', '--exclude', 'docs'], dir, regEnv(dir))
      run(['init', '--agent', 'opencode', '--exclude', ''], dir, regEnv(dir))
      assert.deepEqual(readRc(dir).discovery.exclude, [])
    })
  })
})

describe('CLI commandcode support (add-commandcode-support)', () => {
  const regEnv = (dir) => ({ ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') })

  it('init --agent commandcode rutea skills/agents/commands a .commandcode/*', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'commandcode', '--no-mcp'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, '.commandcode', 'skills', 'triage-clarifier', 'SKILL.md')))
      assert.ok(existsSync(join(dir, '.commandcode', 'agents', 'orchestrator.md')))
      assert.ok(existsSync(join(dir, '.commandcode', 'commands', 'cleto-new.md')))
      const rc = readRc(dir)
      assert.deepEqual(rc.installedPaths.skills, ['.commandcode/skills'])
      assert.deepEqual(rc.installedPaths.agents, ['.commandcode/agents'])
      assert.deepEqual(rc.installedPaths.commands, ['.commandcode/commands'])
    })
  })

  it('commandcode se preserva en un install posterior sin --agent', () => {
    withDir((dir) => {
      run(['init', '--agent', 'commandcode', '--no-mcp'], dir, regEnv(dir))
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.equal(readRc(dir).agent, 'commandcode')
    })
  })

  it('adaptador commandcode: sin claves opencode, model ausente y tools mapeado', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'commandcode'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const out = readFileSync(join(dir, '.commandcode', 'agents', 'coder.md'), 'utf8')
      assert.match(out, /^name: coder$/m)
      assert.match(out, /^description: Implements approved changes from aspec artifacts or orchestrator instructions$/m)
      assert.match(out, /^tools: \[read_file, write_file, edit_file, shell_command\]$/m)
      assert.doesNotMatch(out, /^mode:/m)
      assert.doesNotMatch(out, /^color:/m)
      assert.doesNotMatch(out, /^temperature:/m)
      assert.doesNotMatch(out, /^permission:/m)
      assert.doesNotMatch(out, /^model:/m)
      assert.doesNotMatch(out, /opencode-go/)
      // task: false no amplía capacidades ni genera aviso.
      assert.doesNotMatch(r.stderr, /skip tool 'task': no verified Command Code id for agent 'coder'/)
    })
  })

  it('memory-keeper: tools MCP de Command Code y sin aviso para write/edit false', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'commandcode'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const mk = readFileSync(join(dir, '.commandcode', 'agents', 'memory-keeper.md'), 'utf8')
      assert.match(mk, /^tools: \[read_file, grep, mcp__ancleto-memory__searchMemory, mcp__ancleto-memory__recordRule, mcp__ancleto-memory__recordDecision\]$/m)
      assert.doesNotMatch(r.stderr, /skip tool '(write|edit)': no verified Command Code id for agent 'memory-keeper'/)
    })
  })

  it('skill: true y task: true se omiten con aviso y el orchestrator lleva la nota de modelo', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'commandcode'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const orch = readFileSync(join(dir, '.commandcode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orch, /^tools: \[read_file\]$/m)
      assert.match(orch, /Nota de modelo \(solo Command Code\)/)
      assert.match(r.stderr, /skip tool 'skill': no verified Command Code id for agent 'orchestrator'/)
      assert.match(r.stderr, /skip tool 'task': no verified Command Code id for agent 'orchestrator'/)
    })
  })

  it('init commandcode crea .mcp.json con ancleto-memory (transport stdio, sin type/enabled)', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'commandcode', '--tier', 'minimo'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
      const mem = cfg.mcpServers['ancleto-memory']
      assert.ok(mem, 'ancleto-memory presente')
      assert.equal(mem.transport, 'stdio')
      assert.equal(mem.command, process.execPath)
      assert.deepEqual(mem.args.slice(-1), ['mcp'])
      assert.equal('type' in mem, false)
      assert.equal('enabled' in mem, false)
    })
  })

  it('el merge de .mcp.json preserva homonimos y claves preexistentes', () => {
    withDir((dir) => {
      const prev = {
        mcpServers: {
          propio: { transport: 'stdio', command: 'propio-cmd', args: ['--x'] },
          'ancleto-memory': { transport: 'stdio', command: 'memoria-propia', args: ['--keep'] }
        },
        customTop: 1
      }
      writeFileSync(join(dir, '.mcp.json'), JSON.stringify(prev, null, 2) + '\n')
      const r = run(['init', '--agent', 'commandcode', '--tier', 'minimo'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
      assert.deepEqual(cfg.mcpServers.propio, { transport: 'stdio', command: 'propio-cmd', args: ['--x'] })
      assert.deepEqual(cfg.mcpServers['ancleto-memory'], { transport: 'stdio', command: 'memoria-propia', args: ['--keep'] })
      assert.equal(cfg.customTop, 1)
    })
  })

  it('un .mcp.json invalido se avisa y no se sobrescribe', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.mcp.json'), '{ no es json')
      const r = run(['init', '--agent', 'commandcode', '--tier', 'minimo'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.match(r.stderr, /no se pudo leer \.mcp\.json como JSON/)
      assert.equal(readFileSync(join(dir, '.mcp.json'), 'utf8'), '{ no es json')
    })
  })

  it('--no-mcp omite .mcp.json sin afectar el resto de los assets', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'commandcode', '--no-mcp'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.mcp.json')), false)
      assert.ok(existsSync(join(dir, '.commandcode', 'agents', 'coder.md')))
      assert.ok(existsSync(join(dir, '.commandcode', 'commands', 'cleto-new.md')))
      assert.ok(existsSync(join(dir, '.commandcode', 'skills', 'triage-clarifier', 'SKILL.md')))
    })
  })

  it('upgrade regenera una entrada rota de .mcp.json (self-heal)', () => {
    withDir((dir) => {
      run(['init', '--agent', 'commandcode', '--tier', 'minimo'], dir, regEnv(dir))
      const file = join(dir, '.mcp.json')
      const cfg = JSON.parse(readFileSync(file, 'utf8'))
      cfg.mcpServers['ancleto-memory'] = { transport: 'stdio', command: '/no/existe/ancleto', args: [] }
      writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n')
      const r = run(['upgrade', '--agent', 'commandcode'], dir, regEnv(dir))
      assert.equal(r.status, 0)
      const healed = JSON.parse(readFileSync(file, 'utf8'))
      assert.equal(healed.mcpServers['ancleto-memory'].command, process.execPath)
    })
  })

  it('check valida el layout commandcode sin faltantes ni divergencias de frontmatter', () => {
    withDir((dir) => {
      run(['init', '--agent', 'commandcode', '--tier', 'minimo'], dir, regEnv(dir))
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /0 faltantes/)
      assert.match(r.stdout, /0 huerfanos/)
      assert.match(r.stdout, /✔ \.commandcode\/agents/)
      assert.match(r.stdout, /✔ \.commandcode\/skills/)
      assert.doesNotMatch(r.stdout, /frontmatter diverge/)
      assert.doesNotMatch(r.stdout, /tier .* sin agentes locales/)
    })
  })
})

describe('CLI machine environment (machine-environment-block)', () => {
  const GIT_PROBE = spawnSync('git', ['--version'], { encoding: 'utf8' })
  const GIT_READY = !GIT_PROBE.error && GIT_PROBE.status === 0
  const PATH_KEY = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH'
  const regEnv = (dir) => ({ ANCLETO_PROJECTS_FILE: join(dir, 'registry.json') })
  const artifactPath = (dir) => join(dir, '.ancleto', 'machine-env.md')
  const readArtifact = (dir) => readFileSync(artifactPath(dir), 'utf8')
  const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' })

  function excludePath(dir) {
    const raw = git(['rev-parse', '--git-path', 'info/exclude'], dir).stdout.trim()
    return isAbsolute(raw) ? raw : join(dir, raw)
  }

  function readExclude(dir) {
    const file = excludePath(dir)
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  }

  function skipWithoutGit(t) {
    if (GIT_READY) return false
    t.skip('git no disponible')
    return true
  }

  // Herramienta invocable de verdad: en POSIX un script con shebang y en Windows un
  // ejecutable nativo (enlace duro al binario de node, con copia como fallback).
  function writeInvokableTool(dir, name) {
    const file = join(dir, process.platform === 'win32' ? `${name}.exe` : name)
    if (process.platform === 'win32') {
      try {
        linkSync(process.execPath, file)
      } catch {
        copyFileSync(process.execPath, file)
      }
    } else {
      writeFileSync(file, '#!/bin/sh\nexit 0\n')
      chmodSync(file, 0o755)
    }
    return file
  }

  it('init sin git crea el artefacto, advierte y no escribe .gitignore', () => {
    withDir((dir) => {
      const r = run(['init', '--tier', 'gratis', '--no-mcp'], dir, regEnv(dir))
      assert.equal(r.status, 0, r.stderr)

      const artifact = artifactPath(dir)
      assert.ok(existsSync(artifact), 'el artefacto existe')
      const content = readFileSync(artifact, 'utf8')
      for (const section of ['## Platform', '## Shell', '## Line endings', '## Tools', '## Hint']) {
        assert.ok(content.includes(section), `falta la seccion ${section}`)
      }
      assert.match(content, /^- rg: /m)

      assert.match(r.stderr, /no se pudo garantizar la exclusion de \.ancleto\/machine-env\.md/)
      assert.equal(existsSync(join(dir, '.gitignore')), false, 'no se crea .gitignore')
    })
  })

  it('en un repo git que no ignora .ancleto/ usa la exclusion local sin tocar .gitignore', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      const gitignore = join(dir, '.gitignore')
      writeFileSync(gitignore, '# proyecto\nnode_modules/\n')
      const ignoreBefore = readFileSync(gitignore, 'utf8')
      const excludeBefore = readExclude(dir)

      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(r.status, 0, r.stderr)

      assert.ok(existsSync(artifactPath(dir)), 'el artefacto existe')
      assert.equal(git(['check-ignore', '-q', '--', '.ancleto/machine-env.md'], dir).status, 0, 'git lo ignora')
      assert.equal(readFileSync(gitignore, 'utf8'), ignoreBefore, '.gitignore byte a byte sin cambios')
      assert.equal(git(['ls-files'], dir).stdout.includes('.ancleto/machine-env.md'), false, 'no queda trackeado')

      const excludeAfter = readExclude(dir)
      assert.ok(excludeAfter.startsWith(excludeBefore), 'preserva el contenido previo de info/exclude')
      assert.equal(
        excludeAfter.split(/\r?\n/).filter((line) => line.trim() === '.ancleto/machine-env.md').length,
        1
      )
    })
  })

  it('en un repo que ya ignora .ancleto/ no modifica ninguna regla', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      const gitignore = join(dir, '.gitignore')
      writeFileSync(gitignore, '.ancleto/\n')
      const ignoreBefore = readFileSync(gitignore, 'utf8')
      const excludeBefore = readExclude(dir)

      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(r.status, 0, r.stderr)

      assert.ok(existsSync(artifactPath(dir)), 'el artefacto existe')
      assert.equal(git(['check-ignore', '-q', '--', '.ancleto/machine-env.md'], dir).status, 0)
      assert.equal(readFileSync(gitignore, 'utf8'), ignoreBefore, '.gitignore intacto')
      assert.equal(readExclude(dir), excludeBefore, 'info/exclude intacto')
    })
  })

  it('install --project <subdir> escribe el patron repo-root-relative y git add -A no incorpora el artefacto', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      const repo = join(dir, 'repo')
      const app = join(repo, 'packages', 'app')
      mkdirSync(app, { recursive: true })
      assert.equal(git(['init', '-q'], repo).status, 0)
      const gitignore = join(repo, '.gitignore')
      writeFileSync(gitignore, 'node_modules/\n')
      const ignoreBefore = readFileSync(gitignore, 'utf8')
      const pattern = 'packages/app/.ancleto/machine-env.md'

      const r = run(['install', '--project', 'packages/app', '--no-mcp', '--tier', 'gratis'], repo, regEnv(repo))
      assert.equal(r.status, 0, r.stderr)

      assert.ok(existsSync(join(app, '.ancleto', 'machine-env.md')), 'el artefacto existe en el subdir')
      assert.ok(
        readExclude(repo).split(/\r?\n/).includes(pattern),
        'info/exclude contiene el patron repo-root-relative exacto'
      )
      assert.equal(git(['check-ignore', '--no-index', '-q', '--', pattern], repo).status, 0, 'check-ignore desde la raiz')
      assert.equal(readFileSync(gitignore, 'utf8'), ignoreBefore, '.gitignore byte a byte sin cambios')

      assert.equal(git(['add', '-A'], repo).status, 0)
      assert.equal(git(['ls-files'], repo).stdout.includes(pattern), false, 'git add -A no incorpora el artefacto')
      assert.equal(git(['status', '--porcelain'], repo).stdout.includes('machine-env.md'), false, 'no queda como cambio')
    })
  })

  it('install --project <symlink a subdir>: usa el prefijo fisico, sin .. ni patron absoluto', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      const repo = join(dir, 'repo')
      const app = join(repo, 'packages', 'app')
      mkdirSync(app, { recursive: true })
      assert.equal(git(['init', '-q'], repo).status, 0)
      const gitignore = join(repo, '.gitignore')
      writeFileSync(gitignore, 'node_modules/\n')
      const ignoreBefore = readFileSync(gitignore, 'utf8')

      // El symlink vive fuera del repo: es el layout donde `path.relative(repoRoot, artifactPath)`
      // (implementacion anterior) producia `..\link\...` y por eso el patron lexical quedaba fuera
      // de la raiz. Dentro del repo, Windows trata el junction como directorio y `git add -A`
      // recorreria el alias duplicando el contenido.
      const link = join(dir, 'link')
      let mode = 'dir'
      try {
        symlinkSync(app, link, mode)
      } catch {
        try {
          mode = 'junction'
          symlinkSync(app, link, mode)
        } catch (error) {
          t.skip(`el host no permite crear symlinks de directorio: ${error.code}`)
          return
        }
      }
      assert.equal(
        git(['-C', link, 'rev-parse', '--show-prefix'], dir).stdout.trim(),
        'packages/app/',
        `git resuelve el destino fisico del symlink (${mode})`
      )

      const pattern = 'packages/app/.ancleto/machine-env.md'
      const first = run(['install', '--project', link, '--no-mcp', '--tier', 'gratis'], repo, regEnv(repo))
      assert.equal(first.status, 0, first.stderr)

      assert.ok(existsSync(join(app, '.ancleto', 'machine-env.md')), 'el artefacto queda en el destino fisico')
      assert.match(readArtifact(app), /^# Machine Environment$/m)
      assert.doesNotMatch(first.stdout + first.stderr, /fuera del repositorio/)

      const machineLines = readExclude(repo).split(/\r?\n/).filter((line) => line.includes('machine-env.md'))
      assert.deepEqual(machineLines, [pattern], 'info/exclude contiene solo el patron repo-root-relative')
      assert.equal(readFileSync(gitignore, 'utf8'), ignoreBefore, '.gitignore byte a byte sin cambios')
      assert.equal(git(['check-ignore', '--no-index', '-q', '--', pattern], repo).status, 0, 'check-ignore desde la raiz')

      assert.equal(git(['add', '-A'], repo).status, 0)
      assert.equal(
        git(['ls-files'], repo).stdout.split(/\r?\n/).some((line) => line.endsWith('.ancleto/machine-env.md')),
        false,
        'git add -A no incorpora el artefacto'
      )

      const excludeBefore = readExclude(repo)
      const second = run(['install', '--project', link, '--no-mcp', '--tier', 'gratis'], repo, regEnv(repo))
      assert.equal(second.status, 0, second.stderr)
      assert.equal(readExclude(repo), excludeBefore, 'segunda corrida: append idempotente')
      assert.equal(
        readExclude(repo).split(/\r?\n/).filter((line) => line.trim() === pattern).length,
        1,
        'una sola linea del patron tras dos corridas'
      )
    })
  })

  it('install --project <dir con espacio inicial>: el patron conserva el espacio y no hay actualizacion falsa', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      const repo = join(dir, 'repo')
      // El espacio va en el primer componente del prefijo: `trim()` lo eliminaba y el
      // patron escrito dejaba de cubrir el artefacto real.
      const app = join(repo, ' app')
      mkdirSync(app, { recursive: true })
      assert.equal(git(['init', '-q'], repo).status, 0)
      const gitignore = join(repo, '.gitignore')
      writeFileSync(gitignore, 'node_modules/\n')
      const ignoreBefore = readFileSync(gitignore, 'utf8')

      assert.equal(
        git(['rev-parse', '--show-prefix'], app).stdout.replace(/\r?\n$/, ''),
        ' app/',
        'git conserva el espacio inicial en --show-prefix'
      )
      const pattern = ' app/.ancleto/machine-env.md'

      const first = run(['install', '--project', ' app', '--no-mcp', '--tier', 'gratis'], repo, regEnv(repo))
      assert.equal(first.status, 0, first.stderr)
      assert.ok(existsSync(join(app, '.ancleto', 'machine-env.md')), 'el artefacto existe en el dir con espacio')

      assert.deepEqual(
        readExclude(repo).split(/\r?\n/).filter((line) => line.includes('machine-env.md')),
        [pattern],
        'info/exclude contiene el patron exacto con el espacio inicial'
      )
      assert.equal(readFileSync(gitignore, 'utf8'), ignoreBefore, '.gitignore byte a byte sin cambios')
      assert.equal(git(['check-ignore', '--no-index', '-q', '--', pattern], repo).status, 0, 'check-ignore desde la raiz')

      assert.equal(git(['add', '-A'], repo).status, 0)
      assert.equal(
        git(['ls-files'], repo).stdout.split(/\r?\n/).includes(pattern),
        false,
        'git add -A no incorpora el artefacto'
      )

      const upgraded = run(['upgrade'], app, regEnv(repo))
      assert.equal(upgraded.status, 0, upgraded.stderr)
      assert.doesNotMatch(upgraded.stdout, /exclusión local actualizada/)
      assert.match(upgraded.stdout, /exclusión local verificada/)
      assert.equal(
        readExclude(repo).split(/\r?\n/).filter((line) => line.includes('machine-env.md')).length,
        1,
        'una sola entrada tras la segunda corrida'
      )
    })
  })

  it('project root con salto de linea en el nombre: advierte y no escribe regla', (t) => {
    if (skipWithoutGit(t)) return
    if (process.platform === 'win32') {
      t.skip('win32 no permite "\\n" en un nombre de directorio: gap declarado en tasks.md 12.6')
      return
    }
    withDir((dir) => {
      const repo = join(dir, 'repo')
      mkdirSync(repo, { recursive: true })
      assert.equal(git(['init', '-q'], repo).status, 0)
      const app = join(repo, 'a\nb')
      mkdirSync(app, { recursive: true })
      const excludeBefore = readExclude(repo)

      const r = run(['install', '--project', 'a\nb', '--no-mcp', '--tier', 'gratis'], repo, regEnv(repo))
      assert.equal(r.status, 0, r.stderr)
      assert.ok(existsSync(join(app, '.ancleto', 'machine-env.md')), 'el artefacto se genera igual')
      assert.match(r.stderr, /prefijo con caracteres de control/)
      assert.equal(readExclude(repo), excludeBefore, 'no se escribe ninguna regla de exclusion')
    })
  })

  it('project root fuera de cualquier repo: advierte y no escribe exclusiones', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      const first = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(first.status, 0, first.stderr)
      assert.match(
        first.stderr,
        /no se pudo garantizar la exclusion de \.ancleto\/machine-env\.md: el directorio no es un repositorio git/
      )
      const artifact = readArtifact(dir)

      const second = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(second.status, 0, second.stderr)

      assert.equal(readArtifact(dir), artifact, 'el artefacto se conserva')
      assert.equal(existsSync(join(dir, '.git')), false, 'la guarda no crea metadatos de git')
      assert.doesNotMatch(first.stdout + first.stderr + second.stdout + second.stderr, /fuera del repositorio/)
    })
  })

  it('artefacto trackeado con git add -f y regla existente: no toca la exclusion y check advierte', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      const gitignore = join(dir, '.gitignore')
      writeFileSync(gitignore, '.ancleto/\n')
      const ignoreBefore = readFileSync(gitignore, 'utf8')

      const installed = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(installed.status, 0, installed.stderr)

      const excludeBefore = readExclude(dir)
      assert.equal(
        excludeBefore.split(/\r?\n/).filter((line) => line.trim() === '.ancleto/machine-env.md').length,
        0,
        'no escribe la exclusion local: la regla existente ya cubre el path'
      )
      assert.equal(readFileSync(gitignore, 'utf8'), ignoreBefore, '.gitignore intacto')
      assert.equal(git(['add', '-f', '--', '.ancleto/machine-env.md'], dir).status, 0)
      assert.equal(git(['check-ignore', '--no-index', '-q', '--', '.ancleto/machine-env.md'], dir).status, 0)

      const upgraded = run(['upgrade'], dir, regEnv(dir))
      assert.equal(upgraded.status, 0, upgraded.stderr)
      assert.equal(readExclude(dir), excludeBefore, 'el ciclo no agrega ni actualiza la exclusion')
      assert.match(upgraded.stdout, /exclusión local verificada/)

      const checked = run(['check'], dir, regEnv(dir))
      assert.equal(checked.status, 0, 'el warning no cambia el exit code')
      assert.match(checked.stdout, /⚠ \.ancleto\/machine-env\.md \(trackeado en git/)
    })
  })

  it('upgrade distingue la exclusion local actualizada de la ya verificada', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      writeFileSync(join(dir, '.gitignore'), 'node_modules/\n')
      const installed = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(installed.status, 0, installed.stderr)

      const exclude = excludePath(dir)
      const remaining = readExclude(dir)
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '.ancleto/machine-env.md')
      writeFileSync(exclude, remaining.join('\n'))
      assert.equal(
        git(['check-ignore', '-q', '--', '.ancleto/machine-env.md'], dir).status,
        1,
        'sin la linea, git no ignora el artefacto'
      )

      const added = run(['upgrade'], dir, regEnv(dir))
      assert.equal(added.status, 0, added.stderr)
      assert.match(added.stdout, /exclusión local actualizada/)

      const verified = run(['upgrade'], dir, regEnv(dir))
      assert.equal(verified.status, 0, verified.stderr)
      assert.match(verified.stdout, /exclusión local verificada/)
    })
  })

  it('dos corridas seguidas no reescriben el artefacto ni duplican la exclusion', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      writeFileSync(join(dir, '.gitignore'), 'node_modules/\n')

      const first = run(['init', '--tier', 'gratis', '--no-mcp'], dir, regEnv(dir))
      assert.equal(first.status, 0, first.stderr)

      const artifact = artifactPath(dir)
      const contentBefore = readFileSync(artifact, 'utf8')
      const excludeBefore = readExclude(dir)
      const old = new Date('2020-01-01T00:00:00.000Z')
      utimesSync(artifact, old, old)

      const second = run(['init', '--tier', 'gratis', '--no-mcp'], dir, regEnv(dir))
      assert.equal(second.status, 0, second.stderr)

      assert.equal(readFileSync(artifact, 'utf8'), contentBefore, 'contenido identico')
      assert.equal(new Date(statSync(artifact).mtimeMs).getUTCFullYear(), 2020, 'no se reescribio')
      assert.equal(readExclude(dir), excludeBefore, 'exclusion idempotente')
      assert.equal(
        readExclude(dir).split(/\r?\n/).filter((line) => line.trim() === '.ancleto/machine-env.md').length,
        1
      )
    })
  })

  it('worktree vinculado: escribe la exclusion en la ruta de rev-parse --git-path info/exclude', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      const repo = join(dir, 'repo')
      const worktree = join(dir, 'worktree')
      mkdirSync(repo)
      assert.equal(git(['init', '-q'], repo).status, 0)
      assert.equal(git(['-c', 'user.email=tester@example.com', '-c', 'user.name=Tester', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-q', '-m', 'init'], repo).status, 0)
      const added = git(['worktree', 'add', '-q', worktree, '-b', 'machine-env-wt'], repo)
      assert.equal(added.status, 0, added.stderr)

      const r = run(['install', '--project', worktree, '--no-mcp', '--tier', 'gratis'], worktree, regEnv(worktree))
      assert.equal(r.status, 0, r.stderr)

      assert.ok(existsSync(artifactPath(worktree)), 'el artefacto existe en el worktree')
      assert.equal(git(['check-ignore', '-q', '--', '.ancleto/machine-env.md'], worktree).status, 0, 'check-ignore OK en el worktree')

      const exclude = excludePath(worktree)
      assert.ok(existsSync(exclude), 'existe la ruta resuelta de info/exclude')
      assert.ok(
        readFileSync(exclude, 'utf8').split(/\r?\n/).includes('.ancleto/machine-env.md'),
        'la linea exacta esta en la ruta resuelta'
      )
      assert.equal(git(['ls-files'], worktree).stdout.includes('.ancleto/machine-env.md'), false, 'no queda trackeado')
    })
  })

  it('PATH sin git: advierte y conserva el artefacto', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      const installed = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(installed.status, 0, installed.stderr)
      assert.ok(existsSync(artifactPath(dir)))

      const binDir = join(dir, 'sin-git-bin')
      mkdirSync(binDir)
      const r = run(['upgrade'], dir, { ...regEnv(dir), [PATH_KEY]: binDir })
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stderr, /no se pudo garantizar la exclusion de \.ancleto\/machine-env\.md/)

      assert.ok(existsSync(artifactPath(dir)), 'el artefacto se conserva')
      assert.match(readArtifact(dir), /^- git: no disponible — fallback: ninguno \(reportar\)$/m)
    })
  })

  it('check advierte si el artefacto esta trackeado sin cambiar el exit code', (t) => {
    if (skipWithoutGit(t)) return
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      const installed = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(installed.status, 0, installed.stderr)
      assert.equal(git(['add', '-f', '--', '.ancleto/machine-env.md'], dir).status, 0)

      const r = run(['check'], dir, regEnv(dir))
      assert.equal(r.status, 0, 'el warning no cambia el exit code')
      assert.match(r.stdout, /⚠ \.ancleto\/machine-env\.md \(trackeado en git/)
    })
  })

  it('un artefacto que es directorio produce un warning no bloqueante', () => {
    withDir((dir) => {
      mkdirSync(artifactPath(dir), { recursive: true })

      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, regEnv(dir))
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stderr, /no se pudo generar \.ancleto\/machine-env\.md/)
      assert.equal(statSync(artifactPath(dir)).isDirectory(), true, 'el directorio colisionante queda intacto')
    })
  })

  it('un rg invocable agregado al PATH pasa a disponible tras upgrade', () => {
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      const env = { ...regEnv(dir), [PATH_KEY]: binDir }

      const installed = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, env)
      assert.equal(installed.status, 0, installed.stderr)
      assert.match(readArtifact(dir), /^- rg: no disponible — fallback: /m)

      writeInvokableTool(binDir, 'rg')

      const upgraded = run(['upgrade'], dir, env)
      assert.equal(upgraded.status, 0, upgraded.stderr)
      assert.match(upgraded.stdout, /machine-env\.md generado/)
      assert.match(readArtifact(dir), /^- rg: disponible$/m)
    })
  })

  it('un rg que resuelve pero no se puede invocar no pasa a disponible y expone el fallo', () => {
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      const env = { ...regEnv(dir), [PATH_KEY]: binDir }

      const installed = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, env)
      assert.equal(installed.status, 0, installed.stderr)
      assert.match(readArtifact(dir), /^- rg: no disponible — fallback: /m)

      const rgFile = join(binDir, process.platform === 'win32' ? 'rg.exe' : 'rg')
      writeFileSync(rgFile, 'no es un ejecutable')
      if (process.platform !== 'win32') chmodSync(rgFile, 0o755)

      const upgraded = run(['upgrade'], dir, env)
      assert.equal(upgraded.status, 0, upgraded.stderr)
      const content = readArtifact(dir)
      assert.match(content, /^- rg: no disponible — fallback: .* — bloqueado: /m)
      assert.doesNotMatch(content, /^- rg: disponible$/m)
    })
  })

  it('sin senales de shell declara unknown y no filtra variables senuelo ni PATH', () => {
    withDir((dir) => {
      const pathSentinel = 'ancleto-path-sentinel-value'
      const binDir = join(dir, pathSentinel)
      mkdirSync(binDir)
      const decoys = {
        TOKEN: 'token-sentinel-value',
        GITHUB_TOKEN: 'ghp-sentinel-value',
        AWS_SECRET_ACCESS_KEY: 'aws-sentinel-value'
      }
      const env = {
        ...regEnv(dir),
        ...decoys,
        [PATH_KEY]: `${binDir}${delimiter}${process.env[PATH_KEY] || ''}`,
        PSModulePath: '',
        ComSpec: '',
        SHELL: '',
        PROMPT: '',
        MSYSTEM: '',
        CYGWIN: '',
        WSL_DISTRO_NAME: '',
        WSL_INTEROP: ''
      }

      const r = run(['init', '--tier', 'gratis', '--no-mcp'], dir, env)
      assert.equal(r.status, 0, r.stderr)

      const content = readArtifact(dir)
      assert.match(content, /^- shell: unknown$/m)
      assert.match(content, /^- shell_source: unknown$/m)
      for (const value of [pathSentinel, ...Object.values(decoys)]) {
        assert.ok(!content.includes(value), `el artefacto no debe incluir ${value}`)
      }
    })
  })
})

// memory-consolidacion-autonoma: subcomando `memory consolidate` (dry-run default,
// --json, --apply con refresco del working-context y flags incompatibles).
describe('CLI memory consolidate', () => {
  function states(dbPath) {
    const db = new DatabaseSync(dbPath)
    try {
      return db.prepare(`SELECT memory_key, status, superseded_by FROM memory_nodes ORDER BY memory_key`).all()
    } finally {
      db.close()
    }
  }

  function seedDuplicates(dir) {
    const dbPath = join(dir, '.ancleto', 'memory.db')
    const engine = createMemoryEngine(dbPath)
    engine.recordNode({ memory_key: 'cons-a', type: 'rule', scope: 'project', content: 'misma regla duplicada', createdAt: '2026-01-01T00:00:00.000Z' })
    engine.recordNode({ memory_key: 'cons-b', type: 'rule', scope: 'project', content: 'misma regla duplicada', createdAt: '2026-01-02T00:00:00.000Z' })
    engine.close()
    return dbPath
  }

  it('sin --apply es dry-run: no escribe la base ni el working-context y --json parsea', () => {
    withDir((dir) => {
      const dbPath = seedDuplicates(dir)
      const before = states(dbPath)
      const ctxPath = join(dir, '.ancleto', 'working-context.md')

      const r = run(['memory', 'consolidate', '--json'], dir)
      assert.equal(r.status, 0, r.stderr)
      const payload = JSON.parse(r.stdout)
      assert.equal(payload.dryRun, true)
      assert.equal(payload.exactGroups.length, 1)
      assert.equal(payload.exactGroups[0].canonical, 'cons-b')
      assert.deepEqual(payload.superseded, ['cons-a'])
      assert.deepEqual(states(dbPath), before)
      assert.equal(existsSync(ctxPath), false)
    })
  })

  it('--apply supersede los no canonicos y refresca el working-context bajo la DB', () => {
    withDir((dir) => {
      const dbPath = seedDuplicates(dir)
      const canonicalId = (() => {
        const db = new DatabaseSync(dbPath)
        try {
          return db.prepare(`SELECT id FROM memory_nodes WHERE memory_key = 'cons-b'`).get().id
        } finally {
          db.close()
        }
      })()

      const r = run(['memory', 'consolidate', '--apply', '--json'], dir)
      assert.equal(r.status, 0, r.stderr)
      const payload = JSON.parse(r.stdout)
      assert.equal(payload.dryRun, false)
      assert.deepEqual(payload.superseded, ['cons-a'])

      const rows = states(dbPath)
      const byKey = Object.fromEntries(rows.map((row) => [row.memory_key, row]))
      assert.equal(byKey['cons-b'].status, 'active')
      assert.equal(byKey['cons-a'].status, 'superseded')
      assert.equal(byKey['cons-a'].superseded_by, canonicalId)

      const ctxPath = join(dir, '.ancleto', 'working-context.md')
      assert.equal(existsSync(ctxPath), true)
      const ctx = readFileSync(ctxPath, 'utf8')
      assert.match(ctx, /\[cons-b\]/)
      assert.doesNotMatch(ctx, /\[cons-a\]/)
    })
  })

  it('--dry-run y --apply juntos es un error de uso y no escribe', () => {
    withDir((dir) => {
      const dbPath = seedDuplicates(dir)
      const before = states(dbPath)
      const r = run(['memory', 'consolidate', '--dry-run', '--apply'], dir)
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /uso: ancleto memory consolidate/)
      assert.deepEqual(states(dbPath), before)
    })
  })
})
