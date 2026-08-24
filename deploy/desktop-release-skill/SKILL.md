---
name: desktop-release
description: 深瞳AI桌面端（Windows）发布流程：版本号机制、触发 GitHub Actions CI、下载 artifact、上传服务器、更新官网数据库版本记录、验收。当用户要求发布桌面端新版本、打包上传、检查更新发布时使用。
metadata:
  short-description: 深瞳AI桌面端发布流程
---

# 深瞳AI 桌面端发布

完整 SOP 见 `D:\二次开发\deploy\DESKTOP-RELEASE-SOP.md`（唯一权威，含踩坑记录）。执行前先读它。

## 流程速览

1. **版本**：`desktop/package.json` 与线上一致；CI 自动 patch+1（1.2.6 → 构建 1.2.7）。正式发布一律走 CI，不要本地打重复版本。
2. **提交推送**：`git add .gitignore backend desktop frontend/admin`（排除 `.codex/` `.npm-cache/` `.tmp-jest/` `desktop/.cache/` `backend/uploads/` 与 `scripts/` 临时脚本）→ commit → push 到 `main` 和 `upgrade/electron-41`（HTTPS URL）。commit 信息标注 `版本X（CI构建X+1）`。
3. **等 CI**：GitHub Actions `Desktop Build` → artifact `desktop-windows-latest`（exe + latest.yml，**无 zip**）。
4. **验证**：`latest.yml` version 与 exe 的 SHA-512（hex→base64）一致。
5. **上传**：scp exe + zip + latest.yml 到 `ubuntu@129.204.227.200:/tmp/`（无密钥，需密码）。
6. **服务器发布**：`/opt/shentong/updates` 下 rm 旧文件 → mv 新文件 → **`sudo zip -j ShenTongAI-Setup-X.X.X-x64.exe.zip ShenTongAI-Setup-X.X.X-x64.exe`（必做，否则 404）** → `chown -R www-data:www-data`。
7. **官网数据库**（最容易漏）：管理后台 → 客户端版本管理 → 新增 `X.X.X`，下载地址 `/desktop/ShenTongAI-Setup-X.X.X-x64.exe.zip`，停用旧记录。否则官网仍显示旧版。
8. **验收**：`latest.yml` 返回新版本；Setup zip 返回 200；官网显示新版本；桌面端检查更新提示升级。

## 环境注意

- 本机沙箱禁外网；`scp/ssh/git push` 需要授权，自动审批故障时交给用户手动执行。
- 关键 URL：官网 `https://zt.shentongapi.cn/desktop/`，服务器 `129.204.227.200`（ubuntu）。
