# 口播工坊 × 轻语 aigc-human 全面对标（v2）——代码与运营逻辑差异 + 补差方案

> 日期：2026-08-26
> 对标依据：轻语 aigc-human 反编译实物
> - 渲染端 bundle（E:/数字人/aigc-human/resources/app_asar_extracted/electron/renderer/dist/static/js）：功能字符串表、平台映射、发布/克隆/形象/任务/会员流程
> - preload IPC 通道表（150+ 通道）：account:*/publish:*/*draft:*、material:*/vector:*、ip-brain:*、user:activate 等
> - 本地 SQLite（aigc_human.db）：platform_accounts / publish_records / materials / voice_models / digital_humans / tasks / config 真实表结构
> - 主进程 main.jsc 为字节码不可读，登录/发布的具体网页自动化在字节码内，按 IPC 通道 + Playwright 依赖（app.asar.unpacked）推断为「内置浏览器 + cookie 会话」
> 现状代码：本仓库工作区（backend/desktop/admin，P0-P2 未提交改动）
> 本次方向（用户拍板）：**发布账号 = 桌面端用户扫码绑自己的账号；管理后台只做平台开关**

---

## 1. 对标结论总览

| 域 | 对标核心能力 | 我们现状 | 结论 |
|---|---|---|---|
| 文案与选题 | 关键词/爆款选题/排除选题/行业产品/提取(链接+口令文本+上传)/改写模板+字数/产品营销文案/参考范文/学习深度 | 除「参考范文 UI」「学习深度两档 UI」外全部接线 | 基本对齐 |
| 人设与风格 | 预设后台化/风格分析注入选题/人设落库/注入链路 | 已实现（personaPresets 后台可配、styleAnalysis 已接） | 差「IP大脑主页分析」 |
| 配音 | 上传/录音/裁剪训练/试听/语速/情绪/音量/情感参考音频/云端V2/本地 | 全部已实现 | 对齐 |
| 数字人 | 上传建形象/预览/多镜头拼接/画中画/生成方式选择 | 全部已实现 | 对齐 |
| 模板 | 真实封面预览图/后台上传删除/关键词高亮/BGM库/画中画/字幕编辑/多轨开关 | 全部已实现 | 对齐 |
| 预览提交 | 提交前最近成片预览/发布文案AI化/任务中心统计重试删除/导出封面草稿 | 全部已实现 | 对齐 |
| **平台账号发布** | **扫码登录绑定6平台/测试连接/发布面板(批量/草稿/模式/AI标题/风控)/真实发布/发布记录** | **模拟绑定4平台，无真实登录与真实发布** | **最大差异（本次重点）** |
| 素材库 | 素材管理页/向量化状态/AI混剪按字幕匹配素材 | 素材实体+任务产物导入，无管理页/无向量化/无AI混剪 | 差异大 |
| 运营体系 | 激活码激活 + VIP会员(无限次/到期/特权) | 仅 Credits 积分扣费 | 运营模型差异（决策点） |

---

## 2. 差异明细表（功能/代码/运营逻辑）

### G 平台账号与发布（用户新方向，P0-P2）

| 项 | 对标（代码依据） | 我们现状（文件） | 差异 | 复刻方案 | 优先级 |
|---|---|---|---|---|---|
| G1 扫码绑定 | platform_accounts 表含 cookies/status/last_login_at；IPC account:setup-login / open-account | publish-account.entity 只有 platform/accountName/avatarUrl/status/boundAt/remark；service.ts:900 bindPublishAccount 直接置 active（模拟） | 无真实登录态，无 cookie | 桌面端 Electron BrowserWindow 打开平台登录页扫码，采集 session cookie，safeStorage 本地加密 + 上传后端加密存库 | P0 |
| G2 平台范围 | 6 平台 douyin/kuaishou/bilibili/xiaohongshu/xigua/wx_channels（130/814 映射表） | service.ts:885 写死 ['douyin','kuaishou','xiaohongshu','bilibili'] | 缺西瓜视频、蝴蝶号 | 平台清单 + 开关表（见 G3） | P0 |
| G3 平台开关（管理后台） | 平台列表来自 account:get-supported-platforms（主进程配置） | 无开关，硬编码 | 管理后台不能启停平台 | admin Config.tsx 口播工坊新增「发布平台开关」卡片（6 平台：启用/显示名/排序/说明），存 system_config.oral_workshop.publishPlatforms；meta 接口返回启用列表 | P0 |
| G4 登录态/测试连接 | account:test-login / refresh-login；账号状态徽标+最后登录时间（668） | 无测试连接、无登录态回显 | 无法判断 cookie 是否过期 | 后端 POST /publish-accounts/:id/test-login 用 cookie 探测平台主页；账号列表展示 已登录/未登录/已过期 + 最后登录时间 | P1 |
| G5 发布面板 | 529/814：多账号多选批量发布、发布方式(直接发布/保存为草稿)、发布模式(🖐️手动/🌙后台执行)、发布标题≤50/描述≤500、AI生成标题描述、小红书风控提示、结果汇总(全部成功/部分成功/全部失败) | Detail.tsx 单选账号 + publishJobToAccount 单账号模拟直发；无草稿/无模式/无风控/无批量 | 发布交互远弱于对标 | 升级 Detail 发布卡片：多选账号、发布方式、模式、AI 生成、风控提示、结果汇总；后端 publish 接口改多账号 | P1 |
| G6 真实发布 | publish:publish-video（手动开浏览器/后台自动化）；publish_records 表记录 | publish.service.ts:82 publishDirect 直接置 success（模拟） | 没有任何真实发布能力 | 手动模式：桌面端带会话打开平台发布页并 prefill 标题/描述/标签；草稿：跳平台存草稿；自动：B站/快手可做，抖音/小红书按对标风控保持手动 | P2 |
| G7 发布记录 | account:get-publish-records / publish_records（is_draft/published_at/status） | publish_plans 有状态但桌面端无「发布记录」列表 | 无历史发布记录页 | 详情页/账号页展示该账号发布历史（plan 记录），含草稿标记 | P2 |

