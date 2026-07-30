# 基础设施与配置审查报告

**项目**: 深瞳AI 智能中台 (D:\二次开发)
**审查日期**: 2026-07-29
**审查范围**: 打包配置、运行时清单、Git忽略、部署脚本、CDN、CI/CD、数据库迁移、环境变量、依赖兼容性
**审查人**: DevOps Subagent

---

## 摘要

| 严重级别 | 数量 |
|---------|------|
| Critical | 4 |
| Major | 8 |
| Minor | 7 |
| **合计** | **19** |

---

## 1. 打包配置 (desktop/electron-builder.yml)

### [Major] PACK-01: `npmRebuild: false` 依赖手动放置 native binary，缺乏自动化保障

**文件**: `desktop/electron-builder.yml` 第 18-23 行

**描述**: 由于 `@journeyapps/sqlcipher` 6.0.0 移除了 Windows prebuilt binary，配置中设置 `npmRebuild: false` 并依赖手动放置的 5.3.1 时代 N-API v6 binary。虽然注释说明了原因，但：

1. 新开发者 clone 仓库后无法自动获取该 binary
2. 没有脚本验证 binary 是否存在
3. CI/CD 中缺少 binary 存在性检查

**风险**: 构建产物可能缺少 native 模块，导致运行时崩溃。

**建议**:
- 添加 prebuild 脚本验证 `node_modules/@journeyapps/sqlcipher/build/Release/node_sqlite3.node` 存在性
- 将该 binary 文件纳入版本控制或提供自动化下载脚本
- 在 CI 流水线中增加 binary 存在性断言

### [Minor] PACK-02: `asar: true` 但未配置 `asarUnpack` 处理 native 模块

**文件**: `desktop/electron-builder.yml` 第 14 行

**描述**: 启用了 `asar: true` 打包，但 `@journeyapps/sqlcipher` 等 native 模块通常需要 `asarUnpack` 才能正确加载。虽然 `npmRebuild: false` 可能避免了直接问题，但缺乏显式配置是一个隐患。

**建议**: 添加 `asarUnpack: ["**/*.node"]` 确保 native 模块在 asar 外可用。

### [Minor] PACK-03: 代码签名配置被注释掉，默认未签名

**文件**: `desktop/electron-builder.yml` 第 30-31 行、第 47-50 行

**描述**: Windows 和 macOS 的代码签名配置均为注释状态。`signAndEditExecutable: false` 明确禁用了签名。虽然注释说明通过环境变量启用，但未签名的安装包会触发 SmartScreen 警告。

**建议**: 在 CI/CD 中强制要求签名环境变量存在才执行构建，或至少在构建脚本中添加签名状态警告。

### [Minor] PACK-04: `extraResources` 未排除 `.gitkeep` 以外的隐藏文件

**文件**: `desktop/electron-builder.yml` 第 25-27 行

**描述**: `runtime/` 目录的 filter 为 `["**/*", "!**/.gitkeep"]`，但仍可能包含 `.DS_Store`、`Thumbs.db` 等系统文件。

**建议**: filter 改为 `["**/*", "!**/.gitkeep", "!**/.DS_Store", "!**/Thumbs.db"]`。

---

## 2. 运行时清单 (desktop/runtime/manifest.json)

### [Critical] RT-01: SHA256 校验值与实际文件不匹配

**文件**: `desktop/runtime/manifest.json`

**描述**: manifest.json 中声明的 SHA256 值与 CDN 目录中实际文件的哈希值对比结果如下：

| 服务 | manifest 声明值 | 实际文件哈希 | 匹配？ |
|------|----------------|-------------|--------|
| hermes 0.19.0 | `9d22c318...` | `9D22C318DC5D75FB1263348AF1F84C2BD622F3A6580568C0AD3026804F8B049F` | ✅ 匹配 |
| openclaw 2026.7.1 | `43d32c7a...` | `97AF39AF1D4BD77E280995D8F54839AEE38B8F02F7ADEE871E121473F8B558BB` | ❌ **不匹配** |
| mcp 1.0.0 | `9948f68e...` | `F07AF385C2640D9CF133984809889AF9D45D53EC44832964D0F26B0D05203547` | ❌ **不匹配** |
| n8n 1.62.0 | `b02a77f4...` | `FF03F677D5853F83A469F49A64CA0416E47AC60DFA4FA405C43663891A6E9074` | ❌ **不匹配** |

