// S-25 契约锁定测试（源码级静态断言）
// web-preview-inspector.ts 在运行时 import electron（session / webContents），jest 无法直接实例化，
// 因此这里锁定「只允许 web-preview 分区的 webview guest 作为注入目标」的四道校验。
// 审计报告 S-25 的复核结论：实现已具备该校验（无需改代码），本测试防止后续被静默删除。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(
  join(__dirname, '..', '..', 'electron', 'main', 'web-preview-inspector.ts'),
  'utf8',
)
const HANDLER = readFileSync(
  join(__dirname, '..', '..', 'electron', 'main', 'hermes-fs-ipc.ts'),
  'utf8',
)

describe('web-preview-inspect 目标校验（S-25）', () => {
  it('必须校验 webContents 类型为 webview', () => {
    expect(SRC).toMatch(/getType\(\)\s*!==\s*["']webview["']/)
  })

  it('必须校验 hostWebContents 与调用方一致（比分区校验更强）', () => {
    expect(SRC).toMatch(/hostWebContents\s*!==\s*event\.sender/)
  })

  it('必须校验 session 分区为 web-preview', () => {
    expect(SRC).toMatch(/fromPartition\(\s*["']web-preview["']\s*\)/)
  })

  it('必须校验销毁状态', () => {
    expect(SRC).toMatch(/isDestroyed\(\)/)
  })

  it('校验失败必须抛错，不得静默继续', () => {
    expect(SRC).toMatch(/throw new Error\(\s*["']Invalid web preview target["']\s*\)/)
  })

  it('IPC handler 必须把渲染层传入的 id 原样交给校验函数（不得自行放宽）', () => {
    expect(HANDLER).toMatch(/inspectWebPreview\(event,\s*webContentsId,\s*getMainWindow\)/)
  })
})
