// mcp-security.ts —— MCP 探测安全核心（纯函数，可单测）
// 职责：stdio 命令白名单校验（防 RCE）、字面 IP/SSRF 判定、HTTP 目标安全校验
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

/** 后端 stdio 探测允许执行的命令白名单 */
export const MCP_COMMAND_ALLOWLIST = ['npx', 'uvx', 'docker', 'python', 'python3', 'node'];

/** 控制字符：\x00-\x1f + DEL */
// eslint-disable-next-line no-control-regex -- 有意匹配控制字符（防 RCE 注入）
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

interface DangerousFlagSet {
  short: string[];
  long: string[];
}

/** 各命令禁止使用的危险 flag（短 flag 按前两字符前缀匹配，长 flag 按 = 拆分后精确匹配） */
const DANGEROUS_FLAGS: Record<string, DangerousFlagSet> = {
  node: {
    short: ['-e', '-p', '-i', '-r'],
    long: ['--eval', '--print', '--interactive', '--require', '--inspect', '--inspect-brk'],
  },
  python: {
    short: ['-c', '-i'],
    long: ['--interactive', '--code'],
  },
  python3: {
    short: ['-c', '-i'],
    long: ['--interactive', '--code'],
  },
  npx: {
    short: ['-c'],
    long: ['--call', '--shell', '--exec'],
  },
  uvx: {
    short: ['-c'],
    long: ['--call', '--shell', '--exec'],
  },
};

function fail(message: string): never {
  throw new BusinessException(ErrorCode.VALIDATION_FAILED, message);
}

/**
 * 校验 MCP stdio 探测命令是否安全。
 * - command 必须是单个命令词（不允许空白，控制字符拒绝）
 * - base 必须在 MCP_COMMAND_ALLOWLIST 内
 * - args 不允许出现对应命令的危险 flag；docker 采用放行式白名单
 */
export function assertMcpCommandSafe(command: string | undefined, args: string[] | undefined): void {
  const trimmed = (command ?? '').trim();
  if (trimmed === '' || trimmed !== command || /\s/.test(trimmed)) {
    fail('command 必须是单个命令词，参数请放入 args');
  }
  if (CONTROL_CHAR_RE.test(trimmed)) {
    fail('command 不允许包含控制字符');
  }
  if (!MCP_COMMAND_ALLOWLIST.includes(trimmed)) {
    fail('command 必须在白名单内: npx/uvx/docker/python/python3/node');
  }
  if (trimmed === 'docker') {
    assertDockerArgsSafe(args);
    return;
  }
  const flags = DANGEROUS_FLAGS[trimmed];
  for (const arg of args ?? []) {
    if (arg.startsWith('--')) {
      const long = arg.split('=')[0];
      if (flags.long.includes(long)) {
        fail(trimmed + ' 命令不允许使用危险参数 ' + long);
      }
    } else if (arg.startsWith('-')) {
      const short = arg.slice(0, 2);
      if (flags.short.includes(short)) {
        fail(trimmed + ' 命令不允许使用危险参数 ' + short);
      }
    }
  }
}

/**
 * docker 放行式校验：
 * - args[0] 必须为 'run'
 * - 其余 flag 仅允许 -e（含 -eK=V 附加形式）/ --env（含 --env=...），其余以 - 开头的参数拒绝
 * - 必须存在至少一个非 flag 参数（镜像名）
 */
function assertDockerArgsSafe(args: string[] | undefined): void {
  const list = args ?? [];
  if (list[0] !== 'run') {
    fail('docker 命令必须以 run 开始');
  }
  let hasImage = false;
  for (let i = 1; i < list.length; i++) {
    const arg = list[i];
    if (arg.startsWith('--')) {
      if (arg === '--env' || arg.startsWith('--env=')) continue;
      fail('docker 仅允许 -e/--env 环境变量参数');
    }
    if (arg.startsWith('-')) {
      if (arg.startsWith('-e')) continue;
      fail('docker 仅允许 -e/--env 环境变量参数');
    }
    hasImage = true;
  }
  if (!hasImage) {
    fail('docker run 必须包含镜像名');
  }
}

/** 解析 IPv6 为 8 组 16bit 数值；格式非法返回 null */
function ipv6Groups(ip: string): number[] | null {
  const lower = ip.toLowerCase();
  const double = lower.indexOf('::');
  const head = double >= 0 ? lower.slice(0, double) : lower;
  const tail = double >= 0 ? lower.slice(double + 2) : '';
  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    const out: number[] = [];
    for (const g of groups) {
      if (g.includes('.')) {
        // 点分十进制 IPv4 尾巴（如 ::ffff:127.0.0.1）展开为两个 16bit 组
        const parts4 = g.split('.').map((s) => Number(s));
        if (parts4.length !== 4 || parts4.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
        const value =
          ((parts4[0] << 24) | (parts4[1] << 16) | (parts4[2] << 8) | parts4[3]) >>> 0;
        out.push((value >>> 16) & 0xffff, value & 0xffff);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        out.push(parseInt(g, 16));
      }
    }
    return out;
  };
  const h = parse(head);
  const t = parse(tail);
  if (h === null || t === null) return null;
  if (double < 0) return h.length === 8 ? h : null;
  if (h.length + t.length > 7) return null;
  const zeros = Array.from({ length: 8 - h.length - t.length }, () => 0);
  return [...h, ...zeros, ...t];
}

