/** @jest-environment node */
// 定时任务守护服务（Windows 计划任务）— 单测
// 锚点：electron/main/cron-service.ts
import {
  CronService,
  buildTaskCommand,
  buildCreateArgs,
  buildDeleteArgs,
  parseTaskRunning,
  CRON_TASK_NAME,
  CRON_DAEMON_FLAG,
  type ExecLike,
} from '../../electron/main/cron-service';

describe('cron-service 纯函数', () => {
  it('buildTaskCommand：引号包裹 exe + 守护参数', () => {
    expect(buildTaskCommand('C:\\app\\ShenTongAI.exe')).toBe(
      `"C:\\app\\ShenTongAI.exe" ${CRON_DAEMON_FLAG}`,
    );
  });

  it('buildCreateArgs：ONLOGON + LIMITED + /F（幂等覆盖）', () => {
    const args = buildCreateArgs(CRON_TASK_NAME, 'C:\\a b\\x.exe');
    expect(args).toContain('/Create');
    expect(args).toContain(CRON_TASK_NAME);
    expect(args.slice(args.indexOf('/SC'), args.indexOf('/SC') + 2)).toEqual(['/SC', 'ONLOGON']);
    expect(args.slice(args.indexOf('/RL'), args.indexOf('/RL') + 2)).toEqual(['/RL', 'LIMITED']);
    expect(args).toContain('/F');
  });

  it('buildDeleteArgs：/Delete + /F', () => {
    expect(buildDeleteArgs('T')).toEqual(['/Delete', '/TN', 'T', '/F']);
  });

  it('parseTaskRunning：容错英文/中文状态', () => {
    expect(parseTaskRunning('Status:        Running')).toBe(true);
    expect(parseTaskRunning('状态: 正在运行')).toBe(true);
    expect(parseTaskRunning('Status: Ready')).toBe(false);
    expect(parseTaskRunning('')).toBe(false);
  });
});

describe('cron-service 生命周期', () => {
  it('非 Windows：不支持，直接拒绝安装', async () => {
    const svc = new CronService({ execPath: 'x', isPackaged: true, platform: 'darwin' });
    const st = await svc.status();
    expect(st.supported).toBe(false);
    const r = await svc.install();
    expect(r.ok).toBe(false);
  });

  it('开发环境：拒绝安装', async () => {
    const svc = new CronService({ execPath: 'x', isPackaged: false, platform: 'win32' });
    const r = await svc.install();
    expect(r.ok).toBe(false);
    expect(r.error).toContain('开发环境');
  });

  it('安装：调用 schtasks /Create 并回读状态', async () => {
    const calls: string[][] = [];
    const exec: ExecLike = async (_f, args) => {
      calls.push(args);
      if (args[0] === '/Query') {
        return { stdout: 'Task To Run: "C:\\app\\x.exe" --shentong-cron-daemon\nStatus: Running', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    };
    const svc = new CronService({ execPath: 'C:\\app\\x.exe', isPackaged: true, platform: 'win32', exec });
    const r = await svc.install();
    expect(r.ok).toBe(true);
    expect(calls[0]).toContain('/Create');
    expect(r.status?.installed).toBe(true);
    expect(r.status?.running).toBe(true);
    expect(r.status?.command).toContain(CRON_DAEMON_FLAG);
  });

  it('状态查询：任务不存在时 installed=false 且不算错误', async () => {
    const exec: ExecLike = async () => {
      throw new Error('ERROR: The system cannot find the file specified.')
    };
    const svc = new CronService({ execPath: 'x', isPackaged: true, platform: 'win32', exec });
    const st = await svc.status();
    expect(st.installed).toBe(false);
    expect(st.error).toBeUndefined();
  });

  it('删除：任务不存在视为幂等成功', async () => {
    const exec: ExecLike = async (_f, args) => {
      if (args[0] === '/Delete') throw new Error('cannot find')
      return { stdout: '', stderr: '' }
    };
    const svc = new CronService({ execPath: 'x', isPackaged: true, platform: 'win32', exec });
    const r = await svc.uninstall();
    expect(r.ok).toBe(true);
  });
});
