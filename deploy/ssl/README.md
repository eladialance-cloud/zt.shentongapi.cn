# SSL 证书放置说明

部署前请将 SSL 证书文件放置到此目录的上级 `nginx/ssl/` 目录：

```
nginx/ssl/
├── zt.shentongapi.cn.crt   # 证书文件
└── zt.shentongapi.cn.key   # 私钥文件
```

## 获取证书

1. 使用 Let's Encrypt 免费签发：`certbot certonly --standalone -d zt.shentongapi.cn`
2. 或从证书服务商购买

## 部署

将证书复制到服务器 `/opt/shentong/nginx/ssl/` 目录，docker-compose 会自动挂载到 nginx 容器。
