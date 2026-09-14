-- 发布 2.1.8：停用旧记录 + 启用新版本（素材库页面收敛为「单层 · 两库」，去掉重复入口）
-- 生产库是 shentong（不是 ai_agent）；platform 必须是 win
-- 用法（服务器上）：sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-2.1.8.sql
-- 可重复执行：先删同版本记录再插入
-- NOTE: latin1 client charset double-encodes Chinese text; force utf8mb4
SET NAMES utf8mb4;
DELETE FROM client_versions WHERE platform='win' AND version='2.1.8';
UPDATE client_versions SET is_active=0 WHERE platform='win';
INSERT INTO client_versions (version,platform,download_url,changelog,force_update,grayscale_percent,published_at,is_active)
VALUES ('2.1.8','win','/desktop/ShenTongAI-Setup-2.1.8-x64.exe.zip','素材库页面去掉重复入口，只剩一层：此前页面里套了两层标签——外层是「素材库 / 合成视频 / 形象视频 / 音频素材 / 知识库」，内层才是「用户输入库 / 生成素材库」，而后四项跟两库看的是同一批素材，等于同一个东西开了两个门。现在外层全部撤掉，素材库页面只有一层：用户输入库 / 生成素材库，类别是该层下面的二级过滤。——原「合成视频」看到的口播工坊成片，在「生成素材库 · 视频」里同样能看能播，成片的任务视角仍在「口播工坊」；原「形象视频」「音频素材」看到的就是输入库里的形象和声音，创建入口统一在「口播工坊」（我的形象、声音克隆），素材库按「用户输入库 · 形象 / 声音」查看，不再两处各存一套；原「知识库」只是知识库的只读聚合，左侧菜单本来就有独立入口，故移除。另外：素材详情弹窗新增「下载」按钮，视频 / 音频可直接在素材库里预览与下载。本版仅桌面端改动，后端与数据库结构不变。',0,100,NOW(),1);
SELECT id,version,download_url,is_active FROM client_versions WHERE platform='win' ORDER BY published_at DESC LIMIT 3;
