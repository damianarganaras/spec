import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  adaptFrontmatter,
  parseFrontmatter,
  serializeFrontmatter,
  AGENT_ADAPTER_DROP,
  ANTIGRAVITY_TOOL_MAP,
  COMMANDCODE_TOOL_MAP,
  COMMANDCODE_MCP_TOOL_MAP
} from '../src/core/adapters/frontmatter.js'

// Buffer para capturar `console.error` por test. Algunos casos (cursor/roo/
// unknown) deben emitir un aviso a stderr sin abortar.
let stderrLines = []
const origError = console.error
function captureStderr() {
  stderrLines = []
  console.error = (...args) => {
    stderrLines.push(args.map(String).join(' '))
  }
}
function restoreStderr() {
  console.error = origError
}

beforeEach(captureStderr)
afterEach(restoreStderr)

const SAMPLE = (extra = '') => `---
description: agent de ejemplo
mode: subagent
model: opencode-go/qwen3.7-plus
temperature: 0.1
color: red
permission: allow
tools:
  read: true
  edit: true
  bash: true
  grep: false
${extra}---
# Body

Cuerpo verbatim del agent.
`

describe('adaptFrontmatter — opencode (default)', () => {
  it('agents: identity byte-a-byte', () => {
    const c = SAMPLE()
    assert.equal(adaptFrontmatter(c, 'opencode', 'agents', 'coder'), c)
  })
  it('skills: identity byte-a-byte', () => {
    const c = SAMPLE()
    assert.equal(adaptFrontmatter(c, 'opencode', 'skills', 'triage-clarifier'), c)
  })
  it('commands: identity byte-a-byte', () => {
    const c = SAMPLE()
    assert.equal(adaptFrontmatter(c, 'opencode', 'commands', 'cleto-new'), c)
  })
})

describe('adaptFrontmatter — claude/vscode/copilot (drop keys)', () => {
  for (const host of ['claude', 'vscode', 'copilot']) {
    it(`${host} agents: dropea mode/color/temperature/permission/model/tools`, () => {
      const out = adaptFrontmatter(SAMPLE(), host, 'agents', 'coder')
      assert.doesNotMatch(out, /^mode:/m)
      assert.doesNotMatch(out, /^color:/m)
      assert.doesNotMatch(out, /^temperature:/m)
      assert.doesNotMatch(out, /^permission:/m)
      assert.doesNotMatch(out, /^model:/m)
      assert.doesNotMatch(out, /^tools:/m)
      // description se preserva
      assert.match(out, /^description: agent de ejemplo$/m)
    })

    it(`${host} agents: name del archivo no se inyecta (lo conserva opencode, pero no se altera)`, () => {
      const out = adaptFrontmatter(SAMPLE(), host, 'agents', 'coder')
      // AGENT_ADAPTER_DROP no incluye 'name', y el source no declara name: la salida no debe inventarlo.
      assert.doesNotMatch(out, /^name: coder$/m)
    })

    it(`${host} skills: identity (no adapta skills)`, () => {
      const c = SAMPLE()
      assert.equal(adaptFrontmatter(c, host, 'skills', 'triage-clarifier'), c)
    })

    it(`${host} commands: identity (no adapta commands)`, () => {
      const c = SAMPLE()
      assert.equal(adaptFrontmatter(c, host, 'commands', 'cleto-new'), c)
    })

    it(`${host}: sin frontmatter → retorna el contenido sin cambios`, () => {
      const c = '# Solo body\nsin frontmatter'
      assert.equal(adaptFrontmatter(c, host, 'agents', 'coder'), c)
    })
  }

  it('AGENT_ADAPTER_DROP contiene las claves que la spec declara como no portables', () => {
    for (const k of ['mode', 'color', 'temperature', 'permission', 'model', 'tools']) {
      assert.ok(AGENT_ADAPTER_DROP.has(k), `${k} debe estar en AGENT_ADAPTER_DROP`)
    }
  })
})

