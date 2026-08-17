---
name: st-claw-controller
description: 当用户需要生成图片或视频（文生图、图生图、文生视频、图生视频）时，调用本地 ST-Claw 完成创作。支持 --action t2i/i2i/video，参考图自动上传，产物返回可访问 URL。
---

# ST-Claw 创作工具（文生图 / 图生图 / 文生视频 / 图生视频）

调用本地 ST-Claw 服务（http://127.0.0.1:8000）完成图片/视频生成。适用于：

- 文生图（t2i）：只有文字提示词
- 图生图（i2i）：文字提示词 + 参考图片
- 文生视频（video）：只有文字提示词
- 图生视频（video + --image）：文字提示词 + 首帧图片

## 使用方法

运行脚本（把 <参数> 换成实际值，--prompt 用英文双引号包裹）：

```bash
# 文生图（模型可省略，自动取 ST-Claw 默认模型）
node <skill_dir>/scripts/st-claw-controller.mjs --action t2i --prompt "一只戴宇航头盔的柴犬，4K 高清，电影质感"

# 图生图（--image 传本地图片绝对路径，脚本自动上传）
node <skill_dir>/scripts/st-claw-controller.mjs --action i2i --prompt "改成赛博朋克风格，霓虹灯光" --image "C:\path\to\ref.png"

# 文生视频
node <skill_dir>/scripts/st-claw-controller.mjs --action video --prompt "海浪拍打礁石，夕阳金光，电影感" --duration 5

# 图生视频（首帧图）
node <skill_dir>/scripts/st-claw-controller.mjs --action video --prompt "让画面中的女孩在樱花下奔跑起来" --image "C:\path\to\frame.png"
```

## 参数

| 参数 | 说明 |
| ---- | ---- |
| --action | health / config / t2i / i2i / video（必填） |
| --prompt | 创作提示词，越具体越好（t2i/i2i/video 必填） |
| --model | 模型 id（可省略，缺省取 ST-Claw 配置的默认模型） |
| --image | 参考图本地绝对路径（i2i 必填；video 可选作为首帧） |
| --style | 文生图风格（可选，如 anime） |
| --ratio | 画面比例，默认 16:9 |
| --resolution | 视频清晰度，默认 720P |
| --duration | 视频时长（秒），默认 5 |
| --base-url | ST-Claw 地址，默认 http://127.0.0.1:8000 |

## 说明

- ST-Claw 未运行时脚本会明确报错，此时请先引导用户打开/启动 ST-Claw 再重试。
- 生成结果会打印完整可访问 URL（http://127.0.0.1:8000/code/...），可直接展示给用户。
- 参考图支持 jpg/jpeg/png/webp/bmp/mp4/mov/avi/mkv/webm。
- 视频生成耗时较长（通常 1-5 分钟），耐心等待结果，不要重复提交相同任务。