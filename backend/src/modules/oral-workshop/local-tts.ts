/**
 * 本地 TTS 兜底（Windows SAPI / System.Speech）
 *
 * 用途：voiceClone 步骤在未配置火山引擎时的本地降级，零依赖、无需网络。
 * 原理：生成 PowerShell 脚本 + 文案文件（UTF-8 BOM，兼容 Windows PowerShell 5.1），
 *      调用 System.Speech SpeechSynthesizer 输出 WAV。
 * 注意：仅 Windows 可用（依赖系统语音）；Linux 服务器请配置火山引擎或提供音频。
 * 测试可注入 runner 替换真实 spawn。
 */
import { spawn } from 'child_process';
import * as fs from 'fs';

/** PowerShell 脚本模板（参数：文案文件 / 输出 WAV / 语速 -10..10） */
export const SAPI_TTS_PS1 = [
  "param([string]\$TextFile, [string]\$OutFile, [int]\$Rate = 0)",
  "\$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Speech',
  '\$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  'try {',
  '  \$s.Rate = \$Rate',
  '  \$s.SetOutputToWaveFile(\$OutFile)',
  '  \$text = Get-Content -Raw -Encoding UTF8 \$TextFile',
  '  \$s.Speak(\$text)',
  '} finally { \$s.Dispose() }',
].join('\n');

/** 写入可复用的 SAPI 脚本文件（dest 一般位于输出目录） */
export function writeSapiTtsScript(dest: string): void {
  fs.writeFileSync(dest, SAPI_TTS_PS1, 'utf8');
}

export interface SapiTtsOptions {
  /** 语速 -10..10（默认 0） */
  rate?: number;
  /** PowerShell 可执行文件（默认 powershell，可用 ORAL_WORKSHOP_SAPI_POWERSHELL 覆盖） */
  powershellPath?: string;
  /** 进程执行器（测试注入 fake；默认 spawn） */
  runner?: (ps: string, args: string[]) => Promise<void>;
}

/** 组装 powershell 调用参数（纯函数，便于单测） */
export function buildSapiTtsArgs(scriptPath: string, textFile: string, outputFile: string, rate = 0): string[] {
  return ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, textFile, outputFile, String(rate)];
}

/** 文案 → WAV（Windows SAPI）。输出文件已存在视为成功（兼容 fake runner 与真实合成）。 */
export async function sapiTts(
  text: string,
  outputFile: string,
  opts: SapiTtsOptions = {},
): Promise<string> {
  const textFile = outputFile + '.txt';
  // UTF-8 BOM：Windows PowerShell 5.1 的 Get-Content -Encoding UTF8 依赖 BOM 才能正确读取中文
  fs.writeFileSync(textFile, '\uFEFF' + text, 'utf8');
  const scriptPath = outputFile + '.ps1';
  writeSapiTtsScript(scriptPath);
  const ps = opts.powershellPath || process.env.ORAL_WORKSHOP_SAPI_POWERSHELL || 'powershell';
  const args = buildSapiTtsArgs(scriptPath, textFile, outputFile, opts.rate ?? 0);
  if (opts.runner) {
    await opts.runner(ps, args);
  } else {
    await runPowerShell(ps, args);
  }
  if (!fs.existsSync(outputFile)) {
    throw new Error('SAPI TTS 未产出音频文件: ' + outputFile);
  }
  return outputFile;
}

/** 默认执行器：spawn powershell，非 0 退出码抛错（附 stderr 尾部便于排查） */
export async function runPowerShell(ps: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ps, args, { windowsHide: true, stdio: 'ignore' });
    let stderrTail = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString('utf8')).slice(-800);
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('SAPI TTS 执行失败（退出码 ' + code + '）：' + stderrTail));
    });
  });
}
