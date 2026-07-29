# Landing 页面重建部署完整指南

## 概述

按长期建议修复 Landing 页面版本号问题：重新创建支持动态版本号的 Landing 页面项目。

## 步骤 1: 本地准备

### 1.1 打包源码

在本地执行：

```powershell
cd D:\二次开发\frontend\landing
# 确保所有文件已保存

# 打包
Compress-Archive -Path * -DestinationPath landing-source-v0.5.0.zip -Force
```

### 1.2 上传到服务器

通过宝塔面板文件管理器或 SCP 上传：

```bash
# 使用 scp（在本地 PowerShell 执行）
scp landing-source-v0.5.0.zip root@zt.shentongapi.cn:/opt/shentong/
```

## 步骤 2: 服务器部署

### 2.1 连接到服务器

```bash
ssh root@zt.shentongapi.cn
```

### 2.2 解压并部署

```bash
# 创建目录
mkdir -p /opt/shentong/frontend/landing
cd /opt/shentong/frontend/landing

# 解压
rm -rf /opt/shentong/frontend/landing/*
unzip /opt/shentong/landing-source-v0.5.0.zip -d /opt/shentong/frontend/landing/

# 安装依赖
npm ci

# 构建
npm run build
```

### 2.3 部署到 Nginx

```bash
# 备份旧版本
mv /usr/share/nginx/html/landing /usr/share/nginx/html/landing.bak.$(date +%Y%m%d%H%M%S)

# 部署新版本
cp -r /opt/shentong/frontend/landing/dist /usr/share/nginx/html/landing

# 设置权限
chown -R www:www /usr/share/nginx/html/landing
chmod -R 755 /usr/share/nginx/html/landing

# 验证
ls -la /usr/share/nginx/html/landing/
```

## 步骤 3: 验证

### 3.1 检查文件

```bash
# 检查 index.html
head -20 /usr/share/nginx/html/landing/index.html

# 检查 JS 文件
ls -la /usr/share/nginx/html/landing/assets/*.js
```

### 3.2 浏览器验证

1. 访问 https://zt.shentongapi.cn/landing/
2. 按 `Ctrl+Shift+R` 强制刷新
3. 检查版本号是否显示 `0.5.0`
4. 点击下载按钮测试

## 动态版本号工作原理

### API 调用

页面加载时会调用：

```
GET /api/client-versions/latest?platform=win
```

### 响应格式

```json
{
  "code": 0,
  "success": true,
  "data": {
    "id": 1,
    "version": "0.5.0",
    "platform": "win",
    "downloadUrl": "/desktop/ShenTongAI-Setup-0.5.0-x64.exe",
    "changelog": "V0.5.0 版本更新",
    "forceUpdate": false,
    "grayscalePercent": 100,
    "publishedAt": "2026-07-27",
    "isActive": true
  }
}
```

### 回退机制

如果 API 调用失败，页面会显示默认版本号 `0.5.0`。

## 后续更新流程

### 更新版本号

1. 发布新版本到后端（更新 `client_versions` 表）
2. 前端会自动获取最新版本号
3. 无需重新构建前端

### 更新页面内容

1. 修改后端 `landing_blocks` 表中的内容
2. 前端会自动获取最新内容
3. 无需重新构建前端

## 故障排查

### 版本号仍显示 0.1.0

```bash
# 检查 API 是否正常
curl https://zt.shentongapi.cn/api/client-versions/latest?platform=win

# 检查构建产物
ls -la /usr/share/nginx/html/landing/assets/

# 强制刷新浏览器缓存
# 按 Ctrl+Shift+R
```

### 下载按钮 404

```bash
# 检查文件是否存在
ls -la /usr/share/nginx/html/desktop/

# 检查 Nginx 配置
nginx -t
```

### 样式错乱

```bash
# 检查 CSS 文件
ls -la /usr/share/nginx/html/landing/assets/*.css

# 检查浏览器控制台错误
```

## 文件清单

- `frontend/landing/` - 新项目源码
- `deploy-landing.sh` - 服务器部署脚本
- `LANDING_DEPLOY_GUIDE.md` - 本指南