**风险**: 3 个运行时组件的 SHA256 校验值与实际文件不一致。如果客户端下载后校验 SHA256，将导致安装失败。如果客户端不校验，则存在安全风险（文件可能被篡改）。

**建议**:
- 立即重新计算所有 CDN 文件的实际 SHA256 并更新 manifest.json
- 建立自动化流程：每次更新 CDN 文件后自动同步更新 manifest.json
- 添加 CI 步骤验证 manifest 与 CDN 文件一致性

### [Major] RT-02: 非 Windows 平台的下载 URL、size、sha256 均为空

**文件**: `desktop/runtime/manifest.json`

**描述**: 除 openclaw 和 mcp 有 macOS/Linux 的 downloadUrl 外，所有服务的 `size` 和 `sha256` 对 `darwin-*` 和 `linux-*` 均为空字符串或 0。hermes 和 n8n 连 downloadUrl 也为空。

**风险**: 跨平台支持不完整，macOS/Linux 用户无法下载运行时组件。

**建议**: 如果暂不支持其他平台，应在应用层明确提示"仅支持 Windows"，而非留下空 URL 导致运行时错误。

### [Minor] RT-03: manifest.json version 字段未与桌面端版本关联

**文件**: `desktop/runtime/manifest.json` 第 2 行

**描述**: manifest 的 `version: "1.0.0"` 与桌面端 `package.json` 的 `0.5.2` 不一致，缺乏版本联动机制。

**建议**: 将 manifest 版本与桌面端版本关联，或明确文档说明 manifest version 的语义（独立版本还是跟随主版本）。

---

## 3. Git 忽略配置

### [Critical] GIT-01: `.env` 文件包含真实密钥但可能已被 Git 追踪

**文件**: `.env`、`backend/.env`、`desktop/.env`

**描述**: 根目录 `.gitignore` 包含 `.env` 排除规则，`desktop/.gitignore` 也包含 `.env` 排除规则。但是：

1. **根目录 `.env` 包含真实的 MySQL 密码、JWT 密钥、AES 密钥、HMAC 密钥** — 这些是生产级敏感信息
2. `backend/.env` 同样包含真实的数据库密码和 JWT 密钥
3. `backend/.env.example` 包含一个看起来是真实密码的默认值 `shentong_db_2026`
4. 需要验证这些文件是否曾经被 commit 到 Git 历史中

**风险**: 如果 `.env` 文件在 `.gitignore` 规则添加之前被提交，密钥已经泄露到 Git 历史中。

**建议**:
- 执行 `git log --all --full-history -- .env backend/.env` 检查是否曾被追踪
- 如果曾被提交，需要轮换所有密钥（MySQL 密码、JWT 密钥、AES 密钥、HMAC 密钥）
- 使用 `git filter-branch` 或 BFG Repo-Cleaner 清除历史中的密钥文件
- `backend/.env.example` 中的 `DB_PASSWORD=shentong_db_2026` 应改为占位符

### [Major] GIT-02: `.gitignore` 未排除大量构建产物和临时文件

**文件**: `.gitignore`

**描述**: 当前 `.gitignore` 未排除以下内容：
1. `desktop-v0.5.0-portable.zip` — 空文件但不应在仓库中
2. `desktop-update-v0.5.0.tar.gz` (249MB!) — 巨大的构建产物
3. `admin-dist-v0.5.0.tar.gz`、`backend-v0.5.0.tar.gz` 等部署包
4. `landing-source-v0.5.0.zip` — 源码包
5. `deploy-config-v0.5.0.tar.gz` — 部署配置包
6. `desktop-update-temp-11/`、`desktop-update-v0.5.0/` — 临时目录
7. `backend/uploads/` — 用户上传文件
8. `backend/sql/` — SQL 脚本（如果不需要版本控制）

**风险**: 仓库体积膨胀（仅 `desktop-update-v0.5.0.tar.gz` 就 249MB），克隆速度慢，且可能包含敏感信息。

**建议**: 在 `.gitignore` 中添加：
```
# Deployment artifacts
*-v*.tar.gz
*-v*.zip
desktop-update-*/
desktop-*-portable.zip

# User uploads
backend/uploads/
```
并使用 `git rm --cached` 从索引中移除已追踪的文件。

### [Minor] GIT-03: `.gitignore` 排除了 `docs/` 目录

**文件**: `.gitignore` 第 22 行

**描述**: `docs/` 被标记为 "local only" 并排除。但项目文档通常应该纳入版本控制。

**建议**: 如果有需要共享的文档，考虑将部分 docs 纳入版本控制或使用独立的文档仓库。

