# 抖音口令/链接「提取文案」修复方案（对齐 douyin-parser 解析链路）

> 状态：方案稿 v1｜对应仓库：D:\二次开发（upgrade/electron-41）｜服务器：/opt/shentong/backend（systemd shentong-backend）

## 1. 问题与目标

- 场景：口播工坊 →「学习对标」粘贴抖音分享口令（含 v.douyin.com 短链），期望直接出口播文案。
- 现状：
  - 后端 `extractScript`：下载到 HTML → yt-dlp 解析 → 抖音返回 `403 fresh cookies needed` → 报错。
  - 桌面端兜底本地浏览器解析：能找到播放媒体，但下载时报 `net::ERR_BLOCKED_BY_CLIENT`。
  - 上传本地文件提取文案链路已通（ffmpeg + 百炼 paraformer 均已修好），因此只要拿到「可下载的抖音视频文件」，即可复用现有 ffmpeg→STT。
- 目标：抖音口令 →（服务器端）拿直链视频 → ffmpeg 抽音频 → 现有百炼 paraformer STT → 回填文案。桌面端不改交互，也不需要它下载抖音媒体。

## 2. douyin-parser 解析方案解读（已完整读码）

仓库核心是「Python 本地化爬抖音 web API」，不走浏览器渲染，链路为：

1. `extract_share_link / normalize_creator_source_url`：从分享文本提取 v.douyin.com 短链或完整链接。
2. `resolve_short_url`：用 iPhone UA 跟随 302，拿到 www.douyin.com/video/<aweme_id>，从而得到 aweme_id。
3. `sign_api_url / ABogus`（app/infra/douyin_signature.py）：对固定 BASE_PARAMS + aweme_id 生成 a_bogus 签名参数（SM3 哈希 + RC4 + 浏览器指纹，ua_code 已按 Chrome/90 UA 硬编码）。
4. `fetch_video_detail`：GET https://www.douyin.com/aweme/v1/web/aweme/detail/?...&a_bogus=...，带 Referer=www.douyin.com，可选 Cookie（有登录 Cookie 更稳；无 Cookie 也能试）。
5. 取 `aweme_detail.video.play_addr.url_list[0]`，`playwm` 换成 `play` 得到无水印直链。
6. 音频/转录：ffmpeg `-headers "UA + Referer: https://www.douyin.com/"` 直接从直链抽音频；转录默认 SiliconFlow/Groq 或本地 faster-whisper（本项目用不上，我们复用自己已打通的百炼 paraformer）。
- Cookie 管理：CLI `python main.py cookie set "..."` 或 webhook（chrome-cookie-sniffer 扩展自动回传），存 cookie_data/douyin_cookie.json。
- 结论：它绕开了「yt-dlp 403」和「浏览器 MSE/blob 无法下载」两个坑，走的是抖音自己的 web detail API。

## 3. 我们现有代码为什么失败（根因，不是猜）

| 环节 | 现象 | 根因 |
| --- | --- | --- |
| 服务器 yt-dlp | 403 Forbidden，提示 fresh cookies | 抖音 web 详情/视频接口要求带有效 Cookie + 签名，匿名下载被拒 |
| 桌面本地浏览器 | 找到 mediaUrl 但下载 net::ERR_BLOCKED_BY_CLIENT | 抖音 PC 页用 MSE/blob 推流，页面外的 blob fetch/net 请求拿不到原始字节；且 CDN 下载同样要 Cookie/Referer |
| 后端 downloadTo | fetch 无 UA/Referer | 即便拿到 play_addr 直链，抖音 CDN 校验 Referer/UA，裸 fetch 仍可能被拒（方案需补请求头） |

## 4. 推荐方案 A：后端集成 douyin-parser 作为「抖音直链解析器」（首选）

在服务器部署 douyin-parser 源码 + 轻量 Python venv（只需 requests/python-dotenv/gmssl，无需它的 Flask/Postgres），后端在抖音链接时调用它拿直链，再走现有 ffmpeg+STT。

### 4.1 改动清单（仓库侧，一个 commit）

1. 新增 backend/src/modules/oral-workshop/douyin-resolver.ts
   - 平台判定：v.douyin.com / www.douyin.com/video|note/<id>。
   - Cookie 注入：.env `DOUYIN_COOKIE` → 写入 /opt/shentong/douyin-parser/cookie_data/douyin_cookie.json（与 douyin-parser CookieManager 同格式 {cookie,timestamp}），再执行解析。
   - 执行：`cd /opt/shentong/douyin-parser && .venv/bin/python main.py --json --no-transcript <shareText>`，超时 60s。
   - 解析 JSON 的 video_url/aweme_id/title；透出结构化错误（链接失效/无 Cookie/Cookie 过期/a_bogus 失效）。
2. backend/src/modules/oral-workshop/oral-workshop.service.ts extractScript()
   - 在第 2 步 yt-dlp 失败后（或检测到抖音平台时直接）调用 douyin-resolver；
   - 成功后用带 UA + `Referer: https://www.douyin.com/` 的下载（新增 downloadToWithHeaders 或给 ffmpeg 传 -headers），落盘 source.mp4；
   - 之后复用现有 ffmpeg 抽音频 + `systemLlm.stt(audioPath)`。
3. backend/.env 增加 DOUYIN_COOKIE（可选，为空时解析器仍会尝试；推荐配置后更稳）。
4. 保持桌面端 Workbench 现有兜底不动；抖音链路后端直出文案后不会再触发本地浏览器解析。

### 4.2 服务器部署（一次性）

