-- 发布 2.1.4：停用旧记录 + 启用新版本
-- 生产库是 shentong（不是 ai_agent）；platform 必须是 win
-- 用法（服务器上）：sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-2.1.4.sql
-- 可重复执行：先删同版本记录再插入
-- NOTE: latin1 client charset double-encodes Chinese text; force utf8mb4
SET NAMES utf8mb4;
DELETE FROM client_versions WHERE platform='win' AND version='2.1.4';
UPDATE client_versions SET is_active=0 WHERE platform='win';
INSERT INTO client_versions (version,platform,download_url,changelog,force_update,grayscale_percent,published_at,is_active)
VALUES ('2.1.4','win','/desktop/ShenTongAI-Setup-2.1.4-x64.exe.zip','飞书多维表格已建过就复用，不再每点一次多建一份；修复「军机处·任务主表」整张建不出来（关联/公式字段降级）；工作台链接关掉页面后仍然可见；官署详情飞书表链接可直接打开；战略方向文档由中书省牵头创建',0,100,NOW(),1);
SELECT id,version,download_url,is_active FROM client_versions WHERE platform='win' ORDER BY published_at DESC LIMIT 3;