---

## 4. 部署脚本

### [Critical] DEPLOY-01: `register-config-fix.sh` 硬编码数据库密码

**文件**: `deploy/register-config-fix.sh` 第 11 行

**描述**: 脚本中直接硬编码了 MySQL 密码 `085d9f3c748c433b8d4d4a7050df9c9b`：
```bash
docker exec -i shentong-mysql mysql -u shentong -p"085d9f3c748c433b8d4d4a7050df9c9b" ai_agent << 'SQLEOF'
```

**风险**: 密码泄露到版本控制中（即使 `.env` 被忽略，shell 脚本中的密码不会被忽略）。

**建议**:
- 改为从 `.env` 读取密码：`DB_PASS=$(grep MYSQL_PASSWORD .env | cut -d= -f2)`
- 立即轮换被泄露的密码
- 审查 Git 历史中该文件的所有版本

### [Major] DEPLOY-02: `deploy-v0.5.0.sh` (根目录) 在密码变量中使用 `cut` 解析存在安全风险

**文件**: `deploy-v0.5.0.sh` 第 16-20 行

**描述**: 使用 `grep -E "^DB_PASSWORD=" .env | cut -d= -f2` 提取密码。如果密码中包含 `=` 字符，`cut` 会截断密码。

**建议**: 使用 `source .env` 或 `set -a; . .env; set +a` 加载环境变量，避免解析错误。

### [Major] DEPLOY-03: `deploy.sh` 使用 `sed -i` 修改 `.env` 文件，缺乏原子性

**文件**: `deploy/deploy.sh` 第 100-106 行

**描述**: `replace_placeholder_secrets()` 函数使用 `sed -i` 直接修改 `.env` 文件。如果中途失败，`.env` 可能处于不一致状态。

**建议**: 使用 `sed` 写入临时文件，然后原子性地替换原文件：
```bash
sed "s|^${var}=.*|${var}=${new_password}|" "$env_file" > "$env_file.tmp" && mv "$env_file.tmp" "$env_file"
```

### [Major] DEPLOY-04: `deploy-v0.5.0.sh` (deploy 目录) 临时开启 `DB_SYNCHRONIZE=true` 存在风险

**文件**: `deploy/deploy-v0.5.0.sh` 第 56-70 行

**描述**: 脚本临时设置 `DB_SYNCHRONIZE=true` 让 TypeORM 自动建表，然后关闭。问题：
1. 如果脚本中途失败，`DB_SYNCHRONIZE=true` 可能残留
2. `synchronize=true` 在生产环境可能导致数据丢失（TypeORM 会自动修改表结构）
3. 使用 `sleep 15` 等待建表不可靠

**建议**:
- 使用专门的 migration 脚本而非 `synchronize`
- 使用 trap 确保脚本退出时一定恢复 `DB_SYNCHRONIZE=false`
- 用健康检查替代固定 `sleep 15`

### [Minor] DEPLOY-05: `register-fix.sh` 直接覆盖服务器上的源代码文件

**文件**: `deploy/register-fix.sh`

**描述**: 脚本通过 `cat << 'EOF' > file` 直接在服务器上重写源代码文件。这是一种非常规的修复方式，会导致：
1. 服务器代码与 Git 仓库不一致
2. 下次正常部署可能覆盖修复
3. 审计困难

**建议**: 将修复纳入正常代码发布流程，避免在服务器上直接修改源文件。

---

## 5. 环境变量使用

### [Critical] ENV-01: `backend/.env` 包含硬编码的生产级密钥

**文件**: `backend/.env`

**描述**: `backend/.env` 文件包含：
- `DB_PASSWORD=shentong_db_2026` — 真实开发密码
- `JWT_SECRET=a3f7b2c9e1d4a8b6...` — 64 字符的密钥
- `ADMIN_JWT_SECRET=f2e9d6c3b0a7...` — 64 字符的管理密钥
- `AES_KEY=1a2b3c4d5e6f...` — 64 字符的 AES 密钥
- `HMAC_SECRET=9f8e7d6c5b4a...` — 64 字符的 HMAC 密钥

虽然 `.gitignore` 排除了 `.env`，但这些文件在本地存储明文密钥仍然有风险。

**风险**: 开发环境密钥与生产环境密钥混用，如果开发环境被入侵，生产密钥可能泄露。

