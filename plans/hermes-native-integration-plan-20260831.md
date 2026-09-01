# 深瞳AI × Hermes 原生能力接入实施计划（P0-P3）

> 日期：2026-08-31
> 依据：`深瞳AI-Hermes原生能力接入方案_20260831_1700.md` + 代码库实测核实
> 交付形态：桌面端产品功能（面向最终用户：装桌面端安装包 → 自动下载/安装 Hermes 0.20.5 → serve 模式启动）

---

## 1. 目标

将桌面端对 Hermes 的调用从「自研轮子（文件读写 / CLI 解析 / IPC 封装）」收敛到「Hermes 原生控制平面（FastAPI + WebSocket，127.0.0.1:8642）」，并补上「Hermes 任务完成 → 云端知识库沉淀」唯一缺失闭环。业务编排（官署/团队指派/状态机/config.yaml 注入）保留不动。

## 2. 面向最终用户的架构前提（修正基准，非本机开发环境）

| 前提 | 依据（代码） | 说明 |
|---|---|---|
| Hermes 版本锁定 0.20.5 | `desktop/electron/main/runtime-manifest-embedded.ts`：`hermes.version = "0.20.5"`，下载源 `https://zt.shentongapi.cn/runtime/hermes/0.20.5/hermes-win-x64.tar.gz` | 最终用户与开发机同版本，100+ 原生端点兼容由分发机制兜底 |
| Hermes 以 serve 模式启动 | `service-manager.ts` spawnArgs：`['serve','--port','8642','--host','127.0.0.1','--skip-build']` | 端口 8642 由 `SERVICE_DEFS.hermes.port` 统一定义 |
| 原生 API 鉴权 key 已有 | `getOrCreateHermesServerKey()` → credential-store `hermes.serverKey`，经 `buildHermesEnv()` 注入 `CUSTOM_API_KEY` | HermesClient 直接复用，不新增密钥管理 |
| 运行时位置与产品逻辑解耦 | `runtime-resolver.ts`：内置 extraResources → userData 补丁（`getRuntimeRoot()`，可自定义）→ 宿主机命令回退 | HermesClient 只依赖 127.0.0.1:8642 + key，不解析任何运行时文件路径 |
| 服务生命周期由 service-manager 管 | `probeHermesRuntime()`（edict-bridge）/ `getServiceStatus('hermes')` | HermesClient 调用前探测服务状态，未就绪降级/报错 |

## 3. 现状核实结论（代码证据）

| 方案声明 | 实测 | 结论 |
|---|---|---|
| hermes-memory 自研文件读写 | `hermes-memory.ts` 读写 `userData/hermes-home/MEMORY.md`、`USER.md`（§ 分隔/上限/去重） | ✅ 属实 |
| hermes-evolution 自研 journey 解析 | `hermes-evolution.ts` spawn CLI `journey --json` + `curator status` + `memory status` | ✅ 属实 |
| hermes-skills 自研 | `hermes-skills.ts` 封装 CLI `skills list/search/install/...` | ✅ 属实（CLI 封装） |
| hermes-config 自研改 yaml | `hermes-config.ts` 生成 `$HERMES_HOME/config.yaml` model 段 + custom_providers（指向平台 llm-proxy） | ✅ 属实；**保留**（启动注入仍必要） |
| hermes-orchestrator CLI 一次性问答 | `hermes-orchestrator.ts` spawn `hermes.js` CLI（HERMES_ENTRY） | ✅ 属实 |
| 原生 API 现成未用 | 全库无 `api/memory`、`api/learning`、`api/curator` 调用；仅 `hermes-local.ts` 用 `/v1/chat/completions`、edict-bridge 用 `/health` 探测 | ✅ 属实 |
| 知识库沉淀缺失 | 后端已有 `POST /sedimentation/analyze|apply|undo`、`GET /sedimentation/feed`；`apply(target=knowledge_base)` 已写 `knowledge_base_chunks`（`KnowledgeBaseService.createTextDocument`） | ⚠️ 通道已存在，**复用**，不新增 `/knowledge/sediment` |
| 渲染层经 IPC 调用 | `window.electronAPI.hermesMemory.*` / `hermesEvolution.get` / `hermesSkills.*`（preload 封装）；主进程 `ipcMain.handle('hermes-memory:*' 等)` | ✅ 替换主进程内部实现即可渲染层无感 |
| `GET/PUT /api/memory` 可读写 MEMORY.md | 实测（0.20.5，`E:\\中台\\4工具` 起 serve）：`GET /api/memory` 仅返回记忆提供商状态 `{providers:[{name,status,available,...}]}`，**不含 MEMORY.md 内容**；`PUT /api/memory` 返回 **405** | ❌ 修正：MEMORY.md 内容无原生 API，`hermes-memory.ts` 文件读写必须保留；原生仅用于读 providers 状态展示 |

