-- 发布 2.1.5：停用旧记录 + 启用新版本
-- 生产库是 shentong（不是 ai_agent）；platform 必须是 win
-- 用法（服务器上）：sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-2.1.5.sql
-- 可重复执行：先删同版本记录再插入
-- NOTE: latin1 client charset double-encodes Chinese text; force utf8mb4
SET NAMES utf8mb4;
DELETE FROM client_versions WHERE platform='win' AND version='2.1.5';
UPDATE client_versions SET is_active=0 WHERE platform='win';
INSERT INTO client_versions (version,platform,download_url,changelog,force_update,grayscale_percent,published_at,is_active)
VALUES ('2.1.5','win','/desktop/ShenTongAI-Setup-2.1.5-x64.exe.zip','飞书链路按对标产品全面对齐：① 战略方向文档进 SOUL，中书省牵头创建并在编排时真实读取（中书省 4000 字、尚书省派发节点 800 字，5 分钟缓存，读取失败不阻塞）；② 多维表格 14→23 张，兵部 5 张 / 工部 3 张 / 礼部 3 张 / 中书省 3 张，新增 6 张共享表（主写官署回填、其余只读借用）；③ 官署产出自动落飞书（任务主表 + 归档索引表，只写文本列，接口失败不影响编排）；④ 战略表 V1.0 初始版本留痕 + 关键词种子预填；⑤ 定时任务 13→44 条按 24 小时节拍对齐（对外动作走业务流风控闸门）；⑥ flows 落表映射按 collection 修正（键写错会「有映射却找不到表」）；⑦ 官署详情飞书表新增「归属」列，标出共享表与主写官署，保存链接不再丢共享关系',0,100,NOW(),1);
SELECT id,version,download_url,is_active FROM client_versions WHERE platform='win' ORDER BY published_at DESC LIMIT 3;