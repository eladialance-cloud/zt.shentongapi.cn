/**
 * 飞书平台设置（feishu-settings）
 *
 * 对标 RRClaw 的「平台设置 → 飞书开放平台」：
 *  - App ID / App Secret 存取走 credential-store（加密落盘，绝不写入明文配置）
 *  - 测试连接：真实调用 tenant_access_token 接口校验凭证
 *  - 触发/查询多维表格初始化（委托 feishu-bitable）
 *
 * 依赖注入（credentialStore/deps）便于单测。
 */
import { ipcMain } from "electron";
import { FeishuClient } from "./feishu-client";
import type { FeishuResult } from "./feishu-client";

export const FEISHU_APP_ID_CREDENTIAL = "feishu.appId";
export const FEISHU_APP_SECRET_CREDENTIAL = "feishu.appSecret";

export interface FeishuSettingsDeps {
  getCredential: (key: string) => string | null;
  setCredential: (key: string, plain: string) => void;
  deleteCredential: (key: string) => void;
  /** 可注入 fetch（单测） */
  fetchImpl?: typeof fetch;
}

export interface FeishuSettingsView {
  configured: boolean;
  appId: string;
  /** 是否已保存 App Secret（不回传明文） */
  hasSecret: boolean;
}

/** 掩码展示 App ID（保留前 6 后 4） */
function maskSecret(v: string): string {
  if (!v) return "";
  if (v.length <= 6) return "******";
  return v.slice(0, 3) + "******" + v.slice(-2);
}

export function getFeishuSettings(deps: FeishuSettingsDeps): FeishuSettingsView {
  const appId = deps.getCredential(FEISHU_APP_ID_CREDENTIAL) ?? "";
  const secret = deps.getCredential(FEISHU_APP_SECRET_CREDENTIAL) ?? "";
  return { configured: !!appId && !!secret, appId, hasSecret: !!secret };
}

/**
 * 保存飞书凭证。appSecret 为空字符串时表示「不修改」，仅更新 App ID。
 */
export function saveFeishuSettings(
  deps: FeishuSettingsDeps,
  input: { appId?: string; appSecret?: string },
): { ok: boolean; error?: string } {
  try {
    const appId = typeof input.appId === "string" ? input.appId.trim() : "";
    const appSecret = typeof input.appSecret === "string" ? input.appSecret.trim() : "";
    if (appId) deps.setCredential(FEISHU_APP_ID_CREDENTIAL, appId);
    else if (input.appId !== undefined) deps.deleteCredential(FEISHU_APP_ID_CREDENTIAL);
    if (appSecret) deps.setCredential(FEISHU_APP_SECRET_CREDENTIAL, appSecret);
    else if (input.appSecret !== undefined && input.appSecret === "") {
      // 显式清空
      deps.deleteCredential(FEISHU_APP_SECRET_CREDENTIAL);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 构建客户端（读取已存凭证） */
export function buildFeishuClient(deps: FeishuSettingsDeps): FeishuClient | null {
  const appId = deps.getCredential(FEISHU_APP_ID_CREDENTIAL) ?? "";
  const appSecret = deps.getCredential(FEISHU_APP_SECRET_CREDENTIAL) ?? "";
  if (!appId || !appSecret) return null;
  return new FeishuClient({ appId, appSecret, fetchImpl: deps.fetchImpl });
}

/** 测试连接：真实获取 tenant_access_token */
export async function testFeishuConnection(
  deps: FeishuSettingsDeps,
): Promise<FeishuResult<{ appId: string; tokenMask: string }>> {
  const client = buildFeishuClient(deps);
  if (!client) return { ok: false, error: "飞书凭证未配置，请先填写 App ID / App Secret" };
  const res = await client.getTenantAccessToken(true);
  if (!res.ok || !res.data) return { ok: false, error: res.error || "连接失败", code: res.code };
  const view = getFeishuSettings(deps);
  return { ok: true, data: { appId: view.appId, tokenMask: maskSecret(res.data) } };
}

export interface FeishuSettingsIpcDeps extends FeishuSettingsDeps {
  /** 初始化多维表格（由 index.ts 注入 feishu-bitable 实现，避免循环依赖） */
  initTables: () => Promise<unknown>;
}

/** 注册 feishu:* IPC（唯一真源见 shared/ipc-channels.ts） */
export function registerFeishuIpc(deps: FeishuSettingsIpcDeps): () => void {
  ipcMain.handle("feishu:get-settings", () => getFeishuSettings(deps));
  ipcMain.handle("feishu:save-settings", (_e, input: unknown) =>
    saveFeishuSettings(deps, (input as { appId?: string; appSecret?: string }) ?? {}),
  );
  ipcMain.handle("feishu:test-connection", () => testFeishuConnection(deps));
  ipcMain.handle("feishu:init-tables", () => deps.initTables());

  return () => {
    for (const ch of ["feishu:get-settings", "feishu:save-settings", "feishu:test-connection", "feishu:init-tables"]) {
      try {
        ipcMain.removeHandler(ch);
      } catch {
        // 忽略
      }
    }
  };
}
