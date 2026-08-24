# 深瞳AI 桌面端发布 SOP（2026-08-25 实战验证）

> 从「改代码」到「用户下载到新版本」的完整流程。按顺序执行，每步有验证点。
> 适用：Windows 桌面端发布（版本 x.y.z）。

## 1. 版本机制（先搞清楚版本号）

- `desktop/package.json` 的 `version` 保持与**线上最新发布版本一致**（上次 CI 构建的版本）。
- GitHub Actions CI 会自动读取该版本 **patch+1** 作为本次构建版本，不回写仓库。
- 例：package.json=1.2.6（线上 1.2.6）→ CI 构建 **1.2.7**。
- 提交信息按惯例标注：`...，版本1.2.6（CI构建1.2.7）`。
- ⚠️ 不要本地手工打与线上重复的版本包；正式发布一律走 CI。

## 2. 提交并推送（触发 CI）

```powershell
cd D:\二次开发
git add .gitignore backend desktop frontend/admin
git commit -m "feat/fix(...): 改动说明，版本X.X.X（CI构建X.X.X+1）"
git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main
git push https://github.com/eladialance-cloud/zt.shentongapi.cn.git main:upgrade/electron-41
```

- 提交范围：本次功能涉及的目录；**排除** `.codex/` `.npm-cache/` `.tmp-jest/` `desktop/.cache/` `backend/uploads/` 及 `scripts/` 下的一次性临时脚本。
- 推送后到 GitHub Actions 查看 `Desktop Build` 工作流，等 `build-windows` 完成（约 10-20 分钟）。
- artifact 名称：`desktop-windows-latest`，内容：`ShenTongAI-Setup-X.X.X-x64.exe` + `latest.yml`（**没有 zip**）。

## 3. 下载产物并本地验证

```powershell
$dir = "E:\网页下载\desktop-windows-latest (2)"
Get-Content "$dir\latest.yml"            # 确认 version: X.X.X
# SHA-512 一致性：Get-FileHash 的 hex 转 base64 后应与 latest.yml 的 sha512 完全一致
```

## 4. 上传服务器

```powershell
scp "...\ShenTongAI-Setup-X.X.X-x64.exe" "...\ShenTongAI-X.X.X-x64.exe.zip" "...\latest.yml" ubuntu@129.204.227.200:/tmp/
```

- 服务器：`ubuntu@129.204.227.200`（无 SSH 密钥，需密码）。
- zip 可本地生成（不带 Setup 也可），但**服务器端必须再生成带 Setup 前缀的 zip**（见下）。

## 5. 服务器发布（关键，一条都不能少）

```bash
cd /opt/shentong/updates
sudo cp latest.yml latest.yml.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
sudo rm -f ShenTongAI-Setup-*.exe ShenTongAI-Setup-*.exe.zip ShenTongAI-*.exe.zip
sudo mv /tmp/ShenTongAI-Setup-X.X.X-x64.exe /tmp/ShenTongAI-X.X.X-x64.exe.zip /tmp/latest.yml /opt/shentong/updates/
# 必须生成带 Setup 前缀的 zip（官网/自动更新依赖这个文件名，否则 404）
sudo zip -j ShenTongAI-Setup-X.X.X-x64.exe.zip ShenTongAI-Setup-X.X.X-x64.exe
sudo chown -R www-data:www-data /opt/shentong/updates/
```

验证：
```bash
curl -s https://zt.shentongapi.cn/desktop/latest.yml | head -3                    # version: X.X.X
curl -sI https://zt.shentongapi.cn/desktop/ShenTongAI-Setup-X.X.X-x64.exe.zip | head -3   # HTTP 200
```

## 6. 官网下载更新（数据库，最容易漏！）

- 官网「客户端下载」的版本号和下载链接**不读服务器文件**，读数据库 `client_versions` 表。
- 管理后台 → **客户端版本管理** → 新增记录：
  - 版本号：`X.X.X`
  - 平台：Windows
  - 下载地址：`/desktop/ShenTongAI-Setup-X.X.X-x64.exe.zip`
  - 启用：是；同时**停用旧版本记录**（否则官网可能仍显示旧版）
- 不做这步：官网下载页仍显示旧版本、旧下载链接。

## 7. 验收清单（全过才算发布完成）

- [ ] `https://zt.shentongapi.cn/desktop/latest.yml` 返回 `version: X.X.X`
- [ ] `https://zt.shentongapi.cn/desktop/ShenTongAI-Setup-X.X.X-x64.exe.zip` 返回 HTTP 200
- [ ] 官网下载页显示 `X.X.X` 且下载按钮可用（依赖第 6 步）
- [ ] 桌面端「检查更新」提示升级到 `X.X.X`，升级后可正常启动

## 8. 实战踩坑记录（2026-08-25，v1.2.6 → v1.2.7）

1. **zip 文件名必须带 Setup**：服务器只有不带 Setup 的 zip 时，带 Setup 的链接 404。修复：服务器 `zip -j ShenTongAI-Setup-*.exe.zip ShenTongAI-Setup-*.exe`。
2. **CI artifact 里没有 zip**：`electron-builder --win` 只产出 exe；zip 需服务器端生成（或本地 Compress-Archive）。
3. **官网版本走数据库**：只传服务器文件，官网仍显示旧版；必须更新 `client_versions`。
4. **版本号重复**：本地手工打与线上重复的版本号；正确做法是走 CI 自动构建新版本。
5. **本机沙箱限制**：写 `.git`、联网（scp/ssh/push）需要授权；自动审批服务故障时只能由用户手动执行命令。
6. **本机离线打包（备胎，不推荐）**：`winCodeSign` 缓存为空、`app-builder-bin` 缺失时，可用 `ELECTRON_BUILDER_CACHE=<工作区缓存>` + `--config.electronDist=<node_modules/electron/dist>` 离线打包；正式发布优先 CI。

## 9. 相关文件

- CI 工作流：`.github/workflows/desktop-build.yml`
- 一键构建+上传脚本（半过时，输出目录为 `dist/installer-v${version}`）：`desktop/scripts/build-and-upload.ps1`
- 旧版发布指南（含 GitHub Actions 下载脚本模板）：`deploy/桌面端发布部署指南.md`
- 本 SOP 为唯一权威流程，发现不一致以本文件为准。
