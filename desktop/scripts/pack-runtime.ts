/**
 * 运行时归档打包脚本（非 Electron 主进程代码，在 Node.js 环境直接运行）。
 *
 * 用途：将 npm 包（openclaw、mcp-gateway、n8n）及其生产依赖打包成 tar.gz 归档，
 * 供 CDN 分发。解压后的目录包含 Windows .cmd 入口包装和 node_modules。
 *
 * 运行方式：
 *   npx tsx scripts/pack-runtime.ts --service openclaw --platform win32-x64
 *   npx tsx scripts/pack-runtime.ts --service mcp --platform win32-x64
 *   npx tsx scripts/pack-runtime.ts --service n8n --platform win32-x64
 *   npx tsx scripts/pack-runtime.ts --all --platform win32-x64  # 打包所有 local 服务
 *
 * 依赖说明：
 *   本脚本通过 `tsx` 执行 TypeScript。需要系统可用 `npm` 和 `tar` 命令。
 *   Windows 10+ 自带 tar；macOS / Linux 自带 bsdtar / gnutar。
 *
 * 行为说明：
 *   - 从 runtime/manifest.json 读取服务配置（npm 包名、版本号、入口文件名）
 *   - 跳过 type: "cloud" 的服务（如有）
 *   - 在临时目录执行 npm install，生成 Windows .cmd 入口包装，打包为 tar.gz
 *   - 输出到 ../cdn/<service>/<version>/<service>-<os>-<arch>.tar.gz
 *   - npm 包名映射（与 runtime-downloader.ts 的 NPM_PACKAGES 一致）：
 *       openclaw → openclaw，mcp → mcp-gateway，n8n → n8n
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

// ---------- 类型定义 ----------

type PlatformKey = 'win32-x64' | 'darwin-x64' | 'darwin-arm64' | 'linux-x64';

interface ServiceEntry {
  type?: 'local' | 'cloud';
  version: string;
  displayName: string;
  port: number;
  entry: Record<string, string>;
  downloadUrl: Record<string, string>;
  size: Record<string, number>;
  sha256: Record<string, string>;
}

interface RuntimeManifest {
  version: string;
  services: Record<string, ServiceEntry>;
}

interface PkgJson {
  bin?: string | Record<string, string>;
  main?: string;
}

// ---------- 常量 ----------

const PROJECT_ROOT = path.join(__dirname, '..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, 'runtime');
const MANIFEST_PATH = path.join(RUNTIME_DIR, 'manifest.json');
const TMP_DIR = path.join(RUNTIME_DIR, '.tmp');

/** 服务 key → npm 包名映射（与 electron/main/runtime-downloader.ts 的 NPM_PACKAGES 一致） */
const NPM_PACKAGES: Record<string, string> = {
  openclaw: 'openclaw',
  n8n: 'n8n',
  mcp: 'mcp-gateway',
  hermes: 'hermes-agent',
};

/** CDN 本地暂存根目录（d:\二次开发\cdn） */
const CDN_ROOT = path.resolve(PROJECT_ROOT, '..', 'cdn');

// ---------- 工具函数 ----------

function log(...args: unknown[]): void {
  console.log('[pack-runtime]', ...args);
}

function err(...args: unknown[]): void {
  console.error('[pack-runtime] ERROR:', ...args);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface ParsedArgs {
  service: string | null;
  all: boolean;
  platform: PlatformKey;
}

function parseArgs(argv: string[]): ParsedArgs {
  let service: string | null = null;
  let all = false;
  let platform: PlatformKey | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--service') {
      service = argv[i + 1] ?? null;
      i++;
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--platform') {
      platform = (argv[i + 1] ?? null) as PlatformKey | null;
      i++;
    }
  }

  if (!platform) {
    platform = `${process.platform}-${process.arch}` as PlatformKey;
  }

  if (!all && !service) {
    err('usage: --service <name> | --all  [--platform <platform>]');
    process.exit(1);
  }

  return { service, all, platform };
}

/**
 * 将平台 key 转换为归档文件名后缀：
 * win32-x64 → win-x64，darwin-x64 → mac-x64，darwin-arm64 → mac-arm64，linux-x64 → linux-x64
 * 与 manifest.json 中 downloadUrl 的命名规则一致（如 n8n-win-x64.tar.gz）
 */
function archiveSuffix(platform: PlatformKey): string {
  const parts = platform.split('-');
  const os = parts[0];
  const arch = parts[1] ?? 'x64';
  const osName = os === 'win32' ? 'win' : os === 'darwin' ? 'mac' : os;
  return `${osName}-${arch}`;
}

