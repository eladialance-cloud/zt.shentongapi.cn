# 口播工坊对齐轻语 aigc-human 补齐方案（完整版）

> 版本：v1.0（2026-08-26）
> 对标依据：轻语 aigc-human 桌面端反编译代码（E:/数字人/aigc-human/resources/app_asar_extracted/electron/renderer/dist/static/js）
> 现状代码：本仓库（D:/二次开发）backend / desktop / frontend/admin
> 原则：复用已有死代码（prompts/适配器）优先；小改动先行；不动计费与安全基线；每期可独立上线。

---

## 1. 对标结论总览

| 环节 | 轻语核心能力 | 我们现状 | 差距量级 |
|---|---|---|---|
| 文案与选题 | 多维输入、排除选题、提取文案（链接/分享文本/上传）、改写模板+字数、产品/营销文案、参考范文 | 关键词→选题→文案一条线，排除选题未接线、改写黑盒、产品文案无入口 | 中 |
| 人设与风格 | IP 类型 7 类预设、IP 大脑（账号主页分析）、风格分析注入选题、学习深度两档、深度模仿 | 5 个写死预设、风格分析是死代码、人设未落库（style/goal 丢弃） | 中 |
| 配音 | 录音/上传/裁剪训练声音、试听、语速/情绪/音量用户级、云端V2/本地 | 官方音色池+V1/V2 档（独有亮点）、我的声音无试听无状态、参数后台全局 | 中 |
| 数字人形象 | 上传真人视频建形象、形象库预览/排序、多镜头拼接、画中画、首帧封面 | 火山形象 ID+卡片兜底、形象无预览、无多镜头无画中画 | 大 |
| 模板 | 真实封面、关键词高亮、~30 套字幕动画、BGM 库、画中画、多轨道独立控制、可视化编辑 | SVG 示意预览、高亮未接线、4 种动画、无 BGM、无画中画 | 大 |
| 预览提交 | 提交前成片预览、AI 发布文案、平台账号一键发布、任务统计/重试/删除、导出 | 无预览、发布包机械拼接、无发布账号、任务中心薄 | 中 |

轻语关键代码文件：
- `130.7bbe1c81.js`：文案与选题、改写（写作模板/字数）、BGM、封面模板、发布
- `814.cebe2b01.js`：工作台（人设/选题/配音/数字人/多镜头/画中画/字幕编辑/发布）
- `499.fdc7b036.js`：声音克隆训练页（上传/录音/裁剪/语速/情绪/音量）
- `583.5fb5f44e.js`：数字人形象库（上传/转码/预览/排序）
- `529.a2a648b9.js`：任务中心（统计/重试/删除/发布账号）
- `84.cf26d263.js`：会员体系（对应我们积分体系，不做会员）

---

## 2. A 文案与选题补齐

### A1 排除选题接线（P0，小）
- 现状：`topic_generation`/`keyword_topics` prompt 已支持 `excludedTopics`，后端 `generateTopics` 已透传，桌面端 `handleTopics`（Workbench.tsx ~230 行）从不传。
- 目标（对标 814「注意，以下是刚才已经生成过的选题…请避开以上选题」）：选题弹窗内维护 `generatedTopics: string[]`，每次生成把上一轮 title 数组传 `excludedTopics`；弹窗底部展示「本轮已生成 N 条」，可一键清空。
- 改动：`desktop/src/pages/OralWorkshop/Workbench.tsx`（handleTopics 传参+展示）、`desktop/src/api/oral-workshop-api.ts`（generateTopics 参数加 excludedTopics）。
- 验收：连续生成两次无重复/近似选题。

