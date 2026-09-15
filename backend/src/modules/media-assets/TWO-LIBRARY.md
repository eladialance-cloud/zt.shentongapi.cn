# 素材两库（用户输入库 / 生成素材库）改造与调用规则

> 定稿：2026-09-14。判定口径唯一真源 = `backend/src/modules/media-assets/library-kind.ts`，
> 本文是给"以后新增模块"看的接入说明：**素材只有两个库，读和写都走这里，不允许再新建素材表/素材接口。**

## 一、两个库是什么

| 库 | library | 谁产生 | 内容 | 谁读 |
| --- | --- | --- | --- | --- |
| 用户输入库 | `input` | 用户上传 / 手动登记 / 形象与声音训练入口 | 声音、形象、图片、视频、音频、IP 档案、文档 | 生成节点**取材**（口播工坊画中画/混剪、发布中心关联素材、后续一切"用素材"的功能） |
| 生成素材库 | `output` | 软件产出（任务/官署/业务流/媒体生成） | 文案、图片、视频、音频 | 发布中心选成品、素材库回看、后续"二次加工" |

一句话：**输入库是"原料"，生成库是"成品"；原料可以被生成节点读取，成品只写不被生成节点读（防自我循环）。**

## 二、数据模型：物理一张表 + 逻辑两个库

- 物理上仍然只有 `media_assets` 一张表（上传、存储、COS、预览、向量化、归档、权限、分页全部复用）。
- 新增两条轴：
  - `library`：`input` | `output`（默认 `input`）
  - `kind`：`voice` / `avatar` / `ip_archive` / `image` / `video` / `audio` / `file`（输入库）｜ `copy` / `image` / `video` / `audio`（生成库）
- 两轴成对校验：见 `LIBRARY_KINDS`（"生成库里的声音"这类越界数据在口径上就不存在）。
- `biz_type` 是**过渡字段**（`media` / `voice_asset` / `ip_archive` / `avatar`），只为兼容历史查询，新代码不要再用它做判定。
- `source_type` 保留精确来源：`manual`（用户上传）/ `task`（任务输出）/ `media_job`（媒体生成）/ `agent`（官署产出）/ `flow`（业务流）。
- 列表查询支持 `tag` 精确过滤（`GET /media-assets?tag=口播工坊`）：SQL 片段真源 = `library-kind.tagContainsSql()`
  （`JSON_VALID` 兜底脏数据 + `JSON_CONTAINS` 精确匹配）。**用途**：口播成片与媒体生成任务的 `source_type`
  同为 `media_job`，只能靠标签区分「口播工坊」这一类产物。
- 形象（原来的 `digital_human_assets`）已并入：主体 = `media_assets(library=input, kind=avatar, biz_type=avatar)`，
  云侧字段（`dh_kind`/`cloud_id`/`video_url`/`image_url`/`preview_url`/`authorized`/`status`）= 1:1 扩展表 `media_asset_avatar(asset_id)`。

## 三、消费者矩阵（谁读 / 谁写）

### 写输入库（library=input）
| 场景 | 入口 | kind |
| --- | --- | --- |
| 素材库页「上传素材」 | `POST /media-assets`（`createMediaAsset`） | 按物理类型 image/video/audio/file |
| 口播工坊·素材页上传 | 已收敛：跳素材库上传（`OralWorkshop/Materials.tsx` 不再自带上传 UI） | 同上 |
| 画中画弹窗上传 | 同上（`Workbench.tsx`，tags=`画中画`） | 同上 |
| 我的声音（声音克隆） | `POST /oral-workshop/voices` | `voice` |
| 我的形象（火山/HeyGen/本地视频） | `POST /oral-workshop/digital-humans`、`/digital-humans/upload` | `avatar` |
| IP 大脑档案 | `POST /oral-workshop/ip-archives` | `ip_archive` |

### 写生成库（library=output）
| 场景 | 入口 | kind |
| --- | --- | --- |
| 官署（三省六部）任务完成自动入库 | 桌面端 `edict-bridge.importTaskAssetsToLibrary` → `POST /media-assets`（url=`edict://...`、tags 含"三省六部"） | `copy`（文案全文）/ `image` / `video` |
| 口播工坊产物导入 | `Materials.tsx` 的"导入产物" → `POST /media-assets`（tags 含"口播工坊"） | `video` / `image` / `audio` |
| 任务输出批量导入 | `POST /media-assets/import` `{taskId}` | 按输出类型；文本 → `copy` |
| 媒体生成任务批量导入 | `POST /media-assets/import` `{mediaJobId}` | image/video/audio |

> 写入方不需要自己写 library/kind：服务端统一用 `resolveAssetOrigin()` 判定。
> 若新增生成类模块，**必须**在调用 `MediaAssetService.create()` 时通过第 3 个参数声明来源
> （`{ sourceType: 'agent' | 'flow' | 'media_job' | 'task', sourceId }`），不要走前端伪造。

### 读输入库（library=input）
| 场景 | 代码位置 | 说明 |
| --- | --- | --- |
| 口播工坊画中画/混剪取材 | `oral-workshop.service.ts` `mixSuggest()` → `materialSearch.search({ library:'input' })` | 只从原料里挑，禁止取生成物 |
| 口播工坊·素材页列表 | `OralWorkshop/Materials.tsx` → `listMediaAssets({ library:'input' })` | |
| 素材库页「用户输入库」Tab | `Assets/AssetLibrary.tsx` → `libraryTabQuery('input', tab)` | |

