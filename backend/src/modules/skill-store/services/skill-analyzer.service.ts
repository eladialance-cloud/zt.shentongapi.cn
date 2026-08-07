import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import { SkillSourceEntity } from '../entities/skill-source.entity';
import { SkillPackageEntity } from '../entities/skill-package.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import {
  AnalysisResult,
  SkillAdapterInterface,
  SkillManifest,
} from '../adapters/skill-adapter.interface';
import { GitHubAdapter } from '../adapters/github-adapter';
import { LocalZipAdapter } from '../adapters/local-zip-adapter';
import { ManifestGenerator } from '../adapters/manifest-generator';

/**
 * 技能分析服务
 * 数据合同真源：Task 2 - 技能源分析引擎
 *
 * 负责拉取技能源、分析目录结构、生成标准化技能清单并落库为 SkillPackage。
 */
@Injectable()
export class SkillAnalyzerService {
  private readonly logger = new Logger(SkillAnalyzerService.name);

  constructor(
    @InjectRepository(SkillSourceEntity)
    private readonly sourceRepo: Repository<SkillSourceEntity>,
    @InjectRepository(SkillPackageEntity)
    private readonly packageRepo: Repository<SkillPackageEntity>,
    private readonly githubAdapter: GitHubAdapter,
    private readonly zipAdapter: LocalZipAdapter,
    private readonly manifestGenerator: ManifestGenerator,
  ) {}

  /**
   * 分析技能源，生成技能包。
   *
   * 9 步流程：
   * 1. 加载来源（不存在抛 NOT_FOUND）
   * 2. 获取适配器（仅支持 github）
   * 3. 置为 analyzing
   * 4. fetch → analyze → determineSkillType → generateManifest → 覆盖管理员字段 → 安装依赖 → 落库
   * 5. 异常时置为 failed 并重新抛出
   */
  async analyze(sourceId: number): Promise<SkillPackageEntity> {
    // 1. 加载来源
    const source = await this.sourceRepo.findOne({ where: { id: sourceId } });
    if (!source) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能源 ${sourceId} 不存在`);
    }

    // 2. 获取适配器
    const adapter = this.getAdapter(source.sourceType);

    // 3. 更新状态为 analyzing
    source.status = 'analyzing';
    await this.sourceRepo.save(source);

    // 4. 执行分析流程
    let localPath: string | undefined;
    try {
      // a. 拉取源码
      localPath = await adapter.fetch(source.sourceUrl);
      // b. 分析目录结构
      const analysis = await adapter.analyze(localPath);
      // c. 判定技能类型
      const skillType = this.determineSkillType(analysis);
      // d. 生成清单
      const manifest = await adapter.generateManifest(localPath, analysis);
      // e. 用管理员输入覆盖关键字段
      manifest.displayName = source.skillName;
      manifest.description = source.skillDesc;
      manifest.skillType = skillType;
      manifest.sourceUrl = source.sourceUrl;

      // f. 安装依赖（尽力而为）
      if (manifest.dependencies) {
        try {
          await adapter.installDependencies(localPath, manifest.dependencies);
        } catch (e) {
          this.logger.warn(`依赖安装失败（已忽略）: ${(e as Error).message}`);
        }
      }

      // g. 创建或更新技能包
      const pkg = this.buildPackage(manifest);
      // 如果 source 已关联 package，更新已有 package 而不是新建
      if (source.packageId) {
        const existingPkg = await this.packageRepo.findOne({ where: { id: source.packageId } });
        if (existingPkg) {
          Object.assign(existingPkg, {
            name: pkg.name,
            displayName: pkg.displayName,
            description: pkg.description,
            skillType: pkg.skillType,
            runtimeType: pkg.runtimeType,
            category: pkg.category,
            sourceUrl: pkg.sourceUrl,
            installPath: pkg.installPath,
            skillMdPath: pkg.skillMdPath,
            entryPoint: pkg.entryPoint,
            inputSchema: pkg.inputSchema,
            outputSchema: pkg.outputSchema,
            dependencies: pkg.dependencies,
            triggerKeywords: pkg.triggerKeywords,
            examples: pkg.examples,
            uiConfig: pkg.uiConfig,
            opcAgentConfig: pkg.opcAgentConfig,
            // 保留原有 status / reviewStatus 不被覆盖
          });
          const savedPkg = await this.packageRepo.save(existingPkg);
          // h. 更新来源状态
          source.status = 'analyzed';
          source.autoDetectedType = manifest.runtimeType;
          source.analyzeResult = analysis as unknown as Record<string, unknown>;
          await this.sourceRepo.save(source);
          return savedPkg;
        }
      }
      const savedPkg = await this.packageRepo.save(pkg);

      // h. 更新来源状态
      source.status = 'analyzed';
      source.packageId = savedPkg.id;
      source.autoDetectedType = manifest.runtimeType;
      source.analyzeResult = analysis as unknown as Record<string, unknown>;
      await this.sourceRepo.save(source);

      // i. 返回
      return savedPkg;
    } catch (e) {
      // 5. 失败处理：更新状态 + 清理已克隆的目录
      source.status = 'failed';
      source.errorMessage = ((e as Error).message || '分析失败').slice(0, 1024);
      await this.sourceRepo.save(source);

      // 清理已克隆的临时目录
      if (localPath) {
        try {
          await fs.rm(localPath, { recursive: true, force: true });
        } catch (rmErr) {
          this.logger.warn(`清理克隆目录失败: ${(rmErr as Error).message}`);
        }
      }

      throw e;
    }
  }

  /** 判定技能类型：含工作流/多步骤/完整入口则视为 workflow */
  private determineSkillType(analysis: AnalysisResult): 'skill' | 'workflow' {
    if (
      analysis.hasWorkflowDefinition ||
      analysis.hasMultiStepProcess ||
      analysis.hasCompleteEntryPoint
    ) {
      return 'workflow';
    }
    return 'skill';
  }

  /** 根据来源类型获取适配器 */
  private getAdapter(sourceType: string): SkillAdapterInterface {
    if (sourceType === 'github') {
      return this.githubAdapter;
    }
    if (sourceType === 'zip') {
      return this.zipAdapter;
    }
    BusinessException.throw(ErrorCode.VALIDATION_FAILED, '暂不支持该来源类型');
  }

  /** 由清单构建 SkillPackageEntity */
  private buildPackage(manifest: SkillManifest): SkillPackageEntity {
    const pkg = new SkillPackageEntity();
    pkg.name = manifest.name;
    pkg.displayName = manifest.displayName;
    pkg.description = manifest.description;
    pkg.skillType = manifest.skillType;
    pkg.runtimeType = manifest.runtimeType;
    pkg.category = manifest.category;
    pkg.sourceUrl = manifest.sourceUrl;
    pkg.installPath = manifest.installPath;
    pkg.skillMdPath = manifest.skillMdPath;
    pkg.entryPoint = manifest.entryPoint;
    pkg.inputSchema = manifest.inputSchema;
    pkg.outputSchema = manifest.outputSchema;
    pkg.dependencies = manifest.dependencies;
    pkg.triggerKeywords = manifest.triggerKeywords;
    pkg.examples = manifest.examples;
    pkg.uiConfig = manifest.uiConfig;
    pkg.opcAgentConfig = manifest.opcAgentConfig;
    pkg.status = 'draft';
    pkg.reviewStatus = 'pending';
    return pkg;
  }
}
