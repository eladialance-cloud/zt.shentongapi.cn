-- 030: P4 对齐批次（发布层多账号/素材库/字幕编辑配置）
-- 发布层：publish_plans 批量发布账号（JSON 数组，兼容单账号 account_id）
ALTER TABLE publish_plans ADD COLUMN account_ids JSON DEFAULT NULL COMMENT '批量发布账号(F4a/P4)' AFTER account_id;

-- 素材管理库（画中画/混剪/背景素材，对标参考软件"素材管理"）
CREATE TABLE IF NOT EXISTS oral_workshop_materials (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL COMMENT '所属用户',
  name VARCHAR(128) NOT NULL COMMENT '素材名称',
  type VARCHAR(16) NOT NULL COMMENT 'image/video/audio',
  category VARCHAR(32) NOT NULL DEFAULT 'uncategorized' COMMENT '素材分类',
  url VARCHAR(512) NOT NULL COMMENT '素材 URL',
  preview_url VARCHAR(512) DEFAULT NULL COMMENT '缩略图/预览 URL',
  status VARCHAR(16) NOT NULL DEFAULT 'ready' COMMENT 'ready=就绪 / vector_pending=向量化中',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_owm_user (user_id),
  KEY idx_owm_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='口播工坊素材库(P4)';

-- E4 字幕编辑配置升级（分段 + 顶部大小标题 + 动画模板 + 每行画中画）
ALTER TABLE oral_workshop_jobs ADD COLUMN subtitles_config TEXT DEFAULT NULL COMMENT 'E4 字幕编辑配置 JSON' AFTER subtitles_override;
