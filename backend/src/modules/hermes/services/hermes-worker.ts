/**
 * Hermes 实例 Worker 线程
 * 每个运行中的 Hermes 实例对应一个 worker 线程
 * 负责：心跳上报资源、接收 shutdown 指令优雅退出
 */
import { workerData, parentPort } from 'node:worker_threads';
import { resourceUsage, memoryUsage } from 'node:process';

const instanceId: number = workerData?.instanceId ?? 0;
const skillIds: number[] = workerData?.skillIds ?? [];

// 上次采样时间（用于计算 CPU 百分比）
let lastCpuTime = process.hrtime.bigint();
let lastUserTime = resourceUsage().userCPUTime;
let lastSystemTime = resourceUsage().systemCPUTime;

/**
 * 采样资源使用
 */
function sample(): { cpuPercent: number; memoryMb: number } {
  const mem = memoryUsage();
  const memoryMb = Math.round(mem.rss / (1024 * 1024));

  // CPU 百分比（基于 user+system time 差值 / 实际时间差）
  const now = process.hrtime.bigint();
  const usage = resourceUsage();
  const cpuElapsed =
    (Number(usage.userCPUTime - lastUserTime) +
      Number(usage.systemCPUTime - lastSystemTime)) /
    1_000_000; // μs → ms
  const wallElapsed = Number(now - lastCpuTime) / 1_000_000; // ns → ms

  const cpuPercent =
    wallElapsed > 0 ? Math.min(100, (cpuElapsed / wallElapsed) * 100) : 0;

  lastCpuTime = now;
  lastUserTime = usage.userCPUTime;
  lastSystemTime = usage.systemCPUTime;

  return { cpuPercent: Math.round(cpuPercent * 100) / 100, memoryMb };
}

// 监听父线程消息
parentPort?.on('message', (msg: { type: string }) => {
  switch (msg?.type) {
    case 'sample': {
      const data = sample();
      parentPort?.postMessage({
        type: 'resource',
        cpuPercent: data.cpuPercent,
        memoryMb: data.memoryMb,
      });
      break;
    }
    case 'shutdown': {
      // 优雅退出
      parentPort?.postMessage({ type: 'exiting', instanceId });
      process.exit(0);
    }
  }
});

// 定期自采样（即使没有父线程请求，也保持心跳）
const heartbeatTimer = setInterval(() => {
  const data = sample();
  parentPort?.postMessage({
    type: 'resource',
    cpuPercent: data.cpuPercent,
    memoryMb: data.memoryMb,
  });
}, 5000);

// 确保定时器不会阻止退出
heartbeatTimer.unref();

// 通知父线程已就绪
parentPort?.postMessage({
  type: 'ready',
  instanceId,
  skillIds,
});
