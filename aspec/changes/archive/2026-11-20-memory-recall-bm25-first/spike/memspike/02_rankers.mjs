import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.TEMP + '\\memspike'
const STAGE = process.argv[2] || 'pool'
const HALF_LIFE = 30
const NOW = Date.now()

// ---- corpus ----
const db = new DatabaseSync(join(DIR, 'memory.db'), { readOnly: true })
const rules = db
  .prepare(
    `SELECT memory_key, content, scope, created_at, confidence FROM memory_nodes
     WHERE type='rule' AND status='active' ORDER BY memory_key`
  )
  .all()
const ageDays = (r) => Math.max(0, (NOW - Date.parse(r.created_at)) / 86400000)

// ---- FTS helpers: replican engine.js (ftsQuery / ftsQueryLoose) ----
const STOPWORDS = new Set([
  'como','cómo','the','a','an','de','del','la','el','los','las','un','una','unos','unas','en','y','o',
  'que','qué','por','para','con','sin','sobre','al','se','su','sus','mi','mis','tu','tus','es','son',
  'era','fue','hay','esta','está','este','estos','to','of','in','on','for','with','and','or','is','are',
  'was','were','be','how','why','when','where','what','which','that','this','these','those'
])
const tokenize = (s) =>
  String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3 && !STOPWORDS.has(t))
