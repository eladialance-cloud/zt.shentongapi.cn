# 文生视频模型接入操作手册（小白版）

> 配套功能：管理后台「大模型管理」接入第三方视频生成 API，桌面端「文生视频」选择模型生成视频。
> 前置：P2 功能（media-generation 模块 + 管理后台生成配置）上线后，按本手册操作。

## 一、先搞懂 3 个名词（很重要）

| 名词 | 大白话 | 你需要在哪拿 |
| --- | --- | --- |
| **Base URL** | 视频服务商的"总入口网址"，所有请求都发到这个网址下面 | 服务商官网的 API 文档里写死的，复制即可 |
| **API Key** | 你的"钥匙"，一串以 `sk-` 开头的字符，系统靠它认出你是谁、扣你的钱 | 服务商控制台 → API Key 管理 → 创建 |
| **异步任务** | 视频生成很慢（几十秒到几分钟），所以不是"发请求直接拿视频"，而是：**①提交任务 → 拿到任务ID → ②每隔几秒问一次"好了没" → ③好了就拿视频地址** | 系统自动完成，你只需把字段映射配对 |

## 二、准备阶段：去视频服务商开户拿 Key（约 10 分钟）

国内主流文生视频 API 三家任选（建议先试第 1 家免费的）：

### 方案1：硅基流动 SiliconFlow（推荐入门，国内直连、模型多、便宜）
1. 打开官网 https://siliconflow.cn 注册 → 手机号/微信登录
2. 实名认证（做视频生成基本都要实名）
3. 控制台 → **API 密钥** → 新建密钥 → 复制 `sk-xxxxxxxx`
4. 控制台里确认有视频模型可用（如 Wan2.2-T2V-Fast、HunyuanVideo 等），一般有少量免费额度
5. 记下 Base URL：`https://api.siliconflow.cn`

### 方案2：可灵 Kling（快手出品，效果口碑好）
1. 官网 https://klingai.com 或 https://app.klingai.com 注册（快手账号）→ 实名 + 开通服务
2. 控制台 → API 管理 / 密钥管理 → 创建 API Key
3. 记下 Base URL：`https://api.klingai.com`
4. 需要充值（灵感值/余额），价格按条计

### 方案3：通义万相（阿里云百炼，量大优惠）
1. 打开阿里云百炼 https://bailian.console.aliyun.com 注册 + 实名
2. 开通"通义万相-视频生成"服务
3. 右上角头像 → API-KEY → 创建，复制 `sk-xxx`
4. 记下 Base URL：`https://dashscope.aliyuncs.com`

> 外国服务商（Runway、Luma、Kling 国际版等）需要海外支付方式，小白不推荐。
> ⚠️ 每家价格都在变，以官网实时价格为准；本文说的"元"是上游真钱，和你平台里扣的"积分"是两回事，见第五节。

## 三、在管理后台接入（核心步骤）

入口：**管理后台 → 大模型管理 → 供应商**（网页版和桌面端管理页操作一致）

### 第 1 步：新增供应商
- 点「新增供应商」，填：
  - **名称**：随便写个你自己认得出的，如"硅基流动-视频"、"可灵视频"
  - **Base URL**：把服务商给的地址原样粘贴（**末尾不要带斜杠**）
  - **API Key**：粘贴你复制的 `sk-...`
- 点「**测试连接**」→ 显示"连接成功"再继续
  - 失败？→ 检查 Key 有没有复制全、Base URL 是不是多了空格/斜杠、实名认证有没有过

### 第 2 步：读取上游模型列表
- 点「**读取上游模型**」→ 系统会列出这个服务商下所有模型
- 找到**视频生成**类模型（如 `wan2.2-t2v`、`kling-v1-6`、`Wan2.2-T2V-Fast`），勾选导入
  - 如果读不到：说明这个服务商的模型接口格式特殊，把"读取失败"的报错发给开发，加一个小适配

### 第 3 步：把模型类型设为「视频生成」
- 在「模型管理」里找到刚导入的模型，编辑：
  - **模型类型**：选「视频生成」（image=图片，video=视频）
  - 系统会自动填好一份"生成适配模板"（见第四节的示例），一般不用改，除非生成失败

### 第 4 步：配置视频价格矩阵（对应你定的 C 方案）
- 编辑模型 → 「视频价格」区域，是一个表格：

| 分辨率 \ 时长 | 5 秒 | 10 秒 |
| --- | --- | --- |
| 720P | 10 积分 | 18 积分 |
| 1080P | 20 积分 | 36 积分 |

- 格子里的数字 = 用户生成一条该规格视频扣多少积分（**你自定义**，与上游真钱无关）
- 再勾选这个模型**支持的分辨率、时长、帧率**（如 720P/1080P、5s/10s、24/30fps）——桌面端用户可选的就是这些选项
- 保存

### 第 5 步：桌面端验证
1. 桌面端重启/刷新（会拉取最新模型配置）
2. 聊天页点「文生视频」按钮 → 能看到刚才的模型、分辨率、时长选项，并显示"将扣除 X 积分"
3. 输入一句话（如"一只猫在草地上奔跑"）→ 提交
4. 看进度条（提交中 → 生成中 → 完成），完成后能播放/下载视频
5. 到「积分流水」核对扣费是否正确；生成失败应自动退款

## 四、生成适配模板（后台自动生成，可手动微调）

