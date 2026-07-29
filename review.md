# Code Review：AI 办公室渲染失败全面审查

**审查日期**: 2026-07-25  
**审查方法**: Superpowers 阶段 6 — Code Review（5 路子代理并行审查）  
**审查目标**: 诊断用户下载深瞳 AI 桌面端后 AI 办公室无法显示内容的根因  
**审查范围**: Office 页面入口、PixiJS 画布、素材加载、API/后端、Electron 构建配置

---

## 一、审查概览

| 审查维度 | 子代理 | 关键问题 | 主要问题 | 次要问题 |
|---------|--------|---------|---------|---------|
| Office 入口加载流程 | review-office-entry | 2 | 3 | 2 |
| PixiJS 画布渲染 | review-pixi-canvas | 5 | 5 | 7 |
| 素材与依赖加载 | review-assets-deps | 1 | 5 | 4 |
| API/后端可达性 | review-api-backend | 3 | 5 | 7 |
| Electron 构建配置 | review-electron-build | 3 | 5 | 5 |
| **合计** | — | **14** | **23** | **25** |

---

## 二、🔴 关键问题（阻塞渲染，必须修复）

### K1. 生产环境 baseURL 写死公网域名，本地后端 fallback 无效
- **文件**: `.env.production` / `electron.vite.config.ts` / `src/api/http-client.ts`
- **描述**: `VITE_API_BASE_URL=https://zt.shentongapi.cn/api` 通过 `define` 编译期注入，`http-client.ts` 的 `|| 'http://localhost:3001/api'` fallback 在生产包中永远不会生效。用户下载安装后若域名不可达/离线/DNS 失败，所有 API 请求失败。
- **影响**: `listTeams()` 返回空 → `agents=[]` → 画布显示"暂无团队成员"浮层，用户误以为功能损坏。
- **修复**: baseURL 改为运行时可配置（Electron store / config.json），启动时检测后端可达性。

### K2. `opcApi.listTeams()` 无超时保护，后端不可达时页面永久转圈
- **文件**: `src/pages/Office/index.tsx` 第 53 行
- **描述**: 首屏请求无独立超时。后端无响应时 `await` 永远挂起，`finally { setLoading(false) }` 不执行，`Office2DPage` 永远不被渲染。
- **影响**: 用户看到无限 loading 动画。
- **修复**: 为 `listTeams()` 增加超时包装（5-10s），或在 `http-client.ts` 中将默认 timeout 从 30s 缩短。

### K3. `Office2DPage` 未接收已加载的 `agents` 数据
- **文件**: `src/pages/Office/index.tsx` 第 366 行
- **描述**: `<Office2DPage embedded />` 未传入 `agents` prop。即使 loading 结束、agents 已加载，画布也可能永远为空。
- **修复**: `<Office2DPage embedded agents={agents} />`。

### K4. PixiJS `app.init()` 失败无降级 UI，用户看到白屏
- **文件**: `src/pages/Office/OfficeIsoCanvas.tsx` 约 300-312 行
- **描述**: WebGL 初始化失败（无显卡驱动/远程桌面/虚拟机）时仅 `console.error` 后 `return`，div 内无任何内容。
- **修复**: 增加 `initError` state + 降级 UI（"图形加速不可用，请检查显卡驱动"）。

### K5. StrictMode 双挂载异步竞态导致画布丢失
- **文件**: `src/pages/Office/OfficeIsoCanvas.tsx` 约 325 行
- **描述**: `await app.init()` 期间 StrictMode 第二次 effect 可能在 `appRef.current` 赋值前启动，两个并发 init 导致 canvas 被误销毁或 append 失败。
- **修复**: 引入同步 `isInitializingRef` 锁。

### K6. `container.appendChild(app.canvas)` 前未检查 DOM 挂载状态
- **文件**: `src/pages/Office/OfficeIsoCanvas.tsx` 约 320 行
- **描述**: `await` 后组件可能已卸载，`container` 不再连接 DOM。appendChild 不报错但 canvas 不出现在页面上。
- **修复**: appendChild 前断言 `container === divRef.current && container.isConnected`。

### K7. `tickerCallback` 内未捕获异常导致动画循环停止
- **文件**: `src/pages/Office/OfficeIsoCanvas.tsx` 约 385-425 行
- **描述**: `tickEmployees` / `renderer.render` 抛错后 PixiJS Ticker 停止调用该回调，画面冻结。
- **修复**: ticker 回调外层包裹 `try/catch`。