### A2 选题输入补维度（P1，中）
- 现状：选题只有关键词+人设；prompt 无「行业或产品/产品卖点」输入。
- 目标（对标 814「行业或产品」「产品卖点」「爆款选题我的人设」）：选题弹窗加「行业或产品」「产品卖点」输入框，接入 `topic_generation`/`keyword_topics` 的 `industryOrProduct`/`productSellingPoints` 占位符。
- 改动：`prompts.ts`（模板加占位符+要求）、`llm.ts`（generateTopics/keywordTopics 加参）、`dto/oral-workshop.dto.ts`（GenerateTopicsDto 加字段）、Workbench 弹窗。
- 验收：填了产品卖点后选题明显围绕产品。

### A3 提取文案增强（P1，中）
- 现状：`extractScript` 只收 http/https 直链；抖音分享口令文本不支持；不能上传本地音视频。
- 目标（对标 130「支持直接粘贴分享文本，系统会自动识别有效链接」「点击上传音频/视频，AI会提取音视频中的文案」）：
  1. 粘贴文本自动提取 URL（正则 `https?://[^\s]+`，优先匹配抖音/快手/B站短链）；
  2. 新增上传本地音视频转写：桌面端选文件→上传到 `/oral-workshop/extract-file`（multipart）→ 复用 ffmpeg 抽音频 + STT。
- 改动：`oral-workshop.service.ts`（extractScript 加文本解析分支、新增 extractFile）、`oral-workshop.controller.ts`（新接口+上传）、Workbench（支持粘贴文本/上传按钮）。
- 验收：粘贴抖音口令文本可提取；上传 mp4/mp3 可转写。

### A4 改写交互（P1，中）
- 现状：改写只在流水线 rewrite 步骤自动执行（`rewrite_master` 固定 260 字），用户不可选模板/字数、无确认。
- 目标（对标 130/814「请选择改写模板」「选择字数/输入字数」「使用此文案/替换为修改后文案」）：
  1. 新增 POST `/oral-workshop/rewrite`：body { script, templateId?, wordCount?, persona?, style? }；
  2. 模板：`rewrite_master`（信息保全）、`generic_rewrite`（通用）、新增「爆款视频详细文案风格」「深度学习爆款文案风格」两条（对标轻语写作模板）；
  3. 字数：模板注入「请严格将改写后的文案控制在 {wordCount} 字左右」；
  4. 桌面端 ① 步骤加「智能改写」按钮→弹窗（选模板/选字数/参考范文）→结果区「使用此文案/替换」。
- 改动：`prompts.ts`（新模板+字数占位）、`llm.ts`（rewriteScript 扩展）、controller/service（rewrite 接口）、Workbench。
- 验收：改完可选采纳或放弃；字数可控。

### A5 产品/营销文案入口（P1，中）
- 现状：`product_copy` prompt 已存在，无任何 UI/接口调用。
- 目标（对标 814「自由创作文案」「营销文案」「产品文案（请至少输入产品名称或卖点）」）：新增 POST `/oral-workshop/product-copy`（body: productName?, sellingPoints?, persona?），桌面端 ① 步骤加「产品文案」按钮→填产品名称/卖点→生成回填。
- 改动：controller/service（productCopy 接口）、`llm.ts`（createProductCopy，校验至少填一项）、Workbench。
- 验收：只填卖点也能生成；空提交被拦截。

### A6 参考范文入口（P1，小）
- 现状：`script_creation` 支持 `reference` 但 UI 不传。
- 目标（对标 130「参考范文（请严格模仿以下文案的语感、节奏和结构）」）：选题点击生成文案时可选「参考范文」粘贴框，接入 `reference`。
- 改动：Workbench 选题弹窗加参考范文输入，`applyTopic` 传 reference。
- 验收：范文风格被模仿。

### A7 选题→文案质量基线（P0，小）
- 现状：用户反馈「选择后到文案框只有一句话」——`script_creation` 无篇幅下限，模型输出过短直接回填。
- 目标：`script_creation` 模板加「输出 200-300 字完整口播稿，不少于 3 个段落」；后端生成后校验字数，<100 字自动重试 1 次（温度 0.8）。
- 改动：`prompts.ts`、`llm.ts`（createScript 加校验+重试）。
- 验收：生成文案稳定 ≥150 字。

