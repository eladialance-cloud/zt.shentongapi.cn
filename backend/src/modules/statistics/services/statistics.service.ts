import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublishPlanEntity } from '../../channel/entities/publish-plan.entity';
import { AgentTaskEntity } from '../../task/entities/agent-task.entity';
import { TeamTaskEntity } from '../../team/entities/team-task.entity';
import { MediaAssetEntity } from '../../media-assets/entities/media-asset.entity';

/** 30 天发布趋势点（date: YYYY-MM-DD） */
export interface PublishTrendPoint {
  date: string;
  count: number;
}

/** 平台分布项 */
export interface PlatformDistItem {
  platform: string;
  count: number;
}

/** 用户侧数据分析总览（Task 7 契约，按 userId 聚合，不加新表） */
export interface UserOverviewResult {
  weekPublished: number;
  weekCompletedTasks: number;
  assetCount: number;
  pendingReview: number;
  publishTrend30d: PublishTrendPoint[];
  platformDist: PlatformDistItem[];
}

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(PublishPlanEntity)
    private readonly publishPlanRepo: Repository<PublishPlanEntity>,
    @InjectRepository(AgentTaskEntity)
    private readonly agentTaskRepo: Repository<AgentTaskEntity>,
    @InjectRepository(TeamTaskEntity)
    private readonly teamTaskRepo: Repository<TeamTaskEntity>,
    @InjectRepository(MediaAssetEntity)
    private readonly mediaAssetRepo: Repository<MediaAssetEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'statistics' };
  }

  /**
   * 用户侧数据分析总览
   * 近 7 天口径与任务中心一致：当天 0 点往前推 6 天（含今天）。
   * team_tasks 无 user_id 字段；按 team.service 的归属逻辑，任务由团队创建者创建
   * （createTask 写入 creator_id = 团队创建者），故以 creator_id = userId 过滤，
   * 等价于统计本人直接创建 team 的任务。
   */
  async getUserOverview(userId: number): Promise<UserOverviewResult> {
    const now = new Date();
    const weekStart = this.startOfDay(now);
    weekStart.setDate(weekStart.getDate() - 6);

    const [publishedPlans, pendingPlans, agentTasks, teamTasks, assetCount] = await Promise.all([
      this.publishPlanRepo.find({ where: { userId, status: 'published' } }),
      this.publishPlanRepo.find({ where: { userId, status: 'pending_review' } }),
      this.agentTaskRepo.find({ where: { userId, status: 'success' } }),
      this.teamTaskRepo.find({ where: { creatorId: userId, status: 'completed' } }),
      this.mediaAssetRepo.count({ where: { userId } }),
    ]);

    const weekStartMs = weekStart.getTime();
    const weekPublished = publishedPlans.filter((p) => this.effectiveTime(p) >= weekStartMs).length;
    const weekAgentTasks = agentTasks.filter((t) => this.timeOf(t.finishedAt) >= weekStartMs).length;
    const weekTeamTasks = teamTasks.filter((t) => this.timeOf(t.completedAt) >= weekStartMs).length;

    return {
      weekPublished,
      weekCompletedTasks: weekAgentTasks + weekTeamTasks,
      assetCount,
      pendingReview: pendingPlans.length,
      publishTrend30d: this.buildPublishTrend(publishedPlans, now),
      platformDist: this.buildPlatformDist(publishedPlans),
    };
  }

  /** 当天 0 点（本地时区） */
  private startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** 发布时间：publishedAt 为空回退 createdAt（与周发布口径一致） */
  private effectiveTime(plan: PublishPlanEntity): number {
    return this.timeOf(plan.publishedAt ?? plan.createdAt);
  }

  private timeOf(value: Date | null | undefined): number {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }

  private fmtDay(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** 近 30 天每日已发布数：按 effective 日期聚合，缺 0 补零，升序 */
  private buildPublishTrend(plans: PublishPlanEntity[], now: Date): PublishTrendPoint[] {
    const start = this.startOfDay(now);
    start.setDate(start.getDate() - 29);
    const days: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(this.fmtDay(d));
    }
    const counts = new Map<string, number>();
    for (const plan of plans) {
      const key = this.fmtDay(new Date(this.effectiveTime(plan)));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return days.map((date) => ({ date, count: counts.get(date) ?? 0 }));
  }

  /** 平台分布：已发布计划的 targetPlatforms 平铺计数（同一计划多平台各计一次） */
  private buildPlatformDist(plans: PublishPlanEntity[]): PlatformDistItem[] {
    const counts = new Map<string, number>();
    for (const plan of plans) {
      for (const platform of plan.targetPlatforms ?? []) {
        counts.set(platform, (counts.get(platform) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));
  }
}
