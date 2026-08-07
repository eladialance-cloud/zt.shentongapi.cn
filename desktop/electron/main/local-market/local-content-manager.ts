// 本地内容管理器：市场内容（技能/插件/工作流/Agent）下载安装到本地
//
// 目录约定（与 service-manager.ts 保持一致）：
//   openclaw-home = userData/openclaw-home（OPENCLAW_HOME）
//   hermes-home   = userData/hermes-home（HERMES_HOME）
//   market        = userData/market（本地清单 + 下载缓存）
//
// 安装策略：staging 目录写入 → 原子 rename → 更新 installed.json
// （沿用 n8n EBUSY/重装修复的原子替换思路，避免半成品）

import { app, dialog } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  MarketItemType,
  InstalledRecord,
} from '../../shared/types';

/** userData 目录（jest 等无 electron 环境时回退 APPDATA，与 runtime-config 一致） */
function userDataDir(): string {
  try {
    return app.getPath('userData');
  } catch {
    return process.env.APPDATA ?? '';
  }
}

/** OpenClaw 数据目录（与 service-manager.ts getOpenClawHome 一致） */
export function getOpenClawHome(): string {
  return path.join(userDataDir(), 'openclaw-home');
}

/** Hermes 数据目录（与 service-manager.ts getHermesHome 一致） */
export function getHermesHome(): string {
  return path.join(userDataDir(), 'hermes-home');
}

function marketRoot(): string {
  return path.join(userDataDir(), 'market');
}

function installedFilePath(): string {
  return path.join(marketRoot(), 'installed.json');
}