## 4. 实施范围与阶段

### P0（本周，首批交付）：HermesClient 基础 + 记忆/进化替换 + 沉淀闭环

- 新建 `desktop/electron/main/hermes-client.ts`（核心交付物，见 §5.1）
- `hermes-memory.ts`：**保留文件读写**（实测 `GET /api/memory` 仅返回 providers 状态、`PUT /api/memory` 405，MEMORY.md 无原生 API）；原生仅用于展示记忆提供商状态（走 evolution 原生路径）
- `hermes-evolution.ts`：`journey --json`/`curator status`/`memory status` 改为原生 `GET /api/learning/graph`、`GET /api/curator`、`GET /api/memory`（providers 状态）；各失败独立降级回 CLI；返回结构不变
- 沉淀闭环（溯源就绪）：`ApplyDto` 加 `taskId`/`executionRef`，`sedimentation_feed` 加可空 `task_id` 列（db-migration `ensureColumn`），service apply() 落库；orchestrator 任务收尾调用 `sedimentation/apply`（需用户 token）留待下一步接入，**本轮不新增 `/knowledge/sediment` 接口**
- 同步改单测：`desktop/tests/unit/hermes-memory.test.ts`、`hermes-evolution.test.ts`（mock HermesClient）；新增 `hermes-client.test.ts`
- 验收：`npm test`（desktop jest）全绿；`npm run build`（tsc + electron-vite）通过；`E:\中台\4工具` 起 serve 实测端点结构后对齐类型

### P1（本月）：策展 + 状态

- `HermesClient.getCurator/setCuratorPaused/runCurator` → `GET /api/curator`、`PUT /api/curator/paused`、`POST /api/curator/run`
- `HermesClient.getStatus/getSystemStats` → `GET /api/status`、`GET /api/system/stats`，替换 service-manager 自研指标采样（面板只读）
- 新增 IPC：`hermes-curator:*`、`hermes-status:get`（渲染层新页面/面板，不破坏现有）
- 验收：进化页展示原生策展状态；服务管理面板展示官方状态数据

### P2（季度）：技能 + 模型

- `HermesClient.listSkills/installSkill` → `GET /api/skills` 等，替换 `hermes-skills.ts` CLI 封装（保留内置技能同步 `syncHermesSkills`）
- `HermesClient.getModelOptions/setModel` → `GET /api/model/options`、`POST /api/model/set`（实测为 POST 非 PUT），替换模型切换（**config.yaml 生成保留**）
- 同步改 `hermes-skills.test.ts`、`hermes-config.test.ts`
- 风险：`/api/skills`、`/api/model/*` 响应结构需实测对齐；P2 内先做版本探测再切换

> **状态：已实施（2026-09-01）**——技能读写全部切原生优先 + CLI 降级；模型读侧 `getModelOptions` 与客户端 `setModel` 已实现，但**未接入 IPC 模型切换**（桌面端仍走方案 B config.yaml，理由见文末「四、执行记录（P2）」）。

### P3（长期，可选）：执行通道升级 WS PTY

- `hermes-orchestrator` 的 CLI 通道 → `WS /api/pty`（真持续会话），订阅 `/api/events` 实时看执行
- 编排业务逻辑（分解/确认/打回/团队指派）保留，只换执行通道
- 风险中-高；P0-P2 阶段不启动，评估口播/长任务需求后再立项

## 5. 关键设计

### 5.1 HermesClient（`desktop/electron/main/hermes-client.ts`）

