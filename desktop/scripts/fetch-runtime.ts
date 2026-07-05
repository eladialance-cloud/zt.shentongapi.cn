/**
 * 构建期运行时下载脚本(非 Electron 主进程代码,在 Node.js 环境直接运行)。
 *
 * 用途:在打包前下载 N8N / OpenClaw / MCP Gateway 三个服务的运行时到 `runtime/` 目录,
 * 以便 electron-builder 通过 extraResources 打包进安装包。
 *
 * 运行方式:
 *   npx tsx scripts/fetch-runtime.ts           # 按当前 platform + arch 下载
 *   npx tsx scripts/fetch-runtime.ts --win     # 仅下载 win32-x64
 *   npx tsx scripts/fetch-runtime.ts --mac     # 下载 darwin-x64 与 darwin-arm64
 *   npx tsx scripts/fetch-runtime.ts --linux   # 仅下载 linux-x64
 *
 * 依赖说明:
 *   本脚本通过 `tsx` 执行 TypeScript。如果 package.json 中尚未安装 tsx,
 *   请先执行 `npm install`(tsx 已在 devDependencies 中声明)后再运行。
 *
 * 行为说明:
 *   - 由于实际 CDN 地址(https://cdn.shentong.ai/...)尚未部署,下载会失败。
 *   - 下载失败时打印警告但不中断构建(process.exit(0)),
 *     并在 manifest.json 中保持空 SHA-256,以便安装后首次启动触发 RuntimeDownloader 在线下载。
 */

import https from 'node:https';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

// ---------- 类型定义 ----------

type PlatformKey = 'win32-x64' | 'darwin-x64' | 'darwin-arm64' | 'linux-x64';

interface ServiceEntry {
  version: string;
  displayName: string;
  port: number;
  entry: Record<string, string>;
  downloadUrl: Partial<Record<PlatformKey, string>>;
  sha256: Partial<Record<PlatformKey, string>>;
}

interface RuntimeManifest {
  version: string;
  services: Record<'n8n' | 'openclaw' | 'mcp', ServiceEntry>;
}

// ---------- 常量 ----------

