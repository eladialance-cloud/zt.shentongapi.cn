-- 发布 2.0.15：停用旧记录 + 启用新版本
-- 生产库是 shentong（不是 ai_agent）；platform 必须是 win
UPDATE client_versions SET is_active=0 WHERE platform='win';
INSERT INTO client_versions (version,platform,download_url,changelog,force_update,grayscale_percent,published_at,is_active)
VALUES ('2.0.15','win','/desktop/ShenTongAI-Setup-2.0.15-x64.exe.zip','合并对话入口为「深瞳机器人」；修复渠道 Webhook 回调地址显示错误',0,100,NOW(),1);
SELECT id,version,download_url,is_active FROM client_versions WHERE platform='win' ORDER BY published_at DESC LIMIT 3;
