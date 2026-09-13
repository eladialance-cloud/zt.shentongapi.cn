-- 发布 2.1.3：停用旧记录 + 启用新版本
-- 生产库是 shentong（不是 ai_agent）；platform 必须是 win
-- 用法（服务器上）：sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-2.1.3.sql
-- 可重复执行：先删同版本记录再插入
-- NOTE: latin1 client charset double-encodes Chinese text; force utf8mb4
SET NAMES utf8mb4;
DELETE FROM client_versions WHERE platform='win' AND version='2.1.3';
UPDATE client_versions SET is_active=0 WHERE platform='win';
INSERT INTO client_versions (version,platform,download_url,changelog,force_update,grayscale_percent,published_at,is_active)
VALUES ('2.1.3','win','/desktop/ShenTongAI-Setup-2.1.3-x64.exe.zip','修复官署套餐（编制）未生效：选轻量版后任务中心与 AI 办公室只显示套餐内官署，重启不再变回全部；AI 办公室移除内置假员工，按实际组建的官署显示人数',0,100,NOW(),1);
SELECT id,version,download_url,is_active FROM client_versions WHERE platform='win' ORDER BY published_at DESC LIMIT 3;