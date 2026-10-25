import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const CLI = join(TEST_DIR, '..', 'src', 'cli', 'index.js')
const NOW = Date.parse('2026-10-01T12:00:00Z')

function run(args, cwd, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ANCLETO_MUSE_SPARK: '0', ...env }
  })
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-stats-failures-'))
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

// Fixture sintetica: nunca apunta a la base real de opencode.
function createSchema(db) {
  db.exec(`CREATE TABLE session (
    id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, directory TEXT,
    time_created INTEGER, time_updated INTEGER
  )`)
  db.exec('CREATE TABLE part (id TEXT, session_id TEXT, data TEXT, time_created INTEGER)')
  // stats de tokens (no regresion) consulta message; no interviene en failures.
  db.exec('CREATE TABLE message (id TEXT, session_id TEXT, data TEXT)')
}

function makeDb(dir, { wal = false } = {}) {
  const dbPath = join(dir, 'opencode-fixture.db')
  const db = new DatabaseSync(dbPath)
  if (wal) db.exec('PRAGMA journal_mode = WAL')
  createSchema(db)
  return { db, dbPath }
}

function addSession(db, s) {
  db.prepare(
    'INSERT INTO session (id, parent_id, title, directory, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(s.id, s.parent_id ?? null, s.title ?? null, s.directory ?? null, s.time_created ?? NOW, s.time_updated ?? NOW)
}

let partSeq = 0
function addTool(db, o) {
  const state = {
    status: o.status ?? 'completed',
    input: o.input ?? {},
    metadata: {},
    output: o.output ?? '',
    error: o.error ?? ''
  }
  if (o.command !== undefined) state.input.command = o.command
  if (o.exit !== undefined) state.metadata.exit = o.exit
  db.prepare('INSERT INTO part (id, session_id, data, time_created) VALUES (?, ?, ?, ?)').run(
    `part_${++partSeq}`,
    o.session_id,
    JSON.stringify({ type: 'tool', tool: o.tool ?? 'bash', state }),
    o.at ?? NOW
  )
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function fileState(file) {
  if (!existsSync(file)) return null
  const st = statSync(file)
  return { size: st.size, mtime: st.mtimeMs, hash: sha256(file) }
}

// `.db` y `-wal` son el assert; `-shm` queda excluido a proposito: SQLite puede
// actualizar su read-mark sin que eso sea un cambio de datos de la base.
function dbFileStates(dbPath) {
  return { db: fileState(dbPath), wal: fileState(`${dbPath}-wal`) }
}

// Fixture WAL con escritor abierto, autocheckpoint apagado y filas SIN checkpoint:
// las filas viven unicamente en el `-wal` cuando el CLI las lee.
function makePendingWalDb(dir) {
  const dbPath = join(dir, 'opencode-wal-pendiente.db')
  const db = new DatabaseSync(dbPath)
  try {
    assert.equal(db.prepare('PRAGMA journal_mode = WAL').get().journal_mode, 'wal')
    db.exec('PRAGMA wal_autocheckpoint = 0')
    createSchema(db)
    addSession(db, { id: 's1', directory: dir })
    // Estado de `.db` antes de insertar fallos: si luego no cambia, las filas
    // solo pudieron quedar pendientes en el WAL.
    const dbBeforeRows = fileState(dbPath)
    for (let i = 0; i < 5; i++) {
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm test' })
    }
    return { db, dbPath, dbBeforeRows }
  } catch (err) {
    db.close()
    throw err
  }
}

function failures(args, cwd, dbPath) {
  return run(['stats', 'failures', ...args], cwd, { ANCLETO_OPENCODE_DB: dbPath })
}

function json(r) {
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

describe('CLI stats failures — clasificacion', () => {
  it('clasifica env/check/tool/unknown y excluye exit 0', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 9009, command: 'comando-9009' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: 'comando-127' })
      addTool(db, {
        session_id: 's1',
        tool: 'bash',
        exit: 1,
        command: 'comando-msg',
        output: 'cmd : no se reconoce como nombre de un cmdlet'
      })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm test' })
      addTool(db, { session_id: 's1', tool: 'read', status: 'error', input: { filePath: '/tmp/x' } })
      addTool(db, { session_id: 's1', tool: 'bash', status: 'error', command: 'fallo-raro' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 0, command: 'comando-ok' })
      db.close()

      const j = json(failures(['--json'], dir, dbPath))
      const byCommand = new Map(j.groups.map((g) => [g.command, g]))
      assert.equal(byCommand.get('comando-9009').class, 'env')
      assert.equal(byCommand.get('comando-127').class, 'env')
      assert.equal(byCommand.get('comando-msg').class, 'env')
      assert.equal(byCommand.get('npm test').class, 'check')
      assert.equal(byCommand.get('fallo-raro').class, 'unknown')
      const read = j.groups.find((g) => g.tool === 'read')
      assert.equal(read.class, 'tool')
      assert.equal(read.command, null)
      assert.equal(j.universe.parts, 6)
      assert.equal(j.universe.by_class.env.parts, 3)
      assert.equal(j.universe.by_class.check.parts, 1)
      assert.equal(j.universe.by_class.tool.parts, 1)
      assert.equal(j.universe.by_class.unknown.parts, 1)
      assert.ok(!j.groups.some((g) => g.command === 'comando-ok'))
      const ranks = { env: 0, check: 1, tool: 2, unknown: 3 }
      const order = j.groups.map((g) => ranks[g.class])
      assert.deepEqual(order, [...order].sort((a, b) => a - b), 'orden por clase')

      const text = failures([], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.ok(text.stdout.indexOf('env —') >= 0)
      assert.ok(text.stdout.indexOf('env —') < text.stdout.indexOf('check:'), 'env primero')
      assert.match(text.stdout, /^check: 1 fallos/m)
      assert.match(text.stdout, /^tool: 1 fallos/m)
      assert.match(text.stdout, /^unknown: 1 fallos/m)
    })
  })

  it('trunca el esqueleto a 160 y no expone title en session_refs', () => {
    withDir((dir) => {
      const titleSentinel = 'TITULO_SENTINEL_QUE_NO_DEBE_SALIR'
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', title: titleSentinel, directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: `binario-${'x'.repeat(200)}` })
      db.close()

      const asJson = failures(['--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes(titleSentinel), 'el JSON no expone el title')
      const g = JSON.parse(asJson.stdout).groups[0]
      assert.equal(g.class, 'env')
      assert.equal(g.command.length, 160)
      assert.ok(g.command.endsWith('…'))
      assert.deepEqual(g.session_refs, [{ id: 's1' }])
      assert.ok(!('title' in g.session_refs[0]), 'cada session_ref solo tiene id')

      const text = failures([], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.ok(!text.stdout.includes(titleSentinel), 'el texto no expone el title')
    })
  })
})

describe('CLI stats failures — wrapper, esqueleto y normalizacion', () => {
  it('separa el comando envuelto del directo y marca wrapped', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, {
        session_id: 's1',
        tool: 'bash',
        exit: 1,
        command: "& 'C:\\tools\\shrink.exe' shrink -- npm run lint"
      })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm run lint' })
      db.close()

      const j = json(failures(['--tool', 'bash', '--json'], dir, dbPath))
      assert.equal(j.groups.length, 2)
      const wrapped = j.groups.find((g) => g.wrapped === true)
      const direct = j.groups.find((g) => g.wrapped === false)
      assert.equal(wrapped.command, 'npm run lint')
      assert.equal(direct.command, 'npm run lint')
    })
  })

  it('tabla de esqueleto estructural: wrapper, redireccion, flags y prefijo de entorno', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addSession(db, { id: 's2', directory: dir })
      const cases = [
        { command: "& '<caveman>' shrink -- npm run check:i18n", expected: 'npm run check:i18n', wrapped: true },
        { command: 'git push origin development 2>&1', expected: 'git push origin development', wrapped: false },
        { command: "curl -H 'Authorization: Bearer x' https://u:p@h", expected: 'curl', wrapped: false }
      ]
      for (const c of cases) {
        addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: c.command })
      }
      // Dos invocaciones con distinto nombre/valor de variable caen en un solo grupo.
      addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: 'GITHUB_TOKEN=abc1234 npm test' })
      addTool(db, { session_id: 's2', tool: 'bash', exit: 127, command: 'NPM_TOKEN=otro5678 npm test' })
      db.close()

      const asJson = failures(['--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes('GITHUB_TOKEN'))
      assert.ok(!asJson.stdout.includes('abc1234'))
      assert.ok(!asJson.stdout.includes('NPM_TOKEN'))
      assert.ok(!asJson.stdout.includes('otro5678'))
      const j = JSON.parse(asJson.stdout)
      const byCommand = new Map(j.groups.map((g) => [g.command, g]))
      for (const c of cases) {
        assert.ok(byCommand.has(c.expected), `esperaba el esqueleto ${c.expected}`)
        assert.equal(byCommand.get(c.expected).wrapped, c.wrapped)
      }
      const envPrefix = byCommand.get('(env-prefix) npm test')
      assert.ok(envPrefix, 'esperaba (env-prefix) npm test')
      assert.equal(envPrefix.parts, 2)
      assert.equal(envPrefix.sessions, 2)

      const text = failures([], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.match(text.stdout, /npm run check:i18n/)
      assert.match(text.stdout, /git push origin development/)
      assert.match(text.stdout, /\(env-prefix\) npm test/)
    })
  })

  it('colapsa \\r\\n, espacios y argumentos posteriores al corte en un grupo', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addSession(db, { id: 's2', directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm   run\r\nlint' })
      addTool(db, { session_id: 's2', tool: 'bash', exit: 1, command: 'npm run lint' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm run lint -- --fix' })
      addTool(db, {
        session_id: 's1',
        tool: 'bash',
        exit: 1,
        command: 'curl -H "Authorization: Bearer TOKEN_AAA" https://api.example.com'
      })
      addTool(db, {
        session_id: 's2',
        tool: 'bash',
        exit: 1,
        command: 'curl -H "Authorization: Bearer TOKEN_BBB" https://api.example.com'
      })
      db.close()

      const j = json(failures(['--json'], dir, dbPath))
      assert.equal(j.groups.length, 2)
      const npm = j.groups.find((g) => g.command.startsWith('npm'))
      const curl = j.groups.find((g) => g.command.startsWith('curl'))
      assert.equal(npm.command, 'npm run lint')
      assert.equal(npm.parts, 3)
      assert.equal(npm.sessions, 2)
      assert.equal(curl.command, 'curl')
      assert.equal(curl.parts, 2)
      assert.equal(curl.sessions, 2)
    })
  })
})

