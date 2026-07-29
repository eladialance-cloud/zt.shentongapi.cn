import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillPackageEntity } from '../entities/skill-package.entity';
import { SkillInstallLogEntity } from '../entities/skill-install-log.entity';
import { ChatSessionEntity } from '../../chat/entities/chat-session.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { CreditsService } from '../../credits/services/credits.service';

const execFileAsync = promisify(execFile);

/**
 * 技能运行服务
 * 数据合同真源：Task 3 - 用户侧技能执行与健康检查
 *
 * 安全约束：所有子进程调用必须使用 execFile（非 exec），避免 shell 注入。
 */
@Injectable()
export class SkillRunnerService {
  private readonly logger = new Logger(SkillRunnerService.name);

  constructor(
    @InjectRepository(SkillPackageEntity)
    private readonly packageRepo: Repository<SkillPackageEntity>,
    @InjectRepository(SkillInstallLogEntity)
    private readonly logRepo: Repository<SkillInstallLogEntity>,
    @InjectRepository(ChatSessionEntity)
    private readonly sessionRepo: Repository<ChatSessionEntity>,
    private readonly creditsService: CreditsService,
  ) {}

  /**
   * 执行技能
   * - 仅 published 技能可执行
   * - 按 runtimeType 分派：markdown-only/openclaw-skill → 会话；python-cli/node-cli → 子进程；docker/rest-api → 暂不支持
   * - 写入 SkillInstallLog（action='execute'），成功时自增 callCount
   */
  async execute(
    packageId: number,
    input: Record<string, unknown>,
    userId: number,
  ) {
    if (!userId) {
      BusinessException.throw(ErrorCode.UNAUTHORIZED, '执行技能需要登录');
    }
    const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
    if (!pkg || pkg.status !== 'published') {
      BusinessException.throw(ErrorCode.NOT_FOUND, '技能不存在或未上架');
    }

    // 积分预扣（基础费用 5 积分，后续可扩展为按技能定价）
    const estimatedCost = 5;
    let frozenTxnId: number | null = null;
    try {
      const freezeTxn = await this.creditsService.freezeCredits(
        userId,
        estimatedCost,
        'model_call',
        `skill_${packageId}`,
      );
      frozenTxnId = freezeTxn.id;
    } catch {
      BusinessException.throw(ErrorCode.FORBIDDEN, '积分余额不足，请充值');
    }

    const startTime = Date.now();
    let result: 'success' | 'failed' = 'success';
    let errorMessage: string | undefined;

    try {
      let output: unknown;
      switch (pkg.runtimeType) {
        case 'markdown-only':
        case 'openclaw-skill':
          output = await this.executeAsOpcSkill(pkg, input, userId);
          break;
        case 'python-cli':
          output = await this.executeAsCli(pkg, input, 'python');
          break;
        case 'node-cli':
          output = await this.executeAsCli(pkg, input, 'node');
          break;
        case 'docker':
        case 'rest-api':
          BusinessException.throw(
            ErrorCode.VALIDATION_FAILED,
            '暂不支持该运行类型',
          );
          break;
        default:
          BusinessException.throw(
            ErrorCode.VALIDATION_FAILED,
            `不支持的运行类型: ${pkg.runtimeType}`,
          );
      }
      await this.packageRepo.increment({ id: packageId }, 'callCount', 1);

      // 结算积分（成功 = 扣除预估费用）
      if (frozenTxnId) {
        try {
          await this.creditsService.settleCredits(userId, frozenTxnId, estimatedCost);
        } catch (err) {
          this.logger.error(`技能执行积分结算失败: ${(err as Error).message}`);
        }
      }

      return output;
    } catch (e) {
      result = 'failed';
      errorMessage = ((e as Error).message || '执行失败').slice(0, 1024);
      // 执行失败，退回冻结积分
      if (frozenTxnId) {
        try {
          await this.creditsService.refundCredits(userId, frozenTxnId);
        } catch (refundErr) {
          this.logger.error(`技能执行积分退款失败: ${(refundErr as Error).message}`);
        }
      }
      throw e;
    } finally {
      await this.writeLog(
        packageId,
        userId,
        'execute',
        result,
        Date.now() - startTime,
        errorMessage,
      );
    }
  }

