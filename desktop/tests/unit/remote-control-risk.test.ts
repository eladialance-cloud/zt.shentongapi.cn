// remote-control 高危命令判定（安全审计 S-04）
// 背景：云端 sync 通道可下发 file_read / file_open，原本不在高危集合内，
//      持有 JWT 或被攻陷的服务端可无提示读取本机任意文件并回传内容。
import { isHighRiskCommand, parseCommand } from '../../electron/main/remote-control'

describe('remote-control 高危判定', () => {
  it('file_read / file_open 必须视为高危（S-04 核心）', () => {
    const read = parseCommand('读取文件 C:\\Users\\a\\.ssh\\id_rsa', 'c1', 'feishu')
    const open = parseCommand('打开文件 C:\\Windows\\System32\\calc.exe', 'c2', 'feishu')
    expect(read.type).toBe('file_read')
    expect(open.type).toBe('file_open')
    expect(isHighRiskCommand(read)).toBe(true)
    expect(isHighRiskCommand(open)).toBe(true)
  })

  it('云端直接指定类型也不能绕过高危判定', () => {
    for (const t of ['file_read', 'file_open', 'run_scenario'] as const) {
      const cmd = parseCommand('任意文本', 'c3', 'feishu', t)
      expect(cmd.type).toBe(t)
      expect(isHighRiskCommand(cmd)).toBe(true)
    }
  })

  it('run_scenario 是高危（其步骤可含 system / file_open）', () => {
    expect(
      isHighRiskCommand({ commandId: 'c5', type: 'run_scenario', payload: {}, raw: '', source: 'feishu' }),
    ).toBe(true)
  })

  it('低危命令保持低危（避免把确认弹窗泛化到全部命令）', () => {
    expect(isHighRiskCommand(parseCommand('查询状态', 'c4', 'feishu'))).toBe(false)
    expect(isHighRiskCommand(parseCommand('运行工作流 每日报表', 'c5', 'feishu'))).toBe(false)
    expect(isHighRiskCommand(parseCommand('停止任务 7', 'c6', 'feishu'))).toBe(false)
  })

  it('原有高危项仍为高危（不能回退）', () => {
    for (const t of ['execute_system_command', 'delete_file', 'format_disk', 'modify_system_config'] as const) {
      expect(isHighRiskCommand({ commandId: 'x', type: t, payload: {}, raw: '', source: 'feishu' })).toBe(true)
    }
  })
})