describe('CLI stats failures — agregacion y orden', () => {
  it('7 fallos en una sesion + 2 en otra: parts 9, sessions 2, max 7, fechas', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addSession(db, { id: 's2', directory: dir })
      const first = Date.parse('2026-10-10T10:00:00Z')
      const last = Date.parse('2026-10-21T18:30:00Z')
      for (let i = 0; i < 7; i++) {
        addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm run lint', at: first + i * 60000 })
      }
      for (let i = 0; i < 2; i++) {
        addTool(db, { session_id: 's2', tool: 'bash', exit: 1, command: 'npm run lint', at: last + i * 60000 })
      }
      db.close()

      const j = json(failures(['--json'], dir, dbPath))
      assert.equal(j.groups.length, 1)
      const g = j.groups[0]
      assert.equal(g.parts, 9)
      assert.equal(g.sessions, 2)
      assert.equal(g.max_per_session, 7)
      assert.equal(g.first_seen, new Date(first).toISOString())
      assert.equal(g.last_seen, new Date(last + 60000).toISOString())
      assert.deepEqual(g.session_refs.map((r) => r.id).sort(), ['s1', 's2'])
    })
  })

  it('session_refs solo expone id: el title de sesion no aparece en texto ni JSON', () => {
    withDir((dir) => {
      const sentinel = 'TITULO_S3N71N3L'
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', title: `${sentinel}_uno`, directory: dir })
      addSession(db, { id: 's2', title: `${sentinel}_dos`, directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm test' })
      addTool(db, { session_id: 's2', tool: 'bash', exit: 1, command: 'npm test' })
      db.close()

      const text = failures([], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.ok(!text.stdout.includes(sentinel), 'el texto no expone el title')

      const asJson = failures(['--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes(sentinel), 'el JSON no expone el title')
      const g = JSON.parse(asJson.stdout).groups[0]
      assert.deepEqual(g.session_refs, [{ id: 's1' }, { id: 's2' }])
    })
  })

  it('ordena por reincidencia 93 / 43 / 43-con-mas-sesiones y es estable ante el orden de insercion', () => {
    const build = (dir, order) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addSession(db, { id: 's2', directory: dir })
      const fixtures = {
        alpha: { parts: 93, sessions: ['s1'], command: 'alpha run one' },
        beta: { parts: 43, sessions: ['s1', 's2'], command: 'beta run dos' },
        gamma: { parts: 43, sessions: ['s1'], command: 'gamma run tres' }
      }
      for (const name of order) {
        const fx = fixtures[name]
        for (let i = 0; i < fx.parts; i++) {
          addTool(db, {
            session_id: fx.sessions[i % fx.sessions.length],
            tool: 'bash',
            exit: 127,
            command: fx.command
          })
        }
      }
      db.close()
      return dbPath
    }
    const expected = ['alpha run one', 'beta run dos', 'gamma run tres']
    for (const order of [['alpha', 'beta', 'gamma'], ['gamma', 'beta', 'alpha']]) {
      withDir((dir) => {
        const j = json(failures(['--json', '--limit', '10'], dir, build(dir, order)))
        assert.deepEqual(j.groups.map((g) => g.command), expected)
        assert.deepEqual(j.groups.map((g) => g.parts), [93, 43, 43])
        assert.deepEqual(j.groups.map((g) => g.sessions), [1, 2, 1])
      })
    }
  })
})

describe('CLI stats failures — alcance', () => {
  it('default filtra al directorio; --all incluye todo; --session incluye subarbol', () => {
    withDir((dir) => {
      const other = join(tmpdir(), 'ancleto-otro-proyecto-ficticio')
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', title: 'Principal', directory: dir })
      addSession(db, { id: 's2', parent_id: 's1', title: 'Subagente', directory: other })
      addSession(db, { id: 's3', title: 'Otro proyecto', directory: other })
      addSession(db, { id: 's4', title: 'Sin directorio', directory: null })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'fallo-s1' })
      addTool(db, { session_id: 's2', tool: 'bash', exit: 1, command: 'fallo-s2' })
      addTool(db, { session_id: 's3', tool: 'bash', exit: 1, command: 'fallo-s3' })
      addTool(db, { session_id: 's4', tool: 'bash', exit: 1, command: 'fallo-s4' })
      db.close()

      const def = json(failures(['--json'], dir, dbPath))
      assert.equal(def.scope, 'directory')
      assert.equal(def.universe.parts, 1)
      assert.deepEqual(def.groups.map((g) => g.command), ['fallo-s1'])

      const all = json(failures(['--all', '--json'], dir, dbPath))
      assert.equal(all.scope, 'all')
      assert.equal(all.project, null)
      assert.equal(all.universe.parts, 4)

      const sub = json(failures(['--session', 's1', '--json'], dir, dbPath))
      assert.equal(sub.scope, 'session')
      assert.equal(sub.session, 's1')
      assert.equal(sub.universe.parts, 2)
      assert.deepEqual(sub.groups.map((g) => g.command).sort(), ['fallo-s1', 'fallo-s2'])

      const missing = failures(['--session', 'no-existe'], dir, dbPath)
      assert.equal(missing.status, 1)
      assert.match(missing.stderr, /no existe la sesion/)
    })
  })

  it('--since filtra por la fecha del fallo', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'viejo', at: Date.parse('2026-10-10T12:00:00Z') })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'nuevo', at: Date.parse('2026-10-21T12:00:00Z') })
      db.close()

      const j = json(failures(['--since', '2026-10-20', '--json'], dir, dbPath))
      assert.equal(j.since, '2026-10-20')
      assert.equal(j.universe.parts, 1)
      assert.deepEqual(j.groups.map((g) => g.command), ['nuevo'])
    })
  })

  it('dos proyectos con la misma etiqueta enmascarada quedan separados y ordenados por projectKey', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      // Insercion invertida a proposito: el orden no debe depender de la lectura.
      addSession(db, { id: 'sb', directory: '/home/bob/proyecto' })
      addSession(db, { id: 'sa', directory: '/home/alice/proyecto' })
      addTool(db, { session_id: 'sb', tool: 'bash', exit: 1, command: 'npm test' })
      addTool(db, { session_id: 'sa', tool: 'bash', exit: 1, command: 'npm test' })
      db.close()

      const j = json(failures(['--all', '--json'], dir, dbPath))
      assert.equal(j.groups.length, 2)
      for (const g of j.groups) {
        assert.equal(g.project, '/home/<user>/proyecto')
        assert.equal(g.parts, 1)
      }
      // Resto de criterios empatados: desempata la clave de proyecto normalizada.
      assert.deepEqual(j.groups.map((g) => g.session_refs[0].id), ['sa', 'sb'])
    })
  })
})