### K8. `preloadOfficeAssets` 单资源失败中断整个预加载链
- **文件**: `src/pages/Office/asset-loader.ts` 第 127-131 行
- **描述**: 串行 `for...await` 无单资源 try/catch。任一 PNG 加载失败 → 整个预加载抛异常 → 后续资源都不加载。
- **修复**: 逐 URL try/catch 或改用 `Promise.allSettled`。

### K9. `renderer.loadAssets()` 失败与 `renderer.init()` 耦合
- **文件**: `src/pages/Office/OfficeIsoCanvas.tsx` 约 355-365 行
- **描述**: `loadAssets()` 抛非资源异常时 `renderer.init()` 被跳过，静态层不绘制。
- **修复**: 确保 `renderer.init()` 无论如何都执行，与资源加载解耦。

### K10. 公告接口调用管理后台端点 `/admin/announcements`，普通用户 401/403
- **文件**: `src/api/announcement-api.ts` 第 45-50 行
- **描述**: 需要 `adminToken` 的端点被普通用户调用，每 60s 轮询一次持续失败。
- **修复**: 切换到用户端公开端点或停止轮询。

### K11. 生产 CSP `connect-src` 白名单过窄，可能阻断 WebSocket
- **文件**: `electron/main/index.ts` 约 88 行
- **描述**: 生产 CSP 只允许 `wss://zt.shentongapi.cn`。若 WS URL 指向其他域名/IP/端口，被 CSP 拦截。
- **修复**: CSP 动态读取环境变量或放宽 `connect-src` 白名单。

### K12. `process.env.VITE_API_BASE_URL` 编译期替换导致运行时无法覆盖
- **文件**: `electron/main/index.ts` 第 540、560 行
- **描述**: `define` 注入后 `process.env.VITE_API_BASE_URL` 变为字面量字符串，用户无法通过环境变量覆盖后端地址。
- **修复**: 保留编译期默认值 + 运行时 `process.env` 真实读取作为覆盖。

### K13. `import.meta.glob` key 切片依赖字符串假设，生产构建可能查表失败
- **文件**: `src/pages/Office/asset-loader.ts` 第 43-69 行
- **描述**: `charSpriteUrlMap` 构建依赖 key 中包含 `office/iso/characters/` 前缀。若 Vite/Rolldown 生产构建改变 key 格式，查表失败，所有角色走矢量 fallback（方块人）。
- **修复**: 改为基于 `ASSET_PATHS` 的精确路径匹配，不依赖 key 字符串切片。

### K14. Vite 生产构建 `base` 默认 `/`，Electron `file://` 加载可能资源 404
- **文件**: `electron.vite.config.ts` 第 113-133 行
- **描述**: 未显式设置 `base: './'`。绝对路径 `/` 在 `file://` 协议下指向磁盘根目录，可能导致资源 404。
- **修复**: `renderer.build` 中设置 `base: './'`。

---

## 三、🟡 主要问题（影响体验，应尽快修复）

