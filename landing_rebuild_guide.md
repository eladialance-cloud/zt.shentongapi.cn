# Landing 页面重建和部署指南

## 背景

之前的 Landing 页面源码（`frontend/user/`）已被删除，当前服务器上只有构建产物。构建产物中版本号和下载链接是硬编码的，导致显示 `0.1.0` 且下载 404。

## 解决方案

重新创建 Landing 页面项目，支持从后端 API 动态获取版本号。

## 步骤

### 1. 上传源码到服务器

将 `frontend/landing/` 目录打包并上传到服务器：

```bash
# 本地执行
cd D:\二次开发\frontend\landing
tar -czf landing-source-v0.5.0.tar.gz .

# 上传到服务器 /opt/shentong/frontend/landing/
```

### 2. 在服务器上构建

```bash
# 连接到服务器
ssh root@zt.shentongapi.cn

# 进入目录
cd /opt/shentong/frontend/landing

# 解压
rm -rf /opt/shentong/frontend/landing/*
tar -xzf landing-source-v0.5.0.tar.gz -C /opt/shentong/frontend/landing/

# 安装依赖
npm ci

# 构建
npm run build
```

### 3. 部署

```bash
# 备份旧版本
mv /usr/share/nginx/html/landing /usr/share/nginx/html/landing.bak.$(date +%Y%m%d%H%M%S)

# 部署新版本
cp -r /opt/shentong/frontend/landing/dist /usr/share/nginx/html/landing

# 验证
ls -la /usr/share/nginx/html/landing/
```

### 4. 验证

1. 访问 https://zt.shentongapi.cn/landing/
2. 检查版本号是否显示正确
3. 点击下载按钮测试

## 动态版本号说明

新版本通过 `/api/client-versions/latest?platform=win` 获取版本信息：

```typescript
const { version, loading } = useClientVersion('win');
```

如果 API 不可用，会回退到默认版本号。

## 后端 API 要求

确保后端有以下接口：

1. `GET /api/landing/content` - 获取 Landing 页面内容
2. `GET /api/client-versions/latest?platform=win` - 获取最新客户端版本

## 文件清单

- `frontend/landing/` - 新项目源码
- `landing_rebuild_guide.md` - 本指南