describe('adaptFrontmatter — antigravity (transformación completa)', () => {
  it('inyecta name y conserva description', () => {
    const out = adaptFrontmatter(SAMPLE(), 'antigravity', 'agents', 'coder')
    assert.match(out, /^name: coder$/m)
    assert.match(out, /^description: agent de ejemplo$/m)
  })

  it('tools como lista de ids verificados, en el orden de declaración', () => {
    const out = adaptFrontmatter(SAMPLE(), 'antigravity', 'agents', 'coder')
    // source declara read/edit/bash en ese orden, grep=false, ANTIGRAVITY_TOOL_MAP mapea a view_file/replace_file_content/run_command
    assert.match(out, /^tools: \[view_file, replace_file_content, run_command\]$/m)
    assert.doesNotMatch(out, /^model: opencode-go/m)
    assert.match(out, /^model: inherit$/m)
  })

  it('mode: subagent se traduce a mainAgent: false, subagent: true', () => {
    const out = adaptFrontmatter(SAMPLE(), 'antigravity', 'agents', 'coder')
    assert.match(out, /^mainAgent: false$/m)
    assert.match(out, /^subagent: true$/m)
  })

  it('mode: primary se traduce a mainAgent: true, subagent: false', () => {
    const src = SAMPLE().replace('mode: subagent', 'mode: primary')
    const out = adaptFrontmatter(src, 'antigravity', 'agents', 'coder')
    assert.match(out, /^mainAgent: true$/m)
    assert.match(out, /^subagent: false$/m)
  })

  it('sin mode: default mainAgent: true, subagent: true', () => {
    const src = SAMPLE().replace('mode: subagent\n', '')
    const out = adaptFrontmatter(src, 'antigravity', 'agents', 'coder')
    assert.match(out, /^mainAgent: true$/m)
    assert.match(out, /^subagent: true$/m)
  })

  it('omisión con aviso de tools no verificadas (write, glob, task, find_file, etc.)', () => {
    const extra = ['write: true', 'glob: true', 'task: true', 'find_file: true', 'call_mcp_tool: true', 'searchMemory: true']
      .map((k) => `  ${k}`).join('\n') + '\n'
    const out = adaptFrontmatter(SAMPLE(extra), 'antigravity', 'agents', 'coder')
    // Solo los 3 ids verificados (read/edit/bash mapeados) deben quedar; el resto se omite.
    assert.match(out, /^tools: \[view_file, replace_file_content, run_command\]$/m)
    assert.doesNotMatch(out, /write_to_file|find_file|call_mcp_tool|invoke_subagent|start_subagent|define_subagent/)
    for (const k of ['write', 'glob', 'task', 'find_file', 'call_mcp_tool', 'searchMemory']) {
      assert.ok(
        stderrLines.some((l) => l === `skip tool '${k}': no verified Antigravity id for agent 'coder'`),
        `debe avisar por la omisión de ${k}`
      )
    }
  })

  it('skill: true no se emite como tool id (se omite silenciosamente, sin aviso)', () => {
    const extra = '  skill: true\n'
    stderrLines.length = 0
    const out = adaptFrontmatter(SAMPLE(extra), 'antigravity', 'agents', 'coder')
    // skill: se ignora y NO genera aviso
    assert.doesNotMatch(out, /skill/)
    assert.equal(stderrLines.length, 0, 'no debe avisar por la clave `skill` (resuelta por el campo skills)')
  })

  it('emitir commandExecutionPolicy: sandbox', () => {
    const out = adaptFrontmatter(SAMPLE(), 'antigravity', 'agents', 'coder')
    assert.match(out, /^commandExecutionPolicy: sandbox$/m)
  })

  it('preserva description/skills/mcpServers y claves extra del origen', () => {
    const src = `---
description: custom
mode: subagent
mcpServers: []
skills: [triage-clarifier]
tools:
  read: true
otra: clave
---
# body
`
    const out = adaptFrontmatter(src, 'antigravity', 'agents', 'coder')
    assert.match(out, /^description: custom$/m)
    assert.match(out, /^mcpServers: \[\]$/m)
    assert.match(out, /^skills: \[triage-clarifier\]$/m)
    assert.match(out, /^otra: clave$/m)
  })

  it('skills: identity (no adapta skills para antigravity)', () => {
    const c = SAMPLE()
    assert.equal(adaptFrontmatter(c, 'antigravity', 'skills', 'triage-clarifier'), c)
  })

  it('ANTIGRAVITY_TOOL_MAP contiene solo ids verificados del spec', () => {
    const expected = {
      read: 'view_file',
      edit: 'replace_file_content',
      grep: 'grep_search',
      bash: 'run_command',
      todowrite: 'manage_task'
    }
    assert.deepEqual(ANTIGRAVITY_TOOL_MAP, expected)
  })

  it('sin frontmatter → contenido sin cambios', () => {
    const c = '# Solo body\nsin frontmatter'
    assert.equal(adaptFrontmatter(c, 'antigravity', 'agents', 'coder'), c)
  })
})