---

## 3. B 人设与风格补齐

### B1 IP 类型预设后台化+扩充（P1，中）
- 现状：Workbench.tsx 硬编码 5 个 chip（老板型/避坑顾问型/知识干货型/故事经验型/轻松育娃型）。
- 目标（对标 814 下拉 7 类：顾问型IP/创始人IP/创业者IP/老板型IP/专家型IP/通用个人IP/从业者经验派）：预设改由管理后台下发——`system_config.oral_workshop` 新增 `personaPresets: [{label, value}]`；桌面端 GET `/oral-workshop/meta` 拉取渲染。
- 改动：`Config.tsx`（预设编辑区）、Workbench（读 meta 渲染预设，保留自定义输入）。
- 验收：后台改预设，桌面端即时生效。

### B2 风格分析接线（P0，中）
- 现状：`style_analysis` prompt 与 `llm.styleAnalysis()` 是死代码，无接口无 UI。
- 目标（对标 814「正在深入分析账号风格与选题」+ JSON `{style_analysis, topics[]}`）：
  1. 新增 POST `/oral-workshop/style-analysis`（body: referenceContent, excludedTopics?），返回 `{style_analysis, topics}`；
  2. 桌面端 ① 步骤「学习对标」旁加「分析风格」按钮：把已提取文案/对标内容传过去，结果区先展示风格分析（200字），再展示 5 条选题；`style_analysis` 随 persona 一起注入选题 prompt（`topic_generation` 加 `styleAnalysis` 占位符）。
- 改动：`prompts.ts`（topic_generation 加占位）、`llm.ts`（generateTopics 加参）、controller/service（style-analysis 接口）、Workbench。
- 验收：分析后选题明显贴合对标账号风格。

### B3 学习深度两档（P2，大）
- 现状：无。
- 目标（对标 814「学习选题和浅度分析写作风格（快速）」/「深度学习写作风格（耗时较长）」）：选题弹窗加「学习深度」开关——浅度=直接选题；深度=先 `styleAnalysis` 再生成（即 B2 全流程），后端串行两次 LLM。
- 改动：同 B2 + Workbench 开关 + loading 文案「正在深入分析账号风格与选题…」。
- 验收：两档响应时间/结果有区分。

### B4 人设多维度字段+落库（P1，中）
- 现状：Workbench 收集 persona/targetAudience/style/goal，建单只存 persona；style/goal/targetAudience 丢弃；改写只传 persona。
- 目标：`oral_workshop_jobs` 加列 `style`/`target_audience`/`goal`（迁移 024_add_oral_workshop_persona_fields.sql）；create() 落库；executor runRewrite 把 style、目标受众一并传入 `rewriteScript`。
- 改动：entity/迁移、service create、executor runRewrite、llm rewriteScript 签名、DTO。
- 验收：详情页显示完整人设配置；改写用上风格。

### B5 人设注入链路补全（P1，小）
- 现状：`product_copy` 有人设占位无入口（A5 一并解决）；script_creation 人设已传。
- 目标：确保所有生成入口（选题/文案/改写/产品文案/发布描述）统一注入 persona+style+style_analysis。
- 改动：各 llm 方法签名统一透传。
- 验收：改完人设后各步骤生成结果均体现人设。

### B6 深度模仿语言风格（P3，可选）
- 现状：无。
- 目标（对标 814「深度模仿语言风格（耗时较长）」）：参考范文→提取文风特征（句式/词汇/语气）→注入改写 prompt。
- 改动：新增 `style_mimic` prompt + llm 方法；依赖 B2 的分析链路。
- 验收：输出明显贴近范文文风。

---

## 4. C 配音补齐

