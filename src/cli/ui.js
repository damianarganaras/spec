import { setTimeout as sleep } from 'node:timers/promises'

const CYAN = '\x1b[36m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

const CUP = [
  '             █████████████████████████████████',
  '            █████████████████████████████████████',
  '            ██                             ██   ███',
  '             ██                           ██     ██',
  '             ███                         ███    ███',
  '              ███                       █████████',
  '                ███                   ███',
  '          ██████████████████████████████████████',
  '          ███████                      █████████',
  '            ██████████████████████████████████',
  '              ██████████████████████████████'
]

const LOGO = [
  ' ██████  ██    ██  ██████ ██      ███████ ████████  ██████ ',
  '██    ██ ███   ██ ██      ██      ██         ██    ██    ██',
  '████████ ██ █  ██ ██      ██      █████      ██    ██    ██',
  '██    ██ ██  █ ██ ██      ██      ██         ██    ██    ██',
  '██    ██ ██   ███  ██████ ███████ ███████    ██     ██████ '
]

const ART = [...CUP, '', ...LOGO, '']
const TEXT_START = CUP.length + 1

const CUP_PALETTE = ['\x1b[38;5;94m', '\x1b[38;5;130m', '\x1b[38;5;172m', '\x1b[38;5;208m', '\x1b[38;5;214m', '\x1b[38;5;220m', '\x1b[38;5;230m']
const TEXT_PALETTE = ['\x1b[38;5;27m', '\x1b[38;5;33m', '\x1b[38;5;45m', '\x1b[38;5;51m', '\x1b[38;5;201m']

let activeBanner = null

function waveColorIndex(x, y, t, size) {
  const v = Math.sin((x + y) * 0.15 + t)
  return Math.round(((v + 1) / 2) * (size - 1))
}

function renderWaveLine(line, y, t, palette) {
  let out = ''
  let last = -1
  for (let x = 0; x < line.length; x++) {
    const ch = line[x]
    if (ch === ' ') {
      out += ' '
      last = -1
      continue
    }
    const idx = waveColorIndex(x, y, t, palette.length)
    if (idx !== last) {
      out += palette[idx]
      last = idx
    }
    out += ch
  }
  return out + RESET
}

export function stopBanner() {
  if (activeBanner) activeBanner.stop()
}

export function showBanner(delay = 80, duration = 20000) {
  const out = process.stdout

  if (!out.isTTY) {
    for (const line of ART) out.write(line ? `${CYAN}${line}${RESET}\n` : '\n')
    out.write('\n')
    return
  }

  stopBanner()
  const state = { below: 0, stopped: false, hidden: false }
  const restoreCursor = () => {
    if (state.hidden) {
      out.write('\x1b[?25h')
      state.hidden = false
    }
  }
  const stop = () => {
    if (state.stopped) return
    state.stopped = true
    process.removeListener('SIGINT', onSigint)
    restoreCursor()
    if (activeBanner === state) activeBanner = null
  }
  const onSigint = () => {
    stop()
    process.exit(0)
  }
  state.stop = stop
  activeBanner = state

  ;(async () => {
    out.write('\x1b[?25l')
    state.hidden = true
    process.once('SIGINT', onSigint)
    const deadline = Date.now() + duration
    let f = 0
    try {
      while (!state.stopped && Date.now() < deadline) {
        if (f > 0) out.write(`\x1b[${ART.length + state.below}A`)
        for (let y = 0; y < ART.length; y++) {
          const line = ART[y]
          const palette = y >= TEXT_START ? TEXT_PALETTE : CUP_PALETTE
          out.write(`\x1b[2K${line ? renderWaveLine(line, y, f * 0.6, palette) : ''}\n`)
        }
        if (state.below > 0) out.write(`\x1b[${state.below}B`)
        if (state.stopped) break
        f++
        await sleep(delay)
      }
    } finally {
      stop()
    }
  })()
}

export async function selectOption(message, options, initial = 0) {
  const stdin = process.stdin
  const out = process.stdout
  const start = Math.min(Math.max(Number(initial) || 0, 0), options.length - 1)
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') return options[start]

  let index = start
  let rendered = 0
  const draw = () => {
    if (rendered > 0) out.write(`\x1b[${rendered}A`)
    let buf = ''
    for (let i = 0; i < options.length; i++) {
      const pointer = i === index ? `${CYAN}❯${RESET}` : ' '
      const label = i === index ? `${BOLD}${options[i]}${RESET}` : options[i]
      buf += `\x1b[2K  ${pointer} ${label}\n`
    }
    out.write(buf)
    rendered = options.length
  }

  const SIGINT = Symbol('SIGINT')
  let resolveKey
  const key = new Promise((resolve) => { resolveKey = resolve })
  const onData = (chunk) => {
    const s = chunk.toString('utf8')
    if (s === '\u0003') {
      stopBanner()
      resolveKey(SIGINT)
    } else if (s === '\u001b[A') {
      index = (index - 1 + options.length) % options.length
      draw()
    } else if (s === '\u001b[B') {
      index = (index + 1) % options.length
      draw()
    } else if (s === '\r' || s === '\n') {
      resolveKey(options[index])
    }
  }

  let result
  try {
    out.write(`${CYAN}?${RESET} ${BOLD}${message}${RESET}\n`)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
    draw()
    if (activeBanner) activeBanner.below += 1 + options.length
    result = await key
    out.write('\n')
    if (activeBanner) activeBanner.below += 1
  } catch {
    result = undefined
  } finally {
    stdin.removeListener('data', onData)
    try { stdin.setRawMode(false) } catch {}
    stdin.pause()
  }
  if (result === SIGINT) process.exit(0)
  return result === undefined ? options[start] : result
}
