-- 发布 2.1.2：停用旧记录 + 启用新版本
-- 生产库是 shentong（不是 ai_agent）；platform 必须是 win
-- 用法（服务器上）：sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-2.1.2.sql
-- 可重复执行：先删同版本记录再插入
-- NOTE: latin1 client charset double-encodes Chinese text; force utf8mb4
SET NAMES utf8mb4;
DELETE FROM client_versions WHERE platform='win' AND version='2.1.2';
UPDATE client_versions SET is_active=0 WHERE platform='win';
INSERT INTO client_versions (version,platform,download_url,changelog,force_update,grayscale_percent,published_at,is_active)
VALUES ('2.1.2','win','/desktop/ShenTongAI-Setup-2.1.2-x64.exe.zip','修复设置-环境组件显示未安装且无法安装：内置 Python 现在随安装包分发，并识别自定义运行时目录与新版 Hermes 运行时布局；环境组件页新增「如何处理」说明',0,100,NOW(),1);
SELECT id,version,download_url,is_active FROM client_versions WHERE platform='win' ORDER BY published_at DESC LIMIT 3;