# 深瞳AI 桌面端

基于 Electron + React + TypeScript 的智能中台桌面客户端。

## 技术栈

- Electron 41.7.1（主进程 + preload + renderer 三层架构）
- React 18 + React Router 6 + Zustand 4
- Ant Design 5
- Vite 8.1.5 + electron-vite 5（@vitejs/plugin-react 6）
- TypeScript 5.6（strict 模式）
- SQLCipher（本地加密数据库，`@journeyapps/sqlcipher` 6.0.0）
- electron-log（主进程全局错误处理与日志）

## 目录结构

```
desktop/
├── electron/          # Electron 主进程代码
│   ├── main/          # 主进程入口与业务逻辑
│   ├── preload/       # preload 脚本（contextBridge）
│   └── shared/        # 主进程与 preload 共享类型
├── src/               # React 渲染进程代码
│   ├── pages/         # 页面组件
│   ├── components/    # 通用组件
│   ├── store/         # Zustand 状态管理
│   ├── api/           # API 客户端
│   ├── router/        # 路由配置
│   ├── styles/        # 全局样式
│   ├── theme/         # 主题配置
│   ├── types/         # 类型定义
│   ├── utils/         # 工具函数
│   └── public/        # 公共静态资源
├── tests/             # 测试
│   └── e2e/           # 端到端测试
├── scripts/           # 构建脚本
├── runtime/           # 运行时二进制（git 排除）
├── resources/         # 静态资源
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
└── tsconfig.json
```

## 环境要求

- Node.js >= 20.10（推荐 20.20.2）
- npm >= 10
- Windows 10+ / macOS 12+
- Python 3.x（macOS/Linux 编译 sqlcipher 6.0.0 源码需要；Windows 不需要）

## 快速开始

```bash
# 安装依赖（注意 peer 依赖范围警告，--legacy-peer-deps 已封装在 .npmrc 中）
npm install

# Windows 上 @journeyapps/sqlcipher 6.0.0 安装 workaround：
#   6.0.0 的 os 字段移除了 win32 支持，需 --force --ignore-scripts 绕过 os 检查，
#   然后手动放置 5.3.1 时代的 N-API v6 Windows prebuilt binary 到
#   node_modules/@journeyapps/sqlcipher/build/Release/node_sqlite3.node
#   （5.3.1 与 6.0.0 JS wrapper ABI 兼容，N-API v6 是 ABI 稳定的，Electron 41 支持 N-API v9 向下兼容）
# 详见下方"SQLCipher Windows 安装 workaround"章节

# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 构建
npm run build

# 打包安装程序
npm run build:win   # Windows
npm run build:mac   # macOS
```

## SQLCipher Windows 安装 workaround

`@journeyapps/sqlcipher@6.0.0` 在 `package.json` 的 `os` 字段中仅声明 `["darwin", "linux"]`，
**官方已永久移除 Windows 支持**。Windows 上需要以下 workaround：

### 步骤 1：force 安装（绕过 os 检查 + 跳过 install 脚本）

```bash
npm install @journeyapps/sqlcipher@^6.0.0 --force --ignore-scripts
```

### 步骤 2：放置 5.3.1 时代的 N-API v6 Windows prebuilt binary

5.3.1 时代提供了 Windows x64 prebuilt binary（N-API v6 ABI 稳定），与 6.0.0 JS wrapper ABI 兼容。

将 `node_sqlite3.node`（5.54 MB）放置到：

```
node_modules/@journeyapps/sqlcipher/build/Release/node_sqlite3.node
```

binary 来源：
- npm 缓存中的 `@journeyapps/.sqlcipher-XXXX/lib/binding/napi-v6-win32-x64/node_sqlite3.node`
- 或从旧版本（5.3.1）的安装目录复制

### 步骤 3：electron-builder.yml 配置

`electron-builder.yml` 中已配置：

```yaml
npmRebuild: false
nodeGypRebuild: false
```

防止 electron-builder 调用 `@electron/rebuild` 覆盖已放置的 binary。

### 验证 binary 可加载

```bash
node -e "const m = require('./node_modules/@journeyapps/sqlcipher/build/Release/node_sqlite3.node'); console.log(Object.keys(m))"
# 期望输出：[ 'Database', 'Statement', 'Backup', 'OPEN_READONLY', 'OPEN_READWRITE', ... ]
```

### 未来迁移路径

当 6.0.0+ 完全无法在 Windows 使用时，应迁移到 `better-sqlite3`（仍提供 Windows prebuilt binary），
但需要重写 `electron/main/services/local-db.ts` 中的 SQLCipher 加密 API（`PRAGMA key`）调用方式。

## 环境变量

| 变量 | 说明 | 示例 |
|---|---|---|
| VITE_API_BASE_URL | 后端 API 地址 | http://localhost:3001/api |
| VITE_WS_URL | WebSocket 地址 | ws://localhost:3001 |
| VITE_DEVTOOLS_ENABLED | 是否开启 DevTools | true |

开发环境配置参考 `.env.development`，生产环境配置参考 `.env.production.example`。

## 测试

```bash
npm test              # 单元测试
npm run test:e2e      # 端到端测试
```

## 发布流程

1. 更新 `package.json` 版本号
2. `npm run build:win` 构建安装包
3. 验证安装包功能
4. 上传到 `https://zt.shentongapi.cn/desktop/`
5. 更新 `latest.yml`

## 调试技巧

- 主进程日志：`%APPDATA%/shentong-ai/logs/main.log`（通过 electron-log 写入）
- DevTools：开发模式下 Ctrl+Shift+I
- IPC 通信：DevTools Console 中 `window.electronAPI`

## 安全特性

- contextIsolation: true（主进程与渲染进程隔离）
- nodeIntegration: false（渲染进程无法直接访问 Node API）
- sandbox: true（渲染进程沙箱）
- CSP 严格配置（connect-src 限制到生产白名单）
- SafeStorage 凭据加密（密码等敏感信息通过操作系统原生凭据存储加密）
- SQLCipher 本地数据库加密

## License

MIT
