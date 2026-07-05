/**
 * 生成 electron-updater 使用的 latest.yml 清单文件。
 *
 * 用途:在 electron-builder 打包完成后执行,扫描 `dist/installer/` 目录下的
 * 安装包文件(.exe / .dmg / .AppImage / .deb / .rpm),计算每个文件的 SHA-512
 * 哈希与大小,生成符合 electron-updater 规范的 `latest.yml` 并写入同目录。
 *
 * 运行方式:
 *   npx tsx scripts/generate-latest-yml.ts
 *
 * 依赖说明:
 *   仅使用 Node.js 内置模块(fs / path / crypto),不引入新依赖。
 *
 * latest.yml 格式(electron-updater 规范):
 *   version: <版本号>
 *   files:
 *     - url: <文件名>
 *       sha512: <SHA-512 哈希(hex)>
 *       size: <字节数>
 *   path: <主安装包文件名>
 *   sha512: <主安装包 SHA-512 哈希>
 *   releaseDate: '<ISO 8601 时间>'
 */

import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// ---------- 常量 ----------

const PROJECT_ROOT = path.join(__dirname, '..');
const INSTALLER_DIR = path.join(PROJECT_ROOT, 'dist', 'installer');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');
const OUTPUT_PATH = path.join(INSTALLER_DIR, 'latest.yml');
const INSTALLER_EXTS = ['.exe', '.dmg', '.appimage', '.deb', '.rpm'];

// ---------- 类型定义 ----------

interface InstallerFile {
  filename: string;
  sha512: string;
  size: number;
}

interface PackageJson {
  version: string;
}

// ---------- 工具函数 ----------

/** 流式计算文件 SHA-512(支持大文件,避免内存爆炸)。 */
function computeSha512(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: Buffer | string) => hash.update(chunk as Buffer));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/** 格式化文件大小(人类可读)。 */
function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function log(...args: unknown[]): void {
  console.log('[generate-latest-yml]', ...args);
}

function err(...args: unknown[]): void {
  console.error('[generate-latest-yml] ERROR:', ...args);
}

// ---------- 主流程 ----------

async function main(): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  生成 latest.yml(electron-updater 清单)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. 读取版本号。
  const pkgRaw = await readFile(PACKAGE_JSON_PATH, 'utf-8');
  const pkg = JSON.parse(pkgRaw) as PackageJson;
  const version = pkg.version;
  log(`版本号: ${version}`);

  // 2. 扫描安装包目录。
  let entries: string[];
  try {
    entries = readdirSync(INSTALLER_DIR);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    err(`目录不存在或无法读取: ${INSTALLER_DIR}`);
    err(`原因: ${message}`);
    err('请先执行 electron-builder 打包');
    process.exit(1);
  }

  const installers = entries.filter((f) =>
    INSTALLER_EXTS.includes(path.extname(f).toLowerCase()),
  );

  if (installers.length === 0) {
    err(`未在 ${INSTALLER_DIR} 找到安装包文件`);
    err(`支持的扩展名: ${INSTALLER_EXTS.join(', ')}`);
    process.exit(1);
  }

  log(`找到 ${installers.length} 个安装包:`);

  // 3. 计算每个文件的 SHA-512 + 大小。
  const installerInfos: InstallerFile[] = [];
  for (const filename of installers) {
    const filePath = path.join(INSTALLER_DIR, filename);
    const size = statSync(filePath).size;
    log(`  计算 SHA-512: ${filename} (${formatSize(size)})...`);
    const sha512 = await computeSha512(filePath);
    installerInfos.push({ filename, sha512, size });
    log(`  ✅ ${sha512.substring(0, 16)}...`);
  }

  // 4. 生成 latest.yml 内容。
  const releaseDate = new Date().toISOString();
  const primary = installerInfos[0];

  let yml = `version: ${version}\n`;
  yml += `files:\n`;
  for (const info of installerInfos) {
    yml += `  - url: ${info.filename}\n`;
    yml += `    sha512: ${info.sha512}\n`;
    yml += `    size: ${info.size}\n`;
  }
  yml += `path: ${primary.filename}\n`;
  yml += `sha512: ${primary.sha512}\n`;
  yml += `releaseDate: '${releaseDate}'\n`;

  // 5. 写入文件。
  writeFileSync(OUTPUT_PATH, yml, 'utf-8');

  console.log('');
  log(`latest.yml 已生成: ${OUTPUT_PATH}`);
  console.log('');
  console.log('📋 内容预览:');
  console.log('─────────────────────────────────────────');
  console.log(yml.trim());
  console.log('─────────────────────────────────────────');
  console.log('');
  log(`主安装包: ${primary.filename}`);
  log(`  版本: ${version}`);
  log(`  大小: ${formatSize(primary.size)}`);
  log(`  SHA-512: ${primary.sha512.substring(0, 32)}...`);
  log(`  发布时间: ${releaseDate}`);
}

main().catch((e) => {
  err('生成 latest.yml 失败:', e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
