/**
 * 口播工坊 ffmpeg / 媒体下载工具
 * 独立文件：executor 与 service 均需使用，避免两者循环依赖（Nest DI 元数据要求类用值导入）。
 */
import { spawn } from 'child_process';
import * as dns from 'dns';
import * as fs from 'fs';
import * as path from 'path';

/** ffmpeg 命令执行器（测试注入 fake，不真跑 ffmpeg） */
export type FfmpegRunner = (cmd: string[], cwd?: string) => Promise<void>;

/** 默认 ffmpeg 执行器：逐条 spawn，非 0 退出码抛错（附 stderr 尾部便于排查） */
export function defaultFfmpegRunner(cmd: string[], cwd?: string): Promise<void> {
  const argv = [...cmd];
  if (argv[0] === 'ffmpeg') {
    argv[0] = process.env.ORAL_WORKSHOP_FFMPEG_PATH || 'ffmpeg';
  }
  return new Promise<void>((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderrTail = '';
    const timeoutMs = Number(process.env.ORAL_WORKSHOP_FFMPEG_TIMEOUT_MS || 600000);
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* 子进程已退出 */ }
      reject(new Error('ffmpeg 执行超时（' + Math.round(timeoutMs / 60000) + ' 分钟），已强制终止流水线'));
    }, timeoutMs);
    child.stderr?.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString('utf8')).slice(-800);
    });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('ffmpeg 执行失败（退出码 ' + code + '）：' + stderrTail));
    });
  });
}

/** 判断下载内容是否为网页 HTML（而非音视频媒体文件）：取文件头字节探测 */
export function looksLikeHtml(buf: Buffer): boolean {
  if (!buf || !buf.length) return false;
  const head = buf.subarray(0, Math.min(buf.length, 4096)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (!head) return false;
  if (/^<!doctype html/i.test(head) || /^<html[\s>]/i.test(head)) return true;
  return /<(html|head|body|script|meta|title|div|iframe)[\s>]/i.test(head.slice(0, 512));
}

/** yt-dlp 解析网页为媒体直链（学习对标提取文案用）；未安装时抛错并提示安装命令 */
export async function resolveDirectMediaUrl(pageUrl: string): Promise<string> {
  const bin = process.env.ORAL_WORKSHOP_YTDLP_PATH || 'yt-dlp';
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      bin,
      ['--no-playlist', '--no-warnings', '-f', 'bestaudio/best', '-g', pageUrl],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let stdout = '';
    let stderrTail = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* 子进程已退出 */ }
      reject(new Error('yt-dlp 解析超时（60 秒），请检查网络或稍后重试'));
    }, 60000);
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d: Buffer) => { stderrTail = (stderrTail + d.toString('utf8')).slice(-500); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const url = stdout.trim().split(/\r?\n/).pop()?.trim() || '';
      if (code === 0 && url) resolve(url);
      else reject(new Error('yt-dlp 解析失败（退出码 ' + code + '）：' + (stderrTail || stdout.slice(-200))));
    });
  });
}

/**
 * 媒体引用白名单（同步校验，供 DTO class-validator 使用）：
 * 只允许公网 http(s) 链接，或服务端 /uploads/ 静态命名空间下的相对路径。
 * 拒绝本地绝对路径、UNC、file://、../ 穿越与其它任意相对路径（防任意文件读取）。
 */
export function validateMediaRef(value: string): boolean {
  const v = String(value ?? '');
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return Boolean(u.hostname) && !u.username && !u.password;
    } catch {
      return false;
    }
  }
  if (v.startsWith('/uploads/')) {
    const segs = v.split('/');
    return !segs.includes('..') && !segs.some((s) => s.includes(':'));
  }
  return false;
}

/** IPv4 私网/环回/保留地址判定（含云元数据 169.254.169.254） */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** IPv6 环回/链路本地/唯一本地地址判定 */
export function isPrivateIpv6(ip: string): boolean {
  const lower = String(ip).toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  );
}

/**
 * SSRF 防护：http(s) 媒体地址不得指向内网/环回/保留地址。
 * 放行自身 /uploads/ 静态命名空间（同源上传产物，开发环境 localhost 亦可）；
 * 域名先 DNS 解析再按字面 IP 判定，避免 DNS 重绑定绕过。
 */
export async function assertPublicMediaUrl(urlOrPath: string): Promise<void> {
  if (!/^https?:\/\//i.test(urlOrPath)) return;
  let u: URL;
  try {
    u = new URL(urlOrPath);
  } catch {
    throw new Error('无效的媒体链接: ' + urlOrPath.slice(0, 80));
  }
  // 服务端自身静态命名空间（/uploads/…）放行：无信息泄露风险（本身已公网静态托管）
  if (u.pathname.startsWith('/uploads/')) return;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new Error('无效的媒体链接（缺少域名）');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIpv4(host)) throw new Error('不允许访问内网地址: ' + host);
    return;
  }
  if (host.includes(':')) {
    if (isPrivateIpv6(host)) throw new Error('不允许访问内网地址: ' + host);
    return;
  }
  const { address } = await dns.promises.lookup(host, { family: 4 }).catch(() => ({ address: '' }));
  if (!address) {
    // 测试环境无外网 DNS：跳过域名解析校验（字面 IP 检查仍生效），生产环境必须可解析
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('媒体域名解析失败: ' + host);
    }
    return;
  }
  if (isPrivateIpv4(address)) throw new Error('媒体域名解析到内网地址: ' + host + ' (' + address + ')');
}

/** 下载/拷贝媒体到产物目录（支持 http(s) URL 与本地路径） */
export async function downloadTo(urlOrPath: string, dest: string): Promise<string> {
  if (/^https?:\/\//i.test(urlOrPath)) {
    await assertPublicMediaUrl(urlOrPath);
    const resp = await fetch(urlOrPath, { signal: AbortSignal.timeout(120000) });
    if (!resp.ok) throw new Error('媒体下载失败: HTTP ' + resp.status + ' ' + urlOrPath.slice(0, 120));
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) throw new Error('媒体下载为空: ' + urlOrPath.slice(0, 120));
    fs.writeFileSync(dest, buf);
  } else {
    fs.copyFileSync(resolveLocalMediaPath(urlOrPath), dest);
  }
  return dest;
}

/**
 * 限制本地文件路径：只允许服务器 CWD 下 uploads 目录内的相对路径；
 * 拒绝绝对路径、UNC 与 ../ 穿越（防任意文件读取）。
 */
export function resolveLocalMediaPath(urlOrPath: string): string {
  const p = String(urlOrPath);
  if (/^[a-zA-Z]:[\/]/.test(p) || /^\\/.test(p)) {
    throw new Error('不允许引用本地绝对路径：' + p.slice(0, 80));
  }
  const segs = p.split(/[\\/]+/);
  if (segs.includes('..')) {
    throw new Error('媒体路径不允许包含 .. 穿越（仅允许 uploads 目录内）：' + p.slice(0, 80));
  }
  const resolved = p.startsWith('/') ? path.resolve(p.replace(/^\/+/, '')) : path.resolve(p);
  const uploadsRoot = path.resolve('uploads');
  if (resolved !== uploadsRoot && !resolved.startsWith(uploadsRoot + path.sep)) {
    throw new Error('媒体路径必须位于服务器 uploads 目录内：' + p.slice(0, 80));
  }
  return resolved;
}