### 读生成库（library=output）
| 场景 | 代码位置 |
| --- | --- |
| 素材库页「生成素材库」Tab | `Assets/AssetLibrary.tsx` → `libraryTabQuery('output', tab)` |
| 素材库页「生成素材库 · 来源」筛选 | `Assets/library-tabs.ts` → `outputSourceQuery()`：口播成片=`tag=口播工坊`；官署产出 / 媒体生成 / 任务输出=`sourceType`（替代已删除的「合成视频」入口） |
| 发布中心「关联素材」 | `Channels/Publish.tsx` → `listMediaAssets({ library:'output' })`（可切到输入库选封面/画中画） |
| 语义检索 | `GET /media-assets/search?library=...` 跟随当前库 |

## 四、六条强制规则

- **R1 上传必入库**：任何用户上传的素材（含画中画、封面、配音等）都要落 `media_assets` 输入库，不允许只存 URL。
- **R2 产出必入库**：任何模块产出的成品（文案/图片/视频/音频）都要落生成库，且要能追溯到来源（sourceType + sourceId）。
- **R3 引用用 assetId**：跨模块引用素材只用 `media_assets.id`（前端传 `assetId`，后端存 `assetId`），不要另存 URL 副本。
- **R4 读取要声明 kind/library**：读素材必须显式声明 `library`（必要时加 `kind`）。不传 `library` 视为"兼容旧行为"（排除声音/形象/IP 档案），新代码不要依赖这个默认值。
- **R5 不新建素材表**：需要素材就先看 `media_assets` 有没有位置；确实是类别特有的云侧字段，才加 1:1 扩展表（参照 `media_asset_avatar`）。
- **R6 两库互不越界**：生成节点不得从生成库取材（防自我循环、防无限套娃）；输入库只进不改语义（改名/标签/归档可以，改 library/kind 不行）。

## 五、新增模块接入清单（照抄即可）

1. **上传**：`POST /media-assets`，body `{title, url, assetType, tags, description}`（`createMediaAsset`）。落在输入库，无需声明 library。
2. **产出**：调用 `MediaAssetService.create(userId, dto, { sourceType:'agent'|'flow'|'media_job'|'task', sourceId })`，
   或在桌面端复用 `importTaskAssetsToLibrary` 的模式（幂等标记 + best-effort）。
3. **取素材**：`GET /media-assets?library=input&kind=image&page=1&pageSize=50`（列表）或
   `GET /media-assets/search?q=关键词&library=input`（语义检索）。
4. **前端 Tab**：直接复用 `desktop/src/pages/Assets/library-tabs.ts` 的
   `ASSET_LIBRARIES` / `LIBRARY_TABS` / `libraryTabQuery`，不要自己写一套映射。
5. **类型**：前端 `MediaAsset`（`@/api/media-asset-api`）、后端 `MediaAssetEntity` + `library-kind.ts`。

## 六、接口变更

- `GET /media-assets` 新增查询参数：`library`、`kind`、`sourceType`（可组合 `type`、`archived`）。
- `GET /media-assets/search` 新增：`library`、`kind`。
- `source_type` 列由 `ENUM('task','media_job','manual')` 放宽为 `VARCHAR(32)`（容纳 `agent`/`flow`）。
- 语义检索向量 payload 增写 `library`/`kind`（存量点缺字段时按 LIKE 降级兜底）。

## 七、启动迁移（幂等，可重跑）

`db-migration.ts` 中按顺序执行：

1. `library`/`kind` 补列 + 索引；`source_type` 放宽为 VARCHAR(32)。
2. `backfillMediaAssetLibraries()`：用运行时同一判定函数回填历史数据，只写回不一致的行
   （含"官署产出被记成手动登记"的自愈：`edict://` 占位 URL / 三省六部/口播工坊标签 → 生成库 + 精确来源）。
3. 建 `media_asset_avatar`；`mergeDigitalHumanAssetsToMediaAssets()`：形象并入输入库 + 扩展行，
   重映射 `oral_workshop_jobs.digital_human_id`（旧 id → 新 assetId），旧表改名 `digital_human_assets_archived`。

## 八、跨页面中转：画中画待用建议（唯一口径）

口播工坊「素材与混剪」点「加入画中画」→ 任务工作台画中画弹窗使用，跨越两个页面/两个任务，
属于"待用草稿"而不是正式素材，因此不落服务端、不写 `media_assets`（其中真正上传的文件在弹窗
上传那一刻已按 R1 登记进输入库）。

- 读写唯一口径：`desktop/src/pages/OralWorkshop/pip-suggestions.ts`
  （localStorage key `oral-workshop-pip-suggestions`，上限 20 条，url + 字幕相同视为同一条去重，
  位置/大小归一，脏数据直接丢弃）。
- 写入方：`OralWorkshop/Materials.tsx` `handleAddPip()` → `addPipSuggestion(toPipSuggestion(...))`。
- 读取方：`OralWorkshop/Workbench.tsx` 画中画弹窗 → `readPipSuggestions()`；
  「使用」/「全部加入」按成片上限 `PIP_MAX = 4` 消费（`applyPipSuggestion` / `applyAllPipSuggestions`），
  用掉的条目 `removePipSuggestion` / `removePipSuggestions` 从队列移除，未用完的留在队列里。
- 新增模块若也要"把一条素材从一个页面带到另一个页面"，复用上述函数，不要再写第二套 JSON 口径。

## 九、遗留

- 形象占位 URL（`avatar://cloud/<cloudId>`）在素材库列表按图标展示，不参与预览播放。
