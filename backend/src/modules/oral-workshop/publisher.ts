/**
 * 口播工坊发布包导出（M6-4）
 *
 * 入参：已 done 的任务
 * 产出：发布包 JSON（video_url / 主标题 / 副标题 / 发布描述 / 话题标签 / cover_url / 建议发布时间）
 *      + 创建 channel.publish_plans 记录（target_platforms=[douyin]，mode=manual，media_urls=产物）
 * 幂等：任务已有 publish_plan_id 时直接返回既有发布包，不重复建单。
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OralWorkshopJobEntity } from './entities/oral-workshop-job.entity';
import { OralWorkshopStepEntity } from './entities/oral-workshop-step.entity';
import { PublishService } from '../channel/services/publish.service';
import { deriveTitle } from './compose-inputs';

export interface PublishPackage {
  job_id: number;
  video_url: string;
  title: string;
  subtitle: string;
  description: string;
  topic_tags: string[];
  cover_url?: string;
  suggested_time: string;
  target_platforms: string[];
  plan_id?: number;
}

/** 建议发布时间：次日 20:00（黄金时段），ISO 字符串 */
export function suggestedPublishTime(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 24 * 3600 * 1000);
  d.setHours(20, 0, 0, 0);
  return d.toISOString();
}

/** 从文案抽取 3 个话题标签（按标点切分取前 3 段，每段不超过 10 字，去重） */
export function deriveTopicTags(script: string, count = 3): string[] {
  const parts = String(script ?? '')
    .split(/[。！？!?；;，,\n\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 10);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const p of parts) {
    const key = p.slice(0, 8);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(p.slice(0, 8));
    if (tags.length >= count) break;
  }
  return tags.length ? tags : ['口播短视频'];
}

@Injectable()
export class OralWorkshopPublisher {
  private readonly logger = new Logger(OralWorkshopPublisher.name);

  constructor(
    @InjectRepository(OralWorkshopJobEntity)
    private readonly jobRepo: Repository<OralWorkshopJobEntity>,
    @InjectRepository(OralWorkshopStepEntity)
    private readonly stepRepo: Repository<OralWorkshopStepEntity>,
    private readonly publishService: PublishService,
  ) {}

  /** 导出发布包（幂等） */
  async exportPackage(userId: number, jobId: number): Promise<PublishPackage> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId } });
    if (!job) throw new BadRequestException('口播工坊任务不存在');
    if (job.status !== 'done') throw new BadRequestException('任务未完成，无法导出发布包');
    if (!job.videoUrl) throw new BadRequestException('任务缺少成片，无法导出发布包');

    const pkg = await this.buildPackage(job);

    if (job.publishPlanId) {
      pkg.plan_id = job.publishPlanId;
      return pkg;
    }

    const plan = await this.publishService.createPlan(userId, {
      title: pkg.title,
      content: pkg.description,
      mediaUrls: [pkg.video_url, pkg.cover_url].filter((u): u is string => Boolean(u)),
      targetPlatforms: pkg.target_platforms,
      mode: 'manual',
      taskId: jobId,
    });
    job.publishPlanId = plan.id;
    await this.jobRepo.save(job);
    pkg.plan_id = plan.id;
    this.logger.log(`[oral-workshop] 任务 ${job.id} 发布包已生成（plan=${plan.id}）`);
    return pkg;
  }

  /** 组装发布包 JSON（标题/副标题优先取 titleCover 步骤产物，缺失时按文案兜底） */
  private async buildPackage(job: OralWorkshopJobEntity): Promise<PublishPackage> {
    const script = job.rewrittenScript || job.scriptInput || '';
    const step = await this.stepRepo.findOne({ where: { jobId: job.id, step: 'titleCover' } });
    const titleArtifact = (step?.resultJson ?? {}) as { title_h1?: string; title_h2?: string };
    const fallback = deriveTitle(script);
    const h1 = titleArtifact.title_h1 || fallback.h1;
    const h2 = titleArtifact.title_h2 || fallback.h2;
    const description = [h1, h2].filter(Boolean).concat([script.slice(0, 200)]).filter(Boolean).join('\n');
    return {
      job_id: job.id,
      video_url: job.videoUrl ?? '',
      title: h1,
      subtitle: h2,
      description,
      topic_tags: deriveTopicTags(script),
      cover_url: job.coverUrl ?? undefined,
      suggested_time: suggestedPublishTime(),
      target_platforms: ['douyin'],
    };
  }
}