### C1 我的声音试听/状态（P0，中）
- 现状：`voice_assets` 只有 name/refAudioUrl/speakerId/status(默认 ready)；桌面端列表只显示名字+✓，无试听、无克隆状态。
- 目标（对标 499「完成克隆后可在此处播放预览」「该模型没有预览音频」「已训练/训练中」）：
  1. 建声音后立即触发异步克隆（复用 executor voiceClone 链路），回填 `speaker_id`+`status`（training/ready/failed）+`demo_audio`（火山复刻响应 demo_audio）；
  2. 桌面端列表显示状态 Tag + 试听按钮（demo_audio 或 TTS 试听）。
- 改动：`voice-asset.entity.ts`（demo_audio 列）、service（克隆任务）、`voice.adapter.ts`（cloneSpeaker 返回 demo_audio）、Workbench（试听）。
- 验收：添加参考音频后几分钟内状态变「已就绪」并可试听。

### C2 参考音频裁剪（P1，中）
- 现状：无裁剪，参考音频整段使用。
- 目标（对标 499「音频预览与裁剪」「裁剪区域时长必须在 5-30 秒之间」）：桌面端「添加参考音频」弹窗支持上传→播放→选区（0-30 秒）→提交裁剪产物（复用 ffmpeg 落 uploads）。
- 改动：新接口 `/oral-workshop/media/trim`（ffmpeg 裁剪）、Workbench 弹窗。
- 验收：裁剪后克隆音色与选中片段一致。

### C3 录音采集（P3，可选）
- 目标（对标 499「点击开始录音」「使用本地/云端 ASR」）：桌面端 MediaRecorder 录音→上传为参考音频。
- 改动：Workbench 录音组件 + 上传接口（复用 A3 上传通道）。
- 验收：录 10 秒即可建声音。

### C4 合成参数用户级（P1，中）
- 现状：语速/音量/情绪只能管理后台/环境变量全局配置，用户不可调。
- 目标（对标 499 语速滑块 0.5-1.5x、情绪类型下拉、人声音量）：
  1. 任务 DTO/实体加 `voiceSpeechRate`/`voiceLoudnessRate`/`voiceEmotion`；
  2. 桌面端配音步骤加「语速」滑块、「情绪」下拉（高兴/愤怒/悲伤/害怕/平静/无，映射 context_texts）；
  3. executor 透传（speechRate 已支持，emotionText 已支持）。
- 改动：entity/DTO、executor runVoiceClone、Workbench、`voice.adapter.ts`（情绪枚举映射）。
- 验收：用户调语速/情绪后配音结果变化。

### C5 训练耗时/进度提示（P0，小）
- 目标（对标 814「正常1分钟的声音克隆耗时3分钟左右」）：克隆中 toast/状态提示预计耗时；桌面端展示。
- 改动：Workbench 文案 + C1 状态机。
- 验收：有明确等待预期。

### C6 情感参考音频（P3，可选）
- 现状：`refAudioText` 已支持（复刻质量关键）。
- 目标（对标 499「加载情感参考音频」「自动选择情感参考音频」）：可选 emotion 参考音频（附 emotion 标签），克隆时优先用。
- 改动：voice_assets 加 `emotion_ref_audio`，adapter 透传。
- 验收：情感素材被用于复刻。

---

## 5. D 数字人形象补齐

### D1 形象库预览/授权展示（P1，中）
- 现状：`digital_human_assets` 有 preview_url/authorized，桌面端只显示名称+（未授权）。
- 目标（对标 583「点击视频预览、编辑名称描述」）：桌面端形象下拉加预览图（preview_url）+授权状态+描述；添加形象弹窗可填预览 URL/描述。
- 改动：桌面端 Select optionRender 加图；弹窗加字段。
- 验收：选形象能看到长相。

### D2 上传建形象（P2，大）
- 现状：只能手填火山形象 ID。
- 目标（对标 583「上传视频文件创建新的形象」）：上传真人视频（≤500MB，转码 MP4/H.264/1080P）→ 调火山形象创建/本地数字人模型注册 → 生成形象条目（cloudId/本地路径+首帧预览）。
- 改动：新接口 `/oral-workshop/digital-humans/upload`（ffmpeg 转码+取首帧）、`digital-human.adapter.ts`、Workbench 上传区。
- 验收：传一段视频即可在形象库看到可用形象。

