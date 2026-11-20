import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.TEMP + '\\memspike'
const HALF_LIFE = 30
const NOW = Date.now()
const db = new DatabaseSync(join(DIR, 'memory.db'), { readOnly: true })
const rules = db.prepare(`SELECT memory_key, content, scope, created_at, confidence FROM memory_nodes WHERE type='rule' AND status='active'`).all()
const byKey = new Map(rules.map((r) => [r.memory_key, r]))
const ageDays = (r) => Math.max(0, (NOW - Date.parse(r.created_at)) / 86400000)
const tokenize = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3)
const ftsQuery = (s) => String(s).trim().split(/\s+/).filter(Boolean).map((t) => '"' + t.replace(/"/g, '""') + '"').join(' ')
const ftsQueryLoose = (s) => [...new Set(tokenize(s))].map((t) => '"' + t.replace(/"/g, '""') + '"*').join(' OR ')
const hitStmt = db.prepare(`SELECT n.memory_key, bm25(memory_fts) AS score FROM memory_fts f JOIN memory_nodes n ON n.rowid=f.rowid WHERE memory_fts MATCH ? AND n.status='active' AND n.type='rule'`)
const ftsHits = (q) => { let r = []; try { r = hitStmt.all(ftsQuery(q)) } catch { r = [] } if (!r.length) { const l = ftsQueryLoose(q); if (l && l !== ftsQuery(q)) try { r = hitStmt.all(l) } catch { r = [] } } return r }
const cmpKey = (a, b) => (a === b ? 0 : a < b ? -1 : 1)
function feats(q) {
  const raw = new Map(ftsHits(q).map((h) => [h.memory_key, Number(h.score)]))
  const v = [...raw.values()]; const mx = v.length ? Math.max(...v) : 0; const mn = v.length ? Math.min(...v) : 0; const sp = mx - mn
  return rules.map((r) => ({ key: r.memory_key, bm25n: raw.has(r.memory_key) ? (sp === 0 ? 1 : (mx - raw.get(r.memory_key)) / sp) : 0, rec: Math.exp((-Math.LN2 * ageDays(r)) / HALF_LIFE), conf: Math.min(Math.max(Number(r.confidence ?? 1), 0), 1) }))
}
const comp = (q, wb, wr, wc) => feats(q).map((f) => ({ k: f.key, s: wb * f.bm25n + wr * f.rec + wc * f.conf })).sort((a, b) => (b.s !== a.s ? b.s - a.s : cmpKey(a.k, b.k))).map((x) => x.k)

const QUERIES = JSON.parse(readFileSync(join(DIR, 'pools.json'), 'utf8'))
const qrels = JSON.parse(readFileSync(join(DIR, 'qrels.json'), 'utf8'))
const byQuery = new Map(); qrels.forEach((x) => { if (!byQuery.has(x.query)) byQuery.set(x.query, []); byQuery.get(x.query).push(x) })
const dcg = (g) => g.reduce((s, x, i) => s + (Math.pow(2, x) - 1) / Math.log2(i + 2), 0)
function ndcg(id, ranked) {
  const rel = byQuery.get(id) || []; const m = new Map(rel.map((x) => [x.key, x.grade]))
  const ideal = rel.map((x) => x.grade).sort((a, b) => b - a).slice(0, 5)
  return dcg(ideal) === 0 ? 0 : dcg(ranked.slice(0, 5).map((k) => m.get(k) || 0)) / dcg(ideal)
}
const ids = Object.keys(QUERIES)

// ---- grid: multiples of 0.25 summing 1 ----
const grid = []
for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4 - a; b++) { const c = 4 - a - b; grid.push([a / 4, b / 4, c / 4]) }
const scoreOf = new Map()
for (const w of grid) {
  const vals = ids.map((id) => ndcg(id, comp(QUERIES[id].q, ...w)))
  scoreOf.set(w.join('/'), { mean: vals.reduce((s, x) => s + x, 0) / vals.length, vals })
}
const ranked = [...scoreOf.entries()].sort((a, b) => b[1].mean - a[1].mean)
console.log('== grid full-set (SESGADO: tuning y eval sobre el mismo set) ==')
for (const [w, v] of ranked.slice(0, 3)) console.log(`  ${w}  nDCG@5=${v.mean.toFixed(4)}`)
console.log('  bottom:', ranked.slice(-2).map(([w, v]) => `${w}=${v.mean.toFixed(4)}`).join('  '))

// ---- LOO: tune on 36, eval on 1 ----
let looSum = 0; const chosen = {}
for (const held of ids) {
  const best = ranked.slice().sort((x, y) => y[1].vals.reduce((s, v, i) => s + (ids[i] === held ? 0 : v), 0) - x[1].vals.reduce((s, v, i) => s + (ids[i] === held ? 0 : v), 0))[0]
  const idx = ids.indexOf(held)
  looSum += best[1].vals[idx]
  chosen[best[0]] = (chosen[best[0]] || 0) + 1
}
console.log(`== LOO nDCG@5 = ${(looSum / ids.length).toFixed(4)} ; pesos elegidos: ${JSON.stringify(chosen)}`)
// LOO for two fixed candidates
for (const w of [[0.5, 0.25, 0.25], [0.5, 0, 0.5], [0.75, 0.25, 0], [1, 0, 0]]) {
  const v = scoreOf.get(w.join('/'))
  console.log(`  fijo ${w.join('/')} -> nDCG@5 ${v.mean.toFixed(4)}`)
}
// sensitivity: mean over all combos with wr>0 vs wr=0
const noRec = grid.filter((w) => w[1] === 0); const withRec = grid.filter((w) => w[1] > 0)
const meanOf = (arr) => arr.reduce((s, w) => s + scoreOf.get(w.join('/')).mean, 0) / arr.length
console.log(`sensibilidad: media(w_rec>0)=${meanOf(withRec).toFixed(4)}  media(w_rec=0)=${meanOf(noRec).toFixed(4)}  spread(rec>0)=${(Math.max(...withRec.map((w) => scoreOf.get(w.join('/')).mean)) - Math.min(...withRec.map((w) => scoreOf.get(w.join('/')).mean))).toFixed(4)}`)

// ---- recency marginal: R1 vs R2 paired ----
const paired = ids.map((id) => ({ id, r1: ndcg(id, comp(QUERIES[id].q, 0.5, 0.25, 0.25)), r2: ndcg(id, comp(QUERIES[id].q, 0.5, 0, 0.5)) }))
const deltas = paired.map((p) => p.r1 - p.r2)
const m = deltas.reduce((s, x) => s + x, 0) / deltas.length
console.log(`== recencia marginal (R1-R2): ΔnDCG medio ${m >= 0 ? '+' : ''}${m.toFixed(4)}  W${deltas.filter((x) => x > 1e-9).length}/L${deltas.filter((x) => x < -1e-9).length}/T${deltas.filter((x) => Math.abs(x) <= 1e-9).length}`)
const temporal = paired.filter((p) => p.id.startsWith('T'))
const td = temporal.map((p) => p.r1 - p.r2)
console.log(`   temporal (n=${temporal.length}): ${temporal.map((p) => `${p.id} ${p.r1.toFixed(3)}/${p.r2.toFixed(3)}`).join('  ')}`)
console.log(`   temporal Δ medio ${(td.reduce((s, x) => s + x, 0) / td.length).toFixed(4)}`)

// ---- per-query worst cases of R0 ----
const r0 = (q) => ftsHits(q).map((h) => ({ ...byKey.get(h.memory_key), score: Number(h.score) })).sort((a, b) => { const an = Number(/^refs:\s*$/m.test(b.content) && /^\s*-\s+(spec|change|path):/m.test(b.content)) - Number(/^refs:\s*$/m.test(a.content) && /^\s*-\s+(spec|change|path):/m.test(a.content)); if (an) return an; const sc = ({ task: 0, feature: 1, project: 2 }[a.scope] ?? 9) - ({ task: 0, feature: 1, project: 2 }[b.scope] ?? 9); if (sc) return sc; if (a.score !== b.score) return a.score - b.score; return cmpKey(a.memory_key, b.memory_key) }).map((x) => x.memory_key)
const worst = ids.map((id) => ({ id, r0: ndcg(id, r0(QUERIES[id].q)), r1: ndcg(id, comp(QUERIES[id].q, 0.5, 0.25, 0.25)) })).sort((a, b) => a.r0 - b.r0)
console.log('== peores R0:', worst.slice(0, 6).map((x) => `${x.id}=${x.r0.toFixed(2)}->${x.r1.toFixed(2)}`).join(' '))
writeFileSync(join(DIR, 'tuning.json'), JSON.stringify({ top3: ranked.slice(0, 3).map(([w, v]) => ({ w, mean: v.mean })), loo: looSum / ids.length, chosen, paired, grid: ranked.map(([w, v]) => ({ w, mean: v.mean })) }, null, 1))
