import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { adaptFrontmatter, parseFrontmatter } from '../src/core/adapters/frontmatter.js'
import { TIERS, tierModels } from '../src/core/tier-models.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO = join(TEST_DIR, '..')
const CLI = join(REPO, 'src', 'cli', 'index.js')

// Tier de la matriz con modelos distintos de la canónica (`agents/*.md` declara
// `opencode-go/deepseek-v4.1-flash`, que es justo el valor de `minimo`). Con `minimo`
// `applyTier` es no-op y una regresión que omita la aplicación del tier pasaría
// inadvertida; `normal` hace la aplicación observable.
const TIER = 'normal'
const TIER_MODELS = tierModels(TIER, TIERS)

// Oráculo independiente del descriptor de produccion (decision host-matrix-oracle-
// independent): una deriva de AGENT_TARGETS/HOST_MCP_TARGETS debe fallar aca en vez
// de actualizar la expectativa en silencio. `mcp: null` = host sin destino MCP.
const HOSTS = {
  opencode: {
    skills: { dir: '.opencode/skills' },
    agents: { dir: '.opencode/agents', ext: '.md' },
    commands: { dir: '.opencode/commands', ext: '.md' },
    mcp: { file: '.opencode/opencode.json', schema: 'mcp' }
  },
  claude: {
    skills: { dir: '.claude/skills' },
    agents: { dir: '.claude/agents', ext: '.md' },
    commands: { dir: '.claude/commands', ext: '.md' },
    mcp: null
  },
  vscode: {
    skills: { dir: '.github/skills' },
    agents: { dir: '.github/agents', ext: '.agent.md' },
    commands: { dir: '.github/prompts', ext: '.prompt.md' },
    mcp: null
  },
  antigravity: {
    skills: { dir: '.agents/skills' },
    agents: { dir: '.agents/agents', ext: '.md' },
    commands: { dir: '.agents/skills', package: 'skill-dir' },
    mcp: { file: '.agents/mcp_config.json', schema: 'mcpServers' }
  },
  cursor: { skills: { dir: '.cursor/skills' }, agents: null, commands: null, mcp: null },
  roo: { skills: { dir: '.roo/skills' }, agents: null, commands: null, mcp: null },
  copilot: {
    skills: null,
    agents: { dir: '.github/prompts', ext: '.prompt.md' },
    commands: { dir: '.github/prompts', ext: '.prompt.md' },
    mcp: { file: 'copilot-mcp.json', schema: 'mcp' }
  },
  commandcode: {
    skills: { dir: '.commandcode/skills' },
    agents: { dir: '.commandcode/agents', ext: '.md' },
    commands: { dir: '.commandcode/commands', ext: '.md' },
    mcp: { file: '.mcp.json', schema: 'mcpServers' }
  }
}

// Archivos MCP que ninguna operacion debe escribir fuera del destino declarado.
const MCP_FILES = [
  '.opencode/opencode.json',
  '.opencode/opencode.jsonc',
  '.agents/mcp_config.json',
  '.mcp.json',
  'copilot-mcp.json',
  '.vscode/mcp.json',
  '.roo/mcp.json',
  '.cursor/mcp.json'
]

const ADVISORY = (host) => `el host '${host}' no declara configuracion MCP de proyecto`
const ASSET_CATEGORIES = ['skills', 'agents', 'commands']
const HOST_NAMES = Object.keys(HOSTS)

function run(args, cwd, env) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
}

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ancleto-host-matrix-'))
  try {
    return fn(root)
  } finally {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort
    }
  }
}

// PATH/HOME/registro temporales: sin red, sin binarios de host y sin depender de la
// maquina. El PATH solo conserva los directorios de sistema que necesita `where`.
function matrixEnv(root) {
  const home = join(root, 'home')
  mkdirSync(home, { recursive: true })
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH'
  const systemDirs = process.platform === 'win32'
    ? [join(process.env.SystemRoot || 'C:\\Windows', 'System32')]
    : ['/usr/bin', '/bin']
  return {
    ANCLETO_PROJECTS_FILE: join(root, 'registry.json'),
    XDG_CONFIG_HOME: join(root, 'xdg'),
    HOME: home,
    USERPROFILE: home,
    [pathKey]: systemDirs.join(delimiter)
  }
}