**建议**:
- 开发环境使用弱密钥即可，生产密钥仅通过 CI/CD secrets 或密钥管理服务注入
- `backend/.env.example` 不应包含任何看起来像真实密码的值
- 考虑使用 `.env.local` 覆盖 `.env` 中的敏感值

### [Major] ENV-02: `CORS_ORIGINS` 默认值为 `*` 在 docker-compose 中

**文件**: `docker-compose.yml` 第 50 行

**描述**: `CORS_ORIGINS: ${CORS_ORIGINS:-*}` 的默认值是 `*`（允许所有源）。如果部署时忘记设置 `CORS_ORIGINS`，将允许任意域名跨域访问 API。

**风险**: CORS 配置不当导致 CSRF 攻击风险。

**建议**: 移除默认值 `*`，改为无默认值且必需变量：`CORS_ORIGINS: ${CORS_ORIGINS:?必须设置 CORS_ORIGINS}`。

### [Major] ENV-03: `backend/.env` 的 `REDIS_URL` 未包含密码

**文件**: `backend/.env` 第 11 行

**描述**: 开发环境 `REDIS_URL=redis://localhost:6379` 无密码。虽然生产环境通过 docker-compose 使用带密码的 URL，但开发环境的 Redis 完全无认证保护。

**建议**: 开发环境也应启用 Redis 认证，或在文档中明确说明开发环境的安全边界。

### [Minor] ENV-04: 环境变量校验器未覆盖所有必需变量

**文件**: `backend/src/common/utils/env-validator.ts`

**描述**: `validateJwtSecrets()` 仅校验 `JWT_SECRET`、`ADMIN_JWT_SECRET`、`AES_KEY`、`HMAC_SECRET`。未校验：
- `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD`
- `REDIS_PASSWORD`
- `DB_HOST` / `DB_PORT`
- `CORS_ORIGINS`

**建议**: 扩展环境变量校验覆盖所有生产必需变量，在启动时即失败而非运行时才报错。

---

## 6. 依赖版本兼容性

### [Major] DEP-01: Vite 8.x 与 electron-vite 5.x 的兼容性风险

**文件**: `desktop/package.json`

**描述**: 项目使用：
- `vite: ^8.1.5` (最新大版本 8.x)
- `electron-vite: ^5.0.0`
- `electron: ^41.7.1`
- `@vitejs/plugin-react: ^6.0.0`

Vite 8.x 使用 Rolldown 替代 Rollup 作为打包器，这是一个重大架构变更。`electron-vite 5.x` 虽然声称支持 Vite 8，但：

1. `electron.vite.config.ts` 中有大量针对 Vite 8 Rolldown 的 workaround 注释
2. `manualChunks` 从对象格式改为函数格式（Vite 8 要求）
3. native 模块的传递依赖需要显式声明 external

这些 workaround 表明兼容性并非开箱即用。

**风险**: 未来小版本更新可能引入新的兼容性问题。

**建议**:
- 锁定 `vite` 和 `electron-vite` 的精确版本（去除 `^`）
- 在 CI 中添加构建冒烟测试
- 关注 electron-vite 的 issue tracker 跟踪 Vite 8 兼容性问题

### [Major] DEP-02: `@journeyapps/sqlcipher` 6.0.0 与 Electron 41 的 ABI 兼容性未经验证

**文件**: `desktop/package.json`、`desktop/electron-builder.yml`

**描述**: 注释中声称 "ABI 稳定，与 Electron 41 N-API v9 兼容"，但实际使用的是 5.3.1 的 prebuilt binary（N-API v6）配合 Electron 41（N-API v9）。虽然 N-API 设计上向后兼容，但：

1. 没有自动化测试验证此兼容性
2. 6.0.0 的 package.json 声明 `os: ["darwin", "linux"]`，Windows 上 npm install 可能跳过或报错

**建议**:
- 添加集成测试验证 sqlcipher 在 Electron 41 中的功能
- 考虑迁移到 `better-sqlite3`（有完善的 Windows prebuilt 支持且持续维护）
- 在 `postinstall` 脚本中验证 binary 可加载性

---

## 7. 数据库 Migration

### [Major] DB-01: Migration 文件命名不规范，执行顺序不明确

**文件**: `backend/migrations/`

**描述**: 迁移文件列表：
```
001_create_agent_department.sql
002_create_agent_tag.sql
003_alter_agents_add_fields.sql
004_create_mcp_global_tables.sql
005_create_sys_oss_config.sql
006_create_n8n_workflow_lib.sql
007_create_task_tables.sql
008_create_missing_tables.sql
009_create_pricing_config.sql
hermes_stage1.sql          ← 不遵循 NNN_ 前缀
hermes_stage234.sql        ← 不遵循 NNN_ 前缀
upgrade-v0.5.0.sql         ← 不遵循 NNN_ 前缀
```