describe('CLI stats failures — invariantes negativos', () => {
  it('enmascara tokens del esqueleto y el tool, sin alterar comandos normales', () => {
    withDir((dir) => {
      const sentinel = 'S3N71N3LMASK'
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      // Tokens estructurales que sobreviven al corte y contienen credenciales.
      for (const token of [`ghp_${sentinel}G`, `sk-${sentinel}S`, `xoxb-${sentinel}X`]) {
        addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: token })
      }
      // Asignaciones con sufijo sensible: regresion del `\b` de maskSensitive,
      // verificada en `tool` (campo que pasa por la misma funcion).
      const toolSecrets = {
        MY_APP_TOKEN: `TOKEN_${sentinel}`,
        SERVICE_SECRET: `SECRET_${sentinel}`,
        SIGNING_KEY: `KEY_${sentinel}`,
        DB_PASSWORD: `PASSWORD_${sentinel}`,
        ROOT_PASSWD: `PASSWD_${sentinel}`
      }
      for (const [name, value] of Object.entries(toolSecrets)) {
        addTool(db, { session_id: 's1', tool: `${name}=${value}`, status: 'error' })
      }
      // Patrones previos intactos.
      addTool(db, { session_id: 's1', tool: `Bearer ${sentinel}B`, status: 'error' })
      addTool(db, { session_id: 's1', tool: `--password=${sentinel}P`, status: 'error' })
      addTool(db, { session_id: 's1', tool: `apikey=${sentinel}A`, status: 'error' })
      // Comandos normales: el masking no los altera.
      addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: 'npm run lint' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: 'git push origin development' })
      db.close()

      const text = failures(['--limit', '50'], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.ok(!text.stdout.includes(sentinel), 'el texto no debe contener el sentinel')
      assert.ok(text.stdout.includes('***'), 'el token enmascarado se muestra')

      const asJson = failures(['--limit', '50', '--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes(sentinel), 'el JSON no debe contener el sentinel')
      const j = JSON.parse(asJson.stdout)

      const envCommands = j.groups.filter((g) => g.class === 'env').map((g) => g.command)
      assert.deepEqual(envCommands.sort(), ['***', 'git push origin development', 'npm run lint'])
      assert.equal(j.groups.find((g) => g.command === '***').parts, 3)

      const tools = j.groups.filter((g) => g.class === 'tool').map((g) => g.tool)
      assert.equal(tools.length, 8)
      for (const expected of [
        'MY_APP_TOKEN=***',
        'SERVICE_SECRET=***',
        'SIGNING_KEY=***',
        'DB_PASSWORD=***',
        'ROOT_PASSWD=***',
        'Bearer ***',
        '--password=***',
        'apikey=***'
      ]) {
        assert.ok(tools.includes(expected), `esperaba tool enmascarado ${expected}`)
      }
    })
  })

  it('enmascara credenciales que abarcan varios tokens del esqueleto', () => {
    withDir((dir) => {
      // Regresion: `Bearer <token>` cruza dos tokens del esqueleto, asi que el
      // masking por token no lo alcanzaba. Se aplica al esqueleto ya unido.
      const bearerSecret = 'abc123'
      const basicSecret = 'dXNlcjpwYXNz'
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, {
        session_id: 's1',
        tool: 'bash',
        exit: 1,
        command: `Authorization: Bearer ${bearerSecret}`
      })
      addTool(db, {
        session_id: 's1',
        tool: 'bash',
        exit: 1,
        command: `Authorization: Basic ${basicSecret}`
      })
      db.close()

      const asJson = failures(['--class', 'check', '--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes(bearerSecret), 'el JSON no expone el token Bearer')
      assert.ok(!asJson.stdout.includes(basicSecret), 'el JSON no expone el token Basic')
      const commands = JSON.parse(asJson.stdout).groups.map((g) => g.command)
      assert.ok(
        commands.includes('Authorization: Bearer ***'),
        `esperaba el comando enmascarado, obtuve ${JSON.stringify(commands)}`
      )

      const text = failures(['--class', 'check'], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.ok(!text.stdout.includes(bearerSecret), 'el texto no expone el token Bearer')
      assert.ok(!text.stdout.includes(basicSecret), 'el texto no expone el token Basic')
      assert.ok(text.stdout.includes('Authorization: Bearer ***'), 'el texto muestra el comando enmascarado')
    })
  })

  it('enmascara Authorization con cualquier esquema, Basic al inicio y Bearer con dos puntos, sin alterar comandos normales', () => {
    withDir((dir) => {
      // El esquema de `Authorization` es libre (ApiKey, Digest, etc.), no solo
      // Bearer/Basic. `Basic <token>` tambien aparece sin el header y
      // `Bearer:<token>` como un unico token. Las reglas standalone solo
      // enmascaran al inicio del esqueleto: no deben tocar comandos normales
      // cuyo segundo token es la palabra `Basic`.
      const apiKeySecret = 'QXBpS2V5VmFsdWU'
      const basicSecret = 'dXNlcjpwYXNz'
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, {
        session_id: 's1',
        tool: 'bash',
        exit: 1,
        command: `Authorization: ApiKey ${apiKeySecret}`
      })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: `Basic ${basicSecret}` })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: `curl Bearer:${basicSecret}` })
      // Casos negativos: comandos normales conservan su esqueleto intacto.
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'deploy Basic configuration' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm run lint' })
      db.close()

      const asJson = failures(['--class', 'check', '--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes(apiKeySecret), 'el JSON no expone el token de ApiKey')
      assert.ok(!asJson.stdout.includes(basicSecret), 'el JSON no expone el token Basic ni el Bearer:<token>')
      const commands = JSON.parse(asJson.stdout).groups.map((g) => g.command)
      for (const expected of [
        'Authorization: ApiKey ***',
        'Basic ***',
        'curl Bearer ***',
        'deploy Basic configuration',
        'npm run lint'
      ]) {
        assert.ok(commands.includes(expected), `esperaba el comando ${expected}, obtuve ${JSON.stringify(commands)}`)
      }

      const text = failures(['--class', 'check'], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.ok(!text.stdout.includes(apiKeySecret), 'el texto no expone el token de ApiKey')
      assert.ok(!text.stdout.includes(basicSecret), 'el texto no expone el token Basic ni el Bearer:<token>')
      for (const expected of [
        'Authorization: ApiKey ***',
        'Basic ***',
        'curl Bearer ***',
        'deploy Basic configuration',
        'npm run lint'
      ]) {
        assert.ok(text.stdout.includes(expected), `el texto muestra ${expected}`)
      }
    })
  })

  it('enmascara Bearer/ApiKey standalone y Basic inicial sin alterar comandos normales', () => {
    withDir((dir) => {
      // Ultima pasada de masking: `Bearer`/`ApiKey` no son palabras normales de
      // comando y se enmascaran en cualquier posicion; `Basic` solo al inicio.
      // `deploy Basic configuration` es un comando normal y conserva su texto.
      const bearerSecret = 'abc123'
      const basicSecret = 'dXNlcjpwYXNz'
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: `echo Bearer ${bearerSecret}` })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: `echo ApiKey ${bearerSecret}` })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'deploy Basic configuration' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: `Basic ${basicSecret}` })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: '--apikey valor' })
      db.close()

      const asJson = failures(['--class', 'check', '--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes(bearerSecret), 'el JSON no expone el token Bearer/ApiKey')
      assert.ok(!asJson.stdout.includes(basicSecret), 'el JSON no expone el token Basic')
      assert.ok(!asJson.stdout.includes('valor'), 'el JSON no expone el valor de --apikey')
      const commands = JSON.parse(asJson.stdout).groups.map((g) => g.command)
      for (const expected of ['echo Bearer ***', 'echo ApiKey ***', 'deploy Basic configuration', 'Basic ***']) {
        assert.ok(commands.includes(expected), `esperaba el comando ${expected}, obtuve ${JSON.stringify(commands)}`)
      }
      // La regla de flags normaliza el separador (`--apikey valor` -> `--apikey=***`,
      // igual que `--password=***`); lo que importa es que nunca expone el valor.
      assert.ok(
        commands.includes('--apikey=***'),
        `esperaba --apikey enmascarado, obtuve ${JSON.stringify(commands)}`
      )

      const text = failures(['--class', 'check'], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      for (const secret of [bearerSecret, basicSecret, 'valor']) {
        assert.ok(!text.stdout.includes(secret), `el texto no expone ${secret}`)
      }
      assert.ok(text.stdout.includes('deploy Basic configuration'), 'el texto conserva el comando normal')
    })
  })

  it('no imprime input de herramientas no-shell y command es null', () => {
    withDir((dir) => {
      const sentinel = 'S3N71N3LINPUT'
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, { session_id: 's1', tool: 'read', status: 'error', input: { filePath: `/privado/${sentinel}` } })
      addTool(db, { session_id: 's1', tool: 'edit', status: 'error', input: { filePath: `/privado/${sentinel}`, oldString: sentinel } })
      addTool(db, { session_id: 's1', tool: 'grep', status: 'error', input: { pattern: sentinel } })
      addTool(db, { session_id: 's1', tool: 'supabase_execute_sql', status: 'error', input: { query: `select '${sentinel}'` } })
      addTool(db, { session_id: 's1', tool: 'task', status: 'error', input: { description: sentinel, prompt: sentinel } })
      db.close()

      const asJson = failures(['--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes(sentinel))
      const j = JSON.parse(asJson.stdout)
      assert.equal(j.groups.length, 5)
      for (const g of j.groups) {
        assert.equal(g.command, null)
        assert.equal(g.class, 'tool')
      }
    })
  })

  it('no vuelca output aunque sea grande y contenga un sentinel', () => {
    withDir((dir) => {
      const sentinel = 'S3N71N3LOUTPUT'
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, {
        session_id: 's1',
        tool: 'bash',
        exit: 1,
        command: 'npm run build',
        output: `${'linea de salida irrelevante\n'.repeat(4000)}${sentinel}`
      })
      db.close()

      const text = failures([], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.ok(!text.stdout.includes(sentinel))

      const asJson = failures(['--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      assert.ok(!asJson.stdout.includes(sentinel))
      assert.equal(JSON.parse(asJson.stdout).groups[0].class, 'check')
    })
  })

  it('abre la base no-WAL en solo lectura: hash, tamaño y mtime de .db no cambian', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm test' })
      db.close()

      const before = fileState(dbPath)
      const r = failures(['--json'], dir, dbPath)
      assert.equal(r.status, 0, r.stderr)
      assert.deepEqual(fileState(dbPath), before)
    })
  })

  it('WAL pendiente: lee filas sin checkpoint y no modifica .db ni -wal (-shm excluido)', () => {
    withDir((dir) => {
      const { db, dbPath, dbBeforeRows } = makePendingWalDb(dir)
      try {
        // El fixture debe dejar las filas realmente en el WAL, no en el .db.
        const walPending = fileState(`${dbPath}-wal`)
        assert.ok(walPending && walPending.size > 0, 'el fixture debe dejar un WAL pendiente')
        assert.equal(db.prepare('PRAGMA wal_autocheckpoint').get().wal_autocheckpoint, 0)
        assert.deepEqual(fileState(dbPath), dbBeforeRows, 'las filas insertadas siguen en el WAL')

        const before = dbFileStates(dbPath)
        const r = failures(['--json'], dir, dbPath)
        assert.equal(r.status, 0, r.stderr)
        const j = JSON.parse(r.stdout)
        // Prueba de que no se abrio con immutable=1: ve las filas pendientes.
        assert.equal(j.universe.parts, 5)
        assert.equal(j.groups[0].command, 'npm test')
        assert.equal(j.groups[0].parts, 5)

        const after = dbFileStates(dbPath)
        assert.deepEqual(after.db, before.db, '.db identico (hash, tamaño, mtime)')
        assert.deepEqual(after.wal, before.wal, '-wal identico (hash, tamaño, mtime)')
        // `-shm` no se asserta: puede actualizar su read-mark (estado transitorio).
      } finally {
        db.close()
      }
    })
  })
})