describe('adaptFrontmatter — commandcode (transformación)', () => {
  it('inyecta name y conserva description', () => {
    const out = adaptFrontmatter(SAMPLE(), 'commandcode', 'agents', 'coder')
    assert.match(out, /^name: coder$/m)
    assert.match(out, /^description: agent de ejemplo$/m)
  })

  it('dropea mode/color/temperature/permission y omite model', () => {
    const out = adaptFrontmatter(SAMPLE(), 'commandcode', 'agents', 'coder')
    assert.doesNotMatch(out, /^mode:/m)
    assert.doesNotMatch(out, /^color:/m)
    assert.doesNotMatch(out, /^temperature:/m)
    assert.doesNotMatch(out, /^permission:/m)
    assert.doesNotMatch(out, /^model:/m)
    assert.doesNotMatch(out, /opencode-go/)
  })

  it('tools como lista de ids verificados (sólo claves true)', () => {
    const out = adaptFrontmatter(SAMPLE(), 'commandcode', 'agents', 'coder')
    // source: read/edit/bash true, grep false -> sólo los 3 mapeados
    assert.match(out, /^tools: \[read_file, edit_file, shell_command\]$/m)
  })

  it('las tools de memoria se emiten como tools MCP de Command Code', () => {
    const extra = ['searchMemory: true', 'recordRule: true', 'recordDecision: true'].map((k) => `  ${k}`).join('\n') + '\n'
    const out = adaptFrontmatter(SAMPLE(extra), 'commandcode', 'agents', 'memory-keeper')
    assert.match(out, /^tools: \[read_file, edit_file, shell_command, mcp__ancleto-memory__searchMemory, mcp__ancleto-memory__recordRule, mcp__ancleto-memory__recordDecision\]$/m)
  })

  it('una clave sin id verificado se omite con aviso a stderr', () => {
    stderrLines.length = 0
    const out = adaptFrontmatter(SAMPLE('  skill: true\n  task: true\n'), 'commandcode', 'agents', 'orchestrator')
    assert.doesNotMatch(out, /skill|task/)
    for (const k of ['skill', 'task']) {
      assert.ok(
        stderrLines.some((l) => l === `skip tool '${k}': no verified Command Code id for agent 'orchestrator'`),
        `debe avisar por la omisión de ${k}`
      )
    }
  })

  it('sin tools declarado → tools: "*" (default "todas" de opencode)', () => {
    const src = `---\ndescription: sin tools\nmode: subagent\n---\n# body\n`
    const out = adaptFrontmatter(src, 'commandcode', 'agents', 'x')
    assert.match(out, /^tools: "\*"$/m)
    assert.doesNotMatch(out, /^mode:/m)
  })

  it('tools con sólo claves false → tools: []', () => {
    const src = `---\ndescription: vacio\ntools:\n  read: false\n  write: false\n---\n# body\n`
    const out = adaptFrontmatter(src, 'commandcode', 'agents', 'x')
    assert.match(out, /^tools: \[\]$/m)
  })

  it('skills/commands: identity (no adapta skills ni commands)', () => {
    const c = SAMPLE()
    assert.equal(adaptFrontmatter(c, 'commandcode', 'skills', 'triage-clarifier'), c)
    assert.equal(adaptFrontmatter(c, 'commandcode', 'commands', 'cleto-new'), c)
  })

  it('sin frontmatter → contenido sin cambios', () => {
    const c = '# Solo body\nsin frontmatter'
    assert.equal(adaptFrontmatter(c, 'commandcode', 'agents', 'coder'), c)
  })

  it('COMMANDCODE_TOOL_MAP/COMMANDCODE_MCP_TOOL_MAP contienen sólo ids verificados', () => {
    assert.deepEqual(COMMANDCODE_TOOL_MAP, {
      read: 'read_file',
      write: 'write_file',
      edit: 'edit_file',
      bash: 'shell_command',
      grep: 'grep',
      glob: 'glob',
      webfetch: 'web_fetch',
      websearch: 'web_search',
      todowrite: 'todo_write'
    })
    assert.deepEqual(COMMANDCODE_MCP_TOOL_MAP, {
      searchMemory: 'mcp__ancleto-memory__searchMemory',
      recordRule: 'mcp__ancleto-memory__recordRule',
      recordDecision: 'mcp__ancleto-memory__recordDecision'
    })
  })
})