**风险**: 后三个文件不遵循编号约定，执行顺序无法通过排序保证。`008_create_missing_tables.sql` (21KB) 命名模糊，难以判断内容。

**建议**:
- 重命名为 `010_hermes_stage1.sql`、`011_hermes_stage234.sql`、`012_upgrade_v0.5.0.sql`
- `008_create_missing_tables.sql` 应拆分或重命名为描述性名称
- 考虑使用 TypeORM migration 类（TS 文件）替代纯 SQL，获得更好的版本控制和回滚支持

### [Major] DB-02: 无回滚脚本

**文件**: `backend/migrations/`

**描述**: 所有迁移文件仅包含正向 DDL（CREATE/ALTER），没有任何回滚（DOWN migration）脚本。`upgrade-v0.5.0.sql` 添加了大量列和索引，如果需要回退将非常困难。

**风险**: 部署失败时无法回滚数据库变更，可能导致数据丢失。

**建议**:
- 为每个迁移编写对应的回滚脚本
- 至少为关键迁移（如 `upgrade-v0.5.0.sql`）编写回滚方案
- 在部署流程中增加数据库备份步骤（部署前自动 `mysqldump`）

### [Minor] DB-03: `database.ts` 配置中 `synchronize` 可通过环境变量开启

**文件**: `backend/src/config/database.ts`

**描述**: `synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true'` 允许通过环境变量开启 TypeORM 的自动同步功能。虽然默认为 `false`，但这个开关在生产环境中是危险的。

**建议**: 在生产环境强制 `synchronize: false`，忽略环境变量：
```typescript
synchronize: process.env.NODE_ENV === 'production' ? false : config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
```

---

## 8. CI/CD

### [Major] CI-01: CI 流水线不完整，缺少测试和桌面端构建

**文件**: `.github/workflows/ci.yml`

**描述**: 当前 CI 仅包含：
1. backend lint + build（无测试）
2. frontend admin + user build（无测试）

缺失：
- **无测试步骤**：`npm test` 未在 CI 中执行
- **无桌面端构建**：desktop 项目完全不检查
- **无安全扫描**：无依赖漏洞扫描、无 SAST
- **无部署阶段**：CI 不包含 CD
- **无缓存策略**：每次都重新 `npm ci`
- **Node 版本不匹配**：CI 用 Node 20，但 desktop 项目用 `@types/node: ^22.7.5`

**建议**:
- 添加 `npm test` 步骤到 backend 和 frontend job
- 添加 desktop 项目的 typecheck 和 build job
- 添加 `npm audit` 或 Snyk 进行依赖安全扫描
- 添加 Docker 镜像构建 job
- 使用 `actions/cache` 缓存 node_modules
- 对齐 Node 版本（`20.x` 或 `22.x`）

### [Major] CI-02: 无密钥管理策略

**文件**: `.github/workflows/ci.yml`

**描述**: CI 中没有使用任何 GitHub Secrets。如果需要代码签名、Docker 推送、部署等操作，都需要密钥管理。

**建议**:
- 定义所需的 GitHub Secrets：`CSC_LINK`、`CSC_KEY_PASSWORD`、`DOCKER_REGISTRY_TOKEN` 等
- 在 CI 中使用 `${{ secrets.XXX }}` 引用
- 添加部署 stage 使用 `environment` 保护规则

---

## 9. CDN 目录结构

### [Minor] CDN-01: CDN 目录存在冗余/过时文件

**文件**: `cdn/`

**描述**:
1. `cdn/openclaw/0.3.0/` 和 `cdn/openclaw/2026.7.1/` 并存 — 0.3.0 版本是否仍需要？
2. `cdn/openclaw/2026.7.1/openclaw-win-x64.tar.gz.bak` — 备份文件不应在 CDN 目录中
3. `cdn/mcp/0.2.0/` 和 `cdn/mcp/1.0.0/` 并存 — 0.2.0 版本是否仍需要？

**建议**: 清理过时版本，`.bak` 文件移出 CDN 目录。如果需要保留旧版本，建立版本生命周期管理策略。

---

## 10. Docker Compose 配置

### [Minor] DOCKER-01: MySQL 健康检查使用 root 密码但未显式传递