describe('CLI stats failures — errores de base y flags', () => {
  it('base inexistente o sin tabla part/session falla con exit 1', () => {
    withDir((dir) => {
      const missing = failures([], dir, join(dir, 'no-existe.db'))
      assert.equal(missing.status, 1)
      assert.match(missing.stderr, /no se encontro la base de sesiones de opencode/)

      const dbPath = join(dir, 'sin-part.db')
      const db = new DatabaseSync(dbPath)
      db.exec('CREATE TABLE session (id TEXT, parent_id TEXT, title TEXT, directory TEXT)')
      db.close()
      const noPart = failures([], dir, dbPath)
      assert.equal(noPart.status, 1)
      assert.match(noPart.stderr, /no tiene la tabla part/)

      const noSessionPath = join(dir, 'sin-session.db')
      const noSessionDb = new DatabaseSync(noSessionPath)
      noSessionDb.exec('CREATE TABLE part (id TEXT, session_id TEXT, data TEXT, time_created INTEGER)')
      noSessionDb.close()
      const noSession = failures([], dir, noSessionPath)
      assert.equal(noSession.status, 1)
      assert.match(noSession.stderr, /no tiene la tabla session/)
    })
  })

  it('--class y --tool filtran; --limit recorta y reporta shown/matched (JSON y texto)', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: 'binario-faltante' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 127, command: 'otro-binario-faltante' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm test' })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm run lint' })
      addTool(db, { session_id: 's1', tool: 'read', status: 'error', input: { filePath: '/x' } })
      db.close()

      const env = json(failures(['--class', 'env', '--json'], dir, dbPath))
      assert.equal(env.universe.parts, 5)
      assert.ok(env.groups.length > 0)
      assert.ok(env.groups.every((g) => g.class === 'env'))
      assert.equal(env.matched.parts, 2)

      const tools = json(failures(['--tool', 'read,bash', '--json'], dir, dbPath))
      assert.deepEqual([...new Set(tools.groups.map((g) => g.tool))].sort(), ['bash', 'read'])

      const onlyRead = json(failures(['--tool', 'read', '--json'], dir, dbPath))
      assert.equal(onlyRead.groups.length, 1)
      assert.equal(onlyRead.groups[0].tool, 'read')
      assert.equal(onlyRead.matched.groups, 1)

      const limited = json(failures(['--limit', '1', '--json'], dir, dbPath))
      assert.ok(limited.matched.groups > 1)
      assert.equal(limited.shown, 1)
      assert.equal(limited.groups.length, 1)

      const textCheck = failures(['--class', 'check'], dir, dbPath)
      assert.equal(textCheck.status, 0, textCheck.stderr)
      assert.match(textCheck.stdout, /^check —/m)
      assert.doesNotMatch(textCheck.stdout, /^env —/m)

      const textLimited = failures(['--class', 'env', '--limit', '1'], dir, dbPath)
      assert.equal(textLimited.status, 0, textLimited.stderr)
      assert.match(textLimited.stdout, /\(1 de 2 grupos\)/)
    })
  })

  it('--limit invalido, --since inexistente y flag desconocido fallan con exit 1', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      db.close()
      const zero = failures(['--limit', '0'], dir, dbPath)
      assert.equal(zero.status, 1)
      assert.match(zero.stderr, /--limit requiere un entero >= 1/)
      const unknown = failures(['--foo'], dir, dbPath)
      assert.equal(unknown.status, 1)
      assert.match(unknown.stderr, /opcion desconocida/)
      assert.match(unknown.stderr, /uso: ancleto stats failures/)
      for (const bad of ['2026-02-31', '2026-13-01']) {
        const r = failures(['--since', bad], dir, dbPath)
        assert.equal(r.status, 1, `${bad} debe rechazarse`)
        assert.match(r.stderr, /--since requiere una fecha valida/)
      }
      const valid = failures(['--since', '2026-02-28', '--json'], dir, dbPath)
      assert.equal(valid.status, 0, valid.stderr)
      assert.equal(JSON.parse(valid.stdout).since, '2026-02-28')
    })
  })
})

