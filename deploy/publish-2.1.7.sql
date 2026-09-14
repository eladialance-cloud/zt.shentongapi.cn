-- 发布 2.1.7：停用旧记录 + 启用新版本（素材两库 / 画中画联动 / 口播工坊收敛 / 一键组队定时任务幂等）
-- 生产库是 shentong（不是 ai_agent）；platform 必须是 win
-- 用法（服务器上）：sudo docker exec -i shentong-mysql mysql --default-character-set=utf8mb4 -uroot shentong < /tmp/publish-2.1.7.sql
-- 可重复执行：先删同版本记录再插入
-- NOTE: latin1 client charset double-encodes Chinese text; force utf8mb4
SET NAMES utf8mb4;
DELETE FROM client_versions WHERE platform='win' AND version='2.1.7';
UPDATE client_versions SET is_active=0 WHERE platform='win';
INSERT INTO client_versions (version,platform,download_url,changelog,force_update,grayscale_percent,published_at,is_active)
VALUES ('2.1.7','win','/desktop/ShenTongAI-Setup-2.1.7-x64.exe.zip','素材库升级为「两库」：① 新增「用户输入库」（声音 / 形象 / 图片 / 视频 / 音频 / IP 档案 / 文档，你提供的原料）与「生成素材库」（文案 / 图片 / 视频 / 音频，软件产出的成品），素材库页顶部分库切换，列表与语义检索都按库过滤；② 数字人形象并入素材库统一管理，「我的形象」与素材库同一份数据，不再各存一套；③ 生成素材自动入库：官署（三省六部）任务产出、媒体生成任务、口播工坊任务产物完成即自动登记进生成库并标明来源，历史误记为「手动登记」的官署产出在启动迁移时自动纠正；④ 画中画 / 封面等上传的原料统一进输入库，不再散落各处。——画中画联动：口播工坊「素材与混剪」里对混剪建议点「加入画中画」即进入待用队列，任务工作台的画中画弹窗可直接「使用 / 全部加入 / 清空」（成片最多 4 个，用掉的自动出队，未用完的保留）。——口播工坊素材页收敛：上传 / 向量化 / 归档统一到素材库维护，页面只保留 AI 混剪建议、任务产物一键导入与只读取材列表，不再是与素材库重复的两套 UI。——修复「一键组队」重复写入定时任务：此前重跑一次会把默认定时任务翻倍（44 条变 88 条），现在按「标题 + 官署 + 触发时间 + 星期」幂等跳过、自动清理历史重复行、把历史上错建成每日任务的周任务修正为每周，且创建失败不再静默吞掉——界面如实显示新建 / 跳过 / 修正 / 清理条数',0,100,NOW(),1);
SELECT id,version,download_url,is_active FROM client_versions WHERE platform='win' ORDER BY published_at DESC LIMIT 3;