function walkFiles(base, rel = '') {
  const out = []
  for (const entry of readdirSync(rel ? join(base, rel) : base, { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walkFiles(base, child))
    else out.push(child)
  }
  return out
}

const AGENT_NAMES = walkFiles(join(REPO, 'agents'))
  .filter((rel) => rel.endsWith('.md'))
  .map((rel) => rel.slice(0, -'.md'.length))
  .sort()
const COMMAND_NAMES = walkFiles(join(REPO, 'commands'))
  .filter((rel) => rel.endsWith('.md'))
  .map((rel) => rel.slice(0, -'.md'.length))
  .sort()
const SKILL_FILES = walkFiles(join(REPO, 'skills')).sort()

// Rutas y fuente de cada mirror esperado para un host, derivadas del modelo host
// declarado arriba y de la canónica versionada.
function expectedAssets(host) {
  const model = HOSTS[host]
  const map = new Map()
  if (model.skills) {
    for (const rel of SKILL_FILES) {
      map.set(`${model.skills.dir}/${rel}`, { source: join(REPO, 'skills', rel), kind: 'skills', name: null })
    }
  }
  if (model.agents) {
    for (const name of AGENT_NAMES) {
      map.set(`${model.agents.dir}/${name}${model.agents.ext}`, {
        source: join(REPO, 'agents', `${name}.md`),
        kind: 'agents',
        name
      })
    }
  }
  if (model.commands) {
    for (const name of COMMAND_NAMES) {
      const isPackaged = model.commands.package === 'skill-dir'
      map.set(
        isPackaged
          ? `${model.commands.dir}/${name}/SKILL.md`
          : `${model.commands.dir}/${name}${model.commands.ext}`,
        {
          source: join(REPO, 'commands', `${name}.md`),
          kind: isPackaged ? 'command-skill' : 'commands',
          name
        }
      )
    }
  }
  return map
}

const ALL_ASSET_PATHS = new Set(HOST_NAMES.flatMap((host) => [...expectedAssets(host).keys()]))

function declaredDirs(host) {
  const model = HOSTS[host]
  return [...new Set(ASSET_CATEGORIES.map((cat) => model[cat]?.dir).filter(Boolean))]
}

function readRc(project) {
  return JSON.parse(readFileSync(join(project, '.ancletorc'), 'utf8'))
}

function countOccurrences(text, needle) {
  return (text.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
}

function snapshotTree(dir) {
  const out = {}
  for (const rel of walkFiles(dir).sort()) {
    out[rel] = readFileSync(join(dir, rel)).toString('base64')
  }
  return out
}

function snapshotAssets(project, host) {
  const out = {}
  for (const rel of [...expectedAssets(host).keys()].sort()) {
    out[rel] = readFileSync(join(project, rel)).toString('base64')
  }
  return out
}

// Snapshot de idempotencia: `.ancletorc.installedAt` es un timestamp de la corrida,
// no contenido materializado, así que no cuenta como escritura distinta.
function snapshotMaterialized(project) {
  const out = snapshotTree(project)
  delete out['.ancletorc']
  return out
}

// Bytes de todos los destinos de assets y MCP declarados por cualquier host: sirve
// para probar que una operación escribe sólo el destino del host activo.
function snapshotHostWrites(project) {
  const out = {}
  for (const rel of new Set([...ALL_ASSET_PATHS, ...MCP_FILES])) {
    out[rel] = existsSync(join(project, rel)) ? readFileSync(join(project, rel)).toString('base64') : null
  }
  return out
}

// Mirror que una operación de re-materialización debe restaurar. Prefiere un agent
// (formato con frontmatter); cursor/roo sólo tienen skills.
function corruptibleMirror(host) {
  const entries = [...expectedAssets(host).entries()]
  const agent = entries.find(([, meta]) => meta.kind === 'agents')
  return (agent || entries[0])[0]
}

function assertAssets(project, host) {
  const expected = expectedAssets(host)
  for (const rel of ALL_ASSET_PATHS) {
    assert.equal(
      existsSync(join(project, rel)),
      expected.has(rel),
      `${host}: ${rel} ${expected.has(rel) ? 'debe existir' : 'no debe existir'}`
    )
  }
  for (const dir of declaredDirs(host)) {
    const actual = existsSync(join(project, dir))
      ? walkFiles(join(project, dir)).map((rel) => `${dir}/${rel}`).sort()
      : []
    const wanted = [...expected.keys()].filter((rel) => rel.startsWith(`${dir}/`)).sort()
    assert.deepEqual(actual, wanted, `${host}: contenido exacto de ${dir}`)
  }
  // Ningun asset con nombre canonico puede quedar en un directorio base que el
  // host no declara (p. ej. `.roo/agents/coder.md`).
  const knownNames = new Set([...AGENT_NAMES, ...COMMAND_NAMES, 'SKILL'])
  for (const rel of walkFiles(project)) {
    const base = rel.split('/').pop()
    const stem = base.endsWith('.prompt.md')
      ? base.slice(0, -'.prompt.md'.length)
      : base.endsWith('.agent.md')
        ? base.slice(0, -'.agent.md'.length)
        : base.endsWith('.md')
          ? base.slice(0, -'.md'.length)
          : null
    if (!stem || !knownNames.has(stem)) continue
    assert.ok(expected.has(rel), `${host}: asset ${rel} fuera de los destinos declarados`)
  }
}

function assertManifest(project, host) {
  const rc = readRc(project)
  const expected = expectedAssets(host)
  assert.deepEqual([...rc.installedPaths.templates].sort(), ['AGENTS.md', 'PRODUCT.md'])
  for (const cat of ASSET_CATEGORIES) {
    const spec = HOSTS[host][cat]
    const wanted = spec && spec.package !== 'skill-dir' ? [spec.dir] : []
    assert.deepEqual([...rc.installedPaths[cat]].sort(), wanted.sort(), `${host}: installedPaths.${cat}`)
  }
  // El manifiesto solo registra rutas escritas: ninguna ruta esperada cae fuera de
  // los directorios declarados por el host.
  for (const rel of expected.keys()) {
    assert.ok(
      declaredDirs(host).some((dir) => rel.startsWith(`${dir}/`)),
      `${host}: ${rel} fuera de los directorios declarados`
    )
  }
}

// El adaptador emite avisos esperados (cursor/roo, tools omitidas). El oraculo no
// necesita esos avisos: se silencian solo durante el calculo de la expectativa.
function quiet(fn) {
  const original = console.error
  console.error = () => {}
  try {
    return fn()
  } finally {
    console.error = original
  }
}

function assertMirrors(project, host, tier = null) {
  // Sólo opencode escribe `model:` en su mirror y por lo tanto recibe `applyTier`.
  // El tier elegido debe diferir de la canónica para que la aplicación sea observable.
  if (tier && host === 'opencode') {
    const observable = AGENT_NAMES.some((name) => {
      const canonical = /^model: (.*)$/m.exec(readFileSync(join(REPO, 'agents', `${name}.md`), 'utf8'))?.[1]
      return TIER_MODELS[name] !== canonical
    })
    assert.ok(observable, `${host}: el tier ${tier} debe diferir del canónico para que applyTier sea observable`)
  }
  for (const [rel, meta] of expectedAssets(host)) {
    const actual = readFileSync(join(project, rel), 'utf8')
    const source = readFileSync(meta.source, 'utf8')
    if (meta.kind === 'command-skill') {
      // `commandToSkill` (src/cli/index.js:1294-1300) emite `name` + `description`
      // del origen y el body verbatim. Se pinea el head completo: una regresión que
      // descarte `description` debe fallar.
      const parsed = parseFrontmatter(source)
      const description = parsed.hasFrontmatter
        ? parsed.entries.find((entry) => entry.key === 'description')
        : null
      assert.ok(description, `${host}: ${rel} el command canónico declara description`)
      const head = ['---', `name: ${meta.name}`, ...description.lines, '---'].join('\n')
      assert.ok(actual.startsWith(`${head}\n`), `${host}: ${rel} head exacto de commandToSkill`)
      assert.equal(actual, `${head}\n${parsed.body}`, `${host}: ${rel} contenido exacto de commandToSkill`)
      assert.match(actual, new RegExp(`^---\\nname: ${meta.name}\\ndescription: `), `${host}: ${rel} head incluye description`)
      assert.doesNotMatch(actual, /^(?:mode|model|tools|mainAgent|subagent|commandExecutionPolicy):/m)
      continue
    }
    let expected = quiet(() => adaptFrontmatter(source, host, meta.kind, meta.name))
    if (tier && host === 'opencode' && meta.kind === 'agents') {
      // Misma transformación que `applyTier`: reemplazo del primer `model:`.
      expected = expected.replace(/^model: .*$/m, `model: ${TIER_MODELS[meta.name]}`)
    }
    if (meta.kind === 'agents' && meta.name === 'orchestrator' && (host === 'copilot' || host === 'commandcode')) {
      const label = host === 'copilot' ? 'Copilot' : 'Command Code'
      assert.ok(actual.startsWith(expected), `${host}: ${rel} parte de la adaptacion canonica`)
      const suffix = actual.slice(expected.length)
      assert.match(suffix, new RegExp(`Nota de modelo \\(solo ${label}\\)`), `${host}: ${rel} nota host-scoped`)
      assert.equal(countOccurrences(suffix, 'Nota de modelo'), 1, `${host}: ${rel} una sola nota`)
      continue
    }
    assert.equal(actual, expected, `${host}: mirror ${rel} producido por el adaptador del host`)
  }
}

function firstLockedBlock(filename) {
  const source = readFileSync(join(REPO, 'templates', filename), 'utf8')
  const re = /<!--\s*LOCKED:\s*([\w-]+)\s*-->([\s\S]*?)<!--\s*\/LOCKED:\s*\1\s*-->/g
  const match = re.exec(source)
  assert.ok(match, `${filename}: el template canonico declara un bloque LOCKED`)
  return { name: match[1], block: match[0] }
}

function stripLocked(text) {
  return text.replace(/<!--\s*LOCKED:\s*[\w-]+\s*-->[\s\S]*?<!--\s*\/LOCKED:\s*[\w-]+\s*-->/g, '')
}

function seedTemplates(project, marker) {
  for (const filename of ['AGENTS.md', 'PRODUCT.md']) {
    const { name } = firstLockedBlock(filename)
    writeFileSync(
      join(project, filename),
      `# local ${filename}\n\n<!-- LOCKED: ${name} -->\nSTALE_CONTENT_${name}\n<!-- /LOCKED: ${name} -->\n\n${marker}\n`
    )
  }
}

function assertTemplatesMerged(project, marker) {
  for (const filename of ['AGENTS.md', 'PRODUCT.md']) {
    const content = readFileSync(join(project, filename), 'utf8')
    const { name, block } = firstLockedBlock(filename)
    assert.ok(content.includes(block), `${filename}: el bloque LOCKED queda alineado con la canónica`)
    assert.equal(content.includes(`STALE_CONTENT_${name}`), false, `${filename}: no conserva el LOCKED viejo`)
    assert.ok(stripLocked(content).includes(marker), `${filename}: preserva el contenido EXTENSIBLE`)
  }
}

function assertMcpWrites(project, host, allowed = []) {
  const model = HOSTS[host]
  for (const rel of MCP_FILES) {
    if (model.mcp && rel === model.mcp.file) continue
    if (allowed.includes(rel)) continue
    assert.equal(existsSync(join(project, rel)), false, `${host}: no debe escribir ${rel}`)
  }
  if (!model.mcp) return
  const file = join(project, model.mcp.file)
  assert.ok(existsSync(file), `${host}: existe ${model.mcp.file}`)
  const cfg = JSON.parse(readFileSync(file, 'utf8'))
  const servers = cfg?.[model.mcp.schema]
  assert.equal(Array.isArray(servers), false, `${host}: ${model.mcp.schema} es un mapa`)
  assert.equal(typeof servers, 'object', `${host}: ${model.mcp.schema} presente`)
  const entry = servers['ancleto-memory']
  assert.ok(entry, `${host}: ancleto-memory en ${model.mcp.schema}`)
  if (host === 'antigravity') {
    assert.equal(entry.command !== undefined && typeof entry.command === 'string', true)
    assert.equal(Array.isArray(entry.args), true)
    assert.equal('type' in entry, false)
  } else if (host === 'commandcode') {
    assert.equal(entry.transport, 'stdio')
    assert.equal(typeof entry.command, 'string')
    assert.equal(Array.isArray(entry.args), true)
    assert.equal('type' in entry, false)
    assert.equal('enabled' in entry, false)
  } else {
    assert.equal(entry.type, 'local')
    assert.equal(entry.enabled, true)
    assert.equal(Array.isArray(entry.command), true)
  }
}

function mcpEntryNames(project, host) {
  const model = HOSTS[host]
  if (!model.mcp) return []
  const cfg = JSON.parse(readFileSync(join(project, model.mcp.file), 'utf8'))
  return Object.keys(cfg[model.mcp.schema] || {}).sort()
}

function mcpEntryCommand(project, host) {
  const model = HOSTS[host]
  const cfg = JSON.parse(readFileSync(join(project, model.mcp.file), 'utf8'))
  const entry = cfg[model.mcp.schema]['ancleto-memory']
  return Array.isArray(entry.command) ? entry.command[0] : entry.command
}

function assertMergedAfterRepeat(project, host, beforeAssets, beforeMcpNames) {
  assert.deepEqual(snapshotAssets(project, host), beforeAssets, `${host}: assets byte-identicos`)
  assert.deepEqual(mcpEntryNames(project, host), beforeMcpNames, `${host}: mismas entradas MCP`)
}

for (const host of HOST_NAMES) {
  describe(`host matrix — ${host}`, () => {
    it('init + import --repair + upgrade + install/update cumplen la matriz offline', () => {
      withRoot((root) => {
        const env = matrixEnv(root)
        const project = join(root, 'init')
        mkdirSync(project, { recursive: true })
        seedTemplates(project, 'EXTENSIBLE_PROPIO_INIT')
        // Archivo MCP ajeno (de otro host) preexistente: ninguna operacion debe
        // modificarlo ni pisarlo.
        const foreign = host === 'copilot' ? '.mcp.json' : 'copilot-mcp.json'
        const foreignContent = '{ ajeno no parseable\n'
        writeFileSync(join(project, foreign), foreignContent)
        const allowedForeign = [foreign]
        const assertForeignUntouched = () => {
          assert.equal(readFileSync(join(project, foreign), 'utf8'), foreignContent, `${host}: no modifica ${foreign}`)
        }

        // Mirror que `upgrade` y `update` deben re-materializar desde la canónica.
        // Se corrompe con un centinela: una reescritura idéntica o una omisión de la
        // materialización ya no alcanzan para pasar.
        const mirrorRel = corruptibleMirror(host)
        const mirrorSentinel = `MIRROR_CORRUPTO_${host}\n`
        const templateSentinel = `TEMPLATE_CORRUPTO_${host}\n`

        const init = run(['init', '--agent', host, '--tier', TIER], project, env)
        assert.equal(init.status, 0, init.stderr)
        assertAssets(project, host)
        assertMirrors(project, host, TIER)
        assertManifest(project, host)
        assertTemplatesMerged(project, 'EXTENSIBLE_PROPIO_INIT')
        assertMcpWrites(project, host, allowedForeign)
        assertForeignUntouched()
        assert.equal(
          countOccurrences(init.stderr, ADVISORY(host)),
          HOSTS[host].mcp ? 0 : 1,
          `${host}: aviso MCP esperado en init`
        )
        for (const cat of ASSET_CATEGORIES) {
          if (HOSTS[host][cat]) continue
          assert.match(init.stderr, new RegExp(`skip ${cat}: not supported by host '${host}'`))
        }

        // Idempotencia de `init`: la segunda corrida no altera bytes materializados
        // (`.ancletorc.installedAt` es un timestamp y no cuenta como materialización).
        const afterInit = snapshotMaterialized(project)
        const initAgain = run(['init', '--agent', host, '--tier', TIER], project, env)
        assert.equal(initAgain.status, 0, initAgain.stderr)
        assert.deepEqual(snapshotMaterialized(project), afterInit, `${host}: init idempotente`)
        assertAssets(project, host)
        assertMirrors(project, host, TIER)

        // import --repair sin bundle es MCP-only: se siembran un asset y un template
        // corruptos con centinela. Deben seguir corruptos (no se acepta una reescritura
        // idéntica como prueba) y el árbol completo debe quedar byte-idéntico.
        writeFileSync(join(project, mirrorRel), mirrorSentinel)
        writeFileSync(join(project, 'AGENTS.md'), templateSentinel)
        assert.equal(readFileSync(join(project, mirrorRel), 'utf8'), mirrorSentinel, `${host}: sanity asset corrupto`)
        assert.equal(readFileSync(join(project, 'AGENTS.md'), 'utf8'), templateSentinel, `${host}: sanity template corrupto`)
        const beforeRepair = snapshotTree(project)
        for (let pass = 0; pass < 2; pass += 1) {
          const repair = run(['import', '--repair'], project, env)
          assert.equal(repair.status, 0, repair.stderr)
          assert.equal(
            countOccurrences(repair.stderr, ADVISORY(host)),
            HOSTS[host].mcp ? 0 : 1,
            `${host}: aviso MCP esperado en import --repair`
          )
          assert.deepEqual(snapshotTree(project), beforeRepair, `${host}: import --repair byte-identico`)
          assert.equal(readFileSync(join(project, mirrorRel), 'utf8'), mirrorSentinel, `${host}: import --repair no reescribe assets`)
          assert.equal(readFileSync(join(project, 'AGENTS.md'), 'utf8'), templateSentinel, `${host}: import --repair no reescribe templates`)
          assertMcpWrites(project, host, allowedForeign)
          assertForeignUntouched()
        }

        // upgrade re-materializa los assets desde la canónica y refresca solo el
        // destino MCP declarado. Los templates se vuelven a sembrar desactualizados.
        seedTemplates(project, 'EXTENSIBLE_PROPIO_UPGRADE')
        if (host === 'copilot' || host === 'commandcode') {
          const model = HOSTS[host]
          const file = join(project, model.mcp.file)
          const cfg = JSON.parse(readFileSync(file, 'utf8'))
          const missing = join(root, 'binario-inexistente', 'node.exe')
          cfg[model.mcp.schema]['ancleto-memory'] = host === 'commandcode'
            ? { transport: 'stdio', command: missing, args: [] }
            : { type: 'local', enabled: true, command: [missing] }
          writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n')
        }
        assert.equal(readFileSync(join(project, mirrorRel), 'utf8'), mirrorSentinel, `${host}: sanity mirror corrupto antes de upgrade`)
        const upgrade = run(['upgrade', '--agent', host], project, env)
        assert.equal(upgrade.status, 0, upgrade.stderr)
        assertAssets(project, host)
        assertMirrors(project, host)
        assertManifest(project, host)
        assertTemplatesMerged(project, 'EXTENSIBLE_PROPIO_UPGRADE')
        assertMcpWrites(project, host, allowedForeign)
        assertForeignUntouched()
        if (host === 'copilot' || host === 'commandcode') {
          assert.equal(mcpEntryCommand(project, host), process.execPath, `${host}: upgrade repara su MCP`)
        }

        // Idempotencia de `upgrade`: la segunda corrida no altera bytes materializados.
        const afterUpgrade = snapshotMaterialized(project)
        const upgradeAgain = run(['upgrade', '--agent', host], project, env)
        assert.equal(upgradeAgain.status, 0, upgradeAgain.stderr)
        assert.deepEqual(snapshotMaterialized(project), afterUpgrade, `${host}: upgrade idempotente`)
        assertAssets(project, host)
        assertMirrors(project, host)

        // install/update sobre un proyecto nuevo: mismas rutas y mirrors, idempotencia
        // de la misma operacion y ausencia de escrituras MCP fuera del destino.
        const installed = join(root, 'install')
        mkdirSync(installed, { recursive: true })
        seedTemplates(installed, 'EXTENSIBLE_PROPIO_INSTALL')
        const install1 = run(['install', '--project', installed, '--agent', host, '--tier', TIER], installed, env)
        assert.equal(install1.status, 0, install1.stderr)
        assertAssets(installed, host)
        assertMirrors(installed, host, TIER)
        assertManifest(installed, host)
        assertTemplatesMerged(installed, 'EXTENSIBLE_PROPIO_INSTALL')
        assertMcpWrites(installed, host)
        assert.equal(
          countOccurrences(install1.stderr, ADVISORY(host)),
          HOSTS[host].mcp ? 0 : 1,
          `${host}: aviso MCP esperado en install`
        )

        const beforeInstall = snapshotAssets(installed, host)
        const beforeMcpNames = mcpEntryNames(installed, host)
        const install2 = run(['install', '--project', installed, '--agent', host, '--tier', TIER], installed, env)
        assert.equal(install2.status, 0, install2.stderr)
        assertAssets(installed, host)
        assertMirrors(installed, host, TIER)
        assertManifest(installed, host)
        assertTemplatesMerged(installed, 'EXTENSIBLE_PROPIO_INSTALL')
        assertMcpWrites(installed, host)
        assertMergedAfterRepeat(installed, host, beforeInstall, beforeMcpNames)

        // `update` debe materializar, no sólo repetir un estado ya correcto: se
        // corrompe un asset antes y se exige su restauración al contenido del tier.
        writeFileSync(join(installed, mirrorRel), mirrorSentinel)
        assert.equal(readFileSync(join(installed, mirrorRel), 'utf8'), mirrorSentinel, `${host}: sanity mirror corrupto antes de update`)
        const update = run(['update', '--project', installed, '--agent', host, '--tier', TIER], installed, env)
        assert.equal(update.status, 0, update.stderr)
        assertAssets(installed, host)
        assertMirrors(installed, host, TIER)
        assertManifest(installed, host)
        assertTemplatesMerged(installed, 'EXTENSIBLE_PROPIO_INSTALL')
        assertMcpWrites(installed, host)
        assertMergedAfterRepeat(installed, host, beforeInstall, beforeMcpNames)
      })
    })
  })
}

describe('host matrix — no destruccion entre hosts', () => {
  it('un proyecto multi-host conserva los assets de cada host previo', () => {
    withRoot((root) => {
      const env = matrixEnv(root)
      const project = join(root, 'mixed')
      mkdirSync(project, { recursive: true })
      seedTemplates(project, 'EXTENSIBLE_PROPIO_MIXED')
      const first = run(['init', '--agent', 'opencode', '--tier', 'minimo', '--no-mcp'], project, env)
      assert.equal(first.status, 0, first.stderr)
      const installedHosts = ['opencode']
      const hostSnapshots = new Map([['opencode', snapshotAssets(project, 'opencode')]])
      const hostDirs = { skills: new Set(), agents: new Set(), commands: new Set() }
      const addDirs = (host) => {
        for (const cat of ASSET_CATEGORIES) {
          const spec = HOSTS[host][cat]
          if (spec && spec.package !== 'skill-dir') hostDirs[cat].add(spec.dir)
        }
      }
      addDirs('opencode')

      for (const host of HOST_NAMES.filter((name) => name !== 'opencode')) {
        const beforeWrites = snapshotHostWrites(project)
        const installed = run(['install', '--project', project, '--agent', host, '--tier', 'minimo', '--no-mcp'], project, env)
        assert.equal(installed.status, 0, installed.stderr)
        addDirs(host)
        // Todos los hosts previos conservan sus bytes; no se asume que sólo opencode
        // importa.
        for (const prev of installedHosts) {
          assert.deepEqual(snapshotAssets(project, prev), hostSnapshots.get(prev), `${prev} conservado al instalar ${host}`)
        }
        // Cero escrituras huérfanas: todo path de asset que cambió pertenece al host
        // activo (los paths compartidos entre hosts siguen siendo del host activo).
        const afterWrites = snapshotHostWrites(project)
        const allowed = new Set([
          ...expectedAssets(host).keys(),
          ...(HOSTS[host].mcp ? [HOSTS[host].mcp.file] : [])
        ])
        for (const rel of new Set([...Object.keys(beforeWrites), ...Object.keys(afterWrites)])) {
          if (beforeWrites[rel] !== afterWrites[rel]) {
            assert.ok(allowed.has(rel), `${host}: escritura fuera del host activo en ${rel}`)
          }
        }
        installedHosts.push(host)
        hostSnapshots.set(host, snapshotAssets(project, host))
        for (const rel of expectedAssets(host).keys()) {
          assert.ok(existsSync(join(project, rel)), `${host}: ${rel} materializado`)
        }
        const rc = readRc(project)
        for (const cat of ASSET_CATEGORIES) {
          for (const dir of hostDirs[cat]) {
            assert.ok(rc.installedPaths[cat].includes(dir), `${cat} ${dir} conservado tras instalar ${host}`)
          }
        }
      }

      for (const host of HOST_NAMES) {
        assert.deepEqual(snapshotAssets(project, host), hostSnapshots.get(host), `${host}: assets estables al final`)
        for (const rel of expectedAssets(host).keys()) {
          assert.ok(existsSync(join(project, rel)), `${host}: ${rel} presente al final`)
        }
      }
      assertTemplatesMerged(project, 'EXTENSIBLE_PROPIO_MIXED')
      for (const rel of MCP_FILES) {
        assert.equal(existsSync(join(project, rel)), false, `--no-mcp no crea ${rel}`)
      }

      // `upgrade` con otro host tampoco destruye el layout previo.
      const upgraded = join(root, 'mixed-upgrade')
      mkdirSync(upgraded, { recursive: true })
      assert.equal(run(['init', '--agent', 'opencode', '--tier', 'minimo', '--no-mcp'], upgraded, env).status, 0)
      const upgradedAssets = snapshotAssets(upgraded, 'opencode')
      const crossUpgrade = run(['upgrade', '--agent', 'claude'], upgraded, env)
      assert.equal(crossUpgrade.status, 0, crossUpgrade.stderr)
      assert.deepEqual(snapshotAssets(upgraded, 'opencode'), upgradedAssets, 'upgrade para otro host conserva opencode')
      for (const rel of expectedAssets('claude').keys()) {
        assert.ok(existsSync(join(upgraded, rel)), `claude: ${rel} materializado por upgrade`)
      }
    })
  })
})

describe('host matrix — oraculo', () => {
  it('declara exactamente los ocho hosts y sus tres assets', () => {
    assert.deepEqual([...HOST_NAMES].sort(), [
      'antigravity',
      'claude',
      'commandcode',
      'copilot',
      'cursor',
      'opencode',
      'roo',
      'vscode'
    ])
    for (const host of HOST_NAMES) {
      assert.deepEqual(Object.keys(HOSTS[host]).sort(), ['agents', 'commands', 'mcp', 'skills'])
    }
  })
})
