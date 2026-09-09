// Compile the restricted-token launcher (SandboxRunner.cs) to a Windows x64 exe.
// Required before electron-builder packages resources/sandbox/shentong-sandbox-runner.exe
// (see electron-builder.yml extraResources). Windows-only; csc.exe ships with .NET
// Framework 4.x which is present on Windows dev machines and windows-latest runners.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const root = join(HERE, '..')
const src = join(root, 'resources', 'sandbox', 'SandboxRunner.cs')
const out = join(root, 'resources', 'sandbox', 'shentong-sandbox-runner.exe')

const cscCandidates = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
]
const csc = cscCandidates.find((c) => existsSync(c))
if (!csc) {
  console.error('[build-sandbox-runner] csc.exe not found; cannot build Windows sandbox runner.')
  process.exit(1)
}
if (!existsSync(src)) {
  console.error(`[build-sandbox-runner] source not found: ${src}`)
  process.exit(1)
}
mkdirSync(dirname(out), { recursive: true })
execFileSync(csc, ['/nologo', `/out:${out}`, src], { stdio: 'inherit' })
console.log(`[build-sandbox-runner] wrote ${out}`)