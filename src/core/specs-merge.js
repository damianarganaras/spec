// Merge determinístico de delta specs sobre specs canónicos.
// Módulo puro: no toca disco; el CLI resuelve rutas y escribe.
// Aplica ADDED/MODIFIED/REMOVED/RENAMED por título exacto de `### Requirement:`.

const REQUIREMENT_RE = /^###\s+Requirement:\s*(.*)$/
// Heading indentado: no es un requirement válido y debe fallar cerrado.
const INDENTED_REQUIREMENT_RE = /^\s+###\s+Requirement:/
// Preámbulo H1 opcional al inicio del delta (p. ej. `# Delta: <name>`): un único `#`.
const H1_PREAMBLE_RE = /^#\s/
// Fin de un bloque de requirement: próximo `## ` o `### ` (no `#### Scenario:`).
const BLOCK_BOUNDARY_RE = /^#{2,3}\s/
// Fin de una sección de delta o del `## Requirements` canónico: solo `## `.
const SECTION_BOUNDARY_RE = /^##\s/
const REQUIREMENTS_SECTION_RE = /^##\s+Requirements\s*$/
const SECTION_TYPES = new Map([
  ['## ADDED Requirements', 'ADDED'],
  ['## MODIFIED Requirements', 'MODIFIED'],
  ['## REMOVED Requirements', 'REMOVED'],
  ['## RENAMED Requirements', 'RENAMED']
])
const SECTION_ORDER = ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED']
const FROM_RE = /^-\s*FROM:\s*(.+)$/
const TO_RE = /^-\s*TO:\s*(.+)$/

function normalizeNewlines(text) {
  return String(text).replace(/\r\n?/g, '\n')
}

function splitLines(text) {
  const lines = normalizeNewlines(text).split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function trimBlankLines(lines) {
  let end = lines.length
  while (end > 0 && lines[end - 1].trim() === '') end -= 1
  return lines.slice(0, end)
}

function serializeLines(lines, eol = '\n') {
  return `${trimBlankLines(lines).join(eol)}${eol}`
}

// Separador dominante del archivo: CRLF solo si supera estrictamente a los LF sueltos.
function detectEol(text) {
  const source = String(text)
  const crlf = (source.match(/\r\n/g) || []).length
  const lf = (source.match(/\n/g) || []).length - crlf
  return crlf > lf ? '\r\n' : '\n'
}

// Clave de bloque para comparar contenido ignorando espacios al final de línea.
function blockKey(block) {
  return block.map((line) => line.replace(/[ \t]+$/, '')).join('\n')
}

function findRequirementBlocks(lines) {
  const blocks = []
  for (let i = 0; i < lines.length; i += 1) {
    const match = REQUIREMENT_RE.exec(lines[i])
    if (!match) continue
    let end = i + 1
    while (end < lines.length && !BLOCK_BOUNDARY_RE.test(lines[end])) end += 1
    blocks.push({ title: match[1].trim(), start: i, end, block: trimBlankLines(lines.slice(i, end)) })
    i = end - 1
  }
  return blocks
}

function findRequirementsSectionIndex(lines) {
  return lines.findIndex((line) => REQUIREMENTS_SECTION_RE.test(line))
}

function extractRenameTitle(value) {
  const stripped = String(value).trim().replace(/^`+/, '').replace(/`+$/, '').trim()
  const match = REQUIREMENT_RE.exec(stripped)
  return match ? match[1].trim() : stripped
}

export function parseCanonicalSpec(text) {
  const lines = splitLines(text)
  const blocks = findRequirementBlocks(lines)
  return {
    hasRequirementsSection: findRequirementsSectionIndex(lines) >= 0,
    requirements: blocks.map((entry) => ({
      title: entry.title,
      block: entry.block,
      body: entry.block.slice(1).join('\n').trim()
    }))
  }
}

function collectRequirementOperations(type, lines, operations, errors) {
  let current = null
  const flush = (end) => {
    if (!current) return
    const block = trimBlankLines(lines.slice(current.start, end))
    const body = block.slice(1).join('\n').trim()
    if (type !== 'REMOVED' && body === '') {
      errors.push({ requirement: current.title, reason: `${type} block without body` })
    }
    operations.push({ type, title: current.title, block })
    current = null
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (INDENTED_REQUIREMENT_RE.test(line)) {
      errors.push({ requirement: null, reason: `bloque de delta malformado: ${line.trim()}` })
      continue
    }
    const match = REQUIREMENT_RE.exec(line)
    if (match) {
      flush(i)
      const title = match[1].trim()
      if (title === '') {
        errors.push({ requirement: null, reason: `bloque de delta malformado: ${line}` })
        continue
      }
      current = { title, start: i }
      continue
    }
    if (/^###\s/.test(line)) {
      flush(i)
      errors.push({ requirement: null, reason: 'malformed delta block' })
      continue
    }
    if (!current && line.trim() !== '') {
      errors.push({ requirement: null, reason: 'malformed delta block' })
    }
  }
  flush(lines.length)
}

function collectRenameOperations(lines, operations, errors) {
  let pending = null
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') continue
    const from = FROM_RE.exec(line)
    if (from) {
      if (pending) errors.push({ requirement: pending, reason: 'RENAMED missing TO' })
      pending = extractRenameTitle(from[1])
      continue
    }
    const to = TO_RE.exec(line)
    if (to) {
      if (!pending) {
        errors.push({ requirement: null, reason: 'RENAMED missing FROM' })
        continue
      }
      operations.push({ type: 'RENAMED', from: pending, to: extractRenameTitle(to[1]) })
      pending = null
      continue
    }
    errors.push({ requirement: null, reason: 'malformed delta block' })
  }
  if (pending) errors.push({ requirement: pending, reason: 'RENAMED missing TO' })
}

