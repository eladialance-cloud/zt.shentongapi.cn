import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { extractZipFile } from '../../../common/utils/zip.util';
import { GitHubAdapter } from './github-adapter';
import { ManifestGenerator } from './manifest-generator';

/**
 * 本地 ZIP 技能适配器
 *
 * 复用 GitHubAdapter 的目录分析 / 清单生成 / 依赖安装逻辑，
 * 仅将 fetch 替换为「解压本地 zip」：
 *   sourceUrl 形如 local://<zip 绝对路径>
 * 每次解析解压到独立目录（失败时由分析器统一清理），zip 原件保留以便重试。
 */
@Injectable()
export class LocalZipAdapter extends GitHubAdapter {
  private readonly zipLogger = new Logger(LocalZipAdapter.name);

  constructor(manifestGenerator: ManifestGenerator) {
    super(manifestGenerator);
  }

  async fetch(sourceUrl: string): Promise<string> {
    if (!sourceUrl.startsWith('local://')) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '无效的本地技能包地址');
    }
    const zipPath = sourceUrl.slice('local://'.length);
    try {
      await fs.access(zipPath);
    } catch {
      BusinessException.throw(ErrorCode.NOT_FOUND, `本地技能包不存在: ${zipPath}`);
    }

    const base = path.basename(zipPath, '.zip') || 'skill';
    const targetDir = path.resolve(
      process.cwd(),
      'uploads',
      'skills',
      `${base}-${Date.now()}`,
    );
    await fs.mkdir(targetDir, { recursive: true });
    try {
      extractZipFile(zipPath, targetDir);
    } catch (e) {
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, `解压失败: ${(e as Error).message}`);
    }
    this.zipLogger.log(`本地技能包已解压: ${zipPath} -> ${targetDir}`);
    return targetDir;
  }

  /**
   * 本地 zip 技能包不自动安装依赖（pip/npm install 会执行包内任意脚本，
   * 管理员上传的 zip 存在任意代码执行风险），依赖安装交给用户端/安装环节按需处理。
   */
  async installDependencies(
    _localPath: string,
    _deps: Record<string, unknown>,
  ): Promise<void> {
    this.zipLogger.warn('本地 zip 技能包跳过依赖自动安装（安全策略：上传包不执行 pip/npm install）');
  }
}
