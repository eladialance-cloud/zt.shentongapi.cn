import * as fs from 'node:fs'
import * as path from 'node:path'
import { relocateHermesRuntime } from './desktop/electron/main/hermes-runtime-relocate'

const root = 'D:\\二次开发\\.hermes-relocate-test\\hermes'
const agent = path.join(root, 'node_modules', 'hermes-agent')
const src = path.join(agent, 'runtime', 'hermes-agent')
const venv = path.join(src, 'venv')
const sp = path.join(venv, 'Scripts')
const site = path.join(venv, 'Lib', 'site-packages')
const mp = path.join(agent, 'runtime', 'python', 'cpython-3.11-windows-x86_64-none')

const r1 = relocateHermesRuntime(root)
console.log('run1 relocated:', r1.relocated)

// DLLs copied?
for (const dll of ['python311.dll', 'python3.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']) {
  const dst = path.join(sp, dll)
  if (!fs.existsSync(dst)) throw new Error(`FAIL: ${dll} not copied`)
  if (fs.statSync(dst).size !== fs.statSync(path.join(mp, dll)).size) throw new Error(`FAIL: ${dll} size mismatch`)
}
console.log('DLLs copied: OK')

// python.exe replaced
if (fs.statSync(path.join(sp, 'python.exe')).size !== 91648) throw new Error('FAIL: python.exe not replaced')
console.log('python.exe replaced: OK')

// pyvenv home
const cfg = fs.readFileSync(path.join(venv, 'pyvenv.cfg'), 'utf8')
const home = /^home\s*=\s*(.+)$/m.exec(cfg)?.[1]?.trim()
if (home !== mp) throw new Error(`FAIL: home ${home}`)
console.log('pyvenv home: OK')

// finder
for (const f of fs.readdirSync(site).filter((x) => x.startsWith('__editable__') && x.endsWith('.py'))) {
  const c = fs.readFileSync(path.join(site, f), 'utf8')
  if (c.includes('Temp\\hermes-portable-build')) throw new Error('FAIL: finder old path remains')
}
console.log('finder: OK')

// launcher patch
const lp = fs.readFileSync(path.join(agent, 'lib', 'python-launcher.js'), 'utf8')
if (!lp.includes('HERMES_PORTABLE_RELOCATED') || !lp.includes('"-m", "hermes_cli.main"')) throw new Error('FAIL: launcher patch')
console.log('launcher patch: OK')

// idempotent second run
const r2 = relocateHermesRuntime(root)
console.log('run2 relocated:', r2.relocated)
if (r2.relocated) throw new Error('FAIL: second run should be no-op')
console.log('ALL TESTS PASSED')
