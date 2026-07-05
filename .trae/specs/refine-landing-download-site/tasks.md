# Tasks

## 配置与路由

- [x] Task 1: 新建 `frontend/user/.env.production` 配置文件
  - [x] SubTask 1.1: 创建 `frontend/user/.env.production`
  - [x] SubTask 1.2: 确认 `frontend/user/vite.config.ts` 默认加载 `.env.production`

- [x] Task 2: 精简 `frontend/user/src/router/index.tsx`
  - [x] SubTask 2.1-2.6: 删除所有用户端 lazy import 与守卫,精简为 3 条路由

## 代码清理

- [x] Task 3: 删除用户端页面目录
  - [x] SubTask 3.1-3.6: 删除 Dashboard/chat/agent/knowledge/user/opc

- [x] Task 4: 删除用户端组件目录
  - [x] SubTask 4.1-4.7: 删除 MainLayout/PageSkeleton/AgentCard/ChatMessage/DataForm/DataTable

- [x] Task 5: 删除用户端 store/api/types/hooks/utils
  - [x] SubTask 5.1-5.8: 删除业务 store/api/types/hooks/utils,修改 index.ts 只导出保留模块

## Landing 页面改造

- [x] Task 6: 修改 `frontend/user/src/pages/Landing/index.tsx`
  - [x] SubTask 6.1-6.7: import useAuthStore、品牌域名更新、导航栏按钮改造、新增下载区域、CTA 按钮改造、读取环境变量

- [x] Task 7: 修改 `frontend/user/src/pages/Landing/styles.module.css`
  - [x] SubTask 7.1-7.9: 新增下载区域全部样式

## 登录注册跳转改造

- [x] Task 8: 修改 `frontend/user/src/pages/Register/index.tsx`
  - [x] SubTask 8.1-8.3: 注册成功保存 token + 跳转 `/`

- [x] Task 9: 修改 `frontend/user/src/pages/Login/index.tsx`
  - [x] SubTask 9.1-9.2: 跳转改为 `/`

## 部署配置

- [x] Task 10: 修改 `deploy/nginx.conf` 新增 `zt.shentongapi.cn` server 块
  - [x] SubTask 10.1-10.5: 新增 server 块 + SPA fallback + 静态资源缓存 + 下载站

- [x] Task 11: 修改 `docker-compose.yml` nginx 服务挂载
  - [x] SubTask 11.1-11.3: 新增 landing 挂载

- [x] Task 12: 更新 `deploy/upload-files.md`
  - [x] SubTask 12.1-12.3: 新增 Landing 上传说明 + rsync 命令 + 部署步骤

## 验证

- [x] Task 13: 类型检查与构建验证
  - [x] SubTask 13.1: `npx tsc --noEmit` 退出码 0
  - [x] SubTask 13.2: `npm run build` 成功产出 `dist/`
  - [x] SubTask 13.3: `dist/index.html` 存在
  - [x] SubTask 13.4: `dist/assets/` 下有 JS 与 CSS 文件

## 修复验证失败项

- [x] Task 14: 移除演示模式（修复 checklist 第 18 项失败）
  - [x] SubTask 14.1: 删除 `frontend/user/src/utils/mock-data.ts`
  - [x] SubTask 14.2: 修改 `frontend/user/src/api/auth.ts` 移除 `mockLogin` 函数与 `mockUser`/`DEMO_TOKEN` 导入
  - [x] SubTask 14.3: 修改 `frontend/user/src/utils/token.ts` 移除 `DEMO_TOKEN` 导入与第 47 行 `DEMO_TOKEN` 短路逻辑
  - [x] SubTask 14.4: 修改 `frontend/user/src/utils/request.ts` 移除 `getMockResponse`/`DEMO_TOKEN` 导入、`demoAdapter` 函数与请求拦截器中 `DEMO_TOKEN` 短路
  - [x] SubTask 14.5: 修改 `frontend/user/src/pages/Login/index.tsx` 移除 `mockLogin` 导入、`handleDemoLogin` 函数与"演示模式登录"按钮
  - [x] SubTask 14.6: 验证 `npx tsc --noEmit` 退出码 0
  - [x] SubTask 14.7: 验证 `npm run build` 成功

# Task Dependencies
- Task 2 依赖 Task 1
- Task 6/7/8/9 在 Task 2 完成后并行
- Task 3/4/5 并行执行
- Task 10/11 并行
- Task 12 依赖 Task 10/11
- Task 13 依赖所有前置任务完成
- Task 14 依赖 Task 13（修复验证阶段发现的失败项）