export function parseDeltaSpec(text) {
  const lines = splitLines(text)
  const operations = []
  const errors = []
  let current = null
  // Preámbulo opcional: líneas en blanco y como máximo un H1 (`# `) al inicio.
  let start = 0
  while (start < lines.length && lines[start].trim() === '') start += 1
  if (start < lines.length && H1_PREAMBLE_RE.test(lines[start])) {
    start += 1
    while (start < lines.length && lines[start].trim() === '') start += 1
  }
  const flushSection = (end) => {
    if (!current) return
    const body = lines.slice(current.start + 1, end)
    if (current.type === 'RENAMED') collectRenameOperations(body, operations, errors)
    else collectRequirementOperations(current.type, body, operations, errors)
    current = null
  }
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]
    if (SECTION_BOUNDARY_RE.test(line)) {
      flushSection(i)
      const type = SECTION_TYPES.get(line.trim())
      if (type) current = { type, start: i }
      else errors.push({ requirement: null, reason: `bloque de delta malformado: ${line}` })
      continue
    }
    if (REQUIREMENT_RE.test(line)) {
      if (!current) errors.push({ requirement: null, reason: `bloque de delta malformado: ${line}` })
      continue
    }
    if (!current && line.trim() !== '') {
      errors.push({ requirement: null, reason: `bloque de delta malformado: ${line}` })
    }
  }
  flushSection(lines.length)
  operations.sort((a, b) => SECTION_ORDER.indexOf(a.type) - SECTION_ORDER.indexOf(b.type))
  return { operations, errors }
}

function applyAdd(lines, op) {
  const matches = findRequirementBlocks(lines).filter((entry) => entry.title === op.title)
  if (matches.length > 1) {
    return { error: { requirement: op.title, reason: 'ADDED matches 2+ requirements' } }
  }
  if (matches.length === 1) {
    if (blockKey(matches[0].block) === blockKey(op.block)) return { lines, applied: false }
    return { error: { requirement: op.title, reason: 'ADDED title already exists with different content' } }
  }
  const sectionIndex = findRequirementsSectionIndex(lines)
  if (sectionIndex < 0) {
    return { error: { requirement: op.title, reason: 'canonical spec has no Requirements section' } }
  }
  let end = sectionIndex + 1
  while (end < lines.length && !SECTION_BOUNDARY_RE.test(lines[end])) end += 1
  let insertAt = end
  while (insertAt > sectionIndex + 1 && lines[insertAt - 1].trim() === '') insertAt -= 1
  const next = [...lines.slice(0, insertAt), '', ...op.block]
  if (insertAt < lines.length) next.push('', ...lines.slice(insertAt))
  return { lines: next, applied: true }
}

