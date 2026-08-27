#!/usr/bin/env node
/**
 * 传旨建任务工具卡（三省六部）
 * 调用方式：node edict-create.mjs --title "<标题>" [--body "<正文>"] [--dept "<部门>"] [--priority "<优先级>"]
 * 依赖环境变量（由桌面端 service-manager 注入到 OpenClaw 进程）：
 *   HERMES_PYTHON - hermes 运行时的 python.exe 绝对路径（kanban 脚本解释器）
 *   EDICT_HOME    - edict 可写运行时根（含 data/tasks_source.json、scripts/kanban_update.py）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, def = '') {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
}

/** 生成 JJC-YYYYMMDD-NNN（与 edict-orchestrator.nextTaskId 同规则） */
function nextTaskId(tasks) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const day = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const prefix = 'JJC-' + day + '-';
  let max = 0;
  for (const t of tasks || []) {
    if (typeof t?.id === 'string' && t.id.startsWith(prefix)) {
      const n = Number(t.id.slice(prefix.length));
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return prefix + String(max + 1).padStart(3, '0');
}

async function main() {
  const title = arg('title').trim();
  if (!title) {
    console.error('缺少 --title 参数（10-30 字中文标题）');
    process.exit(2);
  }
  const body = arg('body').trim();
  const dept = arg('dept').trim();
  const priority = arg('priority').trim();

  const python = process.env.HERMES_PYTHON;
  const home = process.env.EDICT_HOME;
  if (!python || !home || !existsSync(python)) {
    console.error('缺少 Hermes Python 或 EDICT_HOME（Hermes 运行时未安装/未配置）');
    process.exit(3);
  }
  const script = join(home, 'scripts', 'kanban_update.py');
  if (!existsSync(script)) {
    console.error('看板脚本缺失: ' + script);
    process.exit(3);
  }

  // 读取现有看板计算任务 ID（并发写由 kanban_update.py 文件锁兜底）
  let tasks = [];
  const tasksFile = join(home, 'data', 'tasks_source.json');
  try {
    const raw = readFileSync(tasksFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) tasks = parsed;
  } catch {}
  const taskId = nextTaskId(tasks);

  const org = dept || '中书省';
  const official = dept ? org : '中书令';
  const remark = body ? body.slice(0, 100) : '太子整理旨意';
  const args = ['create', taskId, title.slice(0, 80), 'Zhongshu', org, official, remark];

  const r = spawnSync(python, [script, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      EDICT_HOME: home,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      AGENT_ID: 'taizi',
    },
    windowsHide: true,
    timeout: 30000,
  });
  if (r.error) {
    console.error(JSON.stringify({ ok: false, error: '看板脚本启动失败: ' + r.error.message }));
    process.exit(1);
  }
  const text = (r.stdout || r.stderr || '').trim();
  if (r.status !== 0) {
    console.error(JSON.stringify({ ok: false, error: '建任务失败（退出码 ' + r.status + '）: ' + text.slice(0, 300) }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, taskId, title, state: 'Zhongshu' }));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
