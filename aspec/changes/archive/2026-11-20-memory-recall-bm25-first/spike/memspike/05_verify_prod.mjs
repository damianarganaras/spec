import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.TEMP + '\\memspike'
const url = pathToFileURL('D:\\Repos D\\Proyectos\\ancleto\\spec\\src\\core\\memory\\engine.js').href
const { createReadonlyMemoryEngine } = await import(url)
const engine = createReadonlyMemoryEngine(join(DIR, 'memory.db'))
const pools = JSON.parse(readFileSync(join(DIR, 'pools.json'), 'utf8'))
const ids = ['Q01', 'Q03', 'Q05', 'Q10', 'Q18', 'Q26', 'T4', 'Q31']
for (const id of ids) {
  const rows = engine.searchMemory({ query: pools[id].q, type: 'rule', limit: 5 })
  console.log(id, rows.map((r) => r.memory_key).join(' | '))
}