系统靠这张"说明书"知道怎么跟服务商说话。各家接口不一样，但都能用下面这套模板描述：

```json
{
  "generation": {
    "images_path": "/v1/images/generations",
    "videos_path": "/v1/videos/generations",
    "task_path": "/v1/videos/generations/{id}",
    "extra_headers": {},
    "async": true,
    "poll_interval": 5,
    "request_template": {
      "model": "{upstreamModelId}",
      "prompt": "{prompt}",
      "duration": "{duration}"
    },
    "task_id_path": "data.task_id",
    "status_path": "data.task_status",
    "success_values": ["succeed", "SUCCEEDED"],
    "failed_values": ["failed", "FAILED"],
    "result_url_path": "data.task_result.videos[0].url"
  }
}
```

字段解释：
- `videos_path`：提交任务的接口（相对 Base URL）
- `task_path`：查任务状态的接口，`{id}` 会被替换成任务ID
- `extra_headers`：额外请求头（个别服务商要求，如通义万相要 `X-DashScope-Async: enable`）
- `async`：true=异步任务制（视频都是）；false=直接返回结果
- `poll_interval`：每几秒问一次"好了没"
- `request_template`：请求体，`{prompt}` `{duration}` 等占位符会被用户选择替换
- `task_id_path / status_path / result_url_path`：从响应里取"任务ID / 状态 / 视频地址"的路径

### 三个主流服务商的模板示例（新供应商导入时系统自动匹配）

**硅基流动**（提交 → 返回 `id`，轮询 `/v1/videos/generations/{id}`）：
```json
{ "videos_path": "/v1/videos/generations",
  "task_path": "/v1/videos/generations/{id}",
  "request_template": { "model": "{upstreamModelId}", "prompt": "{prompt}", "image_size": "{resolution}", "duration": {duration} },
  "task_id_path": "id",
  "status_path": "status",
  "success_values": ["succeed"],
  "result_url_path": "video.url" }
```

**可灵**（提交 → `data.task_id`，轮询 `/v1/videos/text2video/{id}`）：
```json
{ "videos_path": "/v1/videos/text2video",
  "task_path": "/v1/videos/text2video/{id}",
  "request_template": { "model_name": "{upstreamModelId}", "prompt": "{prompt}", "duration": "{duration}", "aspect_ratio": "16:9", "mode": "std" },
  "task_id_path": "data.task_id",
  "status_path": "data.task_status",
  "success_values": ["succeed"],
  "result_url_path": "data.task_result.videos[0].url" }
```

**通义万相**（要额外请求头，提交 → `output.task_id`，轮询 `/tasks/{id}`）：
```json
{ "videos_path": "/api/v1/services/aigc/video-generation/video-synthesis",
  "task_path": "/api/v1/services/aigc/video-generation/tasks/{id}",
  "extra_headers": { "X-DashScope-Async": "enable" },
  "request_template": { "model": "{upstreamModelId}", "input": { "prompt": "{prompt}", "parameters": { "resolution": "{resolution}", "duration": {duration}, "fps": {fps} } } },
  "task_id_path": "output.task_id",
  "status_path": "output.task_status",
  "success_values": ["SUCCEEDED"],
  "failed_values": ["FAILED"],
  "result_url_path": "output.video_url" }
```

> ⚠️ 服务商接口会升级，以上字段以官方文档为准；如果导入时模板不匹配，把"提交任务"的报错原文发给我，我来校准模板。

## 五、积分和上游费用是什么关系（重要澄清）

- **上游真钱**：服务商按条/按量收你的钱，从你给服务商充值的余额扣
- **平台积分**：你的用户在你平台消耗的积分，扣除标准**完全由你在后台定价**（C 方案）
- 两者互不影响：比如可灵一条成本 2 元，你可以定价"1080P 10 秒 = 36 积分"；积分价格高你赚差价，低你补贴用户
- 建议：按上游成本 × 合理倍率定价，先按表设一轮，跑几天看后台财务报表再调

## 六、常见问题排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 测试连接失败 | Key 错 / 未实名 / URL 多个斜杠 | 核对复制；去服务商控制台看实名与余额 |
| 读取模型列表失败 | 服务商模型接口特殊 | 把报错发给开发加适配 |
| 提交任务报错 4xx | 模板字段不匹配 / 参数不支持 | 对照官方文档调模板；或减少分辨率/时长选项 |
| 一直"生成中" | 轮询字段配错 / 服务商排队 | 核对 `status_path`；看任务实际几分钟内完成 |
| 完成了但拿不到视频 | `result_url_path` 配错 | 把任务查询的原始返回发给开发 |
| 积分没扣/扣错 | 价格矩阵没保存 / 看错行 | 重进编辑确认保存 |
| 用户生成失败被扣分 | 系统未退款 | 正常应自动退款；后台积分流水应显示"退款" |

## 七、给开发的一句话清单（本期实现时逐项核对）
1. 服务器装 ffmpeg（视频抽帧用，属聊天视频理解，不是生成）
2. media-generation 模块：image 同步 / video 异步轮询
3. 管理后台：供应商生成模板编辑 + 模型类型/价格矩阵/参数配置
4. 桌面端：文生视频弹窗 + 任务进度 + 结果播放/下载 + 积分预览
5. 端到端验收：硅基流动/可灵/通义万相各接一条，核对扣费与退款
