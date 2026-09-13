/**
 * 扫码登录阶段启发式（纯函数，无 electron 依赖，便于单测）
 *
 * 不同平台的登录页结构各异，无法拿到平台级 API，只能靠页面标题/正文关键字
 * 与会话 Cookie 出现来判断进度。这里集中放判定逻辑，platform-login.ts 复用。
 */

/** 扫码阶段 */
export type ScanPhase = "waiting" | "scanned" | "confirmed" | "expired" | "success" | "error";

/** 二维码失效关键字（命中即 expired，渲染层展示「刷新二维码」） */
const EXPIRED_RE = /二维码(已)?失效|二维码过期|重新获取|刷新二维码|点击刷新|二维码已过期|expired|QR code expired/i;

/** 已扫码待确认关键字 */
const SCANNED_RE = /扫描成功|扫码成功|请在手机|请在.{0,8}确认|确认登录|正在确认|请在微信中确认|scan success/i;

/**
 * 从页面标题 + 正文文本推断当前扫码阶段。
 * 默认 waiting（页面已加载但未检测到任何阶段特征）。
 */
export function detectScanPhaseFromText(title: string, bodyText: string): ScanPhase {
  const t = `${title ?? ""}\n${bodyText ?? ""}`.slice(0, 4000);
  if (EXPIRED_RE.test(t)) return "expired";
  if (SCANNED_RE.test(t)) return "scanned";
  return "waiting";
}

/** 会话 Cookie 名称特征（命中且值足够长，视为已登录） */
const SESSION_COOKIE_RE = /session|sess|token|ticket|uid|userid|sid|login|auth|passport|account/i;

/**
 * 判断 cookies 中是否出现会话标志——登录成功的证据。
 * 要求同时满足「名称像会话」+「值长度 > 8」，过滤掉 csrftoken 之类的空值噪音。
 */
export function hasSessionCookie(cookies: Array<{ name: string; value: string }>): boolean {
  if (!cookies || cookies.length === 0) return false;
  return cookies.some((c) => SESSION_COOKIE_RE.test(c.name) && String(c.value ?? "").length > 8);
}
