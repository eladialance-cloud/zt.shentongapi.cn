# 深瞳AI 桌面端

基于 Electron + React + TypeScript 的智能中台客户端。

> **运行模式说明（2026-08-04）**：本客户端为**纯云端模式**。本地加密数据库（SQLCipher）与离线同步能力已下线，所有数据（会话/消息/积分/知识库）均通过后端 API 持久化。请勿依赖离线功能。

## 技术栈

- Electron 41.7.1（主进程 + preload + renderer 三层架构）
- React 18 + React Router 6 + Zustand 4
- Ant Design 5
- Vite 8.1.5 + electron-vite 5（@vitejs/plugin-react 6）
- TypeScript 5.6（strict 模式）
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

## 快速开始

```bash
# 安装依赖（注意 peer 依赖范围警告：-legacy-peer-deps 已封装在 .npmrc 中）
npm install

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
5. 更新 `latest.yml`（CI 自动执行 `scripts/generate-latest-yml.ts`，SHA-512 为 base64 格式）

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

## Electron 安装问题排查

### 错误：Electron failed to install correctly

**错误信息**：

```
Electron failed to install correctly, please delete node_modules/electron and try installing again
```

**原因**：`npm install` 时 Electron 二进制文件下载失败（通常是国内网络问题），导致 `node_modules/electron/path.txt` 缺失。

**自动修复**：项目已配置 `.npmrc` 使用国内镜像（npmmirror.com），`postinstall` 钩子会自动验证并在必要时重新下载 Electron 二进制。大多数情况下重新运行 `npm install` 即可修复。

**手动修复**：如果自动修复失败，执行以下命令手动下载 Electron 二进制：

```bash
npm run setup:electron
```

该命令会从国内镜像下载对应平台的 Electron 二进制并生成 `path.txt` 文件。

**其他排查步骤**：

1. 检查网络连接，确保能访问 `https://npmmirror.com`
2. 手动设置环境变量：`set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
3. 删除 `node_modules/electron` 目录后重新运行 `npm install`
4. 如果使用代理，确认 `HTTPS_PROXY` 环境变量已正确设置

### 错误：打包应用启动后报 Electron 相关错误

**原因**：系统环境变量中可能存在残留 `ELECTRON_RUN_AS_NODE=1`，导致 Electron 以纯 Node.js 模式运行。

**解决方法**：

1. 打开 系统属性 → 环境变量
2. 在用户变量和系统变量中查找 `ELECTRON_RUN_AS_NODE`
3. 如果存在，删除该变量
4. 重启应用

## License

MIT
