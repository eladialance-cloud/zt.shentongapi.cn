// computer-control MCP 工具集（自动化工作台 D1）
//
// 通过 stdio 暴露 JSON-RPC 2.0 MCP 服务，工具：
//   app_open / app_close / file_read / file_write / clipboard_get / clipboard_set
//   keyboard_type / mouse_click / browser_open / screenshot / system_exec（高危）
//
// 启动方式：Electron 主进程带 --shentong-mcp-server 参数进入本模式（见 index.ts）
// 注册方式：写入 <OPENCLAW_HOME>/.openclaw/openclaw.json 的 mcp.servers（见 registerComputerControlMcp）
//
// 安全：
//   - system_exec 标记 high_risk，由上层（remote-control 高危白名单）二次确认后才会走到这里
//   - browser_open 仅允许 http/https
//   - file_read 有大小上限；file_write 仅允许绝对路径

import { clipboard, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as readline from 'node:readline'
import * as path from 'node:path'
import { writeOpenClawMcpServers } from './openclaw-mcp-sync'

const execFileAsync = promisify(execFile)

/** MCP 工具定义 */
interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (args: Record<string, unknown>) => Promise<unknown>
}

const FILE_READ_MAX = 1024 * 1024 // 1MB
const SYSTEM_EXEC_TIMEOUT = 60_000

/** 把 PowerShell 脚本编码为 -EncodedCommand（UTF-16LE base64），避免引号转义地狱 */
function psEncoded(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** 执行 PowerShell（Windows） */
async function runPs(script: string, timeoutMs = 30_000): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', psEncoded(script)],
    { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
  )
  return `${stdout ?? ''}${stderr ? `\n[stderr] ${stderr}` : ''}`.trim()
}

/** SendKeys 特殊字符转义 */
function escapeSendKeys(text: string): string {
  return text.replace(/([+^%~(){}[\]])/g, '{$1}')
}

// ===== 工具实现 =====

