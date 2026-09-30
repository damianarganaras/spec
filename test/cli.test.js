import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync, cpSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { createMemoryEngine } from '../src/core/memory/engine.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CLI = join(TEST_DIR, '..', 'src', 'cli', 'index.js')
const PKG = JSON.parse(readFileSync(join(TEST_DIR, '..', 'package.json'), 'utf8'))

function run(args, cwd, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ANCLETO_MUSE_SPARK: '0', ...env }
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
      assert.match(coderSrc, /^model: opencode-go\//m)
      assert.match(coderSrc, /^tools:/m)

      const coderOut = readFileSync(join(dir, '.claude', 'agents', 'coder.md'), 'utf8')
      assert.doesNotMatch(coderOut, /^mode:/m)
      assert.doesNotMatch(coderOut, /^color:/m)
      assert.doesNotMatch(coderOut, /^temperature:/m)
      assert.doesNotMatch(coderOut, /^permission:/m)
      assert.doesNotMatch(coderOut, /^tools:/m)
      assert.doesNotMatch(coderOut, /opencode-go/)
      assert.match(coderOut, /^description: Implements approved changes/m)
    })
  })

  it('5.12 adaptador vscode: .agent.md adaptado (no verbatim), sin claves opencode/model/tools', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo', '--agent', 'vscode'], dir)
      assert.equal(r.status, 0)

      const coderSrc = readFileSync(AGENT_SRC('coder'), 'utf8')
      assert.match(coderSrc, /^mode: /m)
      assert.match(coderSrc, /^model: opencode-go\//m)
      assert.match(coderSrc, /^tools:/m)

      const coderOut = readFileSync(join(dir, '.github', 'agents', 'coder.agent.md'), 'utf8')
      assert.doesNotMatch(coderOut, /^mode:/m)
      assert.doesNotMatch(coderOut, /^color:/m)
      assert.doesNotMatch(coderOut, /^temperature:/m)
      assert.doesNotMatch(coderOut, /^permission:/m)
      assert.doesNotMatch(coderOut, /^tools:/m)
      assert.doesNotMatch(coderOut, /opencode-go/)
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
      assert.match(src, /^model: opencode-go\//m)
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
      assert.doesNotMatch(out, /opencode-go/)
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
          { cwd: dir, encoding: 'utf8', env: { ...process.env, ANCLETO_MUSE_SPARK: '0', ...regEnv(dir) } }
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
        assert.doesNotMatch(out, /opencode-go/)
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
          { cwd: dir, encoding: 'utf8', env: { ...process.env, ANCLETO_MUSE_SPARK: '0', ...regEnv(dir) } }
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
          { cwd: dir, encoding: 'utf8', env: { ...process.env, ANCLETO_MUSE_SPARK: '0', ...regEnv(dir) } }
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

      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode-go\/deepseek-v4\.1-flash/)

      assert.equal(readFileSync(join(dir, '.opencode', '.ancleto-tier'), 'utf8').trim(), 'minimo')
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

describe('CLI check (G3)', () => {
  it('exit 0 en instalacion sana', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      const r = run(['check'], dir)
      assert.equal(r.status, 0)
      assert.match(r.stdout, /✔/)
      assert.match(r.stdout, /0 faltantes/)
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

      const inst = run(['install', '--project', dir, '--no-mcp'], dir, { ANCLETO_MUSE_SPARK: '0' })
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
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode-go\/deepseek-v4\.1-flash/)
    })
  })

  it('init --tier gratis aplica el modelo gratis y lo persiste en .ancletorc', () => {
    withDir((dir) => {
      const r = run(['init', '--tier', 'gratis'], dir)
      assert.equal(r.status, 0)
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/big-pickle/)
      assert.equal(readRc(dir).gratisModel, 'opencode/big-pickle')
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
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode-go\/deepseek-v4\.1-flash/)
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

  it('install --tier gratis con Muse Spark disponible aplica muse-spark', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, { ANCLETO_MUSE_SPARK: '1' })
      assert.equal(r.status, 0)
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/muse-spark-1\.3-contributor-free/)
      assert.match(r.stdout, /modelo gratis: opencode\/muse-spark-1\.3-contributor-free/)
      assert.equal(readRc(dir).gratisModel, 'opencode/muse-spark-1.3-contributor-free')
    })
  })

  it('install --tier gratis reutiliza el modelo persistido sin preguntar', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, { ANCLETO_MUSE_SPARK: '1' })
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir, { ANCLETO_MUSE_SPARK: '' })
      assert.equal(r.status, 0)
      assert.match(r.stdout, /modelo gratis: opencode\/muse-spark-1\.3-contributor-free/)
      assert.equal(readRc(dir).gratisModel, 'opencode/muse-spark-1.3-contributor-free')
      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode\/muse-spark-1\.3-contributor-free/)
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
