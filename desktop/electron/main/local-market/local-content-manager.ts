// 本地内容管理器：市场内容（技能/插件/工作流/Agent）下载安装到本地
//
// 目录约定（与 service-manager.ts 保持一致）：
//   openclaw-home = userData/openclaw-home（OPENCLAW_HOME）
//   hermes-home   = userData/hermes-home（HERMES_HOME）
//   market        = userData/market（本地清单 + 下载缓存）
//
// 安装策略：staging 目录写入 → 原子 rename → 更新 installed.json
// （沿用 n8n EBUSY/重装修复的原子替换思路，避免半成品）

import { app, dialog, net } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  MarketItemType,
  MarketSource,
  InstalledRecord,
  MarketItemDetail,
} from '../../shared/types';
import { extractTarGz } from '../runtime-downloader';

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
function resolveTargetDir(type: MarketItemType, id: number | string): string {
  switch (type) {
    case 'skill':
      return path.join(getOpenClawHome(), 'skills', String(id));
    case 'plugin':
      return path.join(getOpenClawHome(), 'plugins', String(id));
    case 'workflow':
      return path.join(getHermesHome(), 'workflows', String(id));
    case 'agent':
      return path.join(getHermesHome(), 'agents', String(id));
    case 'mcp':
      return path.join(getHermesHome(), 'mcp', String(id));
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
    } else if (type === 'mcp') {
      writeMcpFiles(staging, payload.mcp as Record<string, unknown>);
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
  id: number | string,
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
/** 按类型+id 读取本地详情(我的详情页) */
export function getInstalledDetail(
  type: MarketItemType,
  id: number | string,
): { ok: boolean; detail?: MarketItemDetail; error?: string } {
  try {
    const record = readInstalled().find(
      (r) => r.type === type && String(r.id) === String(id),
    );
    if (!record) return { ok: false, error: '未找到本地记录' };
    const source: MarketSource = record.source ?? 'official';
    const dir = record.dir;
    const base = {
      type,
      id: record.id,
      name: record.name,
      version: record.version,
      dir,
      source,
      installedAt: record.installedAt,
      description: '',
    };
    if (type === 'skill') {
      const markdown = fs.existsSync(path.join(dir, 'SKILL.md'))
        ? fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8')
        : '';
      let manifest: Record<string, unknown> = {};
      try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8')); } catch { manifest = {}; }
      return { ok: true, detail: { ...base, description: String(manifest.description || ''), detail: { markdown, manifest } } };
    }
    if (type === 'agent') {
      let agent: Record<string, unknown> = {};
      try { agent = JSON.parse(fs.readFileSync(path.join(dir, 'agent.json'), 'utf-8')); } catch { agent = {}; }
      return { ok: true, detail: { ...base, description: String(agent.description || ''), detail: agent } };
    }
    if (type === 'workflow') {
      let workflow: Record<string, unknown> = {};
      try { workflow = JSON.parse(fs.readFileSync(path.join(dir, 'workflow.json'), 'utf-8')); } catch { workflow = {}; }
      return { ok: true, detail: { ...base, description: String(workflow.description || ''), detail: workflow } };
    }
    if (type === 'plugin') {
      let plugin: Record<string, unknown> = {};
      try { plugin = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf-8')); } catch { plugin = {}; }
      return { ok: true, detail: { ...base, description: String(plugin.description || ''), detail: plugin } };
    }
    if (type === 'mcp') {
      let mcp: Record<string, unknown> = {};
      try { mcp = JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf-8')); } catch { mcp = {}; }
      return { ok: true, detail: { ...base, description: String(mcp.description || ''), detail: mcp } };
    }
    return { ok: false, error: '不支持的类型: ' + type };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 从名称生成稳定的字符串 id(slug + 冲突时加时间戳) */
function makeCustomId(name: string): string {
  const slug = String(name || 'custom')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'custom';
  const exists = readInstalled().some((r) => String(r.id) === slug);
  return exists ? slug + '-' + Date.now().toString(36) : slug;
}

/** 自定义导入:选择本地目录或文件,校验后复制到本地内容目录并登记(source=custom) */
export async function importCustomDir(
  type: MarketItemType,
): Promise<{ ok: boolean; record?: InstalledRecord; error?: string }> {
  try {
    const markerByType: Record<MarketItemType, string> = {
      skill: 'SKILL.md',
      plugin: 'plugin.json',
      workflow: 'workflow.json',
      agent: 'agent.json',
      mcp: 'mcp.json',
    };
    const typeName: Record<MarketItemType, string> = {
      skill: '技能包',
      plugin: '插件',
      workflow: '工作流',
      agent: 'Agent',
      mcp: 'MCP 服务',
    };
    const result = await dialog.showOpenDialog({
      title: '导入' + typeName[type],
      properties: ['openDirectory', 'openFile', 'showHiddenFiles'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    const src = result.filePaths[0];
    const isFile = fs.statSync(src).isFile();
    const markerName = markerByType[type];
    let name = path.basename(src);
    let contentDir = src;
    if (isFile) {
      if (path.basename(src).toLowerCase() !== markerName.toLowerCase()) {
        return { ok: false, error: '文件必须是 ' + markerName };
      }
      name = path.basename(path.dirname(src));
      try {
        if (type === 'skill') {
          const md = fs.readFileSync(src, 'utf-8');
          const m = md.match(/^name:\s*(.+)$/m);
          if (m) name = m[1].trim();
        } else {
          const parsed = JSON.parse(fs.readFileSync(src, 'utf-8'));
          if (parsed && typeof parsed.name === 'string') name = parsed.name;
        }
      } catch { /* 保持默认 */ }
    } else {
      const marker = path.join(src, markerName);
      if (!fs.existsSync(marker)) return { ok: false, error: '目录中缺少 ' + markerName };
      contentDir = src;
      try {
        if (type === 'skill') {
          const md = fs.readFileSync(marker, 'utf-8');
          const m = md.match(/^name:\s*(.+)$/m);
          if (m) name = m[1].trim();
        } else {
          const parsed = JSON.parse(fs.readFileSync(marker, 'utf-8'));
          if (parsed && typeof parsed.name === 'string') name = parsed.name;
        }
      } catch { /* 保持默认 */ }
    }
    const id = makeCustomId(name);
    const target = resolveTargetDir(type, id);
    safeRemove(target);
    fs.cpSync(contentDir, target, { recursive: true });
    const record: InstalledRecord = {
      type,
      id,
      name,
      version: '1.0.0',
      dir: target,
      installedAt: new Date().toISOString(),
      source: 'custom',
    };
    const records = readInstalled().filter(
      (r) => !(r.type === type && String(r.id) === String(id)),
    );
    records.unshift(record);
    writeInstalled(records);
    return { ok: true, record };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 登记对话中 OpenClaw 安装的内容(source=chat),幂等 */
export function registerChatInstalled(
  type: MarketItemType,
  id: number | string,
  name: string,
  version: string,
  dir: string,
): { ok: boolean; error?: string } {
  try {
    const records = readInstalled();
    if (records.some((r) => r.type === type && path.resolve(r.dir) === path.resolve(dir))) {
      return { ok: true };
    }
    records.unshift({
      type,
      id,
      name: name || String(id),
      version: version || '1.0.0',
      dir: path.resolve(dir),
      installedAt: new Date().toISOString(),
      source: 'chat',
    });
    writeInstalled(records);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 更新:备份旧目录 → 复用安装流程 → 失败回滚 */
export async function updateMarketItem(
  type: MarketItemType,
  id: number | string,
  name: string,
  version: string,
  pkg: Record<string, unknown>,
): Promise<{ ok: boolean; dir?: string; error?: string }> {
  const target = resolveTargetDir(type, id);
  const backup = target + '.backup-' + Date.now();
  let backupMade = false;
  if (fs.existsSync(target)) {
    try {
      fs.cpSync(target, backup, { recursive: true });
      backupMade = true;
    } catch (err) {
      return { ok: false, error: '备份旧版本失败: ' + (err instanceof Error ? err.message : String(err)) };
    }
  }
  const result = await installMarketItem(type, Number(id), name, version, pkg);
  if (!result.ok) {
    if (backupMade) {
      try {
        safeRemove(target);
        fs.cpSync(backup, target, { recursive: true });
      } catch { /* 回滚失败仅记录 */ }
    }
    return result;
  }
  if (backupMade) {
    try { safeRemove(backup); } catch { /* 忽略 */ }
  }
  return result;
}

function readNameFromDir(
  type: MarketItemType,
  markerPath: string,
  fallback: string,
): string {
  try {
    if (type === 'skill') {
      const md = fs.readFileSync(markerPath, 'utf-8');
      const m = md.match(/^name:\s*(.+)$/m);
      if (m) return m[1].trim();
    } else {
      const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
      if (parsed && typeof parsed.name === 'string') return parsed.name;
    }
  } catch { /* 忽略 */ }
  return fallback;
}

/** 扫描本地运行时目录,把 OpenClaw/Hermes 已安装但未登记的内容补登记(source=chat) */
export function syncChatInstalled(): { ok: boolean; added?: number; error?: string } {
  try {
    const roots: Array<{ type: MarketItemType; root: string; marker: string }> = [
      { type: 'skill', root: path.join(getOpenClawHome(), 'skills'), marker: 'SKILL.md' },
      { type: 'plugin', root: path.join(getOpenClawHome(), 'plugins'), marker: 'plugin.json' },
      { type: 'workflow', root: path.join(getHermesHome(), 'workflows'), marker: 'workflow.json' },
      { type: 'agent', root: path.join(getHermesHome(), 'agents'), marker: 'agent.json' },
      { type: 'mcp', root: path.join(getHermesHome(), 'mcp'), marker: 'mcp.json' },
    ];
    const records = readInstalled();
    let added = 0;
    for (const { type, root, marker } of roots) {
      if (!fs.existsSync(root)) continue;
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(root, entry.name);
        const markerPath = path.join(dir, marker);
        if (!fs.existsSync(markerPath)) continue;
        if (records.some((r) => r.type === type && path.resolve(r.dir) === path.resolve(dir))) continue;
        const name = readNameFromDir(type, markerPath, entry.name);
        records.unshift({
          type,
          id: entry.name,
          name,
          version: '1.0.0',
          dir,
          installedAt: new Date().toISOString(),
          source: 'chat',
        });
        added += 1;
      }
    }
    if (added > 0) writeInstalled(records);
    return { ok: true, added };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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

/** MCP 服务 → mcp.json（官方目录信息；用户 env 由后端 mcp_servers 管理） */
function writeMcpFiles(dir: string, mcp: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mcp.json'), JSON.stringify(mcp ?? {}, null, 2), 'utf-8');
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


/** 下载文件到磁盘（Electron net.fetch 自动跟随 302 重定向；手动超时 120s） */
async function downloadArchive(url: string, dest: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await net.fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
  } finally {
    clearTimeout(timer);
  }
}

/** 递归查找包含 SKILL.md 的目录（优先浅层命中） */
function findSkillDir(root: string): string | null {
  if (fs.existsSync(path.join(root, 'SKILL.md'))) return root;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(root, d.name));
  for (const d of dirs) {
    if (fs.existsSync(path.join(d, 'SKILL.md'))) return d;
  }
  for (const d of dirs) {
    const nested = findSkillDir(d);
    if (nested) return nested;
  }
  return null;
}

/** 复制目录全部内容（源 → 目标） */
function copyDirContents(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirContents(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** GitHub 仓库默认分支探测（API 可访问时返回 default_branch；404/限流/网络异常返回 null，不影响下载尝试） */
async function resolveDefaultBranch(owner: string, repo: string): Promise<string | null> {
  try {
    const res = await net.fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'GET',
      headers: { 'User-Agent': 'shentong-ai-desktop', Accept: 'application/vnd.github+json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { default_branch?: string };
    return typeof data?.default_branch === 'string' && data.default_branch ? data.default_branch : null;
  } catch {
    return null;
  }
}

/** 生成按优先级排序的 GitHub 归档下载 URL（纯函数，便于单测）：
 *  探测到的默认分支 → main → master → HEAD（默认分支兜底，GitHub 自动解析） */
export function buildGithubArchiveUrls(
  candidates: Array<{ owner: string; repo: string }>,
  defaultBranches?: Record<string, string>,
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => { if (!seen.has(u)) { seen.add(u); urls.push(u); } };
  for (const c of candidates) {
    if (!c || !c.owner || !c.repo) continue;
    const key = c.owner + '/' + c.repo;
    const branch = defaultBranches?.[key];
    if (branch) push(`https://github.com/${c.owner}/${c.repo}/archive/refs/heads/${branch}.tar.gz`);
    push(`https://github.com/${c.owner}/${c.repo}/archive/refs/heads/main.tar.gz`);
    push(`https://github.com/${c.owner}/${c.repo}/archive/refs/heads/master.tar.gz`);
    push(`https://github.com/${c.owner}/${c.repo}/archive/HEAD.tar.gz`);
  }
  return urls;
}

/** GitHub 开源技能直连下载安装：
 *  先探测候选仓库默认分支，再按 默认分支 → main → master → HEAD 依次尝试下载 tar.gz，
 *  解压后定位含 SKILL.md 的目录，安装到 openclaw-home/skills/<sourceId> 并登记 installed.json(source=github)
 */
export async function installGithubSkill(
  sourceId: number,
  name: string,
  candidates: Array<{ owner: string; repo: string; defaultBranch?: string }>,
): Promise<{ ok: boolean; dir?: string; error?: string }> {
  try {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { ok: false, error: '该技能没有可用的下载地址（仓库解析失败）' };
    }
    const target = path.join(getOpenClawHome(), 'skills', String(sourceId));
    const staging = target + '.staging';
    safeRemove(staging);
    fs.mkdirSync(staging, { recursive: true });
    const tmp = path.join(marketRoot(), '.tmp');
    fs.mkdirSync(tmp, { recursive: true });

    // 优先用后端校验时已写入的 defaultBranch（免一次 api.github.com 探测，国内网络更稳）；
    // 缺失的再逐个探测：仓库不存在（404）提前跳过；API 失败走 main/master/HEAD 兜底
    const defaultBranches: Record<string, string> = {};
    const unprobed: Array<{ owner: string; repo: string }> = [];
    for (const c of candidates) {
      if (!c || !c.owner || !c.repo) continue;
      if (c.defaultBranch) defaultBranches[c.owner + '/' + c.repo] = c.defaultBranch;
      else unprobed.push(c);
    }
    await Promise.all(unprobed.map(async (c) => {
      const branch = await resolveDefaultBranch(c.owner, c.repo);
      if (branch) defaultBranches[c.owner + '/' + c.repo] = branch;
    }));
    const urls = buildGithubArchiveUrls(candidates, defaultBranches);
    if (urls.length === 0) {
      return { ok: false, error: '该技能没有可用的仓库候选' };
    }

    let lastErr = '';
    let installed = false;
    for (let i = 0; i < urls.length && !installed; i++) {
      const archive = path.join(tmp, `skill-${sourceId}-${Date.now()}-${i}.tar.gz`);
      const extractRoot = path.join(tmp, `skill-${sourceId}-${Date.now()}-${i}`);
      try {
        await downloadArchive(urls[i], archive);
        fs.mkdirSync(extractRoot, { recursive: true });
        await extractTarGz(archive, extractRoot);
        const skillDir = findSkillDir(extractRoot);
        if (!skillDir) throw new Error('压缩包内未找到 SKILL.md');
        copyDirContents(skillDir, staging);
        installed = true;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      } finally {
        safeRemove(extractRoot);
        try { fs.unlinkSync(archive); } catch { /* ignore */ }
      }
    }
    if (!installed) {
      safeRemove(staging);
      throw new Error(`所有下载源均失败: ${lastErr}（已尝试: ${urls.join(', ')}）`);
    }
    if (!fs.existsSync(path.join(staging, 'SKILL.md'))) {
      safeRemove(staging);
      throw new Error('安装内容缺少 SKILL.md');
    }

    safeRemove(target);
    fs.renameSync(staging, target);
    const records = readInstalled().filter((r) => !(r.type === 'skill' && r.id === sourceId));
    records.unshift({
      type: 'skill',
      id: sourceId,
      name: name || String(sourceId),
      version: '1.0.0',
      dir: target,
      source: 'github',
      installedAt: new Date().toISOString(),
    });
    writeInstalled(records);
    return { ok: true, dir: target };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
