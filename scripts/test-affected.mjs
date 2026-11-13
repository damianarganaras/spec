#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { planTestSelection } from '../src/core/test-selection.js'

// Consumidor del plan de selección de tests. Computa el plan importando el
// módulo puro (sin spawnear el CLI). Sólo ejecuta `selected` cuando el gate es
// `complete === true`; en cualquier otro caso corre la suite completa declarada.
// Nunca interpreta la ausencia del plan como una selección vacía.

const FULL_SUITE = 'test/*.test.js'

function parseArgs(argv) {
  const state = { cwd: process.cwd(), planOnly: false, seeds: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--plan-only' || arg === '--json') {
      state.planOnly = true
      continue
    }
    if (arg === '--cwd') {
      if (i + 1 >= argv.length) return null
      state.cwd = resolve(argv[++i])
      continue
    }
    state.seeds.push(arg)
  }
  return state
}

function run(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' })
  if (result.error) {
    console.error(`ancleto: test-affected: ${result.error.message}`)
    return 1
  }
  return result.status === null ? 1 : result.status
}

const state = parseArgs(process.argv.slice(2))
if (state === null) {
  console.error('ancleto: uso: test-affected [--cwd <dir>] [--plan-only|--json] <semillas...>')
  process.exit(1)
}

const { cwd, planOnly, seeds } = state

if (planOnly) {
  if (seeds.length === 0) {
    // Sin semillas no hay plan: no se emite uno vacío con `reasons: []`, que
    // violaría el invariante `reasons` vacío ⇔ `complete: true`.
    console.error('ancleto: uso: test-affected [--cwd <dir>] [--plan-only|--json] <semillas...>')
    process.exit(1)
  }
  try {
    console.log(JSON.stringify(planTestSelection({ rootDir: cwd, seeds }), null, 2))
    process.exit(0)
  } catch (error) {
    console.error(`ancleto: test-affected: no se pudo computar el plan: ${error.message}`)
    process.exit(1)
  }
}

if (seeds.length === 0) {
  console.error('ancleto: test-affected: sin semillas; se ejecuta la suite completa')
  process.exit(run(['--test', FULL_SUITE], cwd))
}

let plan
try {
  plan = planTestSelection({ rootDir: cwd, seeds })
} catch (error) {
  console.error(`ancleto: test-affected: no se pudo computar el plan: ${error.message}`)
  process.exit(run(['--test', FULL_SUITE], cwd))
}

if (!plan || !Array.isArray(plan.selected)) {
  console.error('ancleto: test-affected: plan ausente; se ejecuta la suite completa')
  process.exit(run(['--test', FULL_SUITE], cwd))
}

if (plan.complete === true && plan.selected.length > 0) {
  process.exit(run(['--test', ...plan.selected], cwd))
}

if (plan.complete === true) {
  console.error('ancleto: test-affected: selección vacía; se ejecuta la suite completa')
} else {
  console.error(`ancleto: test-affected: plan incompleto (${plan.reasons.join(', ') || 'sin razones'}); se ejecuta la suite completa`)
}
process.exit(run(['--test', FULL_SUITE], cwd))
