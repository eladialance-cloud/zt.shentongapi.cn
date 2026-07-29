import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import {
  AnalysisResult,
  SkillAdapterInterface,
  SkillManifest,
} from './skill-adapter.interface';
import { ManifestGenerator } from './manifest-generator';

/** execFile 的 Promise 化包装（不经过 shell，避免命令注入） */
const execFileAsync = promisify(execFile);

/** git clone 超时（30s） */
const CLONE_TIMEOUT_MS = 120_000;
/** 依赖安装超时（60s） */
const INSTALL_TIMEOUT_MS = 60_000;
/** 目录遍历最大深度 */
const MAX_SCAN_DEPTH = 2;
/** execFile 输出缓冲上限 */
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * GitHub 技能适配器
 *
 * 通过 git clone 拉取仓库，分析目录结构并生成技能清单。
 * 安全约束：所有子进程调用均使用 execFile（参数以数组传递，不经过 shell）。
 */
@Injectable()
export class GitHubAdapter implements SkillAdapterInterface {
  private readonly logger = new Logger(GitHubAdapter.name);

  constructor(private readonly manifestGenerator: ManifestGenerator) {}

  /** 克隆仓库到本地，返回本地路径 */
  async fetch(url: string): Promise<string> {
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '无效的 GitHub 仓库地址');
    }
    const repoName = (url.split('/').pop() || 'skill').replace(/\.git$/, '');
    const targetDir = path.resolve(
      process.cwd(),
      'uploads',
      'skills',
      `${repoName}-${Date.now()}`,
    );
    await fs.mkdir(path.dirname(targetDir), { recursive: true });

    // 尝试直接克隆，失败则用 GitHub 镜像加速
    const cloneUrl = await this.resolveCloneUrl(url);
    this.logger.log(`克隆仓库: ${cloneUrl} -> ${targetDir}`);
    await execFileAsync('git', ['clone', cloneUrl, targetDir, '--depth', '1'], {
      timeout: CLONE_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });

    return targetDir;
  }

  /** 分析本地目录结构 */
  async analyze(localPath: string): Promise<AnalysisResult> {
    const files: string[] = [];
    try {
      await this.collectFiles(localPath, files, 0, MAX_SCAN_DEPTH);
    } catch (e) {
      this.logger.warn(`目录列举失败: ${(e as Error).message}`);
    }

    const detectedLanguages = new Set<string>();
    let hasSkillMd = false;
    let hasRequirementsTxt = false;
    let hasPackageJson = false;
    let hasDockerfile = false;
    let hasMainPy = false;
    let hasIndexJs = false;
    let hasRunPy = false;
    let hasWorkflowDefinition = false;
    let readmeContent: string | undefined;

    for (const file of files) {
      const base = path.basename(file).toLowerCase();
      const ext = path.extname(base).toLowerCase();
      const lang = this.extensionToLanguage(ext);
      if (lang) detectedLanguages.add(lang);

      switch (base) {
        case 'skill.md':
          hasSkillMd = true;
          break;
        case 'requirements.txt':
          hasRequirementsTxt = true;
          break;
        case 'package.json':
          hasPackageJson = true;
          break;
        case 'dockerfile':
          hasDockerfile = true;
          break;
        case 'main.py':
          hasMainPy = true;
          break;
        case 'run.py':
          hasRunPy = true;
          break;
        case 'index.js':
          hasIndexJs = true;
          break;
        case 'readme.md':
          try {
            readmeContent = await fs.readFile(file, 'utf-8');
          } catch {
            // 忽略读取失败
          }
          break;
        default:
          if (
            base.includes('workflow') ||
            base.includes('n8n') ||
            base.endsWith('.workflow.json')
          ) {
            hasWorkflowDefinition = true;
          }
          break;
      }
    }

    const hasCompleteEntryPoint = hasMainPy || hasIndexJs || hasRunPy;
    const hasMultiStepProcess = this.detectMultiStepProcess(readmeContent);

    return {
      hasSkillMd,
      hasRequirementsTxt,
      hasPackageJson,
      hasDockerfile,
      hasMainPy,
      hasIndexJs,
      hasWorkflowDefinition,
      hasMultiStepProcess,
      hasCompleteEntryPoint,
      readmeContent,
      detectedLanguages: Array.from(detectedLanguages),
    };
  }

  /** 生成技能清单 */
  async generateManifest(
    localPath: string,
    analysis: AnalysisResult,
  ): Promise<SkillManifest> {
    // 重新扫描以定位关键文件（hasSkillMd 等标志可能命中子目录中的文件）
    const files: string[] = [];
    try {
      await this.collectFiles(localPath, files, 0, MAX_SCAN_DEPTH);
    } catch (e) {
      this.logger.warn(`清单生成时目录列举失败: ${(e as Error).message}`);
    }
    const locate = (name: string): string | undefined =>
      files.find((f) => path.basename(f).toLowerCase() === name.toLowerCase());

    let manifest: SkillManifest;

    const skillMdFile = analysis.hasSkillMd ? locate('skill.md') : undefined;
    if (skillMdFile) {
      const content = await fs.readFile(skillMdFile, 'utf-8');
      manifest = this.manifestGenerator.parseSkillMd(
        content,
        localPath,
        analysis,
      );
      manifest.skillMdPath = skillMdFile;
    } else if (analysis.hasDockerfile) {
      manifest = this.buildBaseManifest(localPath, 'docker', 'Dockerfile');
    } else if (analysis.hasMainPy) {
      const entry = locate('main.py') || locate('run.py') || 'main.py';
      manifest = this.buildBaseManifest(localPath, 'python-cli', entry);
    } else if (analysis.hasPackageJson) {
      const entry = locate('index.js') || 'index.js';
      manifest = this.buildBaseManifest(localPath, 'node-cli', entry);
    } else {
      manifest = this.buildBaseManifest(localPath, 'markdown-only', undefined);
      manifest.skillMdPath = path.join(localPath, 'README.md');
    }

    // 合并自动生成的默认字段（仅在缺失时填充）
    const defaults = this.manifestGenerator.autoGenerateDefaults(
      localPath,
      analysis,
    );
    if (!manifest.name) manifest.name = defaults.name!;
    if (!manifest.category) manifest.category = defaults.category;
    if (!manifest.triggerKeywords || manifest.triggerKeywords.length === 0) {
      manifest.triggerKeywords = defaults.triggerKeywords;
    }
    if (!manifest.uiConfig) manifest.uiConfig = defaults.uiConfig;
    if (!manifest.examples || manifest.examples.length === 0) {
      manifest.examples = defaults.examples;
    }
    if (!manifest.inputSchema) manifest.inputSchema = defaults.inputSchema;
    if (!manifest.outputSchema) manifest.outputSchema = defaults.outputSchema;

    // 描述兜底
    if (!manifest.description) {
      manifest.description = analysis.readmeContent
        ? analysis.readmeContent.slice(0, 512)
        : manifest.name;
    }

    // 依赖信息（用于触发依赖安装）
    const depInfo: Record<string, unknown> = {};
    if (analysis.hasRequirementsTxt) depInfo.requirementsTxt = true;
    if (analysis.hasPackageJson) depInfo.packageJson = true;
    if (
      Object.keys(depInfo).length > 0 &&
      (!manifest.dependencies || Object.keys(manifest.dependencies).length === 0)
    ) {
      manifest.dependencies = depInfo;
    }

    return manifest;
  }

  /** 安装依赖（尽力而为，失败不抛出） */
  async installDependencies(
    localPath: string,
    deps: Record<string, unknown>,
  ): Promise<void> {
    // deps 参数保留以符合接口契约；实际安装依据本地依赖文件是否存在
    void deps;

    if (await this.pathExists(path.join(localPath, 'requirements.txt'))) {
      try {
        this.logger.log(`安装 Python 依赖: ${localPath}`);
        await execFileAsync('pip', ['install', '-r', 'requirements.txt'], {
          cwd: localPath,
          timeout: INSTALL_TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
        });
      } catch (e) {
        this.logger.warn(
          `Python 依赖安装失败（已忽略）: ${(e as Error).message}`,
        );
      }
    }

    if (await this.pathExists(path.join(localPath, 'package.json'))) {
      try {
        this.logger.log(`安装 Node 依赖: ${localPath}`);
        await execFileAsync('npm', ['install'], {
          cwd: localPath,
          timeout: INSTALL_TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
        });
      } catch (e) {
        this.logger.warn(
          `Node 依赖安装失败（已忽略）: ${(e as Error).message}`,
        );
      }
    }
  }

  // ============================================================
  // 私有工具方法
  // ============================================================

  /** 递归收集文件（最多 maxDepth 层） */
  private async collectFiles(
    dir: string,
    out: string[],
    currentDepth: number,
    maxDepth: number,
  ): Promise<void> {
    if (currentDepth > maxDepth) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过隐藏目录与 node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        await this.collectFiles(fullPath, out, currentDepth + 1, maxDepth);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }

  /** 文件扩展名 -> 语言 */
  private extensionToLanguage(ext: string): string | undefined {
    switch (ext) {
      case '.py':
        return 'python';
      case '.js':
      case '.mjs':
      case '.cjs':
      case '.jsx':
        return 'javascript';
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.java':
        return 'java';
      case '.rb':
        return 'ruby';
      case '.php':
        return 'php';
      case '.cs':
        return 'csharp';
      case '.cpp':
      case '.cc':
      case '.cxx':
        return 'cpp';
      case '.c':
        return 'c';
      case '.sh':
      case '.bash':
        return 'shell';
      default:
        return undefined;
    }
  }

  /** 从 README 内容中检测多步骤流程 */
  private detectMultiStepProcess(readme: string | undefined): boolean {
    if (!readme) return false;
    return /step\s*\d|步骤\s*\d|第\s*\d\s*步/i.test(readme);
  }

  /** 构建基础清单（无 SKILL.md 分支使用） */
  private buildBaseManifest(
    localPath: string,
    runtimeType: string,
    entryPoint: string | undefined,
  ): SkillManifest {
    return {
      name: '',
      displayName: '',
      description: '',
      skillType: 'skill',
      runtimeType,
      sourceUrl: '',
      installPath: localPath,
      entryPoint,
    };
  }

  /** 解析克隆 URL：先试直连，失败则走镜像 */
  private async resolveCloneUrl(url: string): Promise<string> {
    // 先测试直连是否可用（快速失败 5 秒）
    try {
      await execFileAsync('git', ['ls-remote', url, 'HEAD'], {
        timeout: 5_000,
        maxBuffer: MAX_BUFFER,
      });
      return url;
    } catch {
      this.logger.warn('直连 GitHub 失败，尝试使用镜像加速...');
    }
    // 使用 ghproxy 镜像
    const mirrored = `https://gh-proxy.com/${url}`;
    this.logger.log(`使用镜像: ${mirrored}`);
    return mirrored;
  }

  /** 判断路径是否存在 */
  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }
}
