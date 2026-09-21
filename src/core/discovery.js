import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DISCOVERY_MAP_FILE = '.discovery-map.json'
export const TOPOLOGY_IGNORED_DIRS = ['node_modules', '.git', '.ancleto', 'dist', 'build', 'coverage']

function countFilesRecursive(dir, ignored) {
  let n = 0
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (ignored.has(e.name)) continue
      n += countFilesRecursive(p, ignored)
    } else if (e.isFile()) {
      n += 1
    }
  }
  return n
}

export function buildTopologyMap(rootDir) {
  const ignored = new Set(TOPOLOGY_IGNORED_DIRS)
  const tree_summary = {}
  const root_files = []
  let total = 0
  let entries
  try {
    entries = readdirSync(rootDir, { withFileTypes: true })
  } catch {
    entries = []
  }
  for (const e of entries) {
    if (ignored.has(e.name)) continue
    if (e.isDirectory()) {
      const n = countFilesRecursive(join(rootDir, e.name), ignored)
      tree_summary[e.name] = n
      total += n
    } else if (e.isFile()) {
      root_files.push(e.name)
      total += 1
    }
  }
  root_files.sort()
  return {
    last_updated: new Date().toISOString(),
    total_files: total,
    tree_summary,
    root_files
  }
}

export function writeDiscoveryMap(rootDir) {
  const map = buildTopologyMap(rootDir)
  writeFileSync(join(rootDir, DISCOVERY_MAP_FILE), JSON.stringify(map, null, 2) + '\n')
  return map
}