### D3 多镜头拼接（P2，大）
- 现状：单形象单段。
- 目标（对标 814「多镜头数字人…列表从上到下就是最终视频拼接顺序，可调整每个数字人的出场时长」）：
  1. 任务 DTO/实体加 `shots: [{digitalHumanId, seconds}]`（JSON 列）；
  2. 桌面端数字人步骤加「添加镜头」（选择形象+时长，可排序）；
  3. executor digitalHuman 逐镜头生成→ffmpeg concat 拼接。
- 改动：entity/DTO、Workbench、executor、`composer.ts`（concat 命令）。
- 验收：多镜头按顺序拼出完整视频。

### D4 画中画素材（P3，大）
- 现状：无。
- 目标（对标 814「上传画中画素材」）：任务加 `pipAssets`（图片/视频+位置/大小/时间段），videoEdit 叠加。
- 改动：entity/DTO、Workbench、composer（overlay 滤镜）、模板渲染。
- 验收：画中画正确叠加。

### D5 封面首帧预览编辑（P2，中）
- 现状：titleCover 自动生成封面，详情页可设计封面；无「首帧预览」交互。
- 目标（对标 130「选择视频源后可基于首帧预览标题、字幕和名片」「编辑预览首帧」）：桌面端在视频生成后/详情页提供「基于首帧编辑」——预览首帧+拖标题位置。
- 改动：Detail/CoverDesigner 扩展。
- 验收：可基于首帧调整标题位置再出封面。

### D6 云端/本地生成方式显式选择（P2，小）
- 现状：auto 自动降级。
- 目标（对标 814「使用云端数字人生成/使用本地数字人生成」）：桌面端加单选（云端/本地/自动），透传任务字段。
- 改动：entity/DTO/executor/Workbench。
- 验收：选本地强制卡片视频，选云端无公网音频时明确报错。

---

## 6. E 模板补齐

### E1 关键词高亮接通（P0，中）
- 现状：`composer.ts` 有高亮能力但 executor 传 `highlightKeywords: []`（出现 1 次，未接线）。
- 目标（对标 130「关键词高亮」「当前样式暂不支持关键词高亮」）：任务/模板加 `highlightKeywords`（后台模板 JSON 可配、桌面端可填），videoEdit 渲染到字幕。
- 改动：executor videoEdit 传参、Workbench、模板 schema 校验。
- 验收：关键词在成片字幕中高亮。

### E2 真实封面/预览图（P2，中）
- 现状：内置模板是 SVG 示意预览。
- 目标（对标 130 真实封面模板 + COS CDN 预览）：为 t1-t10 制作真实封面图/预览视频；自定义模板支持上传预览图。
- 改动：资源生产（设计）、`template-loader.ts`（预览图字段）、后台上传。
- 验收：模板选择界面显示真实效果。

### E3 BGM 自动匹配（P1，中）
- 现状：无 BGM。
- 目标（对标 130「根据文案选择系统音乐」「系统音乐库」「选择本地音乐文件」）：
  1. 后台上传系统音乐库（分类/标签/BPM）；
  2. 合成时按文案情感/时长匹配 BGM（LLM 选曲或规则），混入 videoEdit（ffmpeg amix，音量 0.15）；
  3. 桌面端可手动换曲/关 BGM。
- 改动：新表 `oral_workshop_bgm`、executor videoEdit（amix）、Workbench、后台 Config。
- 验收：成片带背景音乐且人声清晰。

### E4 字幕动画扩充+字幕编辑（P2，大）
- 现状：4 种动画；字幕不可编辑。
- 目标（对标 814「~30 套字幕动画」「可以编辑字幕了…剪辑时将使用新的字幕内容」）：
  1. 扩到 15-30 套动画样式（ASS 模板库，管理后台可管理）；
  2. 桌面端字幕预览/编辑（改文本/分段）→ 覆盖 videoEdit 字幕输入。
