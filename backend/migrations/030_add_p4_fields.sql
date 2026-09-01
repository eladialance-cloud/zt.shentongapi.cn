-- 030: P4 对齐批次（发布层多账号/素材库/字幕编辑配置）
-- 发布层：create_publish_plans 批量发布账号（JSON 数组，兼容单账号 account_id）
ALTER TABLE create_publish_plans ADD COLUMN account_ids JSON DEFAULT NULL COMMENT '批量发布账号(F4a/P4)' AFTER account_id;

-- 注：oral_workshop_materials 已于 P3 合并至 media_assets（biz_type='media'），不再建表

-- E4 字幕编辑配置升级（分段 + 顶部大小标题 + 动画模板 + 每行画中画）
ALTER TABLE create_oral_workshop_jobs ADD COLUMN subtitles_config TEXT DEFAULT NULL COMMENT 'E4 字幕编辑配置 JSON' AFTER subtitles_override;