describe('adaptFrontmatter — cursor y roo (passthrough con aviso)', () => {
  for (const host of ['cursor', 'roo']) {
    it(`${host} skills: identity byte-a-byte + aviso a stderr`, () => {
      const c = SAMPLE()
      assert.equal(adaptFrontmatter(c, host, 'skills', 'triage-clarifier'), c)
      assert.ok(
        stderrLines.some((l) => l === `no documented frontmatter adaptation for host '${host}'`),
        `debe emitir aviso a stderr para ${host}`
      )
    })

    it(`${host} commands: identity (los hosts no soportan, pero si llegara: identity + aviso)`, () => {
      const c = SAMPLE()
      assert.equal(adaptFrontmatter(c, host, 'commands', 'cleto-new'), c)
      assert.ok(
        stderrLines.some((l) => l === `no documented frontmatter adaptation for host '${host}'`),
        `debe emitir aviso a stderr para ${host}`
      )
    })

    it(`${host} agents: identity + aviso (caso defensivo, AGENT_TARGETS los marca null)`, () => {
      const c = SAMPLE()
      assert.equal(adaptFrontmatter(c, host, 'agents', 'coder'), c)
      assert.ok(
        stderrLines.some((l) => l === `no documented frontmatter adaptation for host '${host}'`)
      )
    })
  }
})

describe('adaptFrontmatter — host desconocido', () => {
  it('passthrough + aviso "unknown agent", no aborta', () => {
    const c = SAMPLE()
    assert.equal(adaptFrontmatter(c, 'unknown-host', 'agents', 'coder'), c)
    assert.equal(adaptFrontmatter(c, 'unknown-host', 'skills', 'triage-clarifier'), c)
    assert.equal(adaptFrontmatter(c, 'unknown-host', 'commands', 'cleto-new'), c)
    assert.ok(
      stderrLines.filter((l) => l === `unknown agent 'unknown-host', passthrough`).length === 3,
      'debe emitir un aviso por cada asset procesado'
    )
  })

  it('no lanza excepciones aunque el contenido no tenga frontmatter', () => {
    const c = '# sin frontmatter\n'
    assert.equal(adaptFrontmatter(c, 'unknown-host', 'agents', 'coder'), c)
  })
})

describe('parseFrontmatter / serializeFrontmatter (helpers re-exportados)', () => {
  it('parseFrontmatter: hasFrontmatter=false si no hay delimitadores', () => {
    const p = parseFrontmatter('# sin frontmatter\n')
    assert.equal(p.hasFrontmatter, false)
  })

  it('parseFrontmatter: extrae entradas con clave y lineas crudas', () => {
    const p = parseFrontmatter(SAMPLE())
    assert.equal(p.hasFrontmatter, true)
    const keys = p.entries.filter((e) => e.key).map((e) => e.key)
    assert.ok(keys.includes('description'))
    assert.ok(keys.includes('mode'))
    assert.ok(keys.includes('model'))
  })

  it('serializeFrontmatter: round-trip preserva el contenido (sin cambios)', () => {
    const c = SAMPLE()
    const p = parseFrontmatter(c)
    assert.equal(serializeFrontmatter(p), c)
  })

  it('serializeFrontmatter: con hasFrontmatter=false retorna el contenido original', () => {
    const c = '# x'
    const p = parseFrontmatter(c)
    assert.equal(serializeFrontmatter(p), c)
  })
})