**文件**: `docker-compose.yml` 第 21-22 行

**描述**: MySQL 健康检查 `mysqladmin ping -h 127.0.0.1 -u root` 依赖 `MYSQL_PWD` 环境变量。虽然已设置 `MYSQL_PWD`，但这种方式不够显式，且 `MYSQL_PWD` 已被 MySQL 标记为废弃。

**建议**: 使用 `mysqladmin ping -h 127.0.0.1 -u root -p"$MYSQL_ROOT_PASSWORD"` 或使用 `--password-file`。

### [Minor] DOCKER-02: Nginx 容器挂载路径可能不存在

**文件**: `docker-compose.yml` 第 65-70 行

**描述**: Nginx 挂载了 `./updates`、`./frontend/admin/dist`、`./nginx/ssl` 三个目录。如果这些目录在宿主机不存在，Docker 会创建空目录但不会报错，导致 Nginx 404。

**建议**: 在 `deploy.sh` 中预创建这些目录，或使用 Docker named volumes。

---

## 优先修复建议

### 立即处理 (Critical)
1. **RT-01**: 重新计算并更新 manifest.json 中所有 SHA256 值
2. **GIT-01**: 检查 Git 历史中是否提交过 `.env` 文件，如有则轮换所有密钥
3. **DEPLOY-01**: 从 `register-config-fix.sh` 中移除硬编码密码，轮换被泄露的密码
4. **ENV-01**: 清理 `backend/.env` 和 `.env.example` 中的真实密钥值

### 近期处理 (Major)
1. **PACK-01**: 自动化 native binary 分发流程
2. **GIT-02**: 清理仓库中的大文件和构建产物
3. **DEPLOY-04**: 消除 `DB_SYNCHRONIZE=true` 的使用，改用正规 migration
4. **ENV-02**: 移除 CORS 默认值 `*`
5. **DB-01**: 规范化 migration 文件命名
6. **DB-02**: 编写 migration 回滚脚本
7. **CI-01**: 完善 CI 流水线（添加测试、桌面端构建、安全扫描）
8. **CI-02**: 建立密钥管理策略
9. **DEP-01/02**: 锁定关键依赖版本，添加兼容性测试

---

## 附录: 审查文件清单

| # | 文件 | 状态 |
|---|------|------|
| 1 | `desktop/electron-builder.yml` | ✅ 已审查 |
| 2 | `desktop/runtime/manifest.json` | ✅ 已审查 |
| 3 | `desktop/.gitignore` | ✅ 已审查 |
| 4 | `.gitignore` | ✅ 已审查 |
| 5 | `backend/.env` | ✅ 已审查 |
| 6 | `backend/.env.example` | ✅ 已审查 |
| 7 | `.env` | ✅ 已审查 |
| 8 | `.env.example` | ✅ 已审查 |
| 9 | `.env.production.template` | ✅ 已审查 |
| 10 | `docker-compose.yml` | ✅ 已审查 |
| 11 | `backend/Dockerfile` | ✅ 已审查 |
| 12 | `backend/.dockerignore` | ✅ 已审查 |
| 13 | `deploy/deploy.sh` | ✅ 已审查 |
| 14 | `deploy/deploy-v0.5.0.sh` | ✅ 已审查 |
| 15 | `deploy-v0.5.0.sh` (根目录) | ✅ 已审查 |
| 16 | `deploy/register-fix.sh` | ✅ 已审查 |
| 17 | `deploy/register-config-fix.sh` | ✅ 已审查 |
| 18 | `deploy/server-cleanup.sh` | ✅ 已审查 |
| 19 | `deploy/nginx.conf` | ✅ 已审查 |
| 20 | `deploy-landing.sh` | ✅ 已审查 |
| 21 | `.github/workflows/ci.yml` | ✅ 已审查 |
| 22 | `backend/src/config/database.ts` | ✅ 已审查 |
| 23 | `backend/src/common/utils/env-validator.ts` | ✅ 已审查 |
| 24 | `backend/migrations/*.sql` (12 files) | ✅ 已审查 |
| 25 | `desktop/package.json` | ✅ 已审查 |
| 26 | `backend/package.json` | ✅ 已审查 |
| 27 | `desktop/electron.vite.config.ts` | ✅ 已审查 |
| 28 | `desktop/.npmrc` | ✅ 已审查 |
| 29 | `cdn/` 目录结构 | ✅ 已审查 |
| 30 | CDN 文件 SHA256 校验 | ✅ 已验证 |

---

*报告结束*
