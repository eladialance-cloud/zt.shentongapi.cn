// 运行时下载/安装位置配置
// - 默认根目录：userData/runtime
// - 用户可通过「本地服务管理」页顶部入口自定义根目录，持久化到 userData/runtime-location.json
// - 方案 B：更改位置后不迁移已下载内容，仅对新下载生效

import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

const CONFIG_FILE = "runtime-location.json";

interface RuntimeLocationConfig {
  path?: string;
}

/** userData 目录（jest 等无 electron 环境时回退 APPDATA） */
export function userDataDir(): string {
  try {
    return app.getPath("userData");
  } catch {
    return process.env.APPDATA ?? "";
  }
}

/** 默认运行时根目录 */
export function defaultRuntimeRoot(): string {
  return path.join(userDataDir(), "runtime");
}

/** 配置文件路径 */
export function configFilePath(): string {
  return path.join(userDataDir(), CONFIG_FILE);
}

/** 当前运行时根目录（优先自定义，其次默认） */
export function getRuntimeRoot(): string {
  try {
    const raw = fs.readFileSync(configFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as RuntimeLocationConfig;
    if (parsed.path && typeof parsed.path === "string") {
      const resolved = path.resolve(parsed.path.trim());
      if (path.isAbsolute(resolved) && resolved.length > 0) {
        return resolved;
      }
    }
  } catch {
    // 无配置或配置损坏：使用默认
  }
  return defaultRuntimeRoot();
}

/**
 * 设置运行时根目录（仅持久化路径，不迁移已有内容）
 * - 校验绝对路径
 * - 创建目录 + 写探针验证可写
 */
export function setRuntimeRoot(
  dir: string,
): { ok: boolean; error?: string; path?: string } {
  try {
    const input = dir.trim();
    if (!input || !path.isAbsolute(input)) {
      return { ok: false, error: "必须选择绝对路径" };
    }
    const target = path.resolve(input);
    fs.mkdirSync(target, { recursive: true });
    // 写探针：验证目录可写，避免选到只读位置后下载全部失败
    const probe = path.join(target, `.write-probe-${Date.now()}`);
    fs.writeFileSync(probe, "ok", "utf-8");
    fs.unlinkSync(probe);

    fs.mkdirSync(path.dirname(configFilePath()), { recursive: true });
    fs.writeFileSync(
      configFilePath(),
      JSON.stringify({ path: target }, null, 2),
      "utf-8",
    );
    return { ok: true, path: target };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 运行时目录信息（UI 展示路径 + 磁盘空间） */
export interface RuntimeDirInfo {
  path: string;
  defaultPath: string;
  freeBytes: number;
  totalBytes: number;
  /** 获取目录信息失败时的错误信息（渲染层展示用） */
  error?: string;
}

/** 获取当前运行时目录及其所在磁盘空间 */
export function getRuntimeDirInfo(): RuntimeDirInfo {
  const runtimeRoot = getRuntimeRoot();
  let freeBytes = 0;
  let totalBytes = 0;
  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    const statfs = (fs as unknown as {
      statfsSync?: (p: string) => {
        bsize: number;
        bavail: number;
        blocks: number;
      };
    }).statfsSync;
    if (typeof statfs === "function") {
      const st = statfs(runtimeRoot);
      freeBytes = Number(st.bavail) * Number(st.bsize);
      totalBytes = Number(st.blocks) * Number(st.bsize);
    }
  } catch {
    // 目录暂不可创建或 statfs 不可用：返回 0
  }
  return {
    path: runtimeRoot,
    defaultPath: defaultRuntimeRoot(),
    freeBytes,
    totalBytes,
  };
}
