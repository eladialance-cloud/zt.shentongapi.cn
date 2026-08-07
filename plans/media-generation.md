# 对话多模态 + 文生图/文生视频 实施方案

> 日期：2026-08-07｜范围：桌面端对话 + 后端 + 管理后台（桌面端管理页 + 网页管理后台）
> 需求确认：A=生成供应商走后台模型配置、可多模型选择、需选尺寸/分辨率/时长；B=视频需参与模型理解（抽帧）；C=图片固定积分/张，视频按时长×分辨率矩阵扣费

## 一、现状盘点

| 环节 | 现状 | 缺口 |
| --- | --- | --- |
| 用户上传 | 输入框已支持多文件上传（含 mp4/webm），传 fileId 给后端并入库 | 消息里只显示 📎 文件名，无预览 |
| 后端消息组装 | `chat.controller.ts` 把附件直接丢弃，只发文本给大模型 | 附件未转多模态 content |
| 模型能力 | `models` 表已有 `model_type`(chat/image/...) + `supports_vision` | 无图片/视频固定定价、无生成参数 |
| 供应商 | `model_providers` 已有 baseUrl/apiKey/config 配置 | 无文生图/文生视频适配 |
| 扣费 | 积分预扣→结算/退款体系完善（token 计费） | 无按张/按时长×分辨率计费 |
| 展示 | 助手消息纯文本 | 无 Markdown 渲染、无媒体播放 |
| CSP | `img-src https: data: blob:` 已放行 | 缺 `media-src`，视频被拦 |

## 二、数据模型（db-migration.ts 自动迁移）

### models 表新增列
- `price_per_image` DECIMAL(10,4) NULL —— 图片固定积分（积分/张）
- `video_prices` JSON NULL —— 视频价格矩阵 `{"720p":{"5":10,"10":18},"1080p":{"5":20,"10":36}}`
- `generation_params` JSON NULL —— 可选参数 `{"image_sizes":["1024x1024","512x512"],"video_resolutions":["720p","1080p"],"video_durations":[5,10],"video_fps":[24,30]}`

### 新表 media_jobs（生成任务）
`id / user_id / session_id? / model_id / type('image'|'video') / prompt / params JSON / status('pending'|'processing'|'done'|'failed') / result_urls JSON / credits_cost / frozen_txn_id / error / created_at / updated_at`

### model_providers.config 扩展（生成适配模板，不硬编码厂商）
```json
{
  "generation": {
    "images_path": "/v1/images/generations",
    "videos_path": "/v1/videos/generations",
    "task_path": "/v1/videos/generations/{id}",
    "extra_headers": { "X-DashScope-Async": "enable" },
    "async": true,
    "poll_interval": 5,
    "request_template": { "model": "{upstreamModelId}", "prompt": "{prompt}", "duration": "{duration}" },
    "task_id_path": "data.task_id",
    "status_path": "data.task_status",
    "success_values": ["succeed", "SUCCEEDED"],
    "failed_values": ["failed", "FAILED"],
    "result_url_path": "data.task_result.videos[0].url"
  }
}
```
占位符：`{upstreamModelId} {prompt} {size} {resolution} {duration} {fps}`；响应字段路径用点号取值，支持数组下标

## 三、后端改动

### 1. 多模态输入（聊天理解用户图/视频）— P1
- `chat.service.getSessionMessages` 返回 attachments（fileId/url/mimeType）
- `chat.controller` 组装消息：
  - 图片附件 → `{type:"text"}` + `{type:"image_url",image_url:{url}}`（同域 URL 直用；跨域转 base64 data URL）
  - 视频附件 → 调 `VideoFrameService.extractFrames(videoPath, 4)` → 多张 `image_url` + 文本说明
  - 模型 `supportsVision=false` → 降级为文本（"用户上传了文件：xxx"），不报错
  - 历史消息同样恢复多模态
- 新服务 `backend/src/common/services/video-frame.service.ts`：ffmpeg 抽帧（4 帧、单帧 ≤512KB、存 `/uploads/files/frames/`）
- 上传限制 10MB → 200MB（聊天视频场景）

### 2. 文生图/文生视频 — P2
新模块 `backend/src/modules/media-generation/`：
- `POST /api/media-generation/image` `{modelId,prompt,size}`：预扣(price_per_image×折扣) → 调上游 → 保存产物到文件服务 → job=done，返回 `{jobId,imageUrl,creditsCost}`
- `POST /api/media-generation/video` `{modelId,prompt,resolution,duration}`：按矩阵预扣 → 提交异步任务 → 返回 jobId
- `GET /api/media-generation/jobs/:id`：任务状态 + 结果 URL + 已扣积分（前端轮询）
- `GET /api/media-generation/jobs`：我的生成记录
- `GET /api/media-generation/models`：可选 image/video 模型 + 参数 + 价格预览
- service 实现通用适配：同步（images）与异步轮询（videos）双模式，读取 provider.config.generation 模板映射请求/响应；产物下载后走现有 file 服务落盘

### 3. 扣费（C 方案）
- 图片：`price_per_image` × 会员折扣，预扣即最终价，完成 settle / 失败 refund
- 视频：查 `video_prices[分辨率][时长]` × 折扣，同上
- 余额不足 → 402 提示；沿用 `credits.service` freeze/settle/refund

### 4. 管理后台配置
- 模型编辑：model_type 选 image/video 时出现「图片固定积分」「视频价格矩阵（分辨率×时长表格）」「生成参数（尺寸/分辨率/时长/帧率多选）」
- 供应商编辑：可选生成适配模板（images_path/videos_path/async/轮询/响应字段映射）
- 新增/编辑/测试沿用现有供应商体系

## 四、桌面端改动

### P1 媒体展示
- `MessageList`：附件按 mimeType 渲染——图片缩略图（antd Image 点击放大）、视频 `<video controls>` + 下载、其他文件 chip
- 助手消息 Markdown 渲染（react-markdown + 白名单）：`![]()` → 图片卡片；.mp4/.webm 链接 → 视频播放器
- `index.html` CSP 增加 `media-src 'self' https: blob: data:`
- 上传前本地预览（URL.createObjectURL）

### P2 生成 UI
- 输入框旁「文生图/文生视频」按钮 → 弹窗：
  - 选模型（后端 /media-generation/models，展示价格：图片 X 积分/张；视频按所选时长×分辨率预览扣费）
  - 图片：尺寸；视频：分辨率 + 时长 + 帧率（按模型 generation_params）
  - 提交 → 任务进度条（视频轮询 job）→ 完成后以助手媒体消息插入会话（含缩略图/播放器/下载/积分消耗）
- 生成失败展示退款提示

## 五、依赖与部署
- 服务器安装 ffmpeg（`apt install ffmpeg`）
- 上传/生成产物存本地 `uploads/`（与现有文件服务一致）
- 测试：pricing 矩阵单测、media-generation service 单测（mock 上游）、chat 多模态组装单测
- 桌面端版本 0.7.1→CI 构建 0.7.3；后端随 main 部署（bundle 或 git pull）；迁移由 db-migration 启动自动执行

## 六、实施顺序
1. P1 后端：video-frame.service + chat 多模态组装 + attachments 透传
2. P1 桌面端：媒体渲染 + Markdown + CSP + 上传预览
3. P2 后端：media-generation 模块 + 迁移 + 管理后台配置
4. P2 桌面端：生成弹窗 + 任务进度 + 会话媒体消息
5. 单测 + 联调 + CI 0.7.3 + 服务器部署 + 端到端验收（含扣费核对）
