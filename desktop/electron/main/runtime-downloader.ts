// 在线运行时下载器 - 当内置本地服务运行时损坏或缺失时，从 CDN 下载补丁到用户数据目录
//
// 实现说明（Task 3 - 内置本地服务运行时 spec）：
// - manifest.json 来自 process.resourcesPath/runtime/（打包）或 process.cwd()/runtime/（开发）
// - 下载临时文件存放于 userData/runtime/.tmp/<service>-<version>.tar.gz
// - 支持断点续传：发送 Range: bytes=<existingSize>-，以追加模式写入
// - 进度回调每秒最多一次（记录上次 emit 时间戳）
// - 下载完成后 SHA-256 校验 + 解压 + 更新本地 manifest 版本号
// - 失败自动重试（最多 3 次，间隔 5 秒），重试时复用已下载部分
// - cancelDownload() 通过 AbortController 终止请求，保留临时文件以便下次续传

import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import * as crypto from "node:crypto";
import { createGunzip } from "node:zlib";
import type { WriteStream } from "node:fs";
import type { ServiceName } from "../shared/types";

export interface DownloadProgress {
  /** 进度百分比 0-100 */
  percent: number;
  /** 下载速率 KB/s */
  speedKBs: number;
  /** 预计剩余秒数 */
  etaSec: number;
}

/** 单个服务的 manifest 定义 */
interface ServiceManifest {
  version: string;
  displayName: string;
  port: number;
  entry: Record<string, string>;
  downloadUrl: Record<string, string>;
  sha256: Record<string, string>;
}

/** manifest.json 完整结构 */
interface RuntimeManifest {
  version: string;
  services: Record<ServiceName, ServiceManifest>;
}

const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 5000;
const PROGRESS_EMIT_INTERVAL_MS = 1000;

/** 各服务下载的 AbortController（用于 cancelDownload） */
const downloadControllers: Map<ServiceName, AbortController> = new Map();
/** 各服务取消标记 */
const cancelFlags: Set<ServiceName> = new Set();

/** 计算平台 key，例如 win32-x64 / darwin-arm64 */
function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

/** 内置 manifest 路径（打包后 process.resourcesPath/runtime/，开发环境 process.cwd()/runtime/） */
function builtinManifestPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "runtime", "manifest.json");
  }
  return path.join(process.cwd(), "runtime", "manifest.json");
}

/** 读取内置 manifest */
function readBuiltinManifest(): RuntimeManifest | null {
  try {
    const p = builtinManifestPath();
    const content = fs.readFileSync(p, "utf-8");
    return JSON.parse(content) as RuntimeManifest;
  } catch (err) {
    console.error("[runtime-downloader] read builtin manifest failed:", err);
    return null;
  }
}

/** userData 下的 runtime 根目录 */
function userDataRuntimeDir(): string {
  return path.join(app.getPath("userData"), "runtime");
}

/** 临时下载目录 */
function tmpDir(): string {
  return path.join(userDataRuntimeDir(), ".tmp");
}

/** 临时下载文件路径 */
function tmpFilePath(name: ServiceName, version: string): string {
  return path.join(tmpDir(), `${name}-${version}.tar.gz`);
}

/** 服务目标安装目录 */
function serviceInstallDir(name: ServiceName): string {
  return path.join(userDataRuntimeDir(), name);
}

/**
 * 下载并安装服务运行时到 userData 目录
 *
 * @returns 成功返回 true；失败或被取消返回 false
 */
/**
 * 流式解压 .tar.gz（纯 Node 实现，不依赖系统 tar / shell）
 * - 支持 ustar prefix、GNU 长文件名（L）、PAX 扩展头（x/g）、目录/文件冲突“后者胜出”
 * - 名字以 / 结尾的条目按目录处理（tar 惯例，即使 typeflag 为 0）
 * - 拒绝绝对路径与 .. 穿越，防解压路径逃逸
 * - 内存有界：文件内容按 chunk 直接写盘；元数据条目跨 chunk 有状态机保持对齐
 */