```typescript
export class HermesClient {
  constructor(deps: {
    baseUrl?: string;          // 缺省 http://127.0.0.1:8642（SERVICE_DEFS.hermes.port）
    token?: string;            // 缺省读 credential-store 'hermes.sessionToken'（service-manager mint 并注入 HERMES_DASHBOARD_SESSION_TOKEN，请求头 X-Hermes-Session-Token）
    fetchImpl?: typeof fetch;  // 可注入，便于单测
    logger?: (msg: string) => void;
  }) {}
  // P0
  getMemoryProviders(): Promise<MemoryProvider[]>         // GET /api/memory（仅 providers 状态；MEMORY.md 内容无原生 API，仍走 hermes-memory 文件读写）
  getLearningGraph(): Promise<LearningGraph>              // GET /api/learning/graph
  putLearningNode(node: LearningNodeInput): Promise<{ok: boolean}>  // PUT /api/learning/node
  sedimentToCloud(payload: SedimentPayload): Promise<ApplyResult>   // 主进程代理 → POST /sedimentation/apply
  // P1
  getCurator(): Promise<CuratorState>                     // GET /api/curator
  setCuratorPaused(paused: boolean): Promise<{ok: boolean}>  // PUT /api/curator/paused
  runCurator(): Promise<{ok: boolean; summary?: string}>  // POST /api/curator/run
  getStatus(): Promise<StatusPayload>                     // GET /api/status
  getSystemStats(): Promise<SystemStats>                  // GET /api/system/stats
  // P2
  listSkills(): Promise<SkillInfo[]>                      // GET /api/skills
  installSkill(pack: string): Promise<{ok: boolean}>
  getModelOptions(): Promise<ModelOption[]>               // GET /api/model/options
  setModel(model: string, scope?: 'main'|'aux'): Promise<{ok: boolean}>  // PUT /api/model/set
  // 基建
  health(): Promise<{version: string} | null>             // GET /api/health（版本探测）
  isAlive(): Promise<boolean>                             // 探测服务是否就绪
}
```

关键约束：
- **零路径依赖**：不 import runtime-resolver / 不读 HERMES_HOME，只依赖 baseUrl + key
- **容错与降级**：`GET /api/health` 版本探测失败或 API 异常 → `fallback` 到现有实现（hermes-memory 文件读写 / hermes-evolution CLI），并 `logger.warn` 记录；切换采用「能力开关 + 渐进灰度」（P0 先记忆/进化，验证稳定再继续）
- **鉴权**：请求头携带 `Authorization: Bearer <key>`（对齐 hermes-local.ts 既有调用）；仅 127.0.0.1
- **超时**：全部请求带 AbortSignal.timeout（默认 5s，长任务 30s），避免主进程卡死

### 5.2 IPC 兼容策略（渲染层无感）

| 现有 IPC | 保留通道 | 内部实现 |
|---|---|---|
| `hermes-memory:list/add/replace/remove` | ✅ 不变 | `handleMemoryOp` → 保持文件读写（实测无原生 API）；原生仅 evolution 页展示 memory providers 状态 |
| `hermes-evolution:get` | ✅ 不变 | `getEvolution` → 优先原生 graph/curator/memory，降级 CLI |
| `hermes-skills:*` | ✅ 不变 | 原生 `/api/skills`/`hub/*` 优先 + CLI 降级（P2 已实施） |
| `hermes-orchestrate:*` | ✅ 不变 | 业务逻辑保留；P0 仅在收尾处新增沉淀调用 |

返回结构（`HermesMemoryOpResult` / `HermesEvolutionResult`）与 preload 类型声明（`electron/shared/types.ts`）不变。

### 5.3 沉淀闭环（复用后端现有接口）

```
hermes-orchestrator 任务成功完成（收尾处，createStepRunner 内实现）
  ├─ 判断价值（产出非空 + 类型可复用；缺省由配置/用户确认决定）
  ├─ deps.sedimentToCloud({                     // 主进程 deps（index.ts buildStepRunnerDeps，带用户 token）
  │     type: 'enterprise_doc', target: 'knowledge_base',
  │     title, content, kbId?,
  │     taskId, executionRef          // 溯源字段（新）
  │   })
  │     → fetch(`${ST_API_BASE}/sedimentation/apply`, 带用户 token)
  │     → knowledge_base_chunks 写入 + sedimentation_feed 记录（幂等：24h 同标题同内容）
  └─ 失败仅告警不阻断任务；幂等由后端 apply() 24h 同标题同内容兜底
```

