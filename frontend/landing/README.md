# 深瞳 AI Landing 页面

## 项目说明

Landing 页面源码，支持从后端 API 动态获取版本号。

## 技术栈

- React 18
- TypeScript
- Vite
- CSS Modules

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

```bash
# 在服务器上执行
chmod +x build-and-deploy.sh
./build-and-deploy.sh
```

## 动态版本号

页面通过 `/api/client-versions/latest?platform=win` 接口获取最新版本信息：

```typescript
const { version, loading } = useClientVersion('win');
```

如果 API 调用失败，会回退到默认版本号 `0.5.0`。

## 文件结构

```
landing/
├── src/
│   ├── components/     # 组件
│   ├── hooks/          # 自定义 Hooks
│   │   ├── useClientVersion.ts    # 获取客户端版本
│   │   └── useLandingContent.ts   # 获取 Landing 内容
│   ├── types/          # TypeScript 类型
│   ├── App.tsx         # 主组件
│   ├── App.css         # 样式
│   └── main.tsx        # 入口
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```
