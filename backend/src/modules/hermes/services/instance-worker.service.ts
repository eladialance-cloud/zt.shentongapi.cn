import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HermesInstanceEntity } from '../entities/hermes-instance.entity';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

/** 实例 worker 状态 */
interface InstanceWorker {
  worker: Worker;
  instanceId: number;
  startedAt: Date;
  lastCpuPercent: number;
  lastMemoryMb: number;
}

/** 资源采样消息 */
interface ResourceSample {
  type: 'resource';
  cpuPercent: number;
  memoryMb: number;
}

/**
 * 实例进程管理服务
 * 使用 Node.js worker_threads 管理实例进程生命周期
 * - 启动/停止实例对应实际 worker 线程
 * - 定期采样 CPU/内存
 * - 异常退出自动清理
 */
@Injectable()
export class InstanceWorkerService {
  private readonly logger = new Logger(InstanceWorkerService.name);
  /** 活跃的 worker 映射 instanceId → InstanceWorker */
  private readonly workers = new Map<number, InstanceWorker>();
  /** 资源采样定时器 */
  private readonly sampleTimers = new Map<number, NodeJS.Timeout>();
  /** 采样间隔 ms */
  private readonly SAMPLE_INTERVAL_MS = 5_000;

  constructor(
    @InjectRepository(HermesInstanceEntity)
    private instanceRepo: Repository<HermesInstanceEntity>,
  ) {}

  /**
   * 启动实例 worker
   */
  async startWorker(instance: HermesInstanceEntity): Promise<void> {
    if (this.workers.has(instance.id)) {
      throw new BadRequestException(`实例 ${instance.id} 的 worker 已在运行`);
    }

    const workerPath = join(__dirname, 'hermes-worker.js');

    let worker: Worker;
    try {
      worker = new Worker(workerPath, {
        workerData: {
          instanceId: instance.id,
          skillIds: instance.skillIds || [],
        },
      });
    } catch (err) {
      // worker 文件可能不存在（首次部署），降级为模拟模式
      this.logger.warn(
        `无法启动 worker 线程（降级为模拟模式）: ${(err as Error).message}`,
      );
      return;
    }

    const entry: InstanceWorker = {
      worker,
      instanceId: instance.id,
      startedAt: new Date(),
      lastCpuPercent: 0,
      lastMemoryMb: 0,
    };
    this.workers.set(instance.id, entry);

    // 监听消息（资源采样）
    worker.on('message', (msg: ResourceSample | unknown) => {
      if (msg && typeof msg === 'object' && 'type' in msg && (msg as ResourceSample).type === 'resource') {
        const sample = msg as ResourceSample;
        entry.lastCpuPercent = sample.cpuPercent;
        entry.lastMemoryMb = sample.memoryMb;
      }
    });

    // 监听错误
    worker.on('error', (err) => {
      this.logger.error(
        `实例 ${instance.id} worker 错误: ${err.message}`,
        err.stack,
      );
      this.cleanupWorker(instance.id);
      this.markInstanceError(instance.id, err.message);
    });

    // 监听退出
    worker.on('exit', (code) => {
      this.logger.log(`实例 ${instance.id} worker 退出，code=${code}`);
      this.cleanupWorker(instance.id);
      if (code !== 0) {
        this.markInstanceError(instance.id, `Worker 异常退出 (code=${code})`);
      } else {
        this.markInstanceStopped(instance.id);
      }
    });

    // 启动资源采样
    this.startSampling(instance.id);

    this.logger.log(`实例 ${instance.id} worker 已启动 (threadId=${worker.threadId})`);
  }

  /**
   * 停止实例 worker
   */
  async stopWorker(instanceId: number): Promise<void> {
    const entry = this.workers.get(instanceId);
    if (!entry) {
      this.logger.warn(`实例 ${instanceId} 无活跃 worker，跳过停止`);
      return;
    }

    // 停止采样
    this.stopSampling(instanceId);

    // 通知 worker 优雅退出
    try {
      entry.worker.postMessage({ type: 'shutdown' });
      // 等待 3 秒优雅退出，否则强制 terminate
      await Promise.race([
        new Promise<void>((resolve) => {
          entry.worker.once('exit', () => resolve());
        }),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            entry.worker.terminate();
            resolve();
          }, 3000);
        }),
      ]);
    } catch (err) {
      this.logger.warn(`停止 worker ${instanceId} 异常: ${(err as Error).message}`);
      entry.worker.terminate();
    }

    this.cleanupWorker(instanceId);
  }

  /**
   * 获取实例当前资源使用
   */
  getResourceUsage(instanceId: number): {
    cpuPercent: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
  } | null {
    const entry = this.workers.get(instanceId);
    if (!entry) return null;

    return {
      cpuPercent: entry.lastCpuPercent,
      memoryUsedMb: entry.lastMemoryMb,
      memoryTotalMb: 1024, // 限制 1GB
    };
  }

  /**
   * 检查实例 worker 是否存活
   */
  isAlive(instanceId: number): boolean {
    return this.workers.has(instanceId);
  }

  /**
   * 获取活跃实例 ID 列表
   */
  getActiveInstanceIds(): number[] {
    return [...this.workers.keys()];
  }

  // ============ 内部方法 ============

  private startSampling(instanceId: number): void {
    const timer = setInterval(() => {
      const entry = this.workers.get(instanceId);
      if (!entry) return;

      // 请求 worker 上报资源
      entry.worker.postMessage({ type: 'sample' });

      // 同时更新数据库（异步，不阻塞）
      this.instanceRepo
        .update(instanceId, {
          cpuPercent: entry.lastCpuPercent,
          memoryUsedMb: entry.lastMemoryMb,
        })
        .catch((err) => {
          this.logger.debug(`更新实例 ${instanceId} 资源数据失败: ${err.message}`);
        });
    }, this.SAMPLE_INTERVAL_MS);

    this.sampleTimers.set(instanceId, timer);
  }

  private stopSampling(instanceId: number): void {
    const timer = this.sampleTimers.get(instanceId);
    if (timer) {
      clearInterval(timer);
      this.sampleTimers.delete(instanceId);
    }
  }

  private cleanupWorker(instanceId: number): void {
    this.stopSampling(instanceId);
    this.workers.delete(instanceId);
  }

  private async markInstanceError(
    instanceId: number,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.instanceRepo.update(instanceId, {
        status: 'error',
        errorMessage: errorMessage.slice(0, 512),
        cpuPercent: 0,
        memoryUsedMb: 0,
      });
    } catch (err) {
      this.logger.error(`标记实例 ${instanceId} 为错误状态失败: ${(err as Error).message}`);
    }
  }

  private async markInstanceStopped(instanceId: number): Promise<void> {
    try {
      await this.instanceRepo.update(instanceId, {
        status: 'stopped',
        cpuPercent: 0,
        memoryUsedMb: 0,
      });
    } catch (err) {
      this.logger.error(`标记实例 ${instanceId} 为停止状态失败: ${(err as Error).message}`);
    }
  }
}