### H 素材库 / AI 混剪（P2-P3）

| 项 | 对标（代码依据） | 我们现状 | 差异 | 复刻方案 | 优先级 |
|---|---|---|---|---|---|
| H1 素材管理页 | material:init/upload-image/upload-video/search/update-description/batch-*/verify-category-files；「素材分类」页 + 向量化状态 | oral_workshop_materials 实体（type/category/previewUrl/status=vector_pending 预留）；import-materials 导入任务产物；无管理页 | 无上传/分类/预览/状态管理 UI | 桌面端 OralWorkshop 新增「素材库」页：上传/分类/预览/删除/向量化状态；后端补 material CRUD | P2 |
| H2 向量化 + AI 混剪 | vector:init/embed/search；video-composition:search-materials；「勾选字幕后自动按分镜匹配画中画」 | pipAssets 手动添加；向量化仅状态占位 | 无向量检索、无自动匹配 | 复用现有 embedding 供应商：vectorize 接口（素材→向量入库）+ 按字幕关键词检索匹配素材，先做「AI 匹配建议」手动确认 | P3 |

### I IP 大脑（P2）

| 项 | 对标（代码依据） | 我们现状 | 差异 | 复刻方案 | 优先级 |
|---|---|---|---|---|---|
| I1 IP大脑主页分析 | ip-brain:create/list/get/delete；输入抖音主页链接→抓作品列表→deep_analysis（has_deep）；「基于对标内容生成更适合当前账号的人设文案、口播文案和发布文案」 | styleAnalysis 只支持粘贴对标内容文本（llm.ts:291） | 不支持账号主页抓取 | 输入主页 URL（yt-dlp 已装）抓作品列表 → LLM 风格分析 → 落 ip_archives 表 → 注入选题/人设 | P2 |
| I2 学习深度两档 | 130「学习选题和基础写作风格，速度更快」（浅）/ 深度模仿（深） | 后端 rewrite 已有 B6 深度模仿 prompt（prompts.ts:98），无两档选择 UI | UI 缺档位 | Workbench 改写区加「学习深度」单选（快速学习/深度模仿），透传 llm.rewrite reference 参数 | P2 |

### J 会员 / 激活（决策点，P2-P3）

| 项 | 对标（代码依据） | 我们现状 | 差异 | 说明 |
|---|---|---|---|---|
| J1 VIP 会员 | 84 chunk：激活码开通、剩余天数/到期时间、功能对比（无限次声音克隆/数字人/文案/批量任务/4K/数据备份/优先处理/专属客服）、「需要VIP会员权限」门槛 | 无会员，仅 Credits 积分扣费 | 运营模型不同 | 对标=订阅制无限次；我们=积分制。是否复刻需老板定 |
| J2 激活门槛 | user:activate / 需要激活账号，请先激活您的账号 | 无激活码 | 无「未激活限制使用」 | 若做会员建议一并做激活码 |

### K 其余小差异（P1-P3）