| # | 问题 | 文件 | 影响 |
|---|------|------|------|
| M1 | 401 失败跳转 `window.location.hash = '#/login'`，桌面端可能非 hash 路由 | `http-client.ts:282` | 登录状态丢失、白屏 |
| M2 | WebSocket 真实连接失败后不降级 mock，员工状态永久静态 | `office-ws.ts:117-121` | 无实时状态变更 |
| M3 | `import.meta.glob` eager 模式内联 624 张精灵图到 JS bundle | `asset-loader.ts:43-46` | 主包膨胀、启动变慢 |
| M4 | `statusToAction`/`directionToCharDir` 无运行时兜底，非法值返回 undefined | `asset-config.ts:73-123` | 渲染异常 |
| M5 | `loadCharSprite` 未处理 `getCharSpriteUrl`/`Assets.load` 失败 | `spritesheet-loader.ts:140-160` | 动画循环中断 |
| M6 | `preloadOfficeAssets` 串行加载 600+ 张图，首次打开白屏时间长 | `asset-loader.ts:127-131` | 体验差 |
| M7 | `overlayG` 每帧 `new Text` 累积不清理，内存泄漏 | `iso-renderer.ts:1240-1280` | 长时间运行卡顿 |
| M8 | PixiJS 未单独拆包，首屏 JS 解析阻塞 | `electron.vite.config.ts:105` | 低端机渲染延迟 |
| M9 | API 出错时仍渲染 `Office2DPage`，可能二次报错 | `Office/index.tsx:357-370` | 错误叠加 |
| M10 | `listInstances`/`listTeamAgents` 失败被静默吞掉 | `Office/index.tsx:60-78` | 用户无感知数据缺失 |
| M11 | `.env` 中 `VITE_OFFICE_USE_MOCK_WS=true` 可能泄露到生产构建 | `.env:4` | 生产走 mock 模式 |
| M12 | `withCredentials=true` + Electron `file://` 可能触发 CORS | `http-client.ts:118` | 请求被浏览器拦截 |
| M13 | 无后端健康检查，用户需等 30s 超时才看到错误 | `Office/index.tsx` | 体验差 |
| M14 | `Office2DPage` snapshot 与 `OfficeIsoCanvas` employeesRef 状态不同步 | `Office2DPage.tsx:62-68` | Drawer 显示位置有延迟 |
| M15 | Demo 模式未暂停 mock 状态推送，可能冲突 | `Office2DPage.tsx:140-160` | Demo 行为被覆盖 |
| M16 | `animationEnabled=false` 仍维持完整 PixiJS Application | `OfficeIsoCanvas.tsx:390-400` | 资源浪费 |
| M17 | `moveEmployee` 的 `setInterval` 组件卸载时未清理 | `OfficeIsoCanvas.tsx:620-660` | 内存泄漏 |
| M18 | `IsoRenderer.destroy()` 未释放 textures Map | `iso-renderer.ts:1290-1305` | GC 延迟 |
| M19 | `renderBubbles` 每帧重建 Text/Graphics，GC 压力大 | `iso-renderer.ts:860-890` | 性能问题 |
| M20 | 公告轮询无错误退避，无限 60s 重试 | `Office/index.tsx:127-142` | 资源浪费 |
| M21 | `getEmployeeSprite` 兜底 `Assets.get(url)` 在预加载未执行时永远返回 null | `spritesheet-loader.ts:184` | 角色永远方块人 |
| M22 | GPU 兼容性：无显卡驱动/远程桌面/虚拟机场景未处理 | `main-window.ts:14` | PixiJS init 失败 |
| M23 | `manualChunks` 未拆分 PixiJS | `electron.vite.config.ts:105` | 首屏阻塞 |

---

## 四、🟢 次要问题（可后续优化）

| # | 问题 | 文件 |
|---|------|------|
| M1 | 空数据提示中 `!loading` 条件冗余 | `Office/index.tsx:395` |
| M2 | 错误文案硬编码中文，无 i18n | `Office/index.tsx:84` |
| M3 | `mockStatusIntervalMs` 硬编码 5000，用户不可配 | `OfficeIsoCanvas.tsx:465` |
| M4 | `directionFromDelta` 方向映射注释与代码不一致 | `spritesheet-loader.ts:90-110` |
| M5 | `Office2DPage` embedded 模式未自适应容器大小 | `Office2DPage.tsx:175` |
| M6 | `charSpriteUrlMap` 未对异常 key 校验 | `asset-loader.ts:67-69` |
| M7 | 未使用的 `chibi-stickers` 目录 | `assets/office/iso/characters/chibi-stickers/` |
| M8 | `index.html` CSP 与主进程 CSP 不一致 | `src/index.html:6` |
| M9 | `useEffect` 依赖 `[astar]` 意图不明显 | `OfficeIsoCanvas.tsx:158` |
| M10 | `cancelled` 检查未覆盖所有 await 间隙 | `OfficeIsoCanvas.tsx` |
| M11 | `asar:true` + `npmRebuild:false` 原生模块风险 | `electron-builder.yml` |
| M12 | `preload` 路径依赖 `__dirname` 相对路径 | `main-window.ts:18` |
| M13 | WebSocket URL 缺少协议/路径校验 | `office-ws.ts:117` |
| M14 | ref 模式同步回调缺少注释说明 | `OfficeIsoCanvas.tsx:184-204` |
| M15 | `http-client.ts` 的 30s 超时过长 | `http-client.ts:119` |

---

## 五、根因分析：为什么用户下载后 AI 办公室无法显示

### 最可能的根因链（按概率排序）