后端改动（P0 最小化）：
- `ApplyDto` 增加可选 `taskId?`/`executionRef?` 溯源字段（feed 表加可空列 `task_id`，迁移走 TypeORM `src/migrations/*` 新增 0009 或 db-migration ensureColumn——实施时按现有惯例选择）
- 不新增 `/knowledge/sediment` 接口

## 6. 文件改动清单

| 文件 | 动作 | 阶段 |
|---|---|---|
| `desktop/electron/main/hermes-client.ts` | 新增（核心） | P0 |
| `desktop/electron/main/hermes-memory.ts` | 保持文件读写（实测无原生 API）；不改造 | P0（结论修正） |
| `desktop/electron/main/hermes-evolution.ts` | 内部改原生优先 + 降级 | P0 |
| `desktop/electron/main/hermes-orchestrator.ts` | 收尾处接沉淀（已实现：任务成功自动沉淀，失败告警不阻断） | P0.5（已完成） |
| `desktop/electron/main/index.ts` | `buildStepRunnerDeps` 注入 `sedimentToCloud`（用户 token → `POST /sedimentation/apply`）；P1 已注册 `hermes-curator:get/set-paused/run` + `hermes-status:get` | P0.5/P1（已完成） |
| `desktop/electron/shared/types.ts` | HermesClient 返回类型 + IPC 类型 | P0 |
| `backend/src/modules/sedimentation/dto/sedimentation.dto.ts` | ApplyDto 加 taskId/executionRef 可选字段 | P0 |
| `backend/src/modules/sedimentation/...`（feed 实体/迁移） | task_id 可空列 | P0 |
| `desktop/tests/unit/hermes-memory.test.ts` | 无需改造（文件读写保留） | P0（结论修正） |
| `desktop/tests/unit/hermes-evolution.test.ts` | mock HermesClient 适配 | P0 |
| `desktop/tests/unit/hermes-client.test.ts` | 新增（容错/降级/鉴权） | P0 |
| `desktop/tests/unit/hermes-skills.test.ts`、`hermes-config.test.ts` | P2 适配 | P2 |
| `service-manager.ts` 指标采样 | 保留自研采样（Hermes 官方状态走独立 `hermes-status:get` IPC，不侵入服务管理采样） | P1（范围收敛） |

## 7. 测试与验收

- **桌面端**：`cd desktop && npm test`（jest 全量）；`npm run build`（tsc node/web + electron-vite）
- **后端**：`cd backend && npm test`（717 例，含 sedimentation 现有测试）；`npm run build`
- **端点实测**：用 `E:\中台\4工具` 的 Hermes 0.20.5 起 `hermes serve`，逐一核对 `/api/memory`、`/api/learning/graph`、`/api/curator` 响应结构后固化类型与解析器
- **降级验证**：停 Hermes 服务后，记忆/进化页仍可用（走文件/CLI 兜底）并输出降级日志
- **沉淀闭环**：mock 后端/真实后端各验证一次「任务完成 → chunks 写入 → feed 记录 → undo 撤回」

## 8. 风险与回滚

1. **端点响应结构与 0.20.5 文档差异**：P0 实施首日实测对齐；解析器全容错（取首 JSON、字段缺失默认值），失败降级不阻断
2. **版本升级破坏兼容**：HermesClient 内置版本探测 + 降级日志；升级运行时版本时先在 manifest 更新处回归
3. **双重记账**：沉淀写入不扣积分（与 knowledge-query 规则一致），走 `sedimentation/apply` 现有幂等
4. **主进程卡死**：全部请求带超时；HermesClient 不在渲染线程运行
5. **回滚**：P0 的替换均为「内部实现切换」，IPC/返回结构不变 → 关闭能力开关即回退旧实现，无需改渲染层

## 9. 执行记录

### 一、执行记录（P0）：HermesClient + 进化原生化 + 沉淀溯源