  /**
   * 以 OPC 技能方式执行：读取 SKILL.md，创建关联会话。
   * workflow 类型提示用户在对话中直接使用完整流程；skill 类型提示已加载。
   */
  private async executeAsOpcSkill(
    pkg: SkillPackageEntity,
    input: Record<string, unknown>,
    userId: number,
  ) {
    const skillMdPath =
      pkg.skillMdPath ||
      (pkg.installPath ? path.join(pkg.installPath, 'SKILL.md') : null);
    if (skillMdPath) {
      try {
        await fs.readFile(skillMdPath, 'utf-8');
      } catch (e) {
        this.logger.warn(`读取 SKILL.md 失败: ${(e as Error).message}`);
      }
    }

    const session = new ChatSessionEntity();
    session.title = `[技能] ${pkg.displayName}`;
    session.modelId = 'default';
    session.agentId = `skill:${pkg.name}`;
    session.userId = userId;
    session.groupId = 0;
    const saved = await this.sessionRepo.save(session);

    return {
      sessionId: saved.id,
      skillName: pkg.name,
      skillType: pkg.skillType,
      input,
      message:
        pkg.skillType === 'workflow'
          ? '已启动完整流程，请在此对话中直接使用'
          : '已加载技能，可以在对话中调用',
    };
  }

  /**
   * 以 CLI 方式执行：使用 execFile（非 exec）启动 python3/node，30s 超时。
   * 输入以 JSON 经命令行参数传入（execFile 不经 shell，参数直传，避免注入），
   * stdout 作为输出返回。
   */
  private async executeAsCli(
    pkg: SkillPackageEntity,
    input: Record<string, unknown>,
    runtime: 'python' | 'node',
  ) {
    if (!pkg.entryPoint) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '技能未配置入口文件');
    }
    if (!pkg.installPath) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '技能未安装');
    }
    const cmd = runtime === 'python' ? 'python3' : 'node';
    const args = [pkg.entryPoint, JSON.stringify(input)];
    try {
      const { stdout } = await execFileAsync(cmd, args, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: pkg.installPath,
      });
      return {
        skillName: pkg.name,
        skillType: pkg.skillType,
        message: '执行完成',
        output: stdout,
      };
    } catch (e) {
      const err = e as Error & { stderr?: string };
      BusinessException.throw(
        ErrorCode.VALIDATION_FAILED,
        `技能执行失败: ${err.stderr || err.message}`,
      );
    }
  }

  /**
   * 健康检查：按 runtimeType 校验关键文件是否存在。
   * markdown-only/openclaw-skill → skillMdPath；python-cli/node-cli → entryPoint；docker → installPath/Dockerfile。
   * 写入 SkillInstallLog（action='health_check'）。
   */
  async healthCheck(packageId: number) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '技能不存在');
    }

    const startTime = Date.now();
    let healthy = false;
    let detail = '';

    try {
      switch (pkg.runtimeType) {
        case 'markdown-only':
        case 'openclaw-skill':
          if (pkg.skillMdPath) {
            await fs.access(pkg.skillMdPath);
            healthy = true;
            detail = 'SKILL.md 存在';
          } else {
            detail = '未配置 skillMdPath';
          }
          break;
        case 'python-cli':
        case 'node-cli':
          if (pkg.entryPoint && pkg.installPath) {
            await fs.access(path.join(pkg.installPath, pkg.entryPoint));
            healthy = true;
            detail = '入口文件存在';
          } else if (!pkg.entryPoint) {
            detail = '未配置 entryPoint';
          } else {
            detail = '未配置 installPath';
          }
          break;
        case 'docker':
          if (pkg.installPath) {
            await fs.access(path.join(pkg.installPath, 'Dockerfile'));
            healthy = true;
            detail = 'Dockerfile 存在';
          } else {
            detail = '未配置 installPath';
          }
          break;
        default:
          detail = `不支持的运行类型: ${pkg.runtimeType}`;
      }
    } catch (e) {
      detail = `健康检查失败: ${(e as Error).message}`;
    }

    await this.writeLog(
      packageId,
      undefined,
      'health_check',
      healthy ? 'success' : 'failed',
      Date.now() - startTime,
      healthy ? undefined : detail,
    );

    return { healthy, detail };
  }

  /** 写入安装/执行日志 */
  private async writeLog(
    packageId: number,
    userId: number | undefined,
    action: SkillInstallLogEntity['action'],
    result: SkillInstallLogEntity['result'],
    durationMs: number,
    errorMessage?: string,
  ) {
    const log = new SkillInstallLogEntity();
    log.packageId = packageId;
    log.userId = userId;
    log.action = action;
    log.result = result;
    log.durationMs = durationMs;
    if (errorMessage) {
      log.errorMessage = errorMessage.slice(0, 1024);
    }
    await this.logRepo.save(log);
  }
}