const ftsQuery = (s) => {
  const terms = String(s).trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return ''
  return terms.map((t) => '"' + t.replace(/"/g, '""') + '"').join(' ')
}
const ftsQueryLoose = (s) => {
  const terms = tokenize(s)
  if (!terms.length) return ''
  return [...new Set(terms)].map((t) => '"' + t.replace(/"/g, '""') + '"*').join(' OR ')
}

const hitStmt = db.prepare(
  `SELECT n.memory_key, bm25(memory_fts) AS score FROM memory_fts f
   JOIN memory_nodes n ON n.rowid = f.rowid
   WHERE memory_fts MATCH ? AND n.status='active' AND n.type='rule'`
)
function ftsHits(query) {
  let rows = []
  try { rows = hitStmt.all(ftsQuery(query)) } catch { rows = [] }
  if (rows.length === 0) {
    const loose = ftsQueryLoose(query)
    if (loose && loose !== ftsQuery(query)) { try { rows = hitStmt.all(loose) } catch { rows = [] } }
  }
  return rows
}

// ---- R0: orden total de compareRecall (sin required) ----
const SCOPE_RANK = { task: 0, feature: 1, project: 2 }
const scopeRank = (s) => (s in SCOPE_RANK ? SCOPE_RANK[s] : 9)
const declaresAnchor = (content) => /^refs:\s*$/m.test(String(content)) && /^\s*-\s+(spec|change|path):/m.test(String(content))
const cmpKey = (a, b) => (a === b ? 0 : a < b ? -1 : 1)
const byKey = new Map(rules.map((r) => [r.memory_key, r]))

function r0(query) {
  const rows = ftsHits(query)
  return rows
    .map((h) => ({ ...byKey.get(h.memory_key), score: Number(h.score) }))
    .sort((a, b) => {
      const byAnchor = Number(declaresAnchor(b.content)) - Number(declaresAnchor(a.content))
      if (byAnchor !== 0) return byAnchor
      const byScope = scopeRank(a.scope) - scopeRank(b.scope)
      if (byScope !== 0) return byScope
      const sa = Number.isFinite(a.score) ? a.score : 0
      const sb = Number.isFinite(b.score) ? b.score : 0
      if (sa !== sb) return sa - sb
      return cmpKey(a.memory_key, b.memory_key)
    })
    .map((r) => r.memory_key)
}

// ---- features ----
function features(query) {
  const hits = ftsHits(query)
  const raw = new Map(hits.map((h) => [h.memory_key, Number(h.score)]))
  const vals = [...raw.values()]
  const max = vals.length ? Math.max(...vals) : 0
  const min = vals.length ? Math.min(...vals) : 0
  const span = max - min
  const nb = new Map()
  for (const [k, v] of raw) nb.set(k, span === 0 ? 1 : (max - v) / span) // bm25: menor = mejor
  return rules.map((r) => ({
    key: r.memory_key,
    bm25n: nb.has(r.memory_key) ? nb.get(r.memory_key) : 0,
    rec: Math.exp((-Math.LN2 * ageDays(r)) / HALF_LIFE),
    conf: Math.min(Math.max(Number(r.confidence ?? 1), 0), 1),
    age: ageDays(r)
  }))
}
function composite(query, wb, wr, wc) {
  return features(query)
    .map((f) => ({ key: f.key, s: wb * f.bm25n + wr * f.rec + wc * f.conf }))
    .sort((a, b) => (b.s !== a.s ? b.s - a.s : cmpKey(a.key, b.key)))
    .map((x) => x.key)
}
const bm25OnlyRuleKeys = (query) => features(query).map((f) => ({ key: f.key, s: f.bm25n })).sort((a, b) => (b.s !== a.s ? b.s - a.s : cmpKey(a.key, b.key))).map((x) => x.key)
const bm25FtsOnly = (query) => features(query).filter((f) => f.bm25n > 0).map((f) => ({ key: f.key, s: f.bm25n })).sort((a, b) => (b.s !== a.s ? b.s - a.s : cmpKey(a.key, b.key))).map((x) => x.key)
const recencyOnly = () =>
  [...rules].sort((a, b) => (ageDays(a) !== ageDays(b) ? ageDays(a) - ageDays(b) : cmpKey(a.memory_key, b.memory_key))).map((r) => r.memory_key)

// R4: RRF sobre R0 + recency list, k=60
function rrf(query, k = 60) {
  const lists = [r0(query), recencyOnly()]
  const acc = new Map()
  for (const list of lists) list.forEach((key, i) => acc.set(key, (acc.get(key) || 0) + 1 / (k + i + 1)))
  return [...acc.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : cmpKey(a[0], b[0]))).map((x) => x[0])
}

// ---- metrics over top-5 ----
const G = (q, key) => qrelGet(q, key)
function dcg(gains) { return gains.reduce((s, g, i) => s + (Math.pow(2, g) - 1) / Math.log2(i + 2), 0) }
function metrics(query, ranked, qrels) {
  const top = ranked.slice(0, 5)
  const rel = qrels.filter((x) => x.query === query)
  const relMap = new Map(rel.map((x) => [x.key, x.grade]))
  const gains = top.map((k) => relMap.get(k) || 0)
  const ideal = rel.map((x) => x.grade).sort((a, b) => b - a).slice(0, 5)
  const ndcg = dcg(ideal) === 0 ? 0 : dcg(gains) / dcg(ideal)
  const totalRel = rel.filter((x) => x.grade >= 1).length
  const hit = top.filter((k) => (relMap.get(k) || 0) >= 1).length
  const recall = totalRel === 0 ? 0 : hit / Math.min(totalRel, 5)
  let mrr = 0
  for (let i = 0; i < top.length; i++) if ((relMap.get(top[i]) || 0) >= 1) { mrr = 1 / (i + 1); break }
  return { ndcg, recall, mrr }
}
let QRELS = []
function qrelGet() { throw new Error('unused') }

// ---- queries ----
const QUERIES = [
  ['Q01', 'cómo correr la suite de tests de este repo sin falsos fallos'],
  ['Q02', 'qué comandos de validación existen y cuáles no están configurados'],
  ['Q03', 'republicar una versión cuando el registry no refleja el publish'],
  ['Q04', 'cómo bumpear la versión y qué archivos tocar para un release'],
  ['Q05', 'qué modelo usa cada subagente y dónde se configura'],
  ['Q06', 'por qué un agente de proyecto sigue usando el modelo viejo tras cambiarlo'],
  ['Q07', 'cómo reparar referencias rotas de un nodo de memoria'],
  ['Q08', 'qué debe contener el working context que se inyecta al agente'],
  ['Q09', 'un delta spec que modifica un requirement existente, qué debe reescribir'],
  ['Q10', 'por qué un archivo de test no matchea el patrón de exclusión de discovery'],
  ['Q11', 'qué tests correr cuando solo cambié documentación o un json'],
  ['Q12', 'abrir la base sqlite en solo lectura modifica archivos en disco'],
  ['Q13', 'error de base bloqueada al usar node:sqlite'],
  ['Q14', 'un guard de contenido hardcodea una ruta que el archive mueve'],
  ['Q15', 'por qué falla un test de content guard al cambiar el aviso de overflow'],
  ['Q16', 'al archivar, cómo promover decisiones a la memoria sin romper referencias'],
  ['Q17', 'reglas de permisos de bash en subagentes de opencode'],
  ['Q18', 'contar documentos indexados en un índice FTS5 external content'],
  ['Q19', 'copiar archivos sin pisar los existentes en node'],
  ['Q20', 'diferencia entre install, update y upgrade sobre los agentes instalados'],
  ['Q21', 'cómo crear un nuevo comando slash para el proyecto'],
  ['Q22', 'qué evidencia debe incluir un change de tipo fix'],
  ['Q23', 'política de checkpoints y de push con el usuario'],
  ['Q24', 'cuándo se borran físicamente los nodos de memoria reemplazados'],
  ['Q25', 'una referencia path con backslash falla en linux'],
  ['Q26', 'qué gana al integrar origin/main con development'],
  ['Q27', 'por qué el mirror del agente no es idéntico a la canónica'],
  ['Q28', 'el binario global desactualizado al chequear discovery'],
  ['Q29', 'cómo evitar clasificar mal un recorte derivado'],
  ['Q30', 'antes de construir el engine de memoria sobre una base vieja sin tablas'],
  ['Q31', 'construir working context en tests con cwd aislado'],
  ['Q32', 'reviewer sin bash y tester con ledger prearmado en el pipeline'],
  ['T1', 'cuál es la regla más reciente sobre verificar la memoria en solo lectura'],
  ['T2', 'novedades recientes sobre discovery y globs'],
  ['T3', 'lo último que se aprendió sobre el motor de memoria y refs'],
  ['T4', 'regla nueva sobre tests en windows'],
  ['T5', 'qué cambió últimamente en agentes y modelos']
]

if (STAGE === 'pool') {
  const out = {}
  for (const [id, q] of QUERIES) {
    const sets = {
      R0: r0(q).slice(0, 10),
      R1: composite(q, 0.5, 0.25, 0.25).slice(0, 10),
      R2: composite(q, 0.5, 0, 0.5).slice(0, 10),
      R3: recencyOnly().slice(0, 10),
      R4: rrf(q).slice(0, 10)
    }
    const pool = [...new Set(Object.values(sets).flat())].sort()
    out[id] = { q, pool }
    console.log(`${id}: ${q}\n  R0=${sets.R0.slice(0,5).join(' | ')}\n  R1=${sets.R1.slice(0,5).join(' | ')}\n  pool(${pool.length})=${pool.join(', ')}\n`)
  }
  writeFileSync(join(DIR, 'pools.json'), JSON.stringify(out, null, 1))
} else {
  QRELS = JSON.parse(readFileSync(join(DIR, 'qrels.json'), 'utf8'))
  Object.defineProperty(globalThis, '__qrels', { value: QRELS })
  const byQuery = new Map()
  QRELS.forEach((x) => { if (!byQuery.has(x.query)) byQuery.set(x.query, []); byQuery.get(x.query).push(x) })
  // metrics uses module-level qrels via closure: rebind helper
  const qrelGet2 = (query, key) => (byQuery.get(query) || []).find((x) => x.key === key)?.grade || 0
  globalThis.qrelGet = qrelGet2

  const RANKERS = {
    R0: (q) => r0(q),
    R1: (q) => composite(q, +process.env.WB || 0.5, +process.env.WR || 0.25, +process.env.WC || 0.25),
    R2: (q) => composite(q, +process.env.WB2 || 0.4, 0, +(1 - (+process.env.WB2 || 0.4))),
    R3: () => recencyOnly(),
    R4: (q) => rrf(q),
    R5: (q) => bm25FtsOnly(q),
    R6: (q) => bm25OnlyRuleKeys(q)
  }
  const agg = (arr) => {
    const m = arr.reduce((s, x) => s + x, 0) / arr.length
    const sd = Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length)
    return { m, sd }
  }
  const table = {}
  const perQ = {}
  for (const [name, fn] of Object.entries(RANKERS)) {
    const rows = QUERIES.map(([id, q]) => ({ id, ...metrics(id, fn(q), QRELS) }))
    perQ[name] = rows
    table[name] = {
      ndcg: agg(rows.map((r) => r.ndcg)),
      recall: agg(rows.map((r) => r.recall)),
      mrr: agg(rows.map((r) => r.mrr))
    }
  }
  for (const name of Object.keys(table)) {
    if (name === 'R0') continue
    const d = QUERIES.map(([id]) => perQ[name].find((x) => x.id === id).ndcg - perQ.R0.find((x) => x.id === id).ndcg)
    table[name].winN = d.filter((x) => x > 1e-9).length
    table[name].lossN = d.filter((x) => x < -1e-9).length
    table[name].tieN = d.filter((x) => Math.abs(x) <= 1e-9).length
    table[name].deltaNdcg = agg(d)
  }
  const diag = QUERIES.map(([id, q]) => {
    const r0full = new Set(r0(q)); const f = features(q); const unmatched = new Set(f.filter((x) => x.bm25n === 0).map((x) => x.key))
    const top = composite(q, 0.5, 0.25, 0.25).slice(0, 5)
    return { id, inR0: top.filter((k) => r0full.has(k)).length, unmatched: top.filter((k) => unmatched.has(k)).length }
  })
  console.log('DIAG R1 top5: en R0-full medio=' + (diag.reduce((s, d) => s + d.inR0, 0) / diag.length).toFixed(2) + '/5; docs sin match FTS en top5 medio=' + (diag.reduce((s, d) => s + d.unmatched, 0) / diag.length).toFixed(2) + '/5; queries con >=1 sin-match=' + diag.filter((d) => d.unmatched > 0).length)
  writeFileSync(join(DIR, 'diag.json'), JSON.stringify(diag, null, 1))
  writeFileSync(join(DIR, 'eval_result.json'), JSON.stringify({ table, perQ }, null, 1))
  for (const [k, v] of Object.entries(table)) {
    const f = (x) => x.m.toFixed(3) + '±' + x.sd.toFixed(3)
    console.log(`${k}: nDCG@5 ${f(v.ndcg)}  R@5 ${f(v.recall)}  MRR@5 ${f(v.mrr)}` + (v.deltaNdcg ? `  ΔnDCG ${v.deltaNdcg.m >= 0 ? '+' : ''}${v.deltaNdcg.m.toFixed(4)} (W${v.winN}/L${v.lossN}/T${v.tieN})` : ''))
  }
}
