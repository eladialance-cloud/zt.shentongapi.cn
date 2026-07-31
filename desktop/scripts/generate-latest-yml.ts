/**
 * 生成 electron-updater 使用的 latest.yml 清单文件。
 *
 * 用途:在 electron-builder 打包完成后执行,扫描安装包输出目录下的
 * 安装包文件(.exe / .dmg / .AppImage / .deb / .rpm),计算每个文件的 SHA-512
 * 哈希与大小,生成符合 electron-updater 规范的 `latest.yml` 并写入同目录。
 *
 * 运行方式:
 *   npx tsx scripts/generate-latest-yml.ts
 *
 * 依赖说明:
 *   仅使用 Node.js 内置模块(fs / path / crypto),不引入新依赖。
 *
 * 目录解析:
 *   从 electron-builder.yml 的 directories.output 配置动态推断输出目录，
 *   展开 ${version} 占位符。兼容 dist/installer 和 dist/installer-v${version}。
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

import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

// ---------- 常量 ----------

const PROJECT_ROOT = path.join(__dirname, "..");
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, "package.json");
const BUILDER_CONFIG_PATH = path.join(PROJECT_ROOT, "electron-builder.yml");
const INSTALLER_EXTS = [".exe", ".dmg", ".appimage", ".deb", ".rpm"];

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

/**
 * 从 electron-builder.yml 解析 directories.output 配置，
 * 展开 ${version} 占位符，返回绝对路径。
 * 如果解析失败或目录不存在，按优先级回退到候选目录。
 */
function resolveInstallerDir(): string {
  // 读取版本号
  const pkgRaw = readFileSync(PACKAGE_JSON_PATH, "utf-8");
  const pkg = JSON.parse(pkgRaw) as PackageJson;
  const version = pkg.version;

  const candidates: string[] = [];

  // 1. 尝试解析 electron-builder.yml 中的 directories.output
  try {
    const ymlContent = readFileSync(BUILDER_CONFIG_PATH, "utf-8");
    const lines = ymlContent.split("\n");
    let inDirectoriesBlock = false;
    for (const line of lines) {
      // 检测进入 directories 块
      if (/^directories:\s*$/m.test(line)) {
        inDirectoriesBlock = true;
        continue;
      }
      if (inDirectoriesBlock) {
        const outputMatch = line.match(/^\s+output:\s*(\S+)/);
        if (outputMatch) {
          let dir = outputMatch[1].trim().replace(/^["']|["']$/g, "");
          dir = dir.replace(/\$\{version\}/g, version);
          candidates.push(path.join(PROJECT_ROOT, dir));
          break;
        }
        // 遇到下一个顶层 key 退出 directories 块
        if (/^\S/.test(line) && line.trim()) {
          inDirectoriesBlock = false;
        }
      }
    }
  } catch {
    // 忽略解析失败
  }

  // 2. 硬编码 fallback 候选目录
  candidates.push(path.join(PROJECT_ROOT, "dist", "installer"));
  candidates.push(path.join(PROJECT_ROOT, "dist", `installer-v${version}`));

  // 3. 返回第一个实际存在的目录，否则返回第一个候选（用于报错提示）
  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }
  return candidates[0];
}

/** 流式计算文件 SHA-512(支持大文件,避免内存爆炸)。 */
function computeSha512(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha512");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk as Buffer));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/** 格式化文件大小(人类可读)。 */
function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function log(...args: unknown[]): void {
  console.log("[generate-latest-yml]", ...args);
}

function err(...args: unknown[]): void {
  console.error("[generate-latest-yml] ERROR:", ...args);
}

// ---------- 主流程 ----------

async function main(): Promise<void> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  生成 latest.yml(electron-updater 清单)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 1. 读取版本号。
  const pkgRaw = await readFile(PACKAGE_JSON_PATH, "utf-8");
  const pkg = JSON.parse(pkgRaw) as PackageJson;
  const version = pkg.version;
  log(`版本号: ${version}`);

  // 2. 解析安装包输出目录（从 electron-builder.yml 动态推断）
  const INSTALLER_DIR = resolveInstallerDir();
  log(`安装包目录: ${INSTALLER_DIR}`);

  // 3. 扫描安装包目录。
  let entries: string[];
  try {
    entries = readdirSync(INSTALLER_DIR);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    err(`目录不存在或无法读取: ${INSTALLER_DIR}`);
    err(`原因: ${message}`);
    err("请先执行 electron-builder 打包");
    process.exit(1);
  }

  const installers = entries.filter((f) =>
    INSTALLER_EXTS.includes(path.extname(f).toLowerCase()),
  );

  if (installers.length === 0) {
    err(`未在 ${INSTALLER_DIR} 找到安装包文件`);
    err(`支持的扩展名: ${INSTALLER_EXTS.join(", ")}`);
    err("");
    err("目录内容预览:");
    for (const entry of entries.slice(0, 20)) {
      err(`  - ${entry}`);
    }
    process.exit(1);
  }

  log(`找到 ${installers.length} 个安装包:`);

  // 4. 计算每个文件的 SHA-512 + 大小。
  const installerInfos: InstallerFile[] = [];
  for (const filename of installers) {
    const filePath = path.join(INSTALLER_DIR, filename);
    const size = statSync(filePath).size;
    log(`  计算 SHA-512: ${filename} (${formatSize(size)})...`);
    const sha512 = await computeSha512(filePath);
    installerInfos.push({ filename, sha512, size });
    log(`  ✅ ${sha512.substring(0, 16)}...`);
  }

  // 5. 生成 latest.yml 内容。
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

  // 6. 写入文件到安装包输出目录。
  const OUTPUT_PATH = path.join(INSTALLER_DIR, "latest.yml");
  writeFileSync(OUTPUT_PATH, yml, "utf-8");

  console.log("");
  log(`latest.yml 已生成: ${OUTPUT_PATH}`);
  console.log("");
  console.log("📋 内容预览:");
  console.log("─────────────────────────────────────────");
  console.log(yml.trim());
  console.log("─────────────────────────────────────────");
  console.log("");
  log(`主安装包: ${primary.filename}`);
  log(`  版本: ${version}`);
  log(`  大小: ${formatSize(primary.size)}`);
  log(`  SHA-512: ${primary.sha512.substring(0, 32)}...`);
  log(`  发布时间: ${releaseDate}`);
}

main().catch((e) => {
  err(
    "生成 latest.yml 失败:",
    e instanceof Error ? (e.stack ?? e.message) : String(e),
  );
  process.exit(1);
});