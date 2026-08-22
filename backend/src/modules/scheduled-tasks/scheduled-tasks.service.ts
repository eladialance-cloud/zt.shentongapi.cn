import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ScheduledTaskEntity } from './entities/scheduled-task.entity';
import { CreateScheduledTaskDto, UpdateScheduledTaskDto } from './dto/scheduled-task.dto';

export type ScheduledTaskStatus = 'active' | 'paused' | 'done' | 'failed';

/** 解析 HH:mm → 下次出现时间（from 之后最近的该时刻；weekly 对齐到 weekday，1=周一） */
export function computeNextRunAt(
  repeatType: 'once' | 'daily' | 'weekly',
  runTime: string | null | undefined,
  weekday: number | null | undefined,
  dueAt: Date | null | undefined,
  from: Date = new Date(),
): Date | null {
  if (repeatType === 'once') {
    return dueAt ? new Date(dueAt) : null;
  }
  if (!runTime) return null;
  const [h, m] = runTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setHours(h, m);
  if (repeatType === 'daily') {
    if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  // weekly
  const wd = Number(weekday);
  if (Number.isNaN(wd) || wd < 1 || wd > 7) return null;
  const targetJsDay = wd % 7; // 1=周一 → 1；7=周日 → 0
  let diff = (targetJsDay - d.getDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= from.getTime()) diff = 7;
  else if (diff === 0) diff = 0;
  if (diff > 0) d.setDate(d.getDate() + diff);
  return d;
}

/** 组装可持久化字段 */
function buildFields(dto: CreateScheduledTaskDto | UpdateScheduledTaskDto) {
  const repeatType = (dto.repeatType ?? 'once') as 'once' | 'daily' | 'weekly';
  const runTime = dto.runTime ?? null;
  const weekday = dto.weekday ?? null;
  const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
  return { repeatType, runTime, weekday, dueAt };
}

@Injectable()
export class ScheduledTasksService {
  constructor(
    @InjectRepository(ScheduledTaskEntity)
    private readonly repo: Repository<ScheduledTaskEntity>,
  ) {}

  private assertValid(repeatType: string, runTime?: string | null, weekday?: number | null, dueAt?: Date | null) {
    if (repeatType === 'once' && !dueAt) {
      throw new BadRequestException('once 类型需提供 dueAt');
    }
    if ((repeatType === 'daily' || repeatType === 'weekly') && !runTime) {
      throw new BadRequestException(`${repeatType} 类型需提供 runTime(HH:mm)`);
    }
    if (repeatType === 'weekly' && (weekday == null || weekday < 1 || weekday > 7)) {
      throw new BadRequestException('weekly 类型需提供 weekday(1-7)');
    }
  }

  async create(userId: number, dto: CreateScheduledTaskDto): Promise<ScheduledTaskEntity> {
    const { repeatType, runTime, weekday, dueAt } = buildFields(dto);
    this.assertValid(repeatType, runTime, weekday, dueAt);
    const nextRunAt = computeNextRunAt(repeatType, runTime, weekday, dueAt);
    if (!nextRunAt) throw new BadRequestException('无法计算下次触发时间，请检查时间字段');
    const entity = this.repo.create({
      userId,
      title: dto.title,
      description: dto.description ?? null,
      teamId: dto.teamId ?? null,
      repeatType,
      runTime: runTime ?? null,
      weekday: weekday ?? null,
      dueAt: dueAt ?? null,
      nextRunAt,
      status: 'active',
    });
    return this.repo.save(entity);
  }

  async list(userId: number): Promise<ScheduledTaskEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { nextRunAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async getOne(userId: number, id: number): Promise<ScheduledTaskEntity> {
    const item = await this.repo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException(`定时任务 ${id} 不存在`);
    return item;
  }

  async update(userId: number, id: number, dto: UpdateScheduledTaskDto): Promise<ScheduledTaskEntity> {
    const item = await this.getOne(userId, id);
    const repeatType = (dto.repeatType ?? item.repeatType) as 'once' | 'daily' | 'weekly';
    const runTime = dto.runTime ?? item.runTime ?? null;
    const weekday = dto.weekday ?? item.weekday ?? null;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : item.dueAt ?? null;
    this.assertValid(repeatType, runTime, weekday, dueAt);
    Object.assign(item, {
      title: dto.title ?? item.title,
      description: dto.description !== undefined ? dto.description : item.description,
      teamId: dto.teamId !== undefined ? dto.teamId : item.teamId,
      repeatType,
      runTime: runTime ?? null,
      weekday: weekday ?? null,
      dueAt: dueAt ?? null,
      nextRunAt: computeNextRunAt(repeatType, runTime, weekday, dueAt),
      status: dto.status ?? (item.status === 'failed' ? 'active' : item.status),
    });
    return this.repo.save(item);
  }

  async remove(userId: number, id: number): Promise<void> {
    const item = await this.getOne(userId, id);
    await this.repo.remove(item);
  }

  /** 触发占位（原子）：仅 active 且到期且无未过期 firing 时返回任务，10 分钟窗口内幂等 */
  async fire(userId: number, id: number): Promise<ScheduledTaskEntity> {
    const token = randomUUID();
    const res = await this.repo
      .createQueryBuilder()
      .update()
      .set({
        firingToken: token,
        firingExpireAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      .where('id = :id AND user_id = :userId AND status = :status AND next_run_at <= NOW()', {
        id,
        userId,
        status: 'active',
      })
      .andWhere('(firing_token IS NULL OR firing_expire_at < NOW())')
      .execute();
    if (!res.affected) {
      throw new BadRequestException('定时任务未到期或正在触发中');
    }
    const item = await this.repo.findOne({ where: { id, userId } });
    if (!item) throw new NotFoundException(`定时任务 ${id} 不存在`);
    return item;
  }

  /** 触发完成回执：推进下次时间；once 成功 → done，once 失败 → failed */
  async fired(userId: number, id: number, body: { success?: boolean; error?: string }): Promise<ScheduledTaskEntity> {
    const item = await this.getOne(userId, id);
    if (!item.firingToken) return item;
    const success = body.success !== false;
    const now = new Date();
    const next =
      item.repeatType === 'once'
        ? null
        : computeNextRunAt(
            item.repeatType as 'daily' | 'weekly',
            item.runTime ?? null,
            item.weekday ?? null,
            null,
            now,
          );
    const nextStatus: ScheduledTaskStatus =
      item.repeatType === 'once' ? (success ? 'done' : 'failed') : 'active';
    Object.assign(item, {
      lastRunAt: now,
      lastError: body.error ? String(body.error).slice(0, 2000) : null,
      firingToken: null,
      firingExpireAt: null,
      nextRunAt: next,
      status: nextStatus,
    });
    return this.repo.save(item);
  }
}