function applyModified(lines, op) {
  const matches = findRequirementBlocks(lines).filter((entry) => entry.title === op.title)
  if (matches.length !== 1) {
    return {
      error: {
        requirement: op.title,
        reason: matches.length === 0 ? 'MODIFIED requirement not found' : 'MODIFIED matches 2+ requirements'
      }
    }
  }
  const { start, end, block } = matches[0]
  if (blockKey(block) === blockKey(op.block)) return { lines, applied: false }
  const next = [...lines.slice(0, start), ...op.block]
  if (end < lines.length) next.push('', ...lines.slice(end))
  return { lines: next, applied: true }
}

function applyRemoved(lines, op) {
  const matches = findRequirementBlocks(lines).filter((entry) => entry.title === op.title)
  if (matches.length === 0) return { lines, applied: false }
  if (matches.length > 1) {
    return { error: { requirement: op.title, reason: 'REMOVED matches 2+ requirements' } }
  }
  const { start, end } = matches[0]
  return { lines: [...lines.slice(0, start), ...lines.slice(end)], applied: true }
}

function applyRenamed(lines, op) {
  const blocks = findRequirementBlocks(lines)
  const fromMatches = blocks.filter((entry) => entry.title === op.from)
  const toMatches = blocks.filter((entry) => entry.title === op.to)
  if (op.from === op.to && fromMatches.length === 1) return { lines, applied: false }
  if (fromMatches.length === 0 && toMatches.length === 1) return { lines, applied: false }
  if (fromMatches.length === 1 && toMatches.length === 0) {
    const next = [...lines]
    next[fromMatches[0].start] = `### Requirement: ${op.to}`
    return { lines: next, applied: true }
  }
  if (fromMatches.length === 0 && toMatches.length === 0) {
    return { error: { requirement: op.from, reason: 'RENAMED neither old nor new title found' } }
  }
  if (fromMatches.length > 1 || toMatches.length > 1) {
    return { error: { requirement: op.to, reason: 'RENAMED matches 2+ requirements' } }
  }
  return { error: { requirement: op.from, reason: 'RENAMED both old and new titles present' } }
}

function operationResult(op, lines) {
  if (op.type === 'ADDED') return applyAdd(lines, op)
  if (op.type === 'MODIFIED') return applyModified(lines, op)
  if (op.type === 'REMOVED') return applyRemoved(lines, op)
  return applyRenamed(lines, op)
}

function operationReport(op) {
  const requirement = op.type === 'RENAMED' ? op.to : op.title
  return op.type === 'RENAMED' ? { type: op.type, requirement, from: op.from } : { type: op.type, requirement }
}

export function mergeSpecText(deltaText, canonicalText) {
  const original = String(canonicalText)
  const parsed = parseDeltaSpec(deltaText)
  const errors = parsed.errors.map((error) => ({ ...error }))
  const operations = []
  if (errors.length > 0) return { output: original, operations, errors, changed: false }

  let lines = splitLines(original)
  let appliedAny = false
  for (const op of parsed.operations) {
    const result = operationResult(op, lines)
    if (result.error) {
      errors.push(result.error)
      return { output: original, operations, errors, changed: false }
    }
    lines = result.lines
    if (result.applied) appliedAny = true
    operations.push(operationReport(op))
  }

  if (!appliedAny) return { output: original, operations, errors, changed: false }
  const output = serializeLines(lines, detectEol(original))
  return { output, operations, errors, changed: output !== original }
}