| 项 | 对标 | 我们现状 | 方案 | 优先级 |
|---|---|---|---|---|
| K1 参考范文输入 | 130/814 改写与创作可选参考范文 | 后端 createScript/rewrite 支持 reference 参数（prompts.ts:95-109），桌面端无输入框 | Workbench 文案区加「参考范文」文本域，透传 llm | P1 |
| K2 数字人形象排序/编辑 | 583 形象库排序保存/编辑名称描述 | createDigitalHuman 无 sortOrder，Workbench 可增删 | 列表加排序（可选） | P3 |
| K3 声音模型排序 | 499 声音排序保存 | voice assets 无排序 | 可选 | P3 |
| K4 法务审核 | llm:legal-review / AI法务审核报告（130） | admin 已有 reviewModel 字段，executor/桌面端未接 | 先不做（非核心，后端模型字段已备） | P3 |
| K5 设置页(提示词/高性能/备份) | 921 提示词管理/数据备份恢复/高性能模式 | 通用 Settings 已有；口播提示词在 admin/backend 管理 | 非核心，跳过 | 放弃 |

### L 已确认实现（不再重复做，避免返工）

- A1 排除选题（Workbench excludedTopics）、A2 行业/产品输入、A3 提取增强（链接+extract-file 上传转写）、A4 改写模板+字数、A5 产品/营销文案（productCopy）
- B1 预设后台化（personaPresets）、B2 风格分析（analyzeStyle）、B4 人设落库（persona/style/targetAudience/goal）、B5 注入链路（llm 传 persona/style）
- C1 我的声音+试听（demoAudio）、C2 裁剪参考音视频（trimMedia）、C3 录音（getUserMedia）、C4 语速/情绪/音量用户级、C5 耗时提示（约3分钟文案）、C6 情感参考音频（emotionRefAudio）
- D1 形象预览（previewUrl）、D2 上传建形象（uploadDigitalHumanVideo）、D3 多镜头（shots + runMultiShot concat）、D4/E6 画中画（pipAssets + composer overlay）、D6 生成方式选择
- E1 关键词高亮（executor:682 highlight_keywords）、E2 模板真实预览图+后台上传删除、E3 BGM库+音量+开关、E4 字幕编辑+双语、E5 描边渲染（composer drawtext）、E7 字幕/BGM 多轨开关
- F1 发布文案AI化（publisher.ts generatePublishPackage）、F2 提交前最近成片预览（meta recentJob）、F3 任务中心统计/筛选/重试/删除、F5 发布状态（publishStatus 详情展示）、F6 导出封面/草稿
- 任务执行模式：立即/手动/自动/后台/云端（对标 tasks.mode 五种一致）

---

## 3. 补差方案（可运行，按优先级；每项含改动点与验收）

### 阶段 1（P0）：平台开关 + 桌面端扫码绑定 + 登录态回显

**后端**
1. 迁移 031_add_publish_platforms.sql：publish_accounts 加列 display_name(128)/cookies(4096)/last_login_at(datetime)/login_status('online'|'expired'|'offline' 默认 offline)
2. service：createPublishAccount 平台白名单改为「读 publishPlatforms 启用列表」（无则回退 6 平台全量）；新增 getPublishPlatforms() 从 system_config.oral_workshop.publishPlatforms 读取；新增 savePublishPlatforms()（管理后台用）
3. 新接口（controller）：
   - GET /oral-workshop/publish-platforms（桌面端/前端拉启用平台）
   - POST /oral-workshop/publish-accounts/:id/session（body: cookiesJson/displayName/expiresAt；AES 加密存 cookies，login_status=online，last_login_at=now，status=active）
   - POST /oral-workshop/publish-accounts/:id/test-login（服务端用 cookies 请求平台主页，200=online，401/302=expired）
   - DELETE /oral-workshop/publish-accounts/:id/session（解绑=清 cookies）
4. 加密：复用 backend 现有 crypto 工具（AES-256-GCM，密钥走环境变量）

**管理后台**
5. Config.tsx 口播工坊新增「发布平台开关」卡片：6 行（平台 id/显示名/启用 Switch/排序），保存到 publishPlatforms；下方说明「只控制平台是否开放给用户绑定，账号绑定在桌面端完成」

**桌面端 Electron**
6. 新模块 electron/main/platform-login.ts：PLATFORMS 常量表（6 平台 id/显示名/登录 URL/发布 URL/主页 URL）
   - douyin https://creator.douyin.com/ | 发布 https://creator.douyin.com/creator-micro/content/upload
   - kuaishou https://cp.kuaishou.com/ | 发布 https://cp.kuaishou.com/article/publish/video
   - xiaohongshu https://creator.xiaohongshu.com/ | 发布 https://creator.xiaohongshu.com/publish/publish?source=official
   - bilibili https://member.bilibili.com/ | 发布 https://member.bilibili.com/platform/upload/video/frame
   - xigua https://creator.xigua.com/ | 发布 https://creator.xigua.com/creator/content/publish
   - wx_channels(蝴蝶号) https://channels.weixin.qq.com/ | 发布 https://channels.weixin.qq.com/platform/post/create
   - 流程：open(platform) → 新建隐藏菜单 BrowserWindow 加载登录 URL → 用户扫码 → 等待跳转 → session.cookies.get 收集 cookie → safeStorage 加密本地缓存 → 返回给 renderer → renderer POST session 上传后端
