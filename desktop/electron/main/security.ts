import type { WebContents, WebPreferences, WindowOpenHandlerResponse } from "electron";
import { pathToFileURL } from "url";

const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);
const LOCAL_WEBVIEW_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

type WebviewPreferences = WebPreferences & {
  preloadURL?: string;
};

function parseUrl(rawUrl: unknown): URL | null {
  if (typeof rawUrl !== "string") return null;
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

export function isAllowedExternalUrl(rawUrl: unknown): rawUrl is string {
  const url = parseUrl(rawUrl);
  return !!url && EXTERNAL_PROTOCOLS.has(url.protocol);
}

export function isAllowedAppNavigationUrl(
  rawUrl: unknown,
  rendererHtmlPath: string,
  devServerUrl?: string,
): rawUrl is string {
  const url = parseUrl(rawUrl);
  if (!url) return false;

  const devServer = parseUrl(devServerUrl);
  if (devServer) {
    return url.origin === devServer.origin;
  }

  const rendererUrl = pathToFileURL(rendererHtmlPath);
  // 同时剥离 hash 与 query：应用自身 index.html 带查询串（如 ?a=1）仍属同页导航。
  // 修复前只剥离 hash，带 query 的自身导航会被误判为外部地址 —— 与 main-window.ts 内联判断不一致
  // （该不一致由 tests/unit/security.test.ts 的 TDD 用例发现）。
  const target = url.href.split("#")[0].split("?")[0];
  return url.protocol === "file:" && target === rendererUrl.href;
}

export function isAllowedWebviewUrl(
  rawUrl: unknown,
  allowHttps = false,
): rawUrl is string {
  if (
    typeof rawUrl === "string" &&
    (rawUrl === "about:blank" || rawUrl.startsWith("about:blank"))
  ) {
    return true;
  }

  const url = parseUrl(rawUrl);
  if (!url) {
    console.warn(`[SECURITY] Blocked webview URL (could not parse): ${rawUrl}`);
    return false;
  }

  if (url.protocol === "http:") {
    if (LOCAL_WEBVIEW_HOSTS.has(url.hostname)) {
      const port = Number(url.port);
      if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
        return true;
      }
    }
    console.warn(`[SECURITY] Blocked local/remote HTTP webview URL: ${rawUrl}`);
    return false;
  }

  if (url.protocol === "https:") {
    if (allowHttps) {
      return true;
    }
    console.warn(
      `[SECURITY] Blocked HTTPS webview URL (not allowed for this webview): ${rawUrl}`,
    );
    return false;
  }

  console.warn(
    `[SECURITY] Blocked webview URL (unsupported protocol): ${rawUrl}`,
  );
  return false;
}

export function hardenWebviewPreferences(
  webPreferences: WebviewPreferences,
): void {
  delete webPreferences.preload;
  delete webPreferences.preloadURL;
  webPreferences.nodeIntegration = false;
  webPreferences.contextIsolation = true;
  webPreferences.sandbox = true;
  webPreferences.webSecurity = true;
  webPreferences.allowRunningInsecureContent = false;
}

export function hardenAttachedWebContents(
  webContents: WebContents,
  isWebPreview = false,
): void {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event, url) => {
    if (!isAllowedWebviewUrl(url, isWebPreview)) {
      event.preventDefault();
    }
  });
  webContents.on("will-redirect", (event, url) => {
    if (!isAllowedWebviewUrl(url, isWebPreview)) {
      event.preventDefault();
    }
  });
}

// ── 远程窗口加固（安全审计 S-11 / S-12 残口）───────────────────────────────
// 登录 / 发布 / 视频解析窗口加载的是第三方远程页面，必须与主窗口同标准：
// 不允许 file:/自定义协议导航，不允许非 http(s) 新窗口，权限请求一律拒绝。
// 本文件保持零 electron 运行时依赖（仅 type-only import），故判定逻辑可在 jest 直跑。

/** 明文 http 仅在远程窗口里放行本机服务（n8n / dev server） */
const LOCAL_REMOTE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

function matchesHostAllowlist(host: string, allowedHosts: readonly string[]): boolean {
  if (allowedHosts.length === 0) return true
  const target = host.toLowerCase()
  return allowedHosts.some((raw) => {
    const allowed = String(raw).trim().toLowerCase().replace(/^\./, "")
    if (!allowed) return false
    return target === allowed || target.endsWith("." + allowed)
  })
}

/**
 * 远程窗口是否允许导航到该地址：
 * - https：默认放行任意主机（登录链路必须能跳第三方 OAuth 域）；给了 allowedHosts 则按白名单收口；
 * - http：仅放行本机地址；
 * - 其它协议（file: / javascript: / ms-msdt: / data: / about: / blob: ...）一律拒绝。
 */
export function isAllowedRemoteNavigation(
  rawUrl: unknown,
  allowedHosts: readonly string[] = [],
): boolean {
  const url = parseUrl(rawUrl)
  if (!url) return false
  if (url.protocol === "https:") return matchesHostAllowlist(url.hostname, allowedHosts)
  if (url.protocol === "http:") {
    if (!LOCAL_REMOTE_HOSTS.has(url.hostname.toLowerCase())) return false
    return matchesHostAllowlist(url.hostname, allowedHosts)
  }
  return false
}

/** 远程窗口是否允许 window.open 目标（与导航同规则，独立导出便于后续分化） */
export function isAllowedRemoteNewWindow(
  rawUrl: unknown,
  allowedHosts: readonly string[] = [],
): boolean {
  return isAllowedRemoteNavigation(rawUrl, allowedHosts)
}

export interface RemoteWindowGuardOptions {
  /** 允许的 https 主机白名单；为空表示「任意 https」 */
  allowedHosts?: readonly string[]
  /** 由调用方注入 shell.openExternal，保持本模块零 electron 运行时依赖 */
  openExternal: (url: string) => void
  /** 日志前缀（如 platform-login / video-parser） */
  label?: string
  log?: (message: string) => void
}

/**
 * 远程窗口统一加固：新窗口、导航、重定向、权限请求。
 * 注意：调用方需自行确保 webPreferences 为 contextIsolation:true / nodeIntegration:false / sandbox:true。
 */
export function hardenRemoteWindow(
  webContents: WebContents,
  options: RemoteWindowGuardOptions,
): void {
  const allowedHosts = options.allowedHosts ?? []
  const label = options.label ?? "remote-window"
  const log = options.log ?? ((message: string) => console.warn(message))

  webContents.setWindowOpenHandler((details): WindowOpenHandlerResponse => {
    const url = details?.url
    if (isAllowedRemoteNewWindow(url, allowedHosts)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
          },
        },
      }
    }
    if (isAllowedExternalUrl(url)) {
      try {
        options.openExternal(url)
      } catch (err) {
        log(`[SECURITY] ${label}: openExternal failed -> ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      log(`[SECURITY] ${label}: blocked window.open -> ${String(url)}`)
    }
    return { action: "deny" }
  })

  const guardNavigation = (event: { preventDefault: () => void }, url: string): void => {
    if (!isAllowedRemoteNavigation(url, allowedHosts)) {
      event.preventDefault()
      log(`[SECURITY] ${label}: blocked navigation -> ${String(url)}`)
    }
  }
  webContents.on("will-navigate", guardNavigation)
  webContents.on("will-redirect", guardNavigation)

  webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    log(`[SECURITY] ${label}: denied permission request -> ${String(permission)}`)
    callback(false)
  })
}