- 改动：字幕模板资源、`composer.ts`、Workbench/Detail 字幕编辑面板。
- 验收：可换动画、可改字幕文本。

### E5 描边/斜体/背景图渲染（P1，中）
- 现状：仅阴影。
- 目标（对标 130 多字体/描边/斜体/背景图元素）：cover/composer 渲染支持描边、斜体、背景图、多字体（字体文件放 assets/fonts，模板 JSON 声明）。
- 改动：`composer.ts` drawtext 参数、模板 schema。
- 验收：模板声明的描边/背景图在成片/封面生效。

### E6 画中画（模板级）（P3，大）
- 与 D4 合并处理：模板可声明画中画槽位，任务可填素材。
- 验收：模板槽位正确渲染。

### E7 多轨道独立控制（P2，中）
- 目标（对标 130「字幕、标题、名片、音效、背景音乐和音视频参数都可独立控制」）：任务/模板增加各轨开关与参数（字幕/标题/名片开关、BGM 音量、音效）。
- 改动：entity/DTO、composer、Workbench。
- 验收：关掉字幕不影响其余轨道。

### E8 可视化模板编辑器（P3，远期）
- 目标：管理后台拖拽编辑模板（背景/标题/字幕/动画/画中画）。
- 改动：后台新页面（大工程）。
- 验收：非技术用户可改模板。

---

## 7. F 预览提交/发布补齐

### F1 发布文案 AI 化（P0，小）
- 现状：`title_publish` prompt 已存在（主标题+副标题+发布描述+话题标签 3-5 个），但 `publisher.ts` 用机械拼接（h1+h2+文案前200字）和机械抽标签。
- 目标：`buildPackage` 调 `llm.generateTitle(script)` 生成标题+发布描述+话题标签，解析后写入发布包；失败降级现有拼接。
- 改动：`publisher.ts`、`llm.ts`（generateTitle 返回结构化 {title, subtitle, description, tags}）。
- 验收：发布包描述口语化、带 3-5 个话题标签。

### F2 提交前成片/封面预览（P1，中）
- 现状：⑥ 步骤只有参数摘要。
- 目标（对标 130「生成视频后将在此处显示预览」「请先生成或选择封面」）：⑥ 步骤增加预览区（最近成片预览+封面+标题编辑），提交前可确认。
- 改动：Workbench ⑥、meta 接口返回最近成片。
- 验收：提交前能看到参考成片/封面。

### F3 任务中心增强（P1，中）
- 现状：Projects.tsx 有分页/筛选/刷新/详情/取消/新建。
- 目标（对标 529「任务统计概览」「重试任务」「删除任务」）：
  1. 顶部统计（总数/进行中/已完成/失败）；
  2. 失败任务「重试」= 重置步骤为 pending 重新入队（新接口 `/oral-workshop/jobs/:id/retry`）；
  3. 「删除」任务（清理产物）。
- 改动：Projects.tsx、service（retry）、controller、迁移（deleted_at 可选）。
- 验收：失败可一键重试；统计数字正确。

### F4 平台账号体系+一键发布（P2 大 / P3 更大）
- 现状：无发布账号，只有 publish_plans(manual)。
- 目标（对标 529「登录账号/添加账号/发布到账号/发布成功/部分成功」）：抖音/快手/小红书/B站 账号绑定（扫码登录 OAuth）→ 任务详情「发布到账号」→ 状态回写。
- 阶段：
  - F4a（P2）：账号管理表 `publish_accounts` + 登录入口占位 + publish_plans 状态字段（pending/success/failed/partial）；
  - F4b（P3）：接平台开放接口真发布，回调更新状态。
- 改动：新模块 publish-accounts、publisher、详情页发布区、后台账号管理。
- 验收：F4a 可绑定账号并产生发布状态；F4b 真实发布成功。