function extractTarGz(
  tarGzPath: string,
  destDir: string,
  onProgress?: (extractedEntries: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const source = fs.createReadStream(tarGzPath);
    const gunzip = createGunzip();

    let buf: Buffer = Buffer.alloc(0);
    let offset = 0;
    let outStream: WriteStream | null = null;
    let outRemaining = 0;
    let padRemaining = 0;
    let metaRemaining = 0;
    let metaKind: string | null = null;
    let metaSize = 0;
    let metaChunks: Buffer[] = [];
    let pendingName: string | null = null;
    let pax: Record<string, string> | null = null;
    let eof = false;
    let settled = false;
    let entries = 0;
    let activeStreams = 0;

    const cleanup = () => {
      source.destroy();
      gunzip.destroy();
      if (outStream) {
        try {
          outStream.destroy();
        } catch {
          // ignore
        }
        outStream = null;
      }
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const done = () => {
      if (settled) return;
      if (activeStreams > 0) return; // 等待最后一批文件 flush 完成
      settled = true;
      cleanup();
      resolve();
    };

    const parseOctal = (b: Buffer, start: number, len: number): number => {
      // 支持 base-256 编码（首位 0x80）
      if (b[start] & 0x80) {
        let value = 0;
        for (let i = start + 1; i < start + len; i++) {
          value = value * 256 + b[i];
        }
        return value;
      }
      const s = b.toString("ascii", start, start + len).trim();
      if (!s) return 0;
      const value = parseInt(s, 8);
      return Number.isNaN(value) ? 0 : value;
    };

    const safeTarget = (entryName: string): string => {
      const normalized = entryName.replace(/\\/g, "/");
      if (
        normalized.startsWith("/") ||
        /^[A-Za-z]:/.test(normalized) ||
        normalized.split("/").includes("..")
      ) {
        throw new Error(`归档条目包含不安全路径: ${entryName}`);
      }
      return path.join(destDir, ...normalized.split("/").filter(Boolean));
    };

    // 目录/文件同名冲突时“后者胜出”，与系统 tar 行为一致
    const ensureDir = (target: string) => {
      if (fs.existsSync(target)) {
        const st = fs.lstatSync(target);
        if (!st.isDirectory()) fs.unlinkSync(target);
      }
      fs.mkdirSync(target, { recursive: true });
    };
    const ensureWritableFile = (target: string) => {
      if (fs.existsSync(target)) {
        const st = fs.lstatSync(target);
        if (st.isDirectory()) fs.rmdirSync(target, { recursive: true });
      }
    };

    const processBuffer = () => {
      while (true) {
        // 元数据条目（L/x/g/K）数据消费：跨 chunk 保持状态，防止错位
        if (metaRemaining > 0) {
          if (offset >= buf.length) return;
          const take = Math.min(metaRemaining, buf.length - offset);
          metaChunks.push(buf.subarray(offset, offset + take));
          offset += take;
          metaRemaining -= take;
          if (metaRemaining > 0) return;
          const full = Buffer.concat(metaChunks);
          metaChunks = [];
          if (metaKind === "L") {
            pendingName = full.toString("utf8", 0, metaSize).replace(/\0[\s\S]*$/, "");
          } else if (metaKind === "x" || metaKind === "X") {
            pax = pax || {};
            for (const line of full.toString("utf8", 0, metaSize).split("\n")) {
              const m = /^\d+ ([^=]+)=(.*)$/.exec(line);
              if (m) pax[m[1]] = m[2];
            }
          }
          metaKind = null;
          continue;
        }

        // 文件数据写入
        if (outStream) {
          if (outRemaining > 0) {
            if (offset >= buf.length) return;
            const want = Math.min(outRemaining, buf.length - offset);
            outStream.write(buf.subarray(offset, offset + want));
            offset += want;
            outRemaining -= want;
            if (outRemaining > 0) return;
          }
          outStream.end();
          outStream = null;
        }

        // 512 对齐填充
        if (padRemaining > 0) {
          const take = Math.min(padRemaining, buf.length - offset);
          offset += take;
          padRemaining -= take;
          if (padRemaining > 0) return;
        }

        // header 解析
        if (buf.length - offset < 512) return;
        const header = buf.subarray(offset, offset + 512);
        offset += 512;
        if (header.every((b) => b === 0)) {
          if (buf.length - offset >= 512) {
            const next = buf.subarray(offset, offset + 512);
            offset += 512;
            if (next.every((b) => b === 0)) {
              eof = true;
              done();
              return;
            }
            continue;
          }
          offset -= 512;
          return;
        }

        const typeflag = String.fromCharCode(header[156]);
        let entryName = header.toString("utf8", 0, 100).replace(/\0[\s\S]*$/, "");
        const prefix = header
          .toString("utf8", 345, 500)
          .replace(/\0[\s\S]*$/, "");
        if (prefix) entryName = `${prefix}/${entryName}`;
        const size = parseOctal(header, 124, 12);
        const paddedSize = Math.ceil(size / 512) * 512;

        if (
          typeflag === "L" ||
          typeflag === "x" ||
          typeflag === "X" ||
          typeflag === "g" ||
          typeflag === "K"
        ) {
          metaRemaining = paddedSize;
          metaKind = typeflag;
          metaSize = size;
          metaChunks = [];
          continue;
        }

        let finalName = pendingName ?? entryName;
        pendingName = null;
        if (pax && pax.path) finalName = pax.path;
        let finalSize = size;
        if (pax && pax.size !== undefined) {
          const paxSize = parseInt(pax.size, 10);
          if (!Number.isNaN(paxSize)) finalSize = paxSize;
        }
        pax = null;

        // 目录判定：显式目录类型，或名字以 / 结尾（tar 惯例，即使 typeflag 为 0）
        const isDir = typeflag === "5" || typeflag === "D" || finalName.endsWith("/");
        const isLink = ["1", "2", "3", "4", "6", "7", "S"].includes(typeflag);

        if (isDir) {
          if (buf.length - offset < paddedSize) return;
          offset += paddedSize;
          try {
            ensureDir(safeTarget(finalName));
          } catch (err) {
            fail(`创建目录失败: ${err instanceof Error ? err.message : String(err)}`);
            return;
          }
          continue;
        }
        if (isLink) {
          if (buf.length - offset < paddedSize) return;
          offset += paddedSize;
          continue;
        }

        // 普通文件
        let target: string;
        try {
          target = safeTarget(finalName);
          ensureWritableFile(target);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          outStream = fs.createWriteStream(target);
        } catch (err) {
          fail(`创建文件失败: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        activeStreams++;
        outStream.on("error", (err) =>
          fail(`写入文件失败: ${err instanceof Error ? err.message : String(err)}`),
        );
        outStream.on("close", () => {
          activeStreams--;
          if (settled) return;
          if (eof && activeStreams === 0) {
            cleanup();
            resolve();
          }
        });
        outRemaining = finalSize;
        padRemaining = (512 - (finalSize % 512)) % 512;
        entries++;
        if (entries % 1000 === 0) onProgress?.(entries);
      }
    };

    source.on("error", (err) =>
      fail(`读取压缩包失败: ${err instanceof Error ? err.message : String(err)}`),
    );
    gunzip.on("error", (err) =>
      fail(`gzip 解压失败: ${err instanceof Error ? err.message : String(err)}`),
    );
    gunzip.on("data", (chunk: Buffer) => {
      if (offset > 0) {
        if (offset === buf.length) buf = chunk;
        else buf = Buffer.concat([buf.subarray(offset), chunk]);
        offset = 0;
      } else {
        buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      }
      try {
        processBuffer();
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    });
    gunzip.on("end", () => {
      try {
        processBuffer();
        if (settled) return;
        const rest = buf.subarray(offset);
        if (rest.every((b) => b === 0)) {
          eof = true;
          done();
          return;
        }
        fail("归档数据不完整（缺少结束标记）");
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    });
    source.pipe(gunzip);
  });
}

export async function download(
  name: ServiceName,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<boolean> {
  const manifest = readBuiltinManifest();
  if (!manifest) return false;

  const service = manifest.services?.[name];
  if (!service) {
    console.error(
      `[runtime-downloader] service "${name}" not found in manifest`,
    );
    return false;
  }

  const key = platformKey();
  const url = service.downloadUrl?.[key];
  const expectedSha256 = service.sha256?.[key] ?? "";
  if (!url) {
    console.error(`[runtime-downloader] no downloadUrl for ${name} on ${key}`);
    return false;
  }

  // 准备临时目录
  try {
    fs.mkdirSync(tmpDir(), { recursive: true });
  } catch (err) {
    console.error("[runtime-downloader] mkdir tmp failed:", err);
    return false;
  }

  const tmpFile = tmpFilePath(name, service.version);
  cancelFlags.delete(name);
  const controller = new AbortController();
  downloadControllers.set(name, controller);

  try {
    let attempt = 0;
    let success = false;
    while (attempt < MAX_RETRIES && !success) {
      if (cancelFlags.has(name)) {
        console.log(
          `[runtime-downloader] ${name} cancelled before attempt ${attempt + 1}`,
        );
        return false;
      }
      attempt++;
      try {
        success = await downloadOnce(
          url,
          tmpFile,
          expectedSha256,
          controller,
          onProgress,
        );
      } catch (err) {
        if (controller.signal.aborted || cancelFlags.has(name)) {
          console.log(`[runtime-downloader] ${name} download aborted`);
          return false;
        }
        console.warn(
          `[runtime-downloader] ${name} attempt ${attempt} failed:`,
          err,
        );
      }
      if (!success && attempt < MAX_RETRIES) {
        console.log(
          `[runtime-downloader] ${name} retrying in ${RETRY_INTERVAL_MS}ms (attempt ${attempt}/${MAX_RETRIES})`,
        );
        await sleep(RETRY_INTERVAL_MS);
      }
    }

    if (!success) {
      console.error(
        `[runtime-downloader] ${name} download failed after ${MAX_RETRIES} attempts`,
      );
      return false;
    }

    // 解压到服务目录（纯 Node 流式解压，不依赖系统 tar / shell）
    const destDir = serviceInstallDir(name);
    try {
      fs.mkdirSync(destDir, { recursive: true });
      await extractTarGz(tmpFile, destDir, (extracted) => {
        if (extracted % 1000 === 0) {
          console.log(
            `[runtime-downloader] ${name} extracting... ${extracted} entries`,
          );
        }
      });
    } catch (err) {
      console.error(`[runtime-downloader] ${name} extract failed:`, err);
      return false;
    }

    // 更新 userData manifest（失败不阻断主流程）
    if (!updateLocalManifest(name, service.version, manifest)) {
      console.warn(
        `[runtime-downloader] ${name} update local manifest failed (non-fatal)`,
      );
    }

    // 删除临时文件
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }

    return true;
  } finally {
    downloadControllers.delete(name);
    cancelFlags.delete(name);
  }
}

/** 单次下载尝试（含 SHA-256 校验） */
async function downloadOnce(
  url: string,
  tmpFile: string,
  expectedSha256: string,
  controller: AbortController,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<boolean> {
  // 已下载大小（用于断点续传）
  let existingSize = 0;
  try {
    const stat = fs.statSync(tmpFile);
    existingSize = stat.size;
  } catch {
    // 文件不存在，从头下载
  }

  const headers: Record<string, string> = {};
  if (existingSize > 0) {
    headers.Range = `bytes=${existingSize}-`;
  }

  return new Promise<boolean>((resolve, reject) => {
    const request = https.request(
      url,
      { method: "GET", headers, signal: controller.signal },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        // 416 Range Not Satisfiable：可能临时文件已完整，尝试校验
        if (statusCode === 416 && existingSize > 0) {
          response.resume();
          if (verifySha256(tmpFile, expectedSha256)) {
            resolve(true);
          } else {
            try {
              fs.unlinkSync(tmpFile);
            } catch {
              // ignore
            }
            reject(new Error("HTTP 416 and sha256 mismatch"));
          }
          return;
        }

        // 非 2xx：视为失败
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const contentLengthHeader = response.headers["content-length"];
        const contentLength = contentLengthHeader
          ? parseInt(contentLengthHeader, 10) || 0
          : 0;
        const isResume = statusCode === 206 && existingSize > 0;
        const totalSize = isResume
          ? existingSize + contentLength
          : contentLength;

        let fileStream: fs.WriteStream;
        try {
          fileStream = fs.createWriteStream(tmpFile, {
            flags: isResume ? "a" : "w",
          });
        } catch (err) {
          response.resume();
          reject(err);
          return;
        }

        const hash = crypto.createHash("sha256");

        // 续传时先把已下载部分喂给 hash
        if (isResume && existingSize > 0) {
          try {
            const fd = fs.openSync(tmpFile, "r");
            const buf = Buffer.alloc(64 * 1024);
            let bytesRead = 0;
            while (
              (bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0
            ) {
              hash.update(buf.subarray(0, bytesRead));
            }
            fs.closeSync(fd);
          } catch (err) {
            try {
              fileStream.close();
            } catch {
              // ignore
            }
            response.resume();
            reject(err);
            return;
          }
        }

        let receivedBytes = existingSize;
        let lastEmitTs = 0;
        let bytesSinceLastEmit = 0;
        let windowStartTs = Date.now();

        const emitProgress = (): void => {
          const now = Date.now();
          if (now - lastEmitTs < PROGRESS_EMIT_INTERVAL_MS) return;
          const windowElapsedSec = Math.max(
            0.001,
            (now - windowStartTs) / 1000,
          );
          const speedKBs =
            bytesSinceLastEmit > 0
              ? bytesSinceLastEmit / 1024 / windowElapsedSec
              : 0;
          const percent =
            totalSize > 0
              ? Math.min(100, Math.floor((receivedBytes / totalSize) * 100))
              : 0;
          const remainingBytes = Math.max(0, totalSize - receivedBytes);
          const etaSec =
            speedKBs > 0 ? Math.ceil(remainingBytes / 1024 / speedKBs) : 0;
          onProgress?.({
            percent,
            speedKBs: Math.round(speedKBs * 10) / 10,
            etaSec,
          });
          lastEmitTs = now;
          bytesSinceLastEmit = 0;
          windowStartTs = now;
        };

        response.on("data", (chunk: Buffer) => {
          fileStream.write(chunk);
          hash.update(chunk);
          receivedBytes += chunk.length;
          bytesSinceLastEmit += chunk.length;
          emitProgress();
        });

        response.on("end", () => {
          fileStream.end(() => {
            // 强制 emit 100%
            if (totalSize > 0) {
              onProgress?.({ percent: 100, speedKBs: 0, etaSec: 0 });
            }
            // 校验 sha256
            if (expectedSha256) {
              const actual = hash.digest("hex");
              if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
                try {
                  fs.unlinkSync(tmpFile);
                } catch {
                  // ignore
                }
                reject(
                  new Error(
                    `sha256 mismatch: expected=${expectedSha256} actual=${actual}`,
                  ),
                );
                return;
              }
            }
            resolve(true);
          });
        });

        response.on("error", (err) => {
          try {
            fileStream.close();
          } catch {
            // ignore
          }
          reject(err);
        });

        fileStream.on("error", (err) => {
          response.destroy();
          reject(err);
        });
      },
    );

    request.on("error", (err) => {
      reject(err);
    });

    request.end();
  });
}

/** 校验文件 SHA-256（流式同步读取） */
function verifySha256(filePath: string, expectedSha256: string): boolean {
  if (!expectedSha256) return true;
  try {
    const hash = crypto.createHash("sha256");
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(64 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
    fs.closeSync(fd);
    const actual = hash.digest("hex");
    return actual.toLowerCase() === expectedSha256.toLowerCase();
  } catch (err) {
    console.error("[runtime-downloader] verifySha256 failed:", err);
    return false;
  }
}

/** 更新 userData 下的 manifest.json 中的服务版本号（不存在则基于内置 manifest 创建） */
function updateLocalManifest(
  name: ServiceName,
  version: string,
  builtin: RuntimeManifest,
): boolean {
  const localPath = path.join(userDataRuntimeDir(), "manifest.json");
  let local: RuntimeManifest;
  if (fs.existsSync(localPath)) {
    try {
      local = JSON.parse(
        fs.readFileSync(localPath, "utf-8"),
      ) as RuntimeManifest;
    } catch {
      // 损坏：基于内置 manifest 重建
      local = JSON.parse(JSON.stringify(builtin)) as RuntimeManifest;
    }
  } else {
    // 不存在：基于内置 manifest 复制
    local = JSON.parse(JSON.stringify(builtin)) as RuntimeManifest;
  }

  if (!local.services) {
    local.services = JSON.parse(
      JSON.stringify(builtin.services),
    ) as RuntimeManifest["services"];
  }
  // 整体刷新该服务条目（entry/port/downloadUrl/sha256/size 等），
  // 避免 userData 旧 manifest 残留过时字段（如 openclaw.port=51096）
  local.services[name] = JSON.parse(
    JSON.stringify(builtin.services[name]),
  ) as ServiceManifest;
  local.services[name].version = version;

  try {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, JSON.stringify(local, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("[runtime-downloader] write local manifest failed:", err);
    return false;
  }
}

/** 取消正在进行的下载（保留临时文件以便下次断点续传） */
export function cancelDownload(name: ServiceName): void {
  cancelFlags.add(name);
  const controller = downloadControllers.get(name);
  if (controller) {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
