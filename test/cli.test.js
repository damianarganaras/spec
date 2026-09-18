import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

describe('CLI install', () => {
  it('instala assets y templates, aplica tier y actualiza el manifiesto', () => {
    withDir((dir) => {
      const r = run(['install', '--project', dir, '--no-mcp', '--tier', 'minimo'], dir)
      assert.equal(r.status, 0)
      assert.ok(existsSync(join(dir, 'AGENTS.md')))
      assert.ok(existsSync(join(dir, 'PRODUCT.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'agents', 'orchestrator.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'commands', 'opsx-new.md')))
      assert.ok(existsSync(join(dir, '.opencode', 'skills', 'triage-clarifier', 'SKILL.md')))

      const rc = readRc(dir)
      assert.equal(rc.version, PKG.version)
      assert.ok(!Number.isNaN(Date.parse(rc.installedAt)))
      assert.deepEqual(rc.installedPaths.templates, ['AGENTS.md', 'PRODUCT.md'])
      assert.deepEqual(rc.installedPaths.agents, ['.opencode/agents'])
      assert.deepEqual(rc.installedPaths.commands, ['.opencode/commands'])
      assert.deepEqual(rc.installedPaths.skills, ['.opencode/skills'])

      const orchestrator = readFileSync(join(dir, '.opencode', 'agents', 'orchestrator.md'), 'utf8')
      assert.match(orchestrator, /model: opencode-go\/deepseek-v4-flash/)

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

describe('CLI scaffold OpenSpec (G5)', () => {
  it('init crea openspec/changes y config.yaml', () => {
    withDir((dir) => {
      run(['init'], dir)
      assert.ok(existsSync(join(dir, 'openspec', 'config.yaml')))
      assert.ok(existsSync(join(dir, 'openspec', 'changes')))
    })
  })

  it('no pisa un config.yaml preexistente', () => {
    withDir((dir) => {
      run(['init'], dir)
      const cfgPath = join(dir, 'openspec', 'config.yaml')
      writeFileSync(cfgPath, '# config custom del equipo\n')
      run(['init'], dir)
      assert.equal(readFileSync(cfgPath, 'utf8'), '# config custom del equipo\n')
    })
  })

  it('install --project tambien crea el scaffold', () => {
    withDir((dir) => {
      run(['install', '--project', dir, '--no-mcp', '--tier', 'gratis'], dir)
      assert.ok(existsSync(join(dir, 'openspec', 'config.yaml')))
      assert.ok(existsSync(join(dir, 'openspec', 'changes')))
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
      run(['install', '--project', dir, '--tier', 'gratis'], dir)
      const cfg = JSON.parse(readFileSync(join(dir, '.opencode', 'opencode.json'), 'utf8'))
      assert.equal(cfg.mcp['azure-devops'], undefined)
    })
  })
})
