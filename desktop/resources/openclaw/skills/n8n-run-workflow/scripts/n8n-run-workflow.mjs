#!/usr/bin/env node
/**
 * N8N 工作流工具卡执行脚本
 * 流程：云端按工作流定价扣费（0 免费）→ 触发本地 N8N webhook
 * 依赖环境变量（由桌面端 service-manager 注入）：
 *   N8N_API_KEY        - 本地 N8N REST API Key
 *   ST_API_BASE        - 云端 API 地址（默认 https://zt.shentongapi.cn/api）
 *   ST_AUTH_FILE       - 云端登录信息文件（含 token）
 */
import { readFileSync } from 'node:fs';

function arg(name, def = '') {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
}

async function main() {
  const workflowId = arg('workflow-id');
  if (!workflowId) {
    console.error('缺少 --workflow-id 参数');
    process.exit(2);
  }
  const webhookPath = arg('path') || workflowId;
  let payload = {};
  try {
    payload = JSON.parse(arg('payload', '{}'));
  } catch {
    payload = {};
  }

  const apiBase = process.env.ST_API_BASE || 'https://zt.shentongapi.cn/api';

  // 1) 云端记账（已登录即按工作流定价扣费，0 免费；accountingId 已废弃，路由只认 JWT）
  let token = '';
  try {
    token = (JSON.parse(readFileSync(process.env.ST_AUTH_FILE, 'utf8')).token) || '';
  } catch {}
  if (token) {
    const r = await fetch(apiBase + '/chat/accounting/tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ workflowId: Number(workflowId) }),
    });
    if (!r.ok) {
      const t = (await r.text()).slice(0, 200);
      if (r.status === 401) throw new Error('未登录或离线，请先在桌面端登录并联网');
      throw new Error('余额不足或扣费失败: ' + t);
    }
  }

  // 2) 触发本地 N8N webhook
  const base = process.env.N8N_BASE_URL || 'http://127.0.0.1:5678';
  const r2 = await fetch(base + '/webhook/' + webhookPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': process.env.N8N_API_KEY || '',
    },
    body: JSON.stringify(payload),
  });
  if (!r2.ok) {
    throw new Error('N8N API ' + r2.status + ': ' + (await r2.text()).slice(0, 300));
  }
  const data = await r2.json().catch(() => null);
  console.log(JSON.stringify(data ?? {}));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