```bash
sudo mkdir -p /opt/shentong/douyin-parser
# 把解压后的 douyin-parser-main 内容放到 /opt/shentong/douyin-parser（含 app/ main.py requirements.txt）
cd /opt/shentong/douyin-parser
sudo python3 -m venv .venv
sudo .venv/bin/pip install -r requirements.txt   # 或最小集: requests python-dotenv gmssl
# 设置 Cookie（浏览器打开 www.douyin.com，DevTools → 复制 Cookie 请求头，粘贴到引号内）
sudo .venv/bin/python main.py cookie set "你的douyin Cookie字符串"
sudo .venv/bin/python main.py cookie show
# 打补丁：让 CLI 输出 video_url（原仓库 parse_video 拿到 raw_data 却没回填 video_url）
# 在 app/services/video_parse_service.py 的 result = crawl_video(...) 之后加一行：
#   video_info.video_url = get_video_download_url(raw_data)
# 验证（应输出 JSON 且含 https://...mp4 的 video_url）：
sudo .venv/bin/python main.py --json --no-transcript "6.48 y@... OKW:/ https://v.douyin.com/DTHXMQFkPU0/ 复制此链接"
```

### 4.3 端到端验收

```bash
cd /opt/shentong/backend
sudo rm -rf dist && sudo npm run build 2>&1 | tail -3 && echo BUILD_OK
sudo systemctl restart shentong-backend
sleep 12
curl -s http://127.0.0.1:3001/api/health; echo
sudo journalctl -u shentong-backend -n 30 --no-pager | grep -iE "douyin|resolve|asr" | tail -15
```
- 桌面端用同一条抖音口令点「提取文案」，应直接回填文案。

### 4.4 风险与预案

- a_bogus 签名随抖音更新而失效：表现为主站 detail API 返回 403/verify；此时只需升级 douyin-parser 对应文件（douyin_signature.py / douyin_web_client.py 随上游 JoeanAmier/Evil0ctal 更新即可）。
- Cookie 过期：detail API 返回受限或无 aweme_detail；重新 cookie set 即可。
- 直链 CDN 仍拒下载：给下载/ffmpeg 补 Referer+UA（方案已含）。

## 5. 备选方案 B：先花 5 分钟验证「yt-dlp + Cookie」能否免 Python

如果只想先确认能否不加 Python 服务，可先在服务器做一次探针（需 Netscape cookies.txt 或 `--add-header Cookie`）：

```bash
yt-dlp --cookies-from-browser chrome --no-playlist -g "https://v.douyin.com/DTHXMQFkPU0/"
# 或把 Cookie 转成 cookies.txt 后:
yt-dlp --cookies /opt/shentong/douyin_cookies.txt --no-playlist -f "bestaudio/best" -g "https://v.douyin.com/DTHXMQFkPU0/"
```
- 若输出 mp4/音频直链 → 后端只需给 yt-dlp 传 cookies，改动最小。
- 若仍 403 → 采用方案 A（douyin-parser API 更贴近抖音自身 web 行为，且用户已提供该仓库，说明其有效）。

## 6. 需要你拍板/提供的事

1. 是否按「方案 A」实施（需要服务器允许 python3 venv + pip 装 requests/gmssl，并部署 douyin-parser 源码）？
2. 是否先跑「方案 B」的 5 分钟 yt-dlp cookie 探针，能通就走更小改动？
3. 抖音 Cookie：需要一份 www.douyin.com 的 Cookie（建议浏览器登录后复制，Guest 的 ttwid 也可以先试）。

## 7. 不改动范围

- 微信视频号、小红书等仍走「下载到本地后上传文件提取」或桌面浏览器解析（不在此方案内）。
- douyin-parser 的 Flask/Postgres/creator 监控/转录功能不引入，只复用其「口令→aweme→a_bogus→直链」核心。

## 8. 补充评估：Video-Downloads-main（CopyPilot 壳）与多平台架构建议

> 已通读 zip 全部 9 个文件（README/SKILL/collect.mjs/copypilot_api_server.mjs/ensure_server.mjs/openai.yaml 等）。

- 定性：它不是「多网站解析引擎」，而是「CopyPilot(copypilot.cc) 站点私有接口的调用壳」。collect.mjs 先拉起本地 Node 代理(8787)，再 POST https://copypilot.cc/api/extract（伪造 Origin/Referer/UA 伪装成 copypilot.cc 本站前端），另用 /api/transcribe-link、/api/video-proxy 等完成转写与媒体代理下载。
- 无自控性：无 API Key、无 cookie 配置、无本地签名，等于借用第三方站点后端；README 自述上游有免费额度/频率/平台限制或临时不可用；接口无文档且随时可能改版，涉第三方 ToS 风险。
- 覆盖面确实广：抖音/快手/B站/YouTube/TikTok/小红书/视频号/微博/X/IG/公众号/知乎等；但它自己的语音转写有「超 5 分钟可能不返回文案」限制。
- 建议的最终架构（稳定性优先）：
  1. 抖音 → douyin-parser 本地解析（自持 a_bogus+Cookie，不依赖第三方）。
  2. B站/YouTube/TikTok/西瓜等 → 现有 yt-dlp（已装，先复用）。
  3. 快手/小红书/视频号/微博等（可选）→ CopyPilot 壳只取 title/videoDownloadUrls/publishedText，下载后仍走自己百炼 paraformer，不占它的转写额度、避开 5 分钟限制。
- 是否引入 CopyPilot 壳，建议先在服务器直接 curl https://copypilot.cc/api/extract 做 10 分钟探针验证可用性与稳定性再决定，不要把「全部解析」押在它上面。
