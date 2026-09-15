-- 发布 2.1.9：停用旧记录 + 启用新版本（生成素材库新增「来源」筛选：口播成片 / 官署产出 / 媒体生成 / 任务输出）
-- 生产库是 shentong（不是 ai_agent）；platform 必须是 win
-- 用法（服务器上）：sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-2.1.9.sql
-- 可重复执行：先删同版本记录再插入
-- NOTE: latin1 client charset double-encodes Chinese text; force utf8mb4
SET NAMES utf8mb4;
DELETE FROM client_versions WHERE platform='win' AND version='2.1.9';
UPDATE client_versions SET is_active=0 WHERE platform='win';
INSERT INTO client_versions (version,platform,download_url,changelog,force_update,grayscale_percent,published_at,is_active)
VALUES ('2.1.9','win','/desktop/ShenTongAI-Setup-2.1.9-x64.exe.zip','素材库「生成素材库」新增「来源」筛选：全部来源 / 口播成片 / 官署产出 / 媒体生成 / 任务输出，一个下拉就能把口播成片单独拎出来——替代上一版删掉的「合成视频」入口，不用再多一层标签页。「口播成片」按素材标签精确匹配，历史手动导入的成片同样筛得到。另外：素材详情里的「来源」补全了「官署产出 / 业务流」两种（此前这两种会一律显示成「手动登记」）。本版含后端改动（素材列表新增标签精确过滤），后端已先行部署。',0,100,NOW(),1);
SELECT id,version,download_url,is_active FROM client_versions WHERE platform='win' ORDER BY published_at DESC LIMIT 3;