/** 返回当前平台的 npm 可执行文件名（Windows 为 npm.cmd，需 shell 执行） */
function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

/**
 * 从 node_modules/<pkg>/package.json 的 bin 或 main 字段解析入口路径。
 * 返回相对于包根目录的入口路径（POSIX 风格，如 dist/index.js 或 bin/n8n）。
 *
 * 解析优先级：bin（字符串）> bin[包名] > bin[首个 key] > main > dist/index.js
 */
async function resolvePkgEntry(pkgDir: string, pkgName: string): Promise<string> {
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  const raw = await readFile(pkgJsonPath, 'utf-8');
  const pkg = JSON.parse(raw) as PkgJson;

  // 1. 优先使用 bin 字段（npm 包的命令入口）
  if (pkg.bin) {
    if (typeof pkg.bin === 'string') {
      return pkg.bin;
    }
    // bin 是对象：优先查找与包名同名的 key，否则取第一个
    if (pkg.bin[pkgName]) {
      return pkg.bin[pkgName];
    }
    const firstKey = Object.keys(pkg.bin)[0];
    if (firstKey && pkg.bin[firstKey]) {
      return pkg.bin[firstKey];
    }
  }

  // 2. 回退到 main 字段
  if (pkg.main) {
    return pkg.main;
  }

  // 3. 默认值
  return 'dist/index.js';
}

// ---------- 主流程 ----------

/**
 * 打包单个服务到 tar.gz 归档。
 *
 * 流程：
 * 1. 创建临时目录 runtime/.tmp/pack-<service>-<platform>/
 * 2. 在临时目录执行 npm install <pkg>@<version> --production --no-save --prefix .
 * 3. 生成 Windows .cmd 入口包装（仅 win32 平台）
 * 4. 清理 npm 可能生成的 package-lock.json（归档结构要求仅含 .cmd + node_modules）
 * 5. 使用 tar -czf 打包
 * 6. 打印归档大小和路径
 * 7. 清理临时目录（best-effort，失败不中断）
 */
