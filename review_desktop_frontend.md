# Desktop 前端代码审查报告

**审查日期：** 2026-07-29  
**审查范围：** D:\二次开发\desktop\src  
**审查人：** React 前端代码审查专家（Subagent）

---

## 目录

1. [安全](#1-安全)
2. [路由](#2-路由)
3. [状态管理](#3-状态管理)
4. [API 层](#4-api-层)
5. [性能](#5-性能)
6. [代码质量](#6-代码质量)
7. [类型安全](#7-类型安全)
8. [总结与优先级排序](#8-总结与优先级排序)

---

## 1. 安全

### S-1.1 [Major] dbSecret 和 llmProxyKey 持久化到 localStorage

**文件：** `store/auth.ts` → `partialize`

`dbSecret`（本地数据库加密密钥种子）和 `llmProxyKey`（LLM 代理长期 API Key）通过 Zustand `persist` 中间件持久化到 `localStorage`。虽然注释说明"需跨重启使用"，但 localStorage 对任何同源 JavaScript 可读，包括通过 XSS 注入的恶意脚本。

```typescript
partialize: (state) => ({
  refreshToken: state.refreshToken,
  dbSecret: state.dbSecret,       // ← 长期敏感密钥
  llmProxyKey: state.llmProxyKey,  // ← 长期 API Key
  user: state.user,
})
```

**风险：** XSS 攻击可窃取数据库加密种子和 LLM API Key，导致本地数据库被解密或 LLM 代理被盗用。  
**建议：** 将 `dbSecret` 和 `llmProxyKey` 迁移到 Electron SafeStorage（`electronAPI.credential`），与密码存储方式一致。在 `setAuth` 时通过 `window.electronAPI.credential.set()` 写入，在 `initialize` 时通过 `window.electronAPI.credential.get()` 读取，不落 localStorage。

### S-1.2 [Major] refreshToken 持久化到 localStorage

**文件：** `store/auth.ts` → `partialize`

`refreshToken` 是长期有效的认证令牌，持久化到 localStorage 后，XSS 攻击者可提取它持续获取新的 `accessToken`。

```typescript
partialize: (state) => ({
  refreshToken: state.refreshToken,  // ← 长期认证令牌
  ...
})
```

**风险：** XSS 可导致账户持久被盗。  
**建议：** refreshToken 应优先使用 HttpOnly Cookie（需后端配合），或至少存入 SafeStorage。

### S-1.3 [Minor] 登录页账号明文存入 localStorage

**文件：** `pages/Login/index.tsx`

```typescript
const REMEMBER_ACCOUNT_KEY = 'shentong-remember-account'
localStorage.setItem(REMEMBER_ACCOUNT_KEY, values.account)
```

账号本身非高敏感数据，但暴露用户邮箱/用户名可增加社工攻击面。注释已标明"非敏感"，风险较低。

**建议：** 可接受，但如需更高安全标准，可考虑只记住账号的最后 4 个字符作为提示。

### S-1.4 [Minor] Login 页面 `getDeviceName` 函数永远返回固定值

**文件：** `pages/Login/index.tsx`

```typescript
function getDeviceName(): string {
  const deviceApi = window.electronAPI?.device as
    | { getDeviceName?: () => Promise<string>; getFingerprint: () => Promise<string> }
    | undefined
  if (deviceApi?.getDeviceName) {
    return 'Desktop' // getDeviceName 是异步的，这里用同步回退
  }
  return navigator.platform || '未知设备'
}
```

当 `getDeviceName` 方法存在时，反而返回硬编码的 `'Desktop'`，而非实际设备名。这是一个逻辑 bug。

**建议：** 将 `getDeviceName` 改为 `async` 函数并 `await` 调用，或直接使用 `navigator.platform`。

### S-1.5 [Minor] Hermes 本地 API Key 通过参数明文传递

**文件：** `api/chat-api.ts` → `handleHermesLocalExecute`

```typescript
interface HermesLocalExecutePayload {
  hermesEndpoint: string
  hermesApiKey: string  // ← API Key 从后端 SSE 明文推送
  ...
}
```

后端通过 SSE 推送 `hermesApiKey`，前端再传给本地 Hermes Agent。虽然这是本地通信（127.0.0.1:8642），但 API Key 出现在 SSE 数据流中，可能被浏览器 DevTools Network 面板捕获。

**风险：** 仅本地开发/调试可见，风险可控。  
**建议：** 可接受，但长期建议本地 Hermes Agent 使用固定配置的 Key，不通过 SSE 传递。

---

## 2. 路由

### R-2.1 [Major] `RequireAuth` 仅检查 `isAuthenticated`，不验证 Token 有效性

**文件：** `router/index.tsx`

```typescript
function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
```

`isAuthenticated` 仅检查 `accessToken` 是否存在，但不检查是否过期。如果用户在另一个标签页登出（清空了 accessToken），当前页面的 `RequireAuth` 仍会放行，直到下一次 API 请求 401 才触发跳转。更关键的是，页面刷新后 `accessToken` 不持久化（仅在内存），但 `isAuthenticated` 在 persist rehydrate 前默认为 `false`，rehydrate 后如果 `refreshToken` 存在则 `isAuthenticated` 可能仍为 `false`（因为 `setAuth` 才设为 `true`），导致用户刷新页面后被踢到登录页，然后 `initialize()` 异步刷新 token。

**现状分析：** 页面刷新体验有短暂闪烁——用户先看到登录页，然后 `initialize()` 成功后需手动跳转或被拦截器触发跳转。实际上 `initialize()` 不在路由层调用，需确认调用时机。

**建议：**
1. 在应用启动时（如 `App.tsx` 或 `main.tsx`）调用 `useAuthStore.initialize()`，并在初始化期间显示全屏 Loading。
2. `RequireAuth` 中增加 `isLoading` 检查，初始化期间显示 Spinner 而非直接跳转登录页。
3. 考虑在 `RequireAuth` 中检查 JWT `exp` 字段，提前触发刷新。

### R-2.2 [Minor] 路由别名大量重复，增加维护成本

**文件：** `router/index.tsx`

存在大量重定向别名路由：
```typescript
{ path: '/workflows', element: withSuspense(WorkflowList) },       // 与 /workflow 重复
{ path: '/agent-market', element: withSuspense(AgentMarket) },      // 与 /agents 重复
{ path: '/skill-market', element: withSuspense(HermesSkillMarket) },
{ path: '/profile', element: <Navigate to="/settings" replace /> },
{ path: '/workflow-editor', element: <Navigate to="/workflow/editor" replace /> },
// ... 还有 10+ 条别名
```

约 20 条别名路由占用了路由配置的显著篇幅。

**建议：** 别名路由集中管理，使用数组 + map 生成，减少视觉噪音。如确认无外部链接依赖，可逐步移除废弃别名。

### R-2.3 [Minor] `withSuspense` 使用 `any` 类型断言

**文件：** `router/index.tsx`

```typescript
function withSuspense<T extends React.ComponentType<any>>(Comp: React.LazyExoticComponent<T>): ReactNode {
  const Component = Comp as React.ComponentType<any>
  ...
}
```

使用 `React.ComponentType<any>` 绕过了类型检查，虽然在此处影响有限，但违反了类型安全原则。

**建议：** 使用 `React.ComponentType<Record<string, never>>` 或 `React.ComponentType<unknown>` 作为更安全的替代。

---

## 3. 状态管理

### ST-3.1 [Major] 双主题 Store 冲突

**文件：** `store/settings.ts` 与 `store/theme.ts`

存在两个独立的主题相关 Store：
- `useSettingsStore`（`store/settings.ts`）：`theme: 'light' | 'dark'`，默认 `light`
- `useThemeStore`（`store/theme.ts`）：`mode: 'dark' | 'light'` + `primaryColor`，默认 `dark`

两者都使用 `persist` 持久化到 localStorage（key 分别为 `settings-store` 和 `theme-store`），默认值矛盾（一个 light 一个 dark），且没有同步机制。

**风险：** 不同组件引用不同的 Store 会导致主题不一致；用户修改一个 Store 的主题，另一个 Store 不会同步。  
**建议：** 合并为单一主题 Store，废弃其中一个。保留 `useThemeStore`（功能更完整，含 `primaryColor`），将 `useSettingsStore` 的 theme 字段移除或改为引用 `useThemeStore`。

### ST-3.2 [Minor] Onboarding Store 未使用 Zustand persist 中间件

**文件：** `store/onboarding.ts`

```typescript
export const useOnboardingStore = create<OnboardingState>((set) => ({
  completed: localStorage.getItem(ONBOARDING_KEY) === 'true',
  setCompleted: (value) => {
    localStorage.setItem(ONBOARDING_KEY, String(value))
    set({ completed: value })
  }
}))
```

手动读写 localStorage，而其他 Store 统一使用 `persist` 中间件。风格不一致。

**建议：** 改用 `persist` 中间件保持一致性，或保留手动方式但添加注释说明原因。

### ST-3.3 [Minor] Credits Store 在模块加载时立即绑定 WS 监听

**文件：** `store/credits.ts`

```typescript
// 模块加载即注册监听（确保 WS 推送始终被捕获）
bindCreditsWsListener()
```

模块加载时立即执行副作用，在测试环境或 SSR 环境可能产生问题。`wsListenerBound` 标志虽防止重复绑定，但模块被多次引用时仍只有一次绑定。

**建议：** 可接受，但建议在 `App.tsx` 的 `useEffect` 中显式调用 `bindCreditsWsListener()`，使初始化逻辑更可控。

### ST-3.4 [Minor] Auth Store 的 `initialize` 方法未在路由层调用

**文件：** `store/auth.ts`

`initialize()` 方法负责在应用启动时用 `refreshToken` 刷新 `accessToken`，但路由层的 `RequireAuth` 不调用它。如果该方法在 `App.tsx` 或 `main.tsx` 中调用（未在审查范围内），则无问题；但如果未调用，用户刷新页面后会丢失登录状态。

**建议：** 确认 `initialize()` 的调用时机，应在应用挂载前调用，并在 `RequireAuth` 中考虑 `isLoading` 状态。

---

## 4. API 层

### A-4.1 [Major] HTTP 请求拦截器中 JWT 解码使用 `atob` 无异常保护不足

**文件：** `api/http-client.ts` → `decodeJwtExp`

```typescript
function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}
```

`atob` 在某些环境下对非法 base64 可能抛异常，虽然有 try-catch 包裹，但 `atob` 已被标记为 deprecated（推荐 `Uint8Array.fromBase64`）。此外，非标准 JWT（如三段式但非 base64url）会导致 `null` 返回，触发不必要的 token 刷新。

**风险：** 低，但可能在高频请求下导致不必要的刷新。  
**建议：** 可接受，但长期建议替换 `atob` 为更安全的解码方式。

### A-4.2 [Major] SSE 流式请求缺少 Content-Type 验证

**文件：** `api/chat-api.ts` → `streamMessage`

```typescript
let resp = await fetch(url, {
  method: 'POST',
  headers: await buildHeaders(),
  body: JSON.stringify(dto),
  signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
  credentials: 'include'
})
// 直接进入流读取，未检查 Content-Type
if (!resp.ok) { ... }
if (!resp.body) { ... }
await readStream(resp.body)
```

未验证响应的 `Content-Type` 是否为 `text/event-stream`。如果后端返回非 SSE 格式（如 HTML 错误页），`readStream` 会尝试解析非 SSE 数据，导致静默失败或乱码。

**建议：** 在读取流之前检查 `resp.headers.get('content-type')` 是否包含 `text/event-stream`，不匹配时抛出明确错误。

### A-4.3 [Minor] httpClient 超时固定 30s，不适用于大文件上传

**文件：** `api/http-client.ts`

```typescript
this.instance = axios.create({
  timeout: 30000,  // 固定 30s
  ...
})
```

文件上传（如知识库文档、附件）可能需要更长时间。当前所有请求共享 30s 超时。

**建议：** 为文件上传等长操作设置独立超时，或在调用时通过 `config` 参数覆盖：`httpClient.post(url, data, { timeout: 120000 })`。

### A-4.4 [Minor] WebSocket 心跳使用 socket.io `emit('ping')`，与 socket.io 内置心跳冲突

**文件：** `api/ws-client.ts`

```typescript
this.socket.emit('ping')
```

socket.io 已有内置心跳机制（`pingInterval` / `pingTimeout` 配置），手动发送 `emit('ping')` 是应用层的心跳，与传输层心跳混淆。如果服务端未监听应用层 `ping` 事件，则 `pong` 永远不会返回，导致 60s 后误判超时并强制重连。

**建议：** 确认服务端是否监听应用层 `ping` 事件。如果 socket.io 内置心跳已足够，移除手动心跳逻辑。

### A-4.5 [Minor] `redirectToLogin` 方法中 hash 路由处理不够健壮

**文件：** `api/http-client.ts`

```typescript
private redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    const hashNav = window.location.hash;
    if (hashNav && hashNav.startsWith('#')) {
      window.location.hash = '#/login';
    } else {
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }
}
```

设置 `window.location.hash = '#/login'` 会触发页面滚动到 ID 为 `/login` 的元素（如果存在）。此外，使用 `pushState` + `dispatchEvent` 的方式不如 React Router 的 `navigate` 可靠。

**建议：** 考虑通过回调或事件总线让 React Router 处理跳转，而非直接操作 URL。

---

## 5. 性能

### P-5.1 [Major] ServiceManager 每 2 秒轮询刷新全部服务数据

**文件：** `pages/ServiceManager/index.tsx`

```typescript
useEffect(() => {
  const timer = setInterval(() => {
    void loadData()
  }, 2000)
  return () => clearInterval(timer)
}, [loadData])
```

每 2 秒完整重新加载所有服务数据（`listServices()`），包括 CPU/内存指标。虽然已有 WebSocket 状态变更监听（`onServiceStatusChanged`），但 2s 轮询仍然频繁。

**风险：** 不必要的网络请求和重渲染。如果有 4 个服务卡片，每次 `setServices` 都触发整个组件重渲染。  
**建议：**
1. 将轮询间隔增加到 5-10 秒。
2. 或改为只轮询 CPU/内存指标（轻量接口），状态变更依赖 WebSocket。
3. 对服务卡片使用 `React.memo` 避免不必要的重渲染。

### P-5.2 [Major] Chat 页面 `handleSend` 回调未使用 `useCallback` 优化

**文件：** `pages/Chat/index.tsx`

```typescript
const handleModelChange = async (newModelId: string) => {
  setModelId(newModelId)
  if (activeSession && activeSession.modelId !== newModelId) {
    try {
      await chatApi.updateSession(activeSession.id, { modelId: newModelId })
      setActiveSession({ ...activeSession, modelId: newModelId })
    } catch (err) {
      console.error('[Chat] update model failed:', err)
    }
  }
}
```

`handleModelChange` 未使用 `useCallback` 包裹，每次渲染都会创建新函数，导致 `Select` 组件不必要的重渲染。同样，`handleModelChange` 直接在 onChange 中使用内联 async 函数。

**建议：** 将 `handleModelChange` 用 `useCallback` 包裹，依赖项为 `[activeSession]`。

### P-5.3 [Minor] Dashboard 使用硬编码 Mock 数据

**文件：`pages/Dashboard/index.tsx`**

```typescript
const RECENT_CONVERSATIONS: RecentConversation[] = [
  { id: 1, title: '如何使用 React 优化性能?', agentName: '前端专家', time: '10 分钟前' },
  // ... 4 条硬编码数据
]

const HOT_AGENTS: HotAgent[] = [
  { id: 1, name: '前端专家', desc: 'React/Vue 开发', icon: <RobotOutlined /> },
  // ... 4 条硬编码数据
]

const WEEK_TREND: TrendDay[] = [
  { label: '周一', value: 42 },
  // ... 7 条硬编码数据
]
```

Dashboard 完全使用硬编码 Mock 数据，"今日对话"数量直接使用 `RECENT_CONVERSATIONS.length`（固定为 4），本周消费趋势也是静态值。

**风险：** 用户体验——看到的数据永远不变，失去仪表盘意义。  
**建议：** 接入实际 API（`/stats/overview` 等已有管理端接口），至少使用 `useEffect` + `useState` 加载真实数据。如果后端接口未就绪，添加 TODO 注释。

### P-5.4 [Minor] Chat 页面 Agent 列表加载 pageSize=100，未分页

**文件：** `pages/Chat/index.tsx`

```typescript
const result = await listMarketAgents({ pageSize: 100 })
```

一次性加载 100 个 Agent，如果 Agent 数量增长，请求会变慢且内存占用增加。

**建议：** 改为按需加载（如前 20 个 + 搜索），或使用 Select 的远程搜索模式。

### P-5.5 [Minor] Hermes Detail 页面 `formatTime` 参数类型为 `unknown`

**文件：** `pages/Hermes/Detail.tsx`

```typescript
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  ...
}
```

多处 `formatTime` 函数使用 `unknown` 参数类型，类型安全性差。不同文件中定义了重复的 `formatTime` 函数（Chat、ServiceManager、Hermes List、Hermes Detail）。

**建议：** 提取为共享工具函数（`@/utils/format.ts`），统一类型签名 `formatTime(value: string | Date | number | null | undefined): string`。

---

## 6. 代码质量

### C-6.1 [Major] Chat 页面组件过大（~350 行），职责过多

**文件：** `pages/Chat/index.tsx`

Chat 页面单文件约 350 行，承担了：
- 会话切换 + 消息加载
- 流式消息发送 + 中断
- 模型/Agent/知识库选择器
- officeBridge 事件触发
- Agent 价格计算
- 多个 Select props 构造

**建议：** 将以下逻辑抽取为自定义 Hooks：
- `useChatStream(activeSession)` — 流式发送/中断/状态管理
- `useAgentOptions()` — Agent 列表加载 + 价格映射
- `useChatSelectors()` — 模型/Agent/知识库选择器状态

### C-6.2 [Major] Hermes Detail 组件过大（~400+ 行），包含 5 个功能区

**文件：** `pages/Hermes/Detail.tsx`

单组件包含：基本信息、资源占用、任务历史表格、已挂载技能包列表、可挂载技能包列表、执行任务弹窗。每个区域都有独立的加载状态和数据。

**建议：** 拆分为子组件：
- `<HermesBasicInfo instance={instance} />`
- `<HermesResourceUsage instance={instance} />`
- `<HermesCallLogTable instanceId={instanceId} />`
- `<HermesSkillMounter instance={instance} />`
- `<ExecuteTaskModal instanceId={instanceId} />`

### C-6.3 [Minor] `formatTime` 函数在 4+ 个文件中重复定义

**文件：** `pages/Chat/index.tsx`、`pages/ServiceManager/index.tsx`、`pages/Hermes/index.tsx`、`pages/Hermes/Detail.tsx`、`pages/Chat/components/MessageList.tsx`、`pages/Chat/components/SessionItem.tsx`

每个文件都有独立的 `formatTime` 实现，格式略有不同。

**建议：** 提取到 `@/utils/format.ts`，提供 `formatDateTime`、`formatShortTime`、`formatRelativeTime` 等变体。

### C-6.4 [Minor] ServiceManager 组件中 `handleInstall` 传递给 `Promise.all` 的方式有隐患

**文件：** `pages/ServiceManager/index.tsx`

```typescript
const handleRepairAll = async () => {
  const targets = services.filter(...)
  ...
  await Promise.all(targets.map((s) => handleInstall(s.name)))
  message.success('一键修复执行完成')
  void loadData()
}
```

`handleInstall` 内部有 `message.loading` 和 `message.success/error`，多个并行调用会产生多个 toast 消息，用户体验混乱。

**建议：** 为批量操作提供单独的进度展示（如 antd `Progress` 或统一 loading 消息），抑制单个操作的消息。

### C-6.5 [Minor] SessionList 中 `onSelectSession(null as unknown as ChatSession)` 不安全

**文件：** `pages/Chat/components/SessionList.tsx`

```typescript
if (session.id === activeSessionId) {
  onSelectSession(null as unknown as ChatSession)
}
```

使用 `null as unknown as ChatSession` 绕过类型检查，但 `onSelectSession` 的类型签名为 `(session: ChatSession) => void`，不接受 `null`。

**建议：** 将 `onSelectSession` 的类型改为 `(session: ChatSession | null) => void`，与 Chat 页面的 `handleSelectSession` 签名一致。

### C-6.6 [Minor] 多处 `(err as Error).message` 类型断言

**文件：** 多个页面组件

频繁使用 `(err as Error).message` 或 `(err as Error)` 断言，而非类型守卫。

**建议：** 创建工具函数 `getErrorMessage(err: unknown): string`，统一错误消息提取。

---

## 7. 类型安全

### T-7.1 [Major] `withSuspense` 使用 `React.ComponentType<any>`

**文件：** `router/index.tsx`

```typescript
function withSuspense<T extends React.ComponentType<any>>(Comp: React.LazyExoticComponent<T>): ReactNode {
  const Component = Comp as React.ComponentType<any>
  ...
}
```

双重 `any` 断言完全绕过类型检查。

**建议：**
```typescript
function withSuspense<T extends React.ComponentType<Record<string, never>>>(
  Comp: React.LazyExoticComponent<T>
): ReactNode {
  return (
    <Suspense fallback={...}>
      <Comp />
    </Suspense>
  )
}
```

### T-7.2 [Minor] `getRequestPath` 中 `config.params` 值类型不安全

**文件：** `api/http-client.ts`

```typescript
for (const [key, value] of Object.entries(config.params)) {
  if (value != null && value !== '') {
    searchParams.append(key, String(value))
  }
}
```

`config.params` 的类型为 `any`（axios 类型定义），`Object.entries` 返回 `[string, any][]`。

**建议：** 可接受（axios 限制），但可添加类型注释说明。

### T-7.3 [Minor] Hermes Detail 中 `formatTime(value: unknown)` 类型不安全

**文件：** `pages/Hermes/Detail.tsx`

```typescript
function formatTime(value: unknown): string {
  if (!value) return '-'
  const d = new Date(value as string)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString('zh-CN', { hour12: false })
}
```

参数为 `unknown`，内部 `as string` 断言不安全。

**建议：** 参数类型改为 `string | Date | number | null | undefined`。

### T-7.4 [Minor] Chat 页面 `userId: 0` 硬编码

**文件：** `pages/Chat/index.tsx`

```typescript
const userMsg: ChatMessage = {
  id: Date.now(),
  sessionId: activeSession.id,
  userId: 0,  // ← 硬编码
  role: 'user',
  ...
}
```

`userId` 固定为 0，应从 `useAuthStore` 获取当前用户 ID。

**建议：**
```typescript
const user = useAuthStore((s) => s.user)
const userMsg: ChatMessage = {
  ...
  userId: user?.id ?? 0,
  ...
}
```

### T-7.5 [Minor] `id: Date.now()` 生成消息 ID 不安全

**文件：** `pages/Chat/index.tsx`

```typescript
const userMsg: ChatMessage = {
  id: Date.now(),        // ← 可能冲突
  ...
}
const assistantMsg: ChatMessage = {
  id: Date.now() + 1,    // ← 可能冲突
  ...
}
```

使用 `Date.now()` 作为临时 ID，在快速连续操作时可能冲突（`Date.now()` 精度为毫秒）。

**建议：** 使用 `crypto.randomUUID()` 或递增计数器。

---

## 8. 总结与优先级排序

### Critical（需立即修复）
无 Critical 级别问题。当前未发现 XSS 直接漏洞或导致数据泄露的致命缺陷。

### Major（建议尽快修复，影响安全/性能/可维护性）

| 编号 | 问题 | 影响 |
|------|------|------|
| S-1.1 | dbSecret/llmProxyKey 存 localStorage | XSS 可窃取数据库密钥和 API Key |
| S-1.2 | refreshToken 存 localStorage | XSS 可持久盗号 |
| R-2.1 | RequireAuth 不验证 Token 有效性 / initialize 调用时机不明 | 刷新页面可能丢失登录状态 |
| ST-3.1 | 双主题 Store 冲突 | 主题不一致 |
| A-4.1 | JWT 解码 atob deprecated + 无效刷新 | 不必要的 token 刷新 |
| A-4.2 | SSE 缺少 Content-Type 验证 | 非 SSE 响应导致静默失败 |
| P-5.1 | ServiceManager 2s 轮询 | 不必要的网络请求和重渲染 |
| P-5.2 | Chat handleModelChange 未用 useCallback | 不必要的重渲染 |
| C-6.1 | Chat 页面组件过大 | 可维护性差 |
| C-6.2 | Hermes Detail 组件过大 | 可维护性差 |
| T-7.1 | withSuspense 使用 any | 类型安全缺失 |

### Minor（建议后续优化）

| 编号 | 问题 | 影响 |
|------|------|------|
| S-1.3 | 登录账号明文存 localStorage | 轻微信息暴露 |
| S-1.4 | getDeviceName 逻辑 bug | 设备名不正确 |
| S-1.5 | Hermes API Key 通过 SSE 传递 | DevTools 可见 |
| R-2.2 | 路由别名大量重复 | 维护成本 |
| R-2.3 | withSuspense any 类型 | 类型安全 |
| ST-3.2 | Onboarding Store 风格不一致 | 代码一致性 |
| ST-3.3 | Credits Store 模块加载时绑定 WS | 测试友好性 |
| ST-3.4 | initialize 调用时机不明 | 刷新体验 |
| A-4.3 | HTTP 超时固定 30s | 大文件上传受限 |
| A-4.4 | WS 心跳与 socket.io 内置冲突 | 可能误判超时 |
| A-4.5 | redirectToLogin 不够健壮 | 跳转可靠性 |
| P-5.3 | Dashboard 硬编码 Mock 数据 | 用户体验 |
| P-5.4 | Agent 列表 pageSize=100 | 可扩展性 |
| P-5.5 | formatTime 类型 unknown | 类型安全 |
| C-6.3 | formatTime 重复定义 | 代码重复 |
| C-6.4 | 批量修复 toast 混乱 | 用户体验 |
| C-6.5 | null as unknown as ChatSession | 类型安全 |
| C-6.6 | (err as Error).message 频繁断言 | 类型安全 |
| T-7.2 | config.params 类型 any | 类型安全 |
| T-7.3 | formatTime 参数 unknown | 类型安全 |
| T-7.4 | userId 硬编码 0 | 数据准确性 |
| T-7.5 | Date.now() 作为 ID | 可能冲突 |

---

## 架构亮点

值得肯定的设计决策：

1. **HTTP Client 拦截器设计**：HMAC 签名 + JWT 预校验 + 401 并发刷新队列，架构成熟，边界覆盖全面。
2. **SSE 流式实现**：使用 `fetch + ReadableStream` 而非 `EventSource`，支持 POST + Authorization header，正确处理 401 重试。
3. **离线同步体系**：`offlineQueue` + `syncService` + `wsClient` 三层协作，含互斥锁、批量重试、增量拉取，设计完善。
4. **路由懒加载**：全部页面组件使用 `React.lazy + Suspense`，按需加载，首屏性能好。
5. **Auth Store 安全意识**：accessToken/secretKey 不持久化，仅内存存储，体现了安全设计意识（但 dbSecret/llmProxyKey 的持久化打破了这一原则）。
6. **错误类型体系**：`BusinessError` / `AuthError` / `NetworkError` 分类清晰，`Object.setPrototypeOf` 确保继承链正确。

---

**报告结束。** 共发现 0 个 Critical、11 个 Major、20 个 Minor 问题。建议优先处理安全相关的 Major 问题（S-1.1、S-1.2）和影响用户体验的 R-2.1、ST-3.1。
