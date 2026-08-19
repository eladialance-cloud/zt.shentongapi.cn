// 管理后台跳转助手（三期 3.5）
// 管理前端 base=/admin/：开发 3010 端口，生产与 API 同源（https://zt.shentongapi.cn/admin/）
// 可通过 VITE_ADMIN_BASE_URL 覆盖。

/** 获取管理后台根地址（不带尾部斜杠） */
export function getAdminBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_ADMIN_BASE_URL as string | undefined)?.replace(/\/+$/, "")
  if (fromEnv) return fromEnv
  if (import.meta.env.DEV) return "http://localhost:3010"
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/api\/?$/, "")
  return (apiBase || "http://localhost:3010").replace(/\/+$/, "")
}

/** 打开管理后台指定路径（优先 Electron shell 外部浏览器，降级新窗口） */
export function openAdminUrl(path: string): void {
  const url = getAdminBaseUrl() + (path.startsWith("/") ? path : "/" + path)
  if (window.electronAPI.app.openExternal) {
    void window.electronAPI.app.openExternal(url).catch(() => window.open(url, "_blank"))
  } else {
    window.open(url, "_blank")
  }
}