describe('CLI stats failures — salida vacia y no regresion', () => {
  it('sin fallos informa y sale con exit 0 (texto y JSON)', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 0, command: 'echo ok' })
      db.close()

      const text = failures([], dir, dbPath)
      assert.equal(text.status, 0, text.stderr)
      assert.match(text.stdout, /no hay fallos en el alcance consultado/)

      const asJson = failures(['--json'], dir, dbPath)
      assert.equal(asJson.status, 0, asJson.stderr)
      const j = JSON.parse(asJson.stdout)
      assert.equal(j.ok, true)
      assert.equal(j.universe.groups, 0)
      assert.deepEqual(j.groups, [])
      assert.equal(j.shown, 0)
    })
  })

  it('ancleto stats --json conserva estructura y valores', () => {
    withDir((dir) => {
      const { db, dbPath } = makeDb(dir)
      addSession(db, { id: 's1', title: 'Sesion', directory: dir })
      addTool(db, { session_id: 's1', tool: 'bash', exit: 1, command: 'npm test' })
      db.close()

      const r = run(['stats', '--json'], dir, { ANCLETO_OPENCODE_DB: dbPath })
      assert.equal(r.status, 0, r.stderr)
      const j = JSON.parse(r.stdout)
      assert.equal(j.ok, true)
      assert.equal(j.scope, 'directory')
      assert.equal(j.since, null)
      assert.ok(Array.isArray(j.sessions))
      assert.equal(j.sessions.length, 1)
      assert.equal(j.sessions[0].id, 's1')
      assert.equal(j.sessions[0].title, 'Sesion')
      assert.deepEqual(Object.keys(j.sessions[0].tokens).sort(), [
        'cacheRead',
        'cacheWrite',
        'input',
        'output',
        'reasoning'
      ])
      assert.deepEqual(j.totals, { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })
    })
  })
})
