# 深瞳AI 桌面端下载服务 — Nginx 配置

## 目录结构

```
/opt/shentong/updates/          # 桌面端发布目录（Nginx 静态文件根）
├── index.html                  # 下载页面（自动生成）
├── latest.yml                  # electron-updater 自动更新清单
├── ShenTongAI-Portable-0.2.9-x64.zip   # 压缩包（免安装）
└── ShenTongAI-Setup-0.2.9-x64.exe      # NSIS 安装包
```

## Nginx 配置

在服务器 Nginx 配置中添加：

```nginx
# 深瞳AI 桌面端下载服务
location /desktop/ {
    alias /opt/shentong/updates/;
    autoindex on;
    autoindex_exact_size off;
    autoindex_localtime on;

    # 允许跨域（electron-updater 需要）
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, HEAD, OPTIONS';
    add_header Access-Control-Allow-Headers 'Range, Content-Type';

    # 大文件下载优化
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;

    # 限速（可选，防止带宽打满）
    # limit_conn addr 10;
    # limit_rate 2048k;  # 2MB/s per connection

    # MIME 类型
    types {
        application/octet-stream exe zip;
        text/yaml yml;
        text/html html;
    }

    # Cache-Control（安装包不常变，但 latest.yml 需要实时）
    location ~* \.yml$ {
        alias /opt/shentong/updates/;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Access-Control-Allow-Origin *;
    }

    location ~* \.(exe|zip)$ {
        alias /opt/shentong/updates/;
        add_header Cache-Control "public, max-age=3600";
        add_header Access-Control-Allow-Origin *;
    }
}
```

## 验证

```bash
# 检查文件是否可访问
curl -I https://zt.shentongapi.cn/desktop/latest.yml
curl -I https://zt.shentongapi.cn/desktop/ShenTongAI-Portable-0.2.9-x64.zip

# 检查目录列表
curl https://zt.shentongapi.cn/desktop/
```

## 目录权限

```bash
sudo chown -R www-data:www-data /opt/shentong/updates/
sudo chmod -R 755 /opt/shentong/updates/
```
