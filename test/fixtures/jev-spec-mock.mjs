// Binario falso determinista de `jev-spec` para la suite offline de `ancleto judge`.
//
// No usa red ni credenciales: el comportamiento lo fija `JEV_MOCK_MODE` y cada spawn
// se registra, cuando `JEV_MOCK_MARKER` apunta a un archivo, con el argv recibido. Las
// escrituras son sincronas (`writeSync`) para que un `process.exit` inmediato no trunque
// la salida sobre un pipe en win32.
import { appendFileSync, writeSync } from 'node:fs'

const MODE = process.env.JEV_MOCK_MODE || 'pass'
const MARKER = process.env.JEV_MOCK_MARKER || ''
const RAW_SLEEP_MS = Number(process.env.JEV_MOCK_SLEEP_MS)
const SLEEP_MS = Number.isFinite(RAW_SLEEP_MS) && RAW_SLEEP_MS >= 0 ? RAW_SLEEP_MS : 700
const argv = process.argv.slice(2)

function out(text) {
  writeSync(1, text)
}

function err(text) {
  writeSync(2, text)
}

// Una linea por spawn: la suite distingue la sonda (`--version`) de la corrida (`check`).
if (MARKER) appendFileSync(MARKER, `${argv.join(' ') || 'check'}\n`)

const wantsVersion = argv.includes('--version')
if (wantsVersion) {
  if (MODE === 'version-broken') {
    err('JEV_MOCK_STDERR:version\n')
    process.exit(1)
  }
  if (MODE !== 'no-version') out('JEV_MOCK_VERSION:0.4.1\n')
  process.exit(0)
}

switch (MODE) {
  case 'fail':
    out('JEV_MOCK_REPORT:fail\n')
    process.exit(1)
  case 'broken':
    err('JEV_MOCK_STDERR:broken\n')
    process.exit(2)
  case 'weird':
    out('JEV_MOCK_REPORT:weird\n')
    process.exit(7)
  case 'sleep':
    // Espera sincrona sin busy-loop: el shell que la lanza es lo que el timeout mata.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SLEEP_MS)
    out('JEV_MOCK_REPORT:late\n')
    process.exit(0)
  default:
    out('JEV_MOCK_REPORT:pass\n')
    process.exit(0)
}
