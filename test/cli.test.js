import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
      assert.deepEqual(rc.installedPaths, { templates: [], agents: [], commands: [], skills: [] })
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

describe('CLI upgrade migracion openspec -> aspec (v0.6.5)', () => {
  it('migra openspec/ a aspec/ preservando contenido', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec', 'changes', 'demo'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'changes', 'demo', 'proposal.md'), '# demo\n')
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, 'openspec')), false)
      assert.equal(readFileSync(join(dir, 'aspec', 'changes', 'demo', 'proposal.md'), 'utf8'), '# demo\n')
      assert.match(r.stdout, /migrados/)
    })
  })

  it('no pisa aspec/ existente y avisa', () => {
    withDir((dir) => {
      writeFileSync(join(dir, '.ancletorc'), JSON.stringify({ schemaVersion: 1, version: '0.0.0' }) + '\n')
      mkdirSync(join(dir, 'openspec'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'old.txt'), 'viejo\n')
      mkdirSync(join(dir, 'aspec'), { recursive: true })
      writeFileSync(join(dir, 'aspec', 'keep.txt'), 'nuevo\n')
      const r = run(['upgrade'], dir)
      assert.equal(r.status, 0)
      assert.equal(readFileSync(join(dir, 'openspec', 'old.txt'), 'utf8'), 'viejo\n')
      assert.equal(readFileSync(join(dir, 'aspec', 'keep.txt'), 'utf8'), 'nuevo\n')
      assert.match(r.stderr, /no se migro/)
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

  it('init sin tier no escribe .ancleto-tier (fallback silencioso)', () => {
    withDir((dir) => {
      const r = run(['init', '--agent', 'opencode'], dir)
      assert.equal(r.status, 0)
      assert.equal(existsSync(join(dir, '.opencode', '.ancleto-tier')), false)
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