/** IPv6 前缀匹配（prefixHex 为 8 组 4 位十六进制，bits 为前缀位数） */
function ipv6PrefixMatch(ip: string, prefixHex: string, bits: number): boolean {
  const groups = ipv6Groups(ip);
  if (!groups) return false;
  let remaining = bits;
  for (let i = 0; i < 8 && remaining > 0; i++) {
    const prefixGroup = parseInt(prefixHex.slice(i * 4, i * 4 + 4) || '0000', 16);
    const take = Math.min(16, remaining);
    const mask = take === 16 ? 0xffff : (0xffff << (16 - take)) & 0xffff;
    if ((groups[i] & mask) !== (prefixGroup & mask)) return false;
    remaining -= take;
  }
  return remaining === 0;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((s) => Number(s));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 127) return true; // 127/8 loopback
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // 169.254/16 link-local
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a >= 224 && a <= 239) return true; // 224/4 组播
  if (a >= 240) return true; // 240/4 保留
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  // fc00::/7 ULA
  if (ipv6PrefixMatch(lower, 'fc000000000000000000000000000000', 7)) return true;
  // fe80::/10 link-local
  if (ipv6PrefixMatch(lower, 'fe800000000000000000000000000000', 10)) return true;
  // 2001:db8::/32 文档地址
  if (ipv6PrefixMatch(lower, '20010db8000000000000000000000000', 32)) return true;
  // ::ffff:0:0/96 IPv4-mapped：取出映射的 IPv4 再用 IPv4 规则判断
  const groups = ipv6Groups(lower);
  // ::ffff:0:0/96 IPv4-mapped：取出映射的 IPv4 再用 IPv4 规则判断
  if (
    groups &&
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const mapped =
      (groups[6] >> 8) + '.' + (groups[6] & 0xff) + '.' + (groups[7] >> 8) + '.' + (groups[7] & 0xff);
    return isPrivateLiteralIp(mapped);
  }
  // 64:ff9b::/96 NAT64：低 32 位内嵌 IPv4
  if (
    groups &&
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0
  ) {
    const mapped =
      (groups[6] >> 8) + '.' + (groups[6] & 0xff) + '.' + (groups[7] >> 8) + '.' + (groups[7] & 0xff);
    return isPrivateLiteralIp(mapped);
  }
  // 2002::/16 6to4：第 2/3 组内嵌 IPv4（2002:V4ADDR::/48）
  if (groups && groups[0] === 0x2002) {
    const mapped =
      (groups[1] >> 8) + '.' + (groups[1] & 0xff) + '.' + (groups[2] >> 8) + '.' + (groups[2] & 0xff);
    return isPrivateLiteralIp(mapped);
  }
  // IPv4-compatible ::a.b.c.d（已废弃）：前 6 组为 0 且非 ::ffff
  if (
    groups &&
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0
  ) {
    const mapped =
      (groups[6] >> 8) + '.' + (groups[6] & 0xff) + '.' + (groups[7] >> 8) + '.' + (groups[7] & 0xff);
    return isPrivateLiteralIp(mapped);
  }
  return false;
}

/** 字面 IP 是否属于私有/保留地址段（IPv4 与 IPv6，非 IP 返回 false） */
export function isPrivateLiteralIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return false;
}

/**
 * HTTP/SSE 探测目标 SSRF 防护：
 * - 仅允许 http/https；hostname 去 IPv6 方括号；空 hostname 拒绝
 * - localhost / 0.0.0.0 / 私有字面 IP 拒绝
 * - 域名走 DNS 解析（fail-closed），任一解析结果私有即拒绝
 */
export async function assertHttpUrlSafe(target: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    fail('URL 格式非法');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail('仅支持 http/https 协议');
  }
  const hostname = (url.hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname) {
    fail('URL 缺少 hostname');
  }
  if (hostname === 'localhost' || hostname === '0.0.0.0') {
    fail('不允许探测内网地址');
  }
  if (isIP(hostname) !== 0) {
    if (isPrivateLiteralIp(hostname)) {
      fail('不允许探测内网地址');
    }
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    fail('域名解析失败，无法确认目标安全性');
  }
  for (const addr of addresses) {
    if (isPrivateLiteralIp(addr.address)) {
      fail('不允许探测内网地址');
    }
  }
}

export interface StdioProbePlan {
  allow: boolean;
  reason?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * 生成 stdio 探测执行计划：
 * - 仅官方目录条目（source === 'official' 且存在 catalogId）允许后端执行
 * - 执行用目录的 command/args（白名单校验后），env 取 server.env
 * - 自定义 stdio 服务器一律不执行，引导用户使用官方目录或本地 OpenClaw
 */
export function buildStdioProbePlan(
  server: { source: string; catalogId?: number | null; env?: Record<string, string> },
  catalog?: { enabled: boolean; command?: string; args?: string[] } | null,
): StdioProbePlan {
  if (server.source !== 'official' || !server.catalogId) {
    return { allow: false, reason: '自定义 stdio 服务器不支持后端探测，请使用官方目录条目或本地 OpenClaw 运行' };
  }
  if (!catalog || !catalog.enabled) {
    return { allow: false, reason: '官方目录条目不存在或已下架' };
  }
  try {
    assertMcpCommandSafe(catalog.command, catalog.args);
  } catch (e) {
    return { allow: false, reason: (e as Error).message };
  }
  return { allow: true, command: catalog.command, args: catalog.args, env: server.env };
}
