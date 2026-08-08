# 深瞳AI 部署/上传 SOP

> 用途：每次用户要求「上传 / 部署 / 发布 / 构建后上线」时，**先读本文件**，按对应小节执行。
> 服务器：`ubuntu@129.204.227.200`（VM-0-9-ubuntu，可 sudo）
> 仓库：`github.com/eladialance-cloud/zt.shentongapi.cn`（本地 D:\二次开发；origin 为 SSH，实际推送用 HTTPS URL）
> MySQL：容器 `shentong-mysql`，库 `ai_agent`，用户 `shentong`，密码 `ded9e9de12d34cb48bf6a1f641ca7cb9`

## 0. 产物落点总览

| 产物 | 构建来源 | 服务器落点 |
|---|---|---|
| 后端 API（3001） | 本地提交→GitHub→服务器 `sudo git pull`+`npm run build` | `/opt/shentong/backend` |
| 桌面安装包 | GitHub Actions（push `upgrade/electron-41`）或本地 `pack:win` | `/opt/shentong/updates/` |
| 管理后台 Web | 本地 `frontend/admin` 构建 | `/usr/share/nginx/html/admin/` |
| 用户端 Web（/landing/） | 本地 `frontend/user` 构建 | `/usr/share/nginx/html/landing/` |

## 1. 通用纪律（必读）

1. 服务器命令一律 `sudo`（`.git`、`dist`、`server.log`、`updates` 都是 root/www-data 所有，ubuntu 用户直接跑会 EACCES / Permission denied）。
2. 每次 web 部署后 `sudo chown -R www-data:www-data <目录>`。
3. 覆盖前先备份：`xxx.bak.$(date +%Y%m%d%H%M%S)`；保留最近 2-3 份即可。
4. 服务器 HTTPS 拉 GitHub 偶发 `GnuTLS recv error` 超时 → 用 bundle 兜底（见 §7）。
5. 桌面端 `latest.yml` 与 exe 版本必须一致、必须一起替换；旧版本 exe/zip 及时清理（见 §3）。
6. 生效顺序永远是：**本地提交 → 推 main → 服务器 `sudo git pull` 构建后端**；桌面端/前端按各自小节。

## 2. 后端部署

### 2.1 本地：提交 + 推送
```powershell
cd D:\二次开发
$git = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
& $git add <本次改动的文件>
& $git commit -m "<提交说明>"
& $git --no-pager log --oneline -1     # 确认提交（--no-pager 防 less 报错）
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
```

### 2.2 服务器：拉取 + 构建 + 重启（全部 sudo）
```bash
cd /opt/shentong
sudo git pull origin main
git --no-pager log --oneline -1       # 确认到目标提交

cd backend
sudo rm -rf dist
sudo npm run build 2>&1 | tail -3 && echo BUILD_OK
sudo pkill -9 -f "node dist/main.js"; sleep 2
ss -tlnp | grep 3001 || echo PORT_FREE
sudo bash -c "cd /opt/shentong/backend && nohup node dist/main.js > server.log 2>&1 &"
sleep 8
curl -s http://127.0.0.1:3001/api/health; echo
sudo grep -iE "ERROR|EADDRINUSE" /opt/shentong/backend/server.log | tail -5 || echo NO_ERRORS
```

## 3. 桌面安装包

### 3.1 触发构建
```powershell
# 推送到 CI 分支即触发 Desktop Build（CI 自动版本 +1）
& $git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
```

### 3.1.1 GitHub 网络不稳定（连接被重置/超时）时的重试
- 症状：`git push` 报 `Failed to connect to github.com port 443` / `Recv failure: Connection was reset` / `GnuTLS recv error (-110)`。属间歇性网络问题，**重试即可**，不要改代码。
- 一键重试脚本（最多 10 轮，main 成功后自动推 CI 分支）：
```powershell
powershell -ExecutionPolicy Bypass -File scripts\push-retry.ps1
```
- 服务器拉取失败同理：`sudo timeout 60 git pull origin main` 多试几次；仍不行可用 git bundle / patch 直传（见 §10 历史方案）。
- 服务器上所有 git 命令必须带 `sudo`（.git 目录属 root，否则报 `cannot open '.git/FETCH_HEAD': Permission denied`）。