/** 读本地清单（损坏时回退空清单） */
function readInstalled(): InstalledRecord[] {
  try {
    const raw = fs.readFileSync(installedFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as InstalledRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 原子写清单（先写 .tmp 再 rename） */
function writeInstalled(records: InstalledRecord[]): void {
  fs.mkdirSync(marketRoot(), { recursive: true });
  const tmp = installedFilePath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf-8');
  fs.renameSync(tmp, installedFilePath());
}

/** 类型对应的本地安装目录 */
function resolveTargetDir(type: MarketItemType, id: number): string {
  switch (type) {
    case 'skill':
      return path.join(getOpenClawHome(), 'skills', String(id));
    case 'plugin':
      return path.join(getOpenClawHome(), 'plugins', String(id));
    case 'workflow':
      return path.join(getHermesHome(), 'workflows', String(id));
    case 'agent':
      return path.join(getHermesHome(), 'agents', String(id));
  }
}

/** 删除目录（先确认路径在 userData 内，防误删） */
function safeRemove(target: string): void {
  const root = path.resolve(userDataDir());
  const resolved = path.resolve(target);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('拒绝删除 userData 之外的路径');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

/** 幂等安装：staging → rename → 清单 */
export async function installMarketItem(
  type: MarketItemType,
  id: number,
  name: string,
  version: string,
  pkg: Record<string, unknown>,
): Promise<{ ok: boolean; dir?: string; error?: string }> {
  try {
    const target = resolveTargetDir(type, id);
    const staging = target + '.staging';
    safeRemove(staging);
    fs.mkdirSync(staging, { recursive: true });

    const payload = (pkg?.payload ?? pkg) as Record<string, unknown>;
    if (type === 'skill') {
      writeSkillFiles(staging, payload.skill as Record<string, unknown>);
    } else if (type === 'plugin') {
      writePluginFiles(staging, payload.plugin as Record<string, unknown>);
    } else if (type === 'workflow') {
      writeWorkflowFiles(staging, payload.workflow as Record<string, unknown>);
    } else if (type === 'agent') {
      writeAgentFiles(staging, payload.agent as Record<string, unknown>);
    } else {
      throw new Error('不支持的内容类型: ' + type);
    }

    // 原子替换旧目录
    safeRemove(target);
    fs.renameSync(staging, target);

    // 更新清单（幂等 upsert）
    const records = readInstalled().filter(
      (r) => !(r.type === type && r.id === id),
    );
    records.unshift({
      type,
      id,
      name: name || String(id),
      version: version || '1.0.0',
      dir: target,
      installedAt: new Date().toISOString(),
    });
    writeInstalled(records);

    return { ok: true, dir: target };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 卸载 */
export async function uninstallMarketItem(
  type: MarketItemType,
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const target = resolveTargetDir(type, id);
    safeRemove(target);
    const records = readInstalled().filter(
      (r) => !(r.type === type && r.id === id),
    );
    writeInstalled(records);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 本地已安装清单 */
export function listInstalled(): InstalledRecord[] {
  return readInstalled();
}

// ---------- 各类型安装内容 ----------

/** 技能包 → SKILL.md + manifest.json（格式与后端 skill-store 一致） */
function writeSkillFiles(dir: string, skill: Record<string, unknown>): void {
  const name = String(skill.name || 'skill');
  const description = String(skill.description || '');
  const frontmatter = `---\nname: ${name}\ndescription: ${description.replace(/\n/g, ' ').slice(0, 200)}\nversion: ${skill.version || '1.0.0'}\n---\n\n${description}\n`;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), frontmatter, 'utf-8');
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify(
      {
        name,
        version: skill.version || '1.0.0',
        execConfig: skill.execConfig ?? null,
        pricePerMinute: skill.pricePerMinute ?? 0,
        category: skill.category ?? null,
        tags: skill.tags ?? [],
        author: skill.author ?? '',
      },
      null,
      2,
    ),
    'utf-8',
  );
}

/** 插件 → plugin.json + 注册到本地 MCP 网关配置（userData/mcp-config.json） */
function writePluginFiles(dir: string, plugin: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(dir, 'plugin.json'),
    JSON.stringify(
      {
        name: plugin.name || 'plugin',
        version: plugin.version || '1.0.0',
        description: plugin.description || '',
        mcpServerUrl: plugin.mcpServerUrl ?? null,
        config: plugin.config ?? {},
      },
      null,
      2,
    ),
    'utf-8',
  );
  // MCP 网关注册（Phase 2 本地执行器读取；网关侧扩展挂载）
  if (plugin.mcpServerUrl) {
    const cfgPath = path.join(userDataDir(), 'mcp-config.json');
    let cfg: { servers?: Record<string, unknown> } = {};
    try {
      cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    } catch {
      cfg = {};
    }
    cfg.servers = cfg.servers ?? {};
    cfg.servers[String(plugin.name || plugin.id)] = {
      url: plugin.mcpServerUrl,
      config: plugin.config ?? {},
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
  }
}

/** 工作流 → workflow.json 留档 + 尽力导入本地 n8n（失败不阻塞安装） */
async function writeWorkflowFiles(dir: string, workflow: Record<string, unknown>): Promise<void> {
  const workflowJson = workflow.workflowJson ?? null;
  fs.writeFileSync(
    path.join(dir, 'workflow.json'),
    JSON.stringify(
      {
        name: workflow.name || 'workflow',
        version: workflow.version || '1.0.0',
        engineType: workflow.engineType || 'n8n',
        category: workflow.category || 'other',
        description: workflow.description || '',
        workflowJson,
        inputSchema: workflow.inputSchema ?? null,
        outputSchema: workflow.outputSchema ?? null,
      },
      null,
      2,
    ),
    'utf-8',
  );
  // 尽力导入本地 n8n（127.0.0.1:5678），失败仅记录 warning
  if (workflowJson && workflow.engineType !== 'coze') {
    try {
      await importWorkflowToN8n(workflowJson as Record<string, unknown>);
    } catch (err) {
      console.warn(
        '[local-market] n8n import skipped (start N8N 后重新导入):',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

/** 调用本地 n8n REST API 导入工作流（N8N_API_KEY 在 service-manager N8N_ENV 注入） */
async function importWorkflowToN8n(workflowJson: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.N8N_API_KEY;
  const base = process.env.N8N_BASE_URL || 'http://127.0.0.1:5678';
  const res = await fetch(base + '/api/v1/workflows', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-N8N-API-KEY': apiKey } : {}),
    },
    body: JSON.stringify(workflowJson),
  });
  if (!res.ok) {
    throw new Error('n8n import HTTP ' + res.status);
  }
}

/** Agent → agent.json（本地 Hermes/OpenClaw 加载） */
function writeAgentFiles(dir: string, agent: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(dir, 'agent.json'),
    JSON.stringify(
      {
        id: agent.id,
        name: agent.name || 'agent',
        displayName: agent.displayName || agent.name || 'agent',
        description: agent.description || '',
        systemPrompt: agent.systemPrompt || '',
        usageExample: agent.usageExample || '',
        modelId: agent.modelId || '',
        pricePerCall: agent.pricePerCall ?? 0,
        category: agent.category || 'other',
        tags: agent.tags ?? [],
        allowedPluginIds: agent.allowedPluginIds ?? [],
        allowedWorkflowIds: agent.allowedWorkflowIds ?? [],
        allowedKnowledgeBaseIds: agent.allowedKnowledgeBaseIds ?? [],
        runtimeType: agent.runtimeType || 'openclaw',
        pricingStrategy: agent.pricingStrategy || 'model',
        modelConfig: agent.modelConfig ?? null,
        outputRule: agent.outputRule || '',
      },
      null,
      2,
    ),
    'utf-8',
  );
}

// ---------- 导出 / 导入（Phase 1 为 JSON 清单包；Phase 3 升级为 zip 并纳入个人知识库） ----------

export async function exportMarketBundle(): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const records = readInstalled();
    const bundle = {
      app: 'shentong-ai-desktop',
      kind: 'market-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      installed: records,
      knowledge: [] as unknown[], // Phase 3：个人知识库目录
    };
    const result = await dialog.showSaveDialog({
      title: '导出本地内容',
      defaultPath: path.join(app.getPath('downloads') || userDataDir(), 'market-export-' + Date.now() + '.json'),
      filters: [{ name: 'Market Export', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    fs.writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function importMarketBundle(): Promise<{ ok: boolean; imported?: number; error?: string }> {
  try {
    const result = await dialog.showOpenDialog({
      title: '导入本地内容',
      filters: [{ name: 'Market Export', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    const bundle = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    if (bundle?.kind !== 'market-export' || !Array.isArray(bundle.installed)) {
      return { ok: false, error: '不是有效的导出文件' };
    }
    const records = readInstalled();
    let imported = 0;
    for (const rec of bundle.installed as InstalledRecord[]) {
      if (!rec?.type || !rec?.id || typeof rec.dir !== 'string') continue;
      // 仅恢复指向 userData 内部且当前存在的目录（防止任意路径注入）
      const root = path.resolve(userDataDir());
      const dir = path.resolve(rec.dir);
      if (!dir.startsWith(root + path.sep) || !fs.existsSync(dir)) continue;
      if (!records.some((r) => r.type === rec.type && r.id === rec.id)) {
        records.push({
          type: rec.type,
          id: rec.id,
          name: rec.name || String(rec.id),
          version: rec.version || '1.0.0',
          dir,
          installedAt: rec.installedAt || new Date().toISOString(),
        });
        imported += 1;
      }
    }
    if (imported > 0) writeInstalled(records);
    return { ok: true, imported };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