**2026-08-31 已完成**

- `desktop/electron/main/hermes-client.ts`（新增）：`status/isAlive/getLearningGraph/putLearningNode/getMemoryProviders/getCurator/setCuratorPaused/runCurator/getSystemStats/listSkills/getModelOptions`；请求头 `X-Hermes-Session-Token`（token 惰性读 credential-store `hermes.sessionToken`，支持显式覆盖），默认超时 5s，失败抛 `HermesApiError`
- `desktop/electron/main/service-manager.ts`：`getOrCreateHermesSessionToken()` mint 会话 token（`shentong-session-<hex>`）写入凭据存储，`buildHermesEnv()` 注入 `HERMES_DASHBOARD_SESSION_TOKEN`（与 Hermes `web_server._resolve_session_token` 同源，仅 127.0.0.1:8642）
- `desktop/electron/main/hermes-evolution.ts`：`getEvolution(client?)` 优先原生（learning graph / curator / memory providers），各失败独立降级 CLI（journey --json / curator status / memory status），返回结构不变；修复 CLI 路径 `memoryStatus` 字符串拼接断行编译错误
- `desktop/electron/main/index.ts`：`hermes-evolution:get` 改为 `getEvolution(new HermesClient())`，初始化异常降级 CLI
- 后端沉淀溯源：`sedimentation-feed.entity.ts` 加 `task_id VARCHAR(64) NULL`；`sedimentation.dto.ts` `ApplyDto` 加可选 `taskId?`/`executionRef?`；`sedimentation.service.ts` apply() 两分支落 `taskId`；`db-migration.ts` `ensureColumn('sedimentation_feed','task_id',...)` 幂等补列
- 测试：新增 `desktop/tests/unit/hermes-client.test.ts`（7 例：鉴权头/解析/字段缺失容错/401/超时失败/isAlive/memory providers）；`hermes-evolution.test.ts` 保持通过
- 验收：`cd desktop && npm test -- tests/unit/hermes-client.test.ts tests/unit/hermes-evolution.test.ts` 全绿（13 例）

**结论修正**：MEMORY.md 内容无原生 API（`GET /api/memory` 仅 providers 状态、`PUT /api/memory` 405），`hermes-memory.ts` 文件读写保留；P0 未动 `hermes-orchestrator`（沉淀收尾调用留待 P0.5，需用户 token）。

### 二、执行记录（P0.5）：沉淀闭环

**2026-09-01 已完成**

- `hermes-orchestrator.ts`：新增 `SedimentPayload` 接口；`StepRunnerDeps` 加可选 `sedimentToCloud`；`createStepRunner` 成功收尾处（persistOutputs 后）best-effort 沉淀——content=summary+各节点产出（content/url），title=任务描述前 200 字，`taskId=String(teamTaskId)`、`executionRef` 溯源；失败仅 `console.warn` 不阻断任务
- `index.ts`：`buildStepRunnerDeps` 注入 `sedimentToCloud` 真实实现——用户 token `POST ${ST_API_BASE}/sedimentation/apply`，20s 超时，失败返回 `{ok:false,error}`
- 测试：`hermes-step-runner.test.ts` 新增「任务成功收尾自动沉淀（溯源 taskId/executionRef、含产出内容）」用例；harness 增加 `sediments` 捕获
- 验收：`npm test -- tests/unit/hermes-step-runner.test.ts tests/unit/hermes-orchestrator.test.ts tests/unit/hermes-client.test.ts tests/unit/hermes-evolution.test.ts` 全绿（60 例）；`npm run build`（tsc + electron-vite）通过

**设计注记**：沉淀调用放在主进程 deps（`buildStepRunnerDeps`，已持有用户 token），未放进 HermesClient（后者只面向 127.0.0.1:8642 本地 Hermes API）。

### 三、执行记录（P1）：策展 + 状态面板

**2026-09-01 已完成**