### 3.2 自动上传（推荐）
- 条件：`.github/workflows/desktop-build.yml` 的 `🚀 Deploy to Server` 步骤（push 事件已启用）+ GitHub Secrets 已配置 `SERVER_HOST / SERVER_USER / SERVER_SSH_KEY`。
- 效果：构建成功后自动 scp 到服务器 `/tmp/st_deploy`，备份 `latest.yml`、清理旧版本、`mv` 到 `/opt/shentong/updates/`、`chown www-data`、curl 验证。
- 未配 Secrets 时该步骤自动跳过（不红），改用手动上传（§3.3）。
- 验证：`curl -s https://zt.shentongapi.cn/desktop/latest.yml | head -3`

### 3.3 手动上传（CI 未自动部署时）
（本地 PowerShell，把 X.Y.Z 换成实际版本）
```powershell
scp "D:\二次开发\desktop\dist\installer-vX.Y.Z\ShenTongAI-Setup-X.Y.Z-x64.exe" C:\tmp\latest.yml ubuntu@129.204.227.200:/tmp/
```
（服务器）
```bash
cd /opt/shentong/updates
sudo cp latest.yml latest.yml.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
sudo rm -f ShenTongAI-Setup-*.exe ShenTongAI-Setup-*.exe.zip        # 清旧版本
sudo mv /tmp/ShenTongAI-Setup-X.Y.Z-x64.exe /tmp/latest.yml /opt/shentong/updates/
sudo zip -j ShenTongAI-Setup-X.Y.Z-x64.exe.zip ShenTongAI-Setup-X.Y.Z-x64.exe
sudo chown -R www-data:www-data /opt/shentong/updates
curl -s https://zt.shentongapi.cn/desktop/latest.yml | head -3
curl -sI https://zt.shentongapi.cn/desktop/ShenTongAI-Setup-X.Y.Z-x64.exe.zip | head -3
```

### 3.4 本地打包（不走 CI 时）
```powershell
cd D:\二次开发\desktop
npm run pack:win
# 产物在 desktop/dist/installer-vX.Y.Z/
```

## 4. 管理后台 Web

（本地）
```powershell
cd D:\二次开发\frontend\admin
npm run build
# 打包 dist → 上传 /tmp/admin-dist.zip（zip 内应为 assets/ + index.html，不能带外层目录）
```
（服务器）
```bash
cd /tmp
sudo rm -rf admin-new && sudo mkdir admin-new
sudo unzip -q -o /tmp/admin-dist.zip -d /tmp/admin-new/
sudo cp -r /usr/share/nginx/html/admin /usr/share/nginx/html/admin.bak.$(date +%Y%m%d%H%M%S)
sudo rm -rf /usr/share/nginx/html/admin
sudo cp -r /tmp/admin-new /usr/share/nginx/html/admin
sudo chown -R www-data:www-data /usr/share/nginx/html/admin
sudo grep -o 'assets/index-[^"]*.js' /usr/share/nginx/html/admin/index.html   # 确认资源引用
```

## 5. 用户端 Web（/landing/）

（本地）
```powershell
cd D:\二次开发\frontend\user
npm run build
# 打包 dist → 上传 /tmp/dist-deploy.zip
```
（服务器）
```bash
cd /tmp
sudo rm -rf user-landing-new && sudo mkdir user-landing-new
sudo unzip -q -o /tmp/dist-deploy.zip -d /tmp/user-landing-new/
sudo cp -r /usr/share/nginx/html/landing /usr/share/nginx/html/landing.bak.$(date +%Y%m%d%H%M%S)
sudo rm -rf /usr/share/nginx/html/landing
sudo cp -r /tmp/user-landing-new /usr/share/nginx/html/landing
sudo chown -R www-data:www-data /usr/share/nginx/html/landing
curl -s https://zt.shentongapi.cn/landing/ | grep -oE 'assets/index-[^"]+'   # 确认新版资源
```