7. preload 暴露 platformAccount：{ getSupportedPlatforms, setupLogin, testLogin, openAccount, refreshLogin, saveSession, removeSession }
8. 新页面 desktop/src/pages/OralWorkshop/Accounts.tsx（对标 668）：账号列表卡片（平台徽标/名称/状态徽标/最后登录时间）、添加账号（选平台→扫码弹窗）、操作（登录/测试连接/打开主页/编辑/删除）、分页；路由 /oral-workshop/accounts；Workbench/Detail 的「添加发布账号」改为跳转此页
9. Workbench/Detail 平台下拉改为读 meta.publishPlatforms（未启用平台不显示）

**验收**：抖音扫码后账号列表显示「已登录+最后登录时间」；禁用一个平台后桌面端不再显示；测试连接对失效 cookie 显示已过期；cookie 落库加密（DB 里不可见明文）

### 阶段 2（P1）：发布面板升级（对标 529/814）

**后端**
10. publishJobToAccount 改造为 publishJob(userId, jobId, { accountIds: number[], mode: 'manual'|'auto'|'draft', title?, description? })：多账号循环创建/更新 plan；mode=draft 走 saveDraft；返回 { planIds, summary: '全部成功'|'部分成功: 成功 N 个'|'全部失败' }
11. publish.service：setAccounts(多账号) 已有；补「发布失败账号回写 failed + error_message」

**桌面端**
12. Detail.tsx 发布卡片升级：账号多选（Select multiple，含平台徽标）、发布方式（直接发布/保存为草稿）、发布模式（🖐️手动/🌙后台执行，先落地手动）、发布标题(≤50)/发布描述(≤500) +「AI 生成」按钮（调 generatePublishPackage 回填）、选中小红书时顶部 Alert 风控提示（复刻对标原文）、发布结果 Alert（全部成功/部分成功/全部失败）
13. 「保存为草稿」后详情页显示草稿状态 + 「一键正式发布」

**验收**：一次选 2 账号发布，1 成功 1 失败 → 显示「部分发布成功：成功 1 个」；草稿可一键发布；小红书选中出现风控提示；AI 生成标题/描述可用

### 阶段 3（P2）：真实发布执行

14. 手动发布：Electron 打开平台发布页（带登录会话）+ preload 注入 prefill（标题/描述/标签填入平台输入框，仅同源注入，失败则只打开页面让用户手动填）
15. 草稿发布：打开平台发布页并点击「存草稿」（同源注入或引导用户）
16. 自动发布（可选，按平台开放程度）：B站/快手尝试页面自动化或开放接口；抖音/小红书不做自动（对标风控结论）
17. 发布后回写 publish_records（platform/title/description/tags/status/published_at）并在账号页展示历史

**验收**：抖音手动发布真实成功（登录态有效时）；B站自动发布真实成功；发布记录可见

### 阶段 4（P2-P3）：素材库 / AI 混剪 / IP 大脑

18. 素材管理页（对标 material:*）：OralWorkshop 新增「素材库」——上传图片/视频/音频、分类（pip/bgm/cover/sticker）、预览、删除、向量化状态；后端 material CRUD + upload + vectorize
19. AI 混剪建议：字幕每行提取关键词 → 向量检索素材 → 推荐画中画（先做「AI 匹配建议」列表，用户确认后入 pipAssets）
20. IP 大脑：输入对标主页 URL → 后端 yt-dlp 抓作品列表 → LLM 风格分析 → 存 ip_archives → 选题/改写/人设注入入口（Workbench 学习对标按钮改为「输入主页链接」与「粘贴内容」两种）

**验收**：素材可上传+向量化；AI 混剪建议能按字幕出素材；主页分析能生成风格分析并用于选题

---

## 4. 决策点（需你确认后我按此细化排期）

1. **会员/激活**：对标=激活码 + VIP 无限次订阅；我们=Credits 积分。是否复刻 VIP 会员（J1/J2）？还是维持积分制（推荐先维持积分，发布/素材/IP大脑优先级更高）？
2. **自动发布边界**：默认手动 + 草稿；B站/快手做自动，抖音/小红书手动（对标风控结论）。是否同意？
3. **本期范围**：建议本期只做阶段 1+2（平台开关/扫码绑定/发布面板），阶段 3 手动发布紧随其后；素材/IP大脑作为下一期。是否按此推进？