const PROJECT_ROOT = path.join(__dirname, '..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, 'runtime');
const MANIFEST_PATH = path.join(RUNTIME_DIR, 'manifest.json');
const TMP_DIR = path.join(RUNTIME_DIR, '.tmp');
const DOWNLOAD_TIMEOUT_MS = 60_000;
const SERVICE_KEYS = ['n8n', 'openclaw', 'mcp'] as const;

// ---------- 工具函数 ----------

function parseArgs(argv: string[]): PlatformKey[] {
  if (argv.includes('--win')) return ['win32-x64'];
  if (argv.includes('--mac')) return ['darwin-x64', 'darwin-arm64'];
  if (argv.includes('--linux')) return ['linux-x64'];
  return [`${process.platform}-${process.arch}` as PlatformKey];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function log(...args: unknown[]): void {
  console.log('[fetch-runtime]', ...args);
}

function warn(...args: unknown[]): void {
  console.warn('[fetch-runtime] WARN:', ...args);
}

function err(...args: unknown[]): void {
  console.error('[fetch-runtime] ERROR:', ...args);
}

/**
 * 流式下载文件到指定路径,同时流式计算 SHA-256。
 * 下载失败(网络错误、非 2xx、超时)抛出 Error。
 */
function downloadFile(
  url: string,
  destPath: string,
): Promise<{ sha256: string; size: number }> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let totalBytes = 0;
    let settled = false;

    const finish = (error: Error | null, result?: { sha256: string; size: number }) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      }
    };

    // 超时控制:60s 总超时,每收到数据重置计时(更接近连接空闲超时)。
    let timer: NodeJS.Timeout | null = setTimeout(() => {
      req.destroy(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT_MS}ms: ${url}`));
    }, DOWNLOAD_TIMEOUT_MS);

    const req = https.get(url, (res) => {
      // 处理重定向(3xx):简单支持一层重定向,符合 CDN 场景。
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        if (timer) clearTimeout(timer);
        res.resume();
        downloadFile(res.headers.location, destPath).then(resolve, reject);
        return;
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        finish(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }

      const stream = createWriteStream(destPath);
      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        hash.update(chunk);
        if (timer) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            req.destroy(new Error(`Download stall timeout: ${url}`));
          }, DOWNLOAD_TIMEOUT_MS);
        }
      });
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close((closeErr) => {
          if (closeErr) {
            finish(closeErr);
            return;
          }
          finish(null, { sha256: hash.digest('hex'), size: totalBytes });
        });
      });
      stream.on('error', (streamErr: NodeJS.ErrnoException) => finish(streamErr));
    });

    req.on('error', (e) => finish(e));
  });
}

/**
 * 使用系统自带 tar 解压 .tar.gz 到目标目录(覆盖)。
 * Windows 10+ 自带 tar;macOS / Linux 自带 bsdtar / gnutar。
 */
function extractTarGz(file: string, destDir: string): void {
  execSync(`tar -xzf "${file}" -C "${destDir}"`, { stdio: 'pipe' });
}

async function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ---------- 主流程 ----------

async function processService(
  serviceKey: (typeof SERVICE_KEYS)[number],
  service: ServiceEntry,
  platform: PlatformKey,
  manifestChanged: { value: boolean },
): Promise<void> {
  const url = service.downloadUrl[platform];
  if (!url) {
    warn(`service "${serviceKey}" has no downloadUrl for ${platform}, skip.`);
    return;
  }

  const serviceDir = path.join(RUNTIME_DIR, serviceKey);
  const tmpFile = path.join(TMP_DIR, `${serviceKey}-${platform}.tar.gz`);

  log(`[${serviceKey}/${platform}] downloading ${url}`);
  try {
    await mkdir(serviceDir, { recursive: true });
    const { sha256, size } = await downloadFile(url, tmpFile);
    log(
      `[${serviceKey}/${platform}] downloaded ${formatBytes(size)}, sha256=${sha256}`,
    );

    // 计算的 SHA-256 与 manifest 中已有值校验/写回。
    const recomputed = await computeSha256(tmpFile);
    if (recomputed !== sha256) {
      throw new Error(
        `sha256 mismatch (stream=${sha256}, file=${recomputed}) for ${serviceKey}/${platform}`,
      );
    }

    log(`[${serviceKey}/${platform}] extracting to ${serviceDir}`);
    extractTarGz(tmpFile, serviceDir);

    if (service.sha256[platform] !== sha256) {
      service.sha256[platform] = sha256;
      manifestChanged.value = true;
    }
  } catch (e) {
    // 下载/解压失败:按 spec 要求,打印警告但不中断构建。
    const message = e instanceof Error ? e.message : String(e);
    warn(`[${serviceKey}/${platform}] download/extract failed: ${message}`);
    warn(`[${serviceKey}/${platform}] leaving sha256 empty, will fall back to on-demand download.`);
    if (service.sha256[platform] !== '') {
      service.sha256[platform] = '';
      manifestChanged.value = true;
    }
  } finally {
    // 清理临时下载文件(无论成功失败)。
    await rm(tmpFile, { force: true });
  }
}

async function main(): Promise<void> {
  const platforms = parseArgs(process.argv.slice(2));
  log('platforms:', platforms.join(', '));

  // 读取 manifest.json。
  const manifestRaw = await readFile(MANIFEST_PATH, 'utf-8');
  const manifest = JSON.parse(manifestRaw) as RuntimeManifest;
  const manifestChanged = { value: false };

  // 准备临时目录。
  await mkdir(TMP_DIR, { recursive: true });

  // 遍历平台 + 服务下载。
  let allFailed = true;
  let anyAttempted = false;
  for (const platform of platforms) {
    for (const serviceKey of SERVICE_KEYS) {
      const service = manifest.services[serviceKey];
      if (!service) {
        warn(`service "${serviceKey}" not found in manifest, skip.`);
        continue;
      }
      anyAttempted = true;
      const before = service.sha256[platform] ?? '';
      await processService(serviceKey, service, platform, manifestChanged);
      const after = service.sha256[platform] ?? '';
      if (after && after === before && after !== '') {
        // 之前已有且未变化,视为成功。
        allFailed = false;
      } else if (after) {
        allFailed = false;
      }
    }
  }

  // 清理临时目录。
  await rm(TMP_DIR, { recursive: true, force: true });

  // 写回 manifest.json(若发生变化)。
  if (manifestChanged.value) {
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    log('manifest.json updated.');
  } else {
    log('manifest.json unchanged.');
  }

  // 打印摘要。
  log('========== Runtime Summary ==========');
  for (const serviceKey of SERVICE_KEYS) {
    const service = manifest.services[serviceKey];
    if (!service) continue;
    for (const platform of platforms) {
      const sha = service.sha256[platform] ?? '';
      const status = sha ? 'OK' : 'MISSING';
      log(
        `${serviceKey}/${platform}: v${service.version} [${status}] sha256=${
          sha || '(empty)'
        }`,
      );
    }
  }
  log('======================================');

  if (!anyAttempted || allFailed) {
    warn('Runtime download skipped (CDN not reachable). Installer will use on-demand download fallback.');
    process.exit(0);
  }
}

main().catch((e) => {
  err('fatal:', e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