## 6. Nginx 补丁（一次性，改过别乱动）

- 大文件上传：`/www/server/nginx/conf/nginx.conf` 的 `http {` 下加 `client_max_body_size 200m;`，然后 `sudo nginx -t && sudo nginx -s reload`。
- 根路径白屏修复：`/www/server/panel/vhost/nginx/zt.shentongapi.cn.conf` 主 HTTPS server 里加 `location = / { return 302 /landing/; }`（根路径不能吐旧 index.html）。

## 7. bundle 兜底（服务器拉不到 GitHub 时）

（本地）
```powershell
& $git bundle create C:\tmp\xxx.bundle main
scp C:\tmp\xxx.bundle ubuntu@129.204.227.200:/tmp/
```
（服务器）
```bash
cd /opt/shentong
sudo git fetch /tmp/xxx.bundle "+refs/heads/*:refs/remotes/bundle/*"
sudo git reset --hard bundle/main
git --no-pager log --oneline -1
```
> 注意：bundle 只包含已提交内容；reset 前确认服务器没有未推送的本地提交。

## 8. 验证清单

```bash
curl -s http://127.0.0.1:3001/api/health; echo                    # 后端存活
curl -s https://zt.shentongapi.cn/api/health; echo                # 外网可达
curl -sI https://zt.shentongapi.cn/desktop/latest.yml | head -3   # 安装包清单
curl -s https://zt.shentongapi.cn/landing/ | grep -oE 'assets/index-[^"]+'
curl -s https://zt.shentongapi.cn/admin/ | grep -oE 'assets/index-[^"]+'
sudo grep -iE "ERROR|EADDRINUSE" /opt/shentong/backend/server.log | tail -5 || echo NO_ERRORS
```

## 9. 数据库检查（模型/供应商/用户）

```bash
sudo docker exec shentong-mysql mysql -h127.0.0.1 -ushentong -pded9e9de12d34cb48bf6a1f641ca7cb9 ai_agent -e "
SELECT 'providers' t, id, name, slug, status, model_count, api_key IS NOT NULL has_key FROM model_providers;
SELECT 'deepseek_models' t, id, model_id, provider_id, upstream_model_id, is_active FROM models WHERE model_id LIKE '%deepseek%' OR provider='deepseek';
SELECT 'active_models' t, id, model_id, provider_id, is_active, price_per_1k_input, price_per_1k_output FROM models WHERE is_active=1;
"
```
- 用户生成报 `No available xxx API Key` → 几乎都是供应商未落库/模型未导入/模型未启用，先查本小节。
- 管理后台「测试连接」只验证连通，**不写库**；必须走 添加供应商→保存→读取模型→勾选→定价→导入。

## 10. 半自动脚本

- `scripts/deploy-cloud.ps1`：提交→推送→等 CI→下载产物→部署后端/管理后台→上传安装包 的一键脚本。
  - ⚠️ 脚本内置了**固定的文件清单和提交信息**，改业务前先确认/替换 `$files` 与 `$COMMIT_MSG`。
  - 依赖：Windows 凭据管理器有 GitHub 凭据；服务器 SSH 可交互输密码或已配置密钥。
## 11. OpenClaw 本地直达对话（桌面端 Chat = OpenClaw，模型走云端 llm-proxy）

