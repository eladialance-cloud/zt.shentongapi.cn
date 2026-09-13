/** 扫码登录阶段启发式（scan-heuristics）单元测试 */
import { detectScanPhaseFromText, hasSessionCookie } from "../../electron/main/scan-heuristics";

describe("detectScanPhaseFromText", () => {
  it("普通登录页 → waiting", () => {
    expect(detectScanPhaseFromText("抖音创作者中心", "请使用抖音App扫描二维码登录")).toBe("waiting");
  });

  it("二维码失效关键字 → expired", () => {
    expect(detectScanPhaseFromText("登录", "二维码已失效，请点击刷新")).toBe("expired");
    expect(detectScanPhaseFromText("", "二维码过期，重新获取")).toBe("expired");
    expect(detectScanPhaseFromText("QR code expired", "")).toBe("expired");
  });

  it("已扫码待确认关键字 → scanned", () => {
    expect(detectScanPhaseFromText("登录", "扫描成功，请在手机上确认登录")).toBe("scanned");
    expect(detectScanPhaseFromText("", "请在微信中确认")).toBe("scanned");
  });

  it("expired 优先级高于 scanned（同时命中时判失效）", () => {
    expect(detectScanPhaseFromText("请在手机确认", "二维码已失效")).toBe("expired");
  });

  it("空输入 → waiting（不抛错）", () => {
    expect(detectScanPhaseFromText("", "")).toBe("waiting");
    expect(detectScanPhaseFromText(undefined as unknown as string, undefined as unknown as string)).toBe("waiting");
  });

  it("超长正文被截断，不因尾部关键字误判", () => {
    const long = "x".repeat(5000) + "二维码已失效";
    expect(detectScanPhaseFromText("登录", long)).toBe("waiting");
  });
});

describe("hasSessionCookie", () => {
  it("无 cookie → false", () => {
    expect(hasSessionCookie([])).toBe(false);
    expect(hasSessionCookie(undefined as unknown as Array<{ name: string; value: string }>)).toBe(false);
  });

  it("会话名 + 长值 → true", () => {
    expect(hasSessionCookie([{ name: "sessionid", value: "abcdefghijk123456" }])).toBe(true);
    expect(hasSessionCookie([{ name: "passport_uid", value: "123456789012" }])).toBe(true);
  });

  it("会话名但值过短 → false（过滤空值噪音）", () => {
    expect(hasSessionCookie([{ name: "token", value: "abc" }])).toBe(false);
  });

  it("非会话名（如 csrftoken 长度足够）→ 名称命中即算（token 在正则内）", () => {
    // csrftoken 命中 token 关键字且值足够长，视为会话证据（宽松策略，宁可早判）
    expect(hasSessionCookie([{ name: "csrftoken", value: "abcdefghijklmnop" }])).toBe(true);
  });

  it("无关 cookie → false", () => {
    expect(hasSessionCookie([{ name: "theme", value: "dark-mode-value" }])).toBe(false);
  });
});
