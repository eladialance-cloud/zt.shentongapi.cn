// 本地 N8N 工作流真执行器（主进程）
//
// 背景：本地 N8N 运行在用户桌面（127.0.0.1:5678），后端服务器无法触达，
// 旧实现由后端返回假成功。这里由桌面端直连本地 N8N webhook 真跑，
// 并把云端 token 注入 payload（与 n8n-run-workflow 技能行为对齐）。

import { app } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const N8N_BASE = process.env.N8N_BASE_URL || 'http://127.0.0.1:5678';

export interface RunN8nWorkflowInput {
  /** 候选 webhook 路径（按序尝试，第一个非 404 即成功） */
  paths: string[];
  /** 工作流输入参数 */
  payload?: unknown;
  /** 总超时（毫秒，默认 120s） */
  timeoutMs?: number;
}

export interface RunN8nWorkflowResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** 命中的 webhook 路径 */
  path?: string;
}

/** 读取云端登录 token（与 n8n-run-workflow 技能一致，供工作流内调用受保护接口） */
function readCloudToken(): string {
  try {
    const dir = app.getPath('userData');
    const authFile = join(dir, 'openclaw-chat', 'auth.json');
    if (!existsSync(authFile)) return '';
    const parsed = JSON.parse(readFileSync(authFile, 'utf8'));
    return typeof parsed?.token === 'string' ? parsed.token : '';
  } catch {
    return '';
  }
}

/** 直连本地 N8N webhook 执行工作流；多个候选路径逐个尝试 */
export async function runLocalN8nWorkflow(
  input: RunN8nWorkflowInput,
): Promise<RunN8nWorkflowResult> {
  const paths = Array.isArray(input?.paths) ? input.paths.map((p) => String(p).replace(/^\/+|\/+$/g, '')).filter(Boolean) : [];
  if (paths.length === 0) {
    return { ok: false, error: '缺少工作流 webhook 路径' };
  }
  const timeoutMs = Math.max(5000, Number(input?.timeoutMs) || 120000);
  const payload = { ...((input?.payload as Record<string, unknown>) || {}) };
  const token = readCloudToken();
  if (token && !payload.token) payload.token = token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let lastError = '';
  try {
    for (const p of paths) {
      const url = N8N_BASE + '/webhook/' + p;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const text = await res.text();
        if (res.status === 404) {
          lastError = '本地 N8N 未激活该工作流或 webhook 路径未注册（' + p + '），请先在桌面端 N8N 工作流页激活后重试';
          continue;
        }
        let data: unknown = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (!res.ok) {
          return { ok: false, error: 'N8N 返回 ' + res.status + ': ' + text.slice(0, 300) };
        }
        // 工作流返回 error 对象视为执行失败
        if (data && typeof data === 'object' && (data as { error?: unknown }).error) {
          const e = (data as { error?: { message?: string } | string }).error;
          const msg = typeof e === 'object' && e && 'message' in e ? (e as { message: string }).message : String(e);
          return { ok: false, error: 'N8N 工作流执行错误: ' + msg };
        }
        return { ok: true, data, path: p };
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return { ok: false, error: '工作流执行超时（超过 ' + Math.round(timeoutMs / 1000) + ' 秒）' };
        }
        lastError = (err as Error)?.message || String(err);
      }
    }
    return {
      ok: false,
      error: lastError || '本地 N8N 不可用（请先在服务管理启动 N8N）',
    };
  } finally {
    clearTimeout(timer);
  }
}