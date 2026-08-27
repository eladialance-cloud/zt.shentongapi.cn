// 三省六部端到端联调（真机/沙箱通用）：真实 edict-orchestrator.ts + 真实 Hermes CLI + 真实 kanban_update.py
// 运行：npx tsx scripts/e2e-edict-pipeline.ts
// 环境变量（可选，缺省用开发环境路径）：
//   E2E_PY          - kanban 解释器 python.exe
//   E2E_KANBAN      - kanban_update.py 绝对路径
//   E2E_EDICT_HOME  - EDICT_HOME（看板数据根）
//   E2E_HERMES_EXE  - hermes.exe（venv 内）或任意 hermes CLI
//   E2E_HERMES_HOME - HERMES_HOME（全局 config.yaml + profiles/）
//   E2E_TASKS       - tasks_source.json 绝对路径
import { spawn, execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { edictIssue, edictRunPipeline, edictBoard, edictStats, type EdictDeps } from '../electron/main/edict-orchestrator';

const PY = process.env.E2E_PY || 'C:/Users/Administrator/AppData/Local/Temp/hermes-portable-build-0.20.5/node_modules/hermes-agent/runtime/python/cpython-3.11.15-windows-x86_64-none/python.exe';
const KANBAN = process.env.E2E_KANBAN || 'D:/二次开发/desktop/runtime/edict-t2-test/scripts/kanban_update.py';
const EDICT_HOME = process.env.E2E_EDICT_HOME || 'D:/二次开发/desktop/runtime/edict-t2-test';
const HERMES_EXE = process.env.E2E_HERMES_EXE || 'C:/Users/Administrator/AppData/Local/Temp/hermes-portable-build-0.20.5/node_modules/hermes-agent/runtime/hermes-agent/venv/Scripts/hermes.exe';
const HERMES_HOME = process.env.E2E_HERMES_HOME || 'D:/二次开发/desktop/runtime/hermes-home-test';
const TASKS = process.env.E2E_TASKS || 'D:/二次开发/desktop/runtime/edict-t2-test/data/tasks_source.json';

function spawnCollect(cmd: string, args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (err: Error) => resolve({ code: -1, stdout, stderr: err.message }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

const deps: EdictDeps = {
  spawnKanban: async (args, envExtra) => {
    const scriptArgs = args.length > 1 ? args.slice(1) : args;
    return spawnCollect(PY, [KANBAN, ...scriptArgs], {
      EDICT_HOME, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', AGENT_ID: envExtra?.AGENT_ID || 'taizi',
    });
  },
  runHermes: async (profileId, prompt) => {
    const r = await spawnCollect(HERMES_EXE, ['-p', profileId, 'chat', '-q', prompt, '-Q', '--source', 'tool'], {
      HERMES_HOME, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1',
    });
    if (r.code !== 0) throw new Error(`Hermes exit ${r.code}: ${(r.stderr || r.stdout).slice(0, 400)}`);
    return r.stdout.trim();
  },
  readBoard: () => {
    try { const d = JSON.parse(fs.readFileSync(TASKS, 'utf-8')); return Array.isArray(d) ? d : []; } catch { return []; }
  },
  writeBoard: (tasks) => { fs.writeFileSync(TASKS, JSON.stringify(tasks, null, 2), 'utf-8'); return tasks; },
  now: () => Date.now(),
  log: (msg) => console.log('[e2e] ' + msg),
};

async function main() {
  fs.writeFileSync(TASKS, '[]', 'utf-8');
  const issue = await edictIssue(deps, { title: '端到端联调测试旨意', body: '验证三省六部全链路', dept: '中书省' });
  console.log('ISSUE:', JSON.stringify(issue));
  if (!issue.ok) { process.exit(1); }
  const taskId = issue.data!.taskId;
  const run = await edictRunPipeline(deps, taskId);
  console.log('PIPELINE_OK:', run.ok);
  if (!run.ok) { console.log('PIPELINE_ERR:', JSON.stringify(run.error)); }
  console.log('STEPS:', JSON.stringify(run.ok ? run.data?.steps ?? [] : [], null, 1));
  const board = edictBoard(deps);
  console.log('BOARD:', JSON.stringify(board.tasks.map((t: any) => ({ id: t.id, state: t.state, org: t.org })), null, 1));
  console.log('STATS:', JSON.stringify(edictStats(deps)));
}
main().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