> 逻辑：桌面端 Chat 页发送消息 = 本地 OpenClaw 流式对话（自动调用 Hermes/N8N/MCP）。
> OpenClaw 的 openai provider 指向云端 llm-proxy（baseUrl + 用户静态 Key，登录后桌面端自动注入），
> llm-proxy 按「后台供应商直连 + 后台定价 × 实际 token」扣费。用户只需在 Chat 页选择模型（保存为用户默认模型）。

### 11.1 后端部署（服务器，一次）
```bash
cd /opt/shentong && sudo git pull origin main
cd backend
sudo rm -rf dist
sudo npm run build 2>&1 | tail -3 && echo BUILD_OK
sudo pkill -9 -f "node dist/main.js"; sleep 2
sudo bash -c "cd /opt/shentong/backend && nohup node dist/main.js > server.log 2>&1 &"
sleep 8
curl -s http://127.0.0.1:3001/api/health; echo
# 记账接口（未登录应 401）
curl -s -o /dev/null -w "proxy-key:%{http_code}\n" http://127.0.0.1:3001/api/chat/accounting/proxy-key
curl -s -o /dev/null -w "preferred-model:%{http_code}\n" -X POST http://127.0.0.1:3001/api/chat/accounting/preferred-model
curl -s -o /dev/null -w "tool:%{http_code}\n" -X POST http://127.0.0.1:3001/api/chat/accounting/tool
# llm-proxy（OpenClaw 模型出口，缺 Key 应 401）
curl -s -o /dev/null -w "llm-proxy:%{http_code}\n" -X POST http://127.0.0.1:3001/api/llm-proxy/v1/chat/completions
```

### 11.2 OpenClaw 模型密钥配置（无需手动配置）
- 每个用户登录桌面端后，App 自动调用 `GET /api/chat/accounting/proxy-key` 获取/生成用户静态 llm-proxy Key（`sk-shentong-*`），
  并注入本地 OpenClaw 的 openai provider（baseUrl=`https://zt.shentongapi.cn/api/llm-proxy/v1`、api=`openai-completions`、apiKey=该 Key）。
- 用户在 Chat 页选择模型时，桌面端调用 `POST /api/chat/accounting/preferred-model` 保存为用户默认模型；
  OpenClaw 发送 `openclaw/default` → llm-proxy 解析为「后台已上线模型 / 用户默认模型 / 兜底 deepseek-chat」。
- 不需要给 OpenClaw 配任何真实大模型 Key；供应商 Key 只在服务器（后台供应商体系）。
- 若仍提示「本地 OpenClaw 未配置模型密钥」：重启桌面端重新登录一次（自动重新注入），或到「本地服务管理」重启 OpenClaw。

### 11.3 探针（验证本地链路）
```powershell
cd D:\二次开发\desktop
npx tsx scripts/openclaw-probe.ts
```
看这几行：
- `openclaw.v1-chat-completions`：401=缺 Key（见 11.2）；200=已通；404=当前 OpenClaw 版本不支持，需升级运行时
- `openclaw.v1-models`：200 且包含 `openclaw/default` = 模型名正确
- `openclaw.ws-handshake`：能收到 connect.challenge / 状态帧 = Gateway 正常
- `n8n.healthz`、`mcp.health`：200 = 工具服务正常
- hermes 各项 404/405 属正常（Hermes serve 无 OpenAI 兼容端点，实际走 CLI，由 OpenClaw 调用）

### 11.4 扣费规则
- 对话本体：llm-proxy 按「后台定价 × 实际 token」冻结+结算（预扣 2000 token，结算多退少补）
- Hermes 调用、N8N 调用本身不单独扣费
- 工作流（N8N）若后台设置了 `pricePerExecution`，执行时按次额外扣费；定价 0 不扣
- 断网 / 未登录：OpenClaw 401 → 提示「设备离线或未登录」，消息不发送

### 11.5 版本与提交
- desktop/package.json 升到 0.7.7（CI 自动 +1 构建 0.7.8 安装包）
- 推送 main 后推 main:upgrade/electron-41 触发 CI（见第 2 / 3 节）