### F5 发布状态跟踪（P1，小）
- 现状：publish_plans 无状态回写展示。
- 目标：publish_plans 加 `publish_status`，详情页展示（未发布/发布中/成功/失败/部分成功）。
- 改动：entity/迁移、Detail.tsx、publisher。
- 验收：状态可见。

### F6 封面/草稿导出（P2，小）
- 目标（对标 130「导出封面」「导出草稿」）：详情页加「导出封面」下载、「导出草稿」= 打包文案/标题/描述/视频链接 JSON。
- 改动：Detail.tsx、后端 download 路由（cover_url 已有直链）。
- 验收：一键下载封面/草稿。

---

## 8. 跨模块基础能力（前置依赖）

| 能力 | 被谁依赖 | 说明 |
|---|---|---|
| 公网直链/存储 | D2/D3/D4、C2、E3、F2 | 数字人音频、BGM、裁剪产物需公网 URL（火山拉取）；当前 persistArtifact 只落 uploads，nginx 已通。需要时引入 OSS。 |
| 视频平台解析 | A3、B2/B3 | yt-dlp 已装；主页/作品抓取需处理反爬（cookie/风控）。 |
| 平台开放平台资质 | F4b | 抖音等需企业认证/应用审核，非技术问题，需商务。 |
| 音频处理基建 | C2/A3、E3 | ffmpeg 已装（6.1.1）；批量转码注意服务器负载。 |

---

## 9. 实施分期总表

| 期 | 内容 | 工作量 | 说明 |
|---|---|---|---|
| P0 快赢 | A1 排除选题、A7 文案质量基线、B2 风格分析接线、C1 声音试听/状态、C5 耗时提示、E1 关键词高亮、F1 发布文案AI化 | 小-中 | 全部复用现有死代码/字段，每项独立上线 |
| P1 体验 | A2 选题维度、A3 提取增强、A4 改写交互、A5 产品文案、A6 参考范文、B1 预设后台化、B4 人设落库、B5 注入链路、C2 裁剪、C4 参数用户级、D1 形象预览、E3 BGM、E5 描边渲染、F2 预览、F3 任务中心、F5 发布状态 | 中 | 涉及 UI/表单/实体扩展，批量发布一次版本 |
| P2 能力 | B3 学习深度、D2 上传建形象、D3 多镜头、D5 首帧封面、D6 生成方式、E2 真实封面、E4 字幕动画+编辑、E7 多轨道、F4a 账号管理、F6 导出 | 大 | 需设计资源+异步队列增强 |
| P3 远期 | B6 深度模仿、C3 录音、C6 情感参考、D4 画中画、E6 画中画、E8 可视化模板编辑器、F4b 真发布 | 很大 | 需商务/法务/设计协作，单项排期 |

版本号策略：每次 P0/P1 批次上线，桌面端版本号 +1（当前 1.3.6 → 1.4.x），管理后台 dist 同步部署，后端随 git main 部署。

---

## 10. 风险与注意事项

1. 火山 API：声音复刻（openspeech）与方舟 LLM 是两套 Key；复刻 demo_audio 字段依赖上游返回，需联调确认字段名。
2. 抖音抓取：主页分析（IP 大脑）有反爬与合规风险，上线前需确认是否触碰平台条款。
3. 一键发布：需要平台开放平台资质（企业认证），建议先做 F4a 账号管理+状态占位。
4. 存储：BGM/画中画/多镜头产物会增加存储与转码耗时，需观察服务器负载，必要时任务队列加并发上限（已有 maxConcurrentJobs）。
5. 数据迁移：各实体加列需新增迁移脚本（沿用 02x_*.sql 编号），apply-missing-migrations.js 会跳过已存在的列（如 bilingual/dh_model_version 报 Duplicate column 属正常）。
6. 计费：配音/数字人按档扣费已实现，新增用户级参数（语速/情绪）与多镜头不改变计费逻辑；产品文案等 LLM 步骤已含在 baseCredits。