async function packService(
  serviceKey: string,
  service: ServiceEntry,
  platform: PlatformKey,
): Promise<void> {
  const pkgName = NPM_PACKAGES[serviceKey];
  if (!pkgName) {
    err(`service "${serviceKey}" has no npm package mapping, skip.`);
    return;
  }

  // 跳过云端服务
  if (service.type === 'cloud') {
    log(`service "${serviceKey}" is cloud type, skip.`);
    return;
  }

  const version = service.version;
  log(`[${serviceKey}/${platform}] packing ${pkgName}@${version}`);

  // 1. 创建临时目录
  const tmpDir = path.join(TMP_DIR, `pack-${serviceKey}-${platform}`);
  log(`[${serviceKey}/${platform}] tmpdir: ${tmpDir}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    // 1.5 创建最小 package.json（npm install --prefix 需要存在 package.json）
    const minimalPkg = { name: `runtime-pack-${serviceKey}`, version: '1.0.0', private: true };
    await writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(minimalPkg), 'utf-8');

    // 2. npm install <pkg>@<version> --omit=dev --no-save
    //    使用 --omit=dev 替代 --production（npm 10+ 推荐）
    //    stdio: 'pipe' 避免 PowerShell 将 npm stderr 警告视为错误中断命令
    const npmArgs = [
      'install',
      `${pkgName}@${version}`,
      '--omit=dev',
      '--no-save',
      '--engine-strict=false',
    ];
    log(`[${serviceKey}/${platform}] running: npm ${npmArgs.join(' ')}`);
    try {
      // 使用 spawnSync 替代 execFileSync，更好地捕获退出码和 stderr
      const npmResult = spawnSync(npmCommand(), npmArgs, {
        cwd: tmpDir,
        stdio: 'pipe',
        windowsHide: true,
        shell: process.platform === 'win32',
        encoding: 'utf-8',
      });
      if (npmResult.status !== 0) {
        const stderr = (npmResult.stderr || '').trim();
        const stdout = (npmResult.stdout || '').trim();
        throw new Error(
          `npm install exited with code ${npmResult.status}\nstdout: ${stdout.slice(-300)}\nstderr: ${stderr.slice(-300)}`
        );
      }
      // 打印 stdout 最后几行作为日志
      if (npmResult.stdout) {
        const lines = npmResult.stdout.split(/\r?\n/).filter((l) => l.trim());
        for (const line of lines.slice(-5)) {
          log(`[${serviceKey}/${platform}] npm: ${line}`);
        }
      }
      // 验证 node_modules 已创建
      const nodeModulesDir = path.join(tmpDir, 'node_modules', pkgName);
      try {
        const stats = await stat(nodeModulesDir);
        if (!stats.isDirectory()) {
          throw new Error(`node_modules/${pkgName} is not a directory`);
        }
        log(`[${serviceKey}/${platform}] node_modules/${pkgName} created OK`);
      } catch {
        throw new Error(
          `node_modules/${pkgName} not found after npm install. ` +
          `npm stdout: ${(npmResult.stdout || '').slice(-200)}. ` +
          `npm stderr: ${(npmResult.stderr || '').slice(-200)}`
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`npm install failed for ${pkgName}@${version}: ${msg}`);
    }

    // 3. 解析入口路径并生成 Windows .cmd 包装
    if (platform.startsWith('win32')) {
      const pkgDir = path.join(tmpDir, 'node_modules', pkgName);
      let entryRel: string;
      try {
        entryRel = await resolvePkgEntry(pkgDir, pkgName);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`failed to resolve entry for ${pkgName}: ${msg}`);
      }
      // 转换为 Windows 风格路径用于 .cmd
      const entryWin = entryRel.replace(/\//g, '\\');
      // manifest 中 win32 入口文件名（如 openclaw.exe），追加 .cmd 生成包装文件名
      const entryFile = service.entry['win32'] ?? `${pkgName}.exe`;
      const wrapperName = `${entryFile}.cmd`;
      const wrapperPath = path.join(tmpDir, wrapperName);
      const wrapperContent = `@echo off\r\nnode "%~dp0node_modules\\${pkgName}\\${entryWin}" %*\r\n`;
      log(`[${serviceKey}/${platform}] generating wrapper: ${wrapperName}`);
      log(`[${serviceKey}/${platform}] entry: node_modules/${pkgName}/${entryRel}`);
      await writeFile(wrapperPath, wrapperContent, 'utf-8');
    } else {
      log(`[${serviceKey}/${platform}] non-win32 platform, skip wrapper generation`);
    }

    // 4. 清理 npm 可能生成的 package-lock.json（归档结构要求仅含 .cmd + node_modules）
    await rm(path.join(tmpDir, 'package-lock.json'), { force: true });

    // 5. tar -czf <output> -C <tmpdir> .
    const suffix = archiveSuffix(platform);
    const outputDir = path.join(CDN_ROOT, serviceKey, version);
    const outputName = `${serviceKey}-${suffix}.tar.gz`;
    const outputPath = path.join(outputDir, outputName);
    await mkdir(outputDir, { recursive: true });
    log(`[${serviceKey}/${platform}] packing to ${outputPath}`);
    try {
      execFileSync('tar', ['-czf', outputPath, '-C', tmpDir, '.'], {
        stdio: 'pipe',
        windowsHide: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`tar failed for ${serviceKey}/${platform}: ${msg}`);
    }

    // 6. 打印归档大小和路径
    const stats = await stat(outputPath);
    log(`[${serviceKey}/${platform}] archive: ${outputPath}`);
    log(`[${serviceKey}/${platform}] size: ${formatBytes(stats.size)}`);
  } finally {
    // 7. 清理临时目录（best-effort，失败不中断）
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`[${serviceKey}/${platform}] tmpdir cleanup failed (ignored): ${msg}`);
    }
  }
}

async function main(): Promise<void> {
  const { service, all, platform } = parseArgs(process.argv.slice(2));
  log(`platform: ${platform}`);

  // 读取 manifest.json
  const manifestRaw = await readFile(MANIFEST_PATH, 'utf-8');
  const manifest = JSON.parse(manifestRaw) as RuntimeManifest;

  // 准备临时目录
  await mkdir(TMP_DIR, { recursive: true });

  if (all) {
    // 打包所有 local 服务（跳过 cloud 类型）
    for (const [key, entry] of Object.entries(manifest.services)) {
      if (entry.type === 'cloud') {
        log(`service "${key}" is cloud type, skip.`);
        continue;
      }
      await packService(key, entry, platform);
    }
  } else if (service) {
    const entry = manifest.services[service];
    if (!entry) {
      err(`service "${service}" not found in manifest.`);
      process.exit(1);
    }
    await packService(service, entry, platform);
  }

  log('done.');
}

main().catch((e) => {
  err('fatal:', e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
