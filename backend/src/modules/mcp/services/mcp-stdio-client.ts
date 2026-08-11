// mcp-stdio-client.ts —— 用于探测：启动 MCP server 进程，initialize + tools/list
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export interface StdioProbeResult {
  ok: boolean;
  toolCount: number;
  tools: Array<{ name: string; description?: string }>;
  error?: string;
}

interface RpcMessage {
  id?: number;
  method?: string;
  result?: { tools?: Array<{ name: string; description?: string }> };
  error?: { message: string };
}

/** stdout 缓冲上限（1MB），防止聊天式垃圾输出撑爆内存 */
const MAX_STDOUT_BUFFER = 1024 * 1024;

export function buildSpawnArgs(command: string, args: string[] = [], env: Record<string, string> = {}): {
  cmd: string; args: string[]; env: NodeJS.ProcessEnv;
} {
  const base = command.trim().split(/\s+/)[0];
  if (base === 'docker') {
    const subIdx = args.findIndex((a) => !a.startsWith('-'));
    const eArgs: string[] = [];
    for (const [k, v] of Object.entries(env)) eArgs.push('-e', `${k}=${v}`);
    const out = [...args];
    if (subIdx >= 0) out.splice(subIdx + 1, 0, ...eArgs);
    return { cmd: 'docker', args: out, env: { ...process.env } };
  }
  return { cmd: command, args, env: { ...process.env, ...env } };
}

/**
 * 击杀进程树，防止探测结束后残留孤儿进程：
 * - Windows: taskkill /T /F 递归终止整棵进程树
 * - POSIX: spawn 时 detached 使子进程成为进程组长，对负 pid 发 SIGTERM 杀全组
 */
function killTree(child: ChildProcess): void {
  try { if (child.pid == null) return; } catch { return; }
  const pid = child.pid;
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']); } catch { try { child.kill(); } catch {} }
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { try { child.kill(); } catch {} }
  }
}

export function probeStdioServer(opts: { command: string; args?: string[]; env?: Record<string, string>; timeoutMs?: number }): Promise<StdioProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const { cmd, args, env } = buildSpawnArgs(opts.command, opts.args || [], opts.env || {});
  return new Promise((resolve) => {
    let child: ChildProcess | null = null;
    // settled 守卫：所有收尾路径（成功/initialize 错误/tools 错误/超时/提前退出/spawn 失败）只 resolve 一次
    let settled = false;
    const finish = (r: StdioProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killTree(child as ChildProcess);
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ ok: false, toolCount: 0, tools: [], error: `探测超时（${timeoutMs / 1000}s）` }),
      timeoutMs,
    );
    try {
      child = spawn(cmd, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        detached: process.platform !== 'win32',
      });
    } catch (e) {
      finish({ ok: false, toolCount: 0, tools: [], error: (e as Error).message });
      return;
    }
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    const pending = new Map<number, (m: RpcMessage) => void>();
    // 空监听 + write 回调，防止子进程提前关闭 stdin 时未处理 EPIPE 崩溃
    child.stdin?.on('error', () => {});
    const send = (msg: Record<string, unknown>) => {
      try { child!.stdin?.write(JSON.stringify(msg) + '\n', () => {}); } catch { /* EPIPE 忽略，由 exit 收尾 */ }
    };
    const onLine = (line: string) => {
      let msg: RpcMessage;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id); }
    };
    child.stdout?.on('data', (d: Buffer) => {
      buffer += decoder.write(d);
      if (buffer.length > MAX_STDOUT_BUFFER) {
        finish({ ok: false, toolCount: 0, tools: [], error: 'stdout 输出超过 1MB，已中止探测' });
        return;
      }
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx); buffer = buffer.slice(idx + 1);
        if (line.trim()) onLine(line);
      }
    });
    child.stderr?.on('data', () => { /* 忽略 stderr，避免卡 pipe */ });
    child.on('error', (e) => finish({ ok: false, toolCount: 0, tools: [], error: e.message }));
    child.on('close', () => finish({ ok: false, toolCount: 0, tools: [], error: '进程提前退出' }));
    const reqId = 1;
    pending.set(reqId, (m) => {
      if (m.error) { finish({ ok: false, toolCount: 0, tools: [], error: m.error.message }); return; }
      // 严格 server 需要握手：initialize 成功后、tools/list 之前发送 notifications/initialized
      send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      const toolsId = 2;
      pending.set(toolsId, (m2) => {
        if (m2.error) { finish({ ok: false, toolCount: 0, tools: [], error: m2.error.message }); return; }
        const tools = m2.result?.tools || [];
        finish({ ok: true, toolCount: tools.length, tools });
      });
      send({ jsonrpc: '2.0', id: toolsId, method: 'tools/list', params: {} });
    });
    send({ jsonrpc: '2.0', id: reqId, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'shentong-ai', version: '1.0.0' },
    } });
  });
}