- `shared/ipc-channels.ts`：登记 `hermes-curator:get` / `hermes-curator:set-paused` / `hermes-curator:run` / `hermes-status:get`
- `shared/types.ts`：新增 `HermesCuratorState`/`HermesCuratorResult`/`HermesCuratorOpResult`/`HermesStatusPayload`/`HermesSystemStatsPayload`/`HermesStatusResult`，`ElectronAPI` 增加 `hermesCurator` + `hermesStatus` 命名空间
- `preload/index.ts`：桥接 `hermesCurator.get/setPaused/run`、`hermesStatus.get`
- `main/index.ts`：4 个新 IPC handler（`HermesClient` 原生 API，各失败独立降级，不抛错）
- `src/pages/Hermes/Evolution.tsx`：策展区升级为结构化卡片——运行状态 Tag（运行中/已暂停/未启用）、检查间隔、上次运行时间、「暂停/恢复策展」「立即运行」按钮；原生未接入时降级展示原有 curator 原文
- `src/pages/ServiceManager/index.tsx`：Hermes 服务卡片追加官方状态区（版本 / 组件 overall / 活跃 Agent·会话 / 进程 CPU%，`/api/status` + `/api/system/stats`，只读；API 不可达自动隐藏）
- 测试：`hermes-client.test.ts` 新增 5 例（getCurator / setCuratorPaused PUT / runCurator POST / status 降级 / getSystemStats 解析）
- 验收：`npm test` 全量 471 例通过（唯一失败仍为预存在 oral-workshop.test.ts，`import.meta.env` 问题，与本次无关）；`npm run build`（tsc node/web + electron-vite）通过

**设计注记**：P1 未替换 service-manager 自研指标采样——官方状态作为只读补充走独立 `hermes-status:get` IPC，避免侵入服务生命周期采样逻辑（范围收敛，风险更低）。

**待办（P2）**：技能/模型切换 → **已实施**，见下方「四、执行记录（P2）」。

### 四、执行记录（P2）：技能 + 模型

**2026-09-01 已完成**

- `hermes-client.ts`：新增 `searchSkills`（GET /api/skills/hub/search）、`installSkill`（POST hub/install，后台异步 spawn）、`uninstallSkill`（POST hub/uninstall）、`updateSkills`（POST hub/update）、`toggleSkill`（PUT /api/skills/toggle）、`setModel`（POST /api/model/set，实测为 POST 非方案初稿 PUT；昂贵模型 `confirm_required`/`confirm_message` 透传，400 校验错误转 `{ok:false,error}`）；`listSkills`/`getModelOptions` 读侧补齐（GET /api/skills 实测返回数组，另兜底 `{skills:[]}`）
- `hermes-skills.ts`：6 个桥接函数改**原生优先 + CLI 降级**（保留 `syncHermesSkills` 内置同步与 `listBundledHermesSkills`/parse 函数）：`listSkills` 映射原生 provenance→`builtin`（bundled 或桌面内置名单）；`searchSkills` 用 hub/search 的 `identifier` 作为安装标识；`installSkill`/`uninstallSkill`/`updateSkills`（未指定 name）走原生后台异步；`updateSkills(name)` 指定单技能时原生不支持、直接走 CLI；`checkSkills` 无原生等价端点保持 CLI
- `hermes-skills.test.ts`：新增 10 例（原生映射 / 降级 / hub search / 单技能更新走 CLI）
- `hermes-client.test.ts`：新增 10 例（listSkills 数组与包裹 / searchSkills 参数 / install-uninstall-update-toggle 方法与 body / setModel POST+confirm+400 / getModelOptions）
- 验收：`npm test` 全量 491 例通过（新增 20 例；唯一失败仍为预存在 oral-workshop.test.ts，`import.meta.env` 问题，与本次无关）；`npm run build`（tsc node/web + electron-vite）通过（LASTEXITCODE=0）

**设计注记（写侧 setModel 未接入）**：/api/model/set 的昂贵模型需二次确认、scope 分 main/auxiliary，且桌面端现有「方案 B」（`model-defaults:sync` → config.yaml + 重启）已同时同步 ST-Claw 与每类默认模型；方案原文即「config.yaml 生成保留」。为不破坏现有 llm-proxy 路由，P2 只落地读侧 `getModelOptions` 与客户端 `setModel` 能力，**不替换** IPC 模型切换；如后续要完整切换再细化昂贵模型确认流程。
