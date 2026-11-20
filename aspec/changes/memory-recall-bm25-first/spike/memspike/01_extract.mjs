import { DatabaseSync } from 'node:sqlite'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.TEMP + '\\memspike'
const db = new DatabaseSync(join(DIR, 'memory.db'), { readOnly: true })

const schema = db.prepare(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL`).all()
writeFileSync(join(DIR, 'schema.txt'), schema.map((r) => `-- ${r.type} ${r.name}\n${r.sql}`).join('\n\n'))

const cols = db.prepare(`PRAGMA table_info(memory_nodes)`).all()
console.log('COLUMNS:', cols.map((c) => c.name).join(', '))

const counts = db.prepare(`SELECT status, type, count(*) c FROM memory_nodes GROUP BY status, type`).all()
console.log('COUNTS:', JSON.stringify(counts))

const rules = db.prepare(
  `SELECT memory_key, content, scope, created_at, confidence FROM memory_nodes
   WHERE type='rule' AND status='active' ORDER BY created_at`
).all()
writeFileSync(join(DIR, 'rules.json'), JSON.stringify(rules, null, 1))

const now = Date.now()
const ages = rules.map((r) => (now - Date.parse(r.created_at)) / 86400000).sort((a, b) => a - b)
const q = (p) => ages[Math.min(ages.length - 1, Math.floor(p * (ages.length - 1)))]
const confs = rules.map((r) => Number(r.confidence)).sort((a, b) => a - b)
const cq = (p) => confs[Math.min(confs.length - 1, Math.floor(p * (confs.length - 1)))]
const distOf = (a, qf) => ({ min: +a[0].toFixed(4), p25: +qf(0.25).toFixed(2), p50: +qf(0.5).toFixed(2), p75: +qf(0.75).toFixed(2), p90: +qf(0.9).toFixed(2), max: +a[a.length - 1].toFixed(2) })

console.log('N rules:', rules.length)
console.log('age_days:', JSON.stringify(distOf(ages, q)))
console.log('confidence:', JSON.stringify(distOf(confs, cq)))
console.log('conf values:', JSON.stringify(rules.reduce((m, r) => ((m[r.confidence] = (m[r.confidence] || 0) + 1), m), {})))
console.log('scopes:', JSON.stringify(rules.reduce((m, r) => ((m[r.scope] = (m[r.scope] || 0) + 1), m), {})))
console.log('char total:', rules.reduce((s, r) => s + r.content.length, 0))
console.log('char p50/p90/max:', q2(rules.map((r) => r.content.length)))
function q2(a) { const s = [...a].sort((x, y) => x - y); return [s[Math.floor(s.length / 2)], s[Math.floor(s.length * 0.9)], s[s.length - 1]].join('/') }
console.log('decisions active:', db.prepare(`SELECT count(*) c FROM memory_nodes WHERE type='decision' AND status='active'`).get().c)
