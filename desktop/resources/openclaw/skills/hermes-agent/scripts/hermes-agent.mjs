#!/usr/bin/env node
/**
 * Hermes Agent 工具卡执行脚本
 * 调用方式：node hermes-agent.mjs --task "<任务描述>"
 * 依赖环境变量（由桌面端 service-manager 注入到 OpenClaw 进程）：
 *   HERMES_NODE     - hermes 运行时的 node.exe 绝对路径
 *   HERMES_ENTRY    - hermes-agent 包 bin/hermes.js 绝对路径
 *   HERMES_PYTHON   - hermes 运行时的 python.exe 绝对路径
 *   HERMES_HOME     - hermes 数据目录（配置/凭证复用）
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

function arg(name, def = '') {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
}

/** 输出契约：要求 Hermes 以「项目总监」身份拆解指派，最终只输出单行 JSON（团队驱动执行） */
const OUTPUT_RULE =
  ' 你是项目总监：任务描述前会附上可用团队成员清单（角色+人设摘要）。' +
  '有合适成员时：把任务拆成步骤并指派给最合适的成员，每个 step 必须带 assigneeName（成员角色名）与 assigneeMemberId。' +
  '没有合适成员或团队为空时：用你自己的子代理团队执行，step 不写 assigneeName。' +
  '最终回复必须是单行JSON，不要输出任何其他文字。' +
  '格式: {"summary":"结论","steps":[{"name":"步骤","status":"done","assigneeName":"成员名","assigneeMemberId":1}],"outputs":[{"type":"text|image|video","content":"文本"或"url":"URL"}],"status":"completed"}。' +
  '失败时输出 {"status":"failed","summary":"原因","error":"详情"}。';

async function main() {
  const requireJson = process.argv.includes('--require-json');
  const task = (arg('task') + (requireJson ? OUTPUT_RULE : '')).trim();
  if (!task.trim()) {
    console.error('缺少 --task 参数');
    process.exit(2);
  }
  const nodeBin = process.env.HERMES_NODE;
  const entry = process.env.HERMES_ENTRY;
  if (!nodeBin || !entry || !existsSync(nodeBin) || !existsSync(entry)) {
    console.error('Hermes 运行时未安装或未配置（HERMES_NODE/HERMES_ENTRY 缺失）');
    process.exit(3);
  }

  const env = { ...process.env };
  if (process.env.HERMES_PYTHON) env.HERMES_PYTHON = process.env.HERMES_PYTHON;
  if (process.env.HERMES_HOME) env.HERMES_HOME = process.env.HERMES_HOME;

  // 静默单查询模式：-Q 只输出最终回复与 session 信息；--source tool 不污染用户会话列表
  const args = ['chat', '-q', task, '-Q', '--source', 'tool'];

  const child = spawn(nodeBin, [entry, ...args], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });

  // 长任务保护：5 分钟超时 → kill 子进程 + 降级提示（不静默失败）
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { child.kill(); } catch {}
  }, 5 * 60 * 1000);

  const code = await new Promise((resolve) => child.on('exit', resolve));
  clearTimeout(timer);

  if (timedOut) {
    // 超时降级：返回可读提示，让上层 Agent 自行拆分重试
    console.log('Hermes 编排超时（5 分钟），建议将任务拆分为更小的子任务后重试。');
    process.exit(124);
  }

  if (code !== 0) {
    const detail = (stderr || stdout).trim().slice(-600);
    throw new Error('Hermes 执行失败: ' + (detail || '未知错误'));
  }
  const text = stdout.trim();
  console.log(text || '(Hermes 无输出)');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