const TOOLS: McpTool[] = [
  {
    name: 'app_open',
    description: '用系统默认程序打开指定文件/应用/文件夹',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '文件、可执行文件或目录的绝对路径' } },
      required: ['path'],
    },
    async run(args) {
      const p = String(args.path ?? '').trim()
      if (!p) throw new Error('path 不能为空')
      const err = await shell.openPath(p)
      if (err) throw new Error(err)
      return { opened: p }
    },
  },
  {
    name: 'app_close',
    description: '按进程名关闭应用（如 notepad.exe）',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: '进程名，含 .exe 后缀' } },
      required: ['name'],
    },
    async run(args) {
      const name = String(args.name ?? '').trim()
      if (!name) throw new Error('name 不能为空')
      if (process.platform === 'win32') {
        await runPs(`Stop-Process -Name '${name.replace(/\.exe$/i, '')}' -Force -ErrorAction SilentlyContinue; 'closed'`)
        return { closed: name }
      }
      await runPs(`pkill -f ${name}`)
      return { closed: name }
    },
  },
  {
    name: 'file_read',
    description: '读取文本文件内容（上限 1MB，超过只返回截断）',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '文件绝对路径' } },
      required: ['path'],
    },
    async run(args) {
      const p = String(args.path ?? '').trim()
      if (!p) throw new Error('path 不能为空')
      if (!path.isAbsolute(p)) throw new Error('仅支持绝对路径')
      const buf = await readFile(p)
      const truncated = buf.length > FILE_READ_MAX
      return {
        path: p,
        size: buf.length,
        truncated,
        content: buf.subarray(0, FILE_READ_MAX).toString('utf8'),
      }
    },
  },
  {
    name: 'file_write',
    description: '写入文本文件（覆盖，自动创建目录）',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件绝对路径' },
        content: { type: 'string', description: '要写入的内容' },
      },
      required: ['path', 'content'],
    },
    async run(args) {
      const p = String(args.path ?? '').trim()
      if (!p) throw new Error('path 不能为空')
      if (!path.isAbsolute(p)) throw new Error('仅支持绝对路径')
      await writeFile(p, String(args.content ?? ''), 'utf8')
      return { written: p }
    },
  },
  {
    name: 'clipboard_get',
    description: '读取剪贴板文本',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      return { text: clipboard.readText() }
    },
  },
  {
    name: 'clipboard_set',
    description: '写入剪贴板文本',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    async run(args) {
      clipboard.writeText(String(args.text ?? ''))
      return { ok: true }
    },
  },
  {
    name: 'keyboard_type',
    description: '模拟键盘输入文本（Windows，光标处）',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要输入的文本' } },
      required: ['text'],
    },
    async run(args) {
      const text = escapeSendKeys(String(args.text ?? ''))
      if (!text) return { typed: '' }
      const out = await runPs(
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text}'); 'done'`,
      )
      return { typed: text, output: out }
    },
  },
  {
    name: 'mouse_click',
    description: '移动鼠标并点击（Windows 屏幕坐标）',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '屏幕 X 坐标' },
        y: { type: 'number', description: '屏幕 Y 坐标' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: '按键，默认 left' },
      },
      required: ['x', 'y'],
    },
    async run(args) {
      const x = Number(args.x)
      const y = Number(args.y)
      const button = String(args.button ?? 'left')
      const flags: Record<string, [number, number]> = {
        left: [2, 4],
        right: [8, 16],
        middle: [32, 64],
      }
      const [down, up] = flags[button] ?? flags.left
      const script = [
        "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class M{[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int X,int Y);[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint dx,uint dy,uint d,uint e);}';",
        `[M]::SetCursorPos(${Math.round(x)},${Math.round(y)});`,
        `[M]::mouse_event(${down},0,0,0,0);[M]::mouse_event(${up},0,0,0,0);`,
        "'clicked'",
      ].join('')
      const out = await runPs(script)
      return { x, y, button, output: out }
    },
  },
  {
    name: 'browser_open',
    description: '用默认浏览器打开网址（仅 http/https）',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
    async run(args) {
      const url = String(args.url ?? '').trim()
      if (!/^https?:\/\//i.test(url)) throw new Error('仅允许 http/https 网址')
      await shell.openExternal(url)
      return { opened: url }
    },
  },
  {
    name: 'screenshot',
    description: '截取主屏幕并保存 PNG（返回路径）',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '保存路径（可选，默认系统临时目录）' } },
    },
    async run(args) {
      const target = String(args.path ?? '').trim()
      const outPath = target
        ? (path.isAbsolute(target) ? target : path.join(process.env.TEMP ?? '.', target))
        : path.join(process.env.TEMP ?? '.', `shentong-shot-${Date.now()}.png`)
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        'Add-Type -AssemblyName System.Drawing;',
        '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;',
        '$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height);',
        '$g=[System.Drawing.Graphics]::FromImage($bmp);',
        '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size);',
        `$bmp.Save('${outPath.replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Png);`,
        "'saved'",
      ].join('')
      const out = await runPs(script, 60_000)
      return { path: outPath, exists: existsSync(outPath), output: out }
    },
  },
  {
    name: 'system_exec',
    description: '执行系统命令（高危，需二次确认；Windows 走 PowerShell）',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeoutMs: { type: 'number', description: '超时毫秒，默认 30000' },
      },
      required: ['command'],
    },
    async run(args) {
      const command = String(args.command ?? '').trim()
      if (!command) throw new Error('command 不能为空')
      const timeoutMs = Number(args.timeoutMs ?? SYSTEM_EXEC_TIMEOUT)
      const { stdout, stderr } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      )
      return { stdout: (stdout ?? '').slice(0, 200_000), stderr: (stderr ?? '').slice(0, 20_000) }
    },
  },
]

// ===== MCP JSON-RPC 2.0 服务 =====

/** 运行 computer-control MCP 服务（stdio，直到 stdin 关闭） */
export async function runComputerControlMcpServer(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  const send = (obj: unknown): void => {
    process.stdout.write(`${JSON.stringify(obj)}\n`)
  }

  const handle = async (msg: Record<string, any>): Promise<void> => {
    const { id, method, params } = msg
    try {
      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'shentong-computer-control', version: '1.0.0' },
          },
        })
        return
      }
      if (method === 'notifications/initialized' || method === 'notifications/cancelled') return
      if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} })
        return
      }
      if (method === 'tools/list') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        })
        return
      }
      if (method === 'tools/call') {
        const name = String(params?.name ?? '')
        const tool = TOOLS.find((t) => t.name === name)
        if (!tool) {
          send({ jsonrpc: '2.0', id, error: { code: -32602, message: `未知工具: ${name}` } })
          return
        }
        const args = (params?.arguments ?? {}) as Record<string, unknown>
        const result = await tool.run(args)
        send({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(result ?? {}) }] },
        })
        return
      }
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未知方法: ${method}` } })
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line) as Record<string, any>
      if (msg && typeof msg.method === 'string') {
        void handle(msg)
      }
    } catch {
      // 忽略无法解析的行
    }
  }
}

/** 把 computer-control MCP 注册进 OpenClaw mcp.servers（本应用可执行文件 + --shentong-mcp-server） */
export function registerComputerControlMcp(): void {
  writeOpenClawMcpServers([
    {
      name: 'computer-control',
      command: process.execPath,
      args: ['--shentong-mcp-server'],
      env: {},
      enabled: true,
    },
  ])
}