```
用户安装并打开深瞳AI桌面端
        │
        ▼
Electron 加载 renderer (file:// 协议)
        │
        ▼
React 路由进入 /office → Office/index.tsx
        │
        ▼
loadAgents() 调用 opcApi.listTeams()
        │
        ├── 后端域名 zt.shentongapi.cn 不可达
        │   ├── DNS 解析失败 → 30s 超时 → loading 永久转圈 (K2)
        │   └── 或返回错误 → loading=false, agents=[] → "暂无团队成员" (K1)
        │
        ├── 后端可达但返回 401
        │   └── window.location.hash = '#/login' → 跳转异常 (M1)
        │
        ▼
即使 API 成功，agents 已加载
        │
        ├── <Office2DPage embedded /> 未传入 agents → 画布为空 (K3)
        │
        ▼
即使 Office2DPage 收到数据
        │
        ├── PixiJS app.init() 失败 (无 WebGL/驱动问题) → 白屏 (K4)
        ├── StrictMode 双挂载竞态 → canvas 被销毁 (K5)
        ├── appendChild 到已卸载容器 → canvas 不显示 (K6)
        ├── ticker 异常 → 画面冻结 (K7)
        └── preloadOfficeAssets 单资源失败 → 渲染中断 (K8)
```

### 核心结论

**用户下载后 AI 办公室无法显示，最可能由以下 3 个根因组合导致：**

1. **后端不可达** (K1+K2)：生产 baseURL 写死公网域名，用户离线/域名失效时所有 API 失败，页面永久 loading 或显示空数据
2. **数据未传入画布** (K3)：`Office2DPage` 未接收 `agents` prop
3. **PixiJS 初始化失败** (K4+K5+K6)：WebGL 不可用或 StrictMode 竞态导致白屏

---

## 六、修复优先级与建议

### P0 — 立即修复（阻塞渲染）

| 编号 | 修复项 | 预计工时 |
|------|--------|---------|
| K1 | baseURL 改为运行时可配置 | 2h |
| K2 | listTeams 增加超时 + 健康检查 | 1h |
| K3 | Office2DPage 传入 agents prop | 5min |
| K4 | PixiJS init 失败降级 UI | 30min |
| K5 | StrictMode 双挂载同步锁 | 30min |
| K6 | appendChild 前检查 container.isConnected | 5min |
| K7 | tickerCallback 加 try/catch | 10min |
| K8 | preloadOfficeAssets 逐资源 try/catch | 15min |
| K14 | Vite base: './' | 5min |

### P1 — 尽快修复（影响体验）

| 编号 | 修复项 | 预计工时 |
|------|--------|---------|
| K9 | renderer.init() 与资源加载解耦 | 30min |
| K10 | 公告接口切换到用户端端点 | 30min |
| K11 | CSP connect-src 动态配置 | 1h |
| K12 | 主进程 API base 运行时可覆盖 | 1h |
| K13 | asset-loader 改为精确路径匹配 | 1h |
| M1 | 401 跳转改为应用内导航 | 30min |
| M2 | WS 失败自动降级 mock | 1h |
| M3 | 精灵图不内联 (assetsInlineLimit) | 15min |
| M8 | PixiJS 单独拆包 | 15min |
| M13 | 启动时后端健康检查 | 1h |

### P2 — 后续优化

M4-M23 中的体验优化、内存泄漏修复、性能改进等。

---

## 七、审查结论

**审查结果：不通过**

发现 14 个关键问题，其中 3 个（K1 后端不可达、K3 数据未传入、K4 PixiJS 初始化失败）最可能是用户下载后 AI 办公室无法显示的直接根因。

建议按 P0 优先级依次修复，修复后重新验证打包版本在以下场景的表现：
1. ✅ 后端可用 + 正常网络
2. ✅ 后端不可达 + 离线
3. ✅ 无 WebGL / 远程桌面
4. ✅ StrictMode 开发模式
5. ✅ 首次启动 + 冷加载

---

## 附：子代理审查报告索引

| 报告 | 路径 |
|------|------|
| Office 入口加载 | `office-page-loading-review_2026-07-25.md` |
| PixiJS 画布渲染 | `pixi_canvas_render_review.md` |
| 素材与依赖 | `office_asset_dependency_review_2026-07-25-1640.md` |
| API/后端可达性 | `office_api_review_2026-07-25.md` |
| Electron 构建 | `electron_office_rendering_code_review_2026-07-25.md` |
