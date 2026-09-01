-- 029: P2 能力层字段
-- D6 数字人生成方式显式选择（auto/cloud/local）
ALTER TABLE create_oral_workshop_jobs ADD COLUMN dh_generation_mode VARCHAR(8) NOT NULL DEFAULT 'auto' COMMENT '数字人生成方式 auto/cloud/local' AFTER dh_model_version;
-- D3 多镜头拼接（JSON 数组 [{digitalHumanId, seconds}]）
ALTER TABLE create_oral_workshop_jobs ADD COLUMN shots TEXT DEFAULT NULL COMMENT '多镜头 JSON [{digitalHumanId,seconds}]' AFTER dh_generation_mode;
-- E7 多轨道独立控制：字幕轨开关（默认开）
ALTER TABLE create_oral_workshop_jobs ADD COLUMN subtitles_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '字幕轨开关(E7)' AFTER bilingual;
-- E7 背景音乐轨开关（默认开；关闭后即使配置了 BGM 也不混入）
ALTER TABLE create_oral_workshop_jobs ADD COLUMN bgm_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'BGM 轨开关(E7)' AFTER subtitles_enabled;
-- E4 字幕文本覆盖（多行，每行一条字幕；留空=按文案自动分段）
ALTER TABLE create_oral_workshop_jobs ADD COLUMN subtitles_override TEXT DEFAULT NULL COMMENT 'E4 字幕文本覆盖' AFTER bgm_enabled;
-- D2 上传建形象：形象类型（cloud=火山形象ID / video=本地上传视频）+ 视频 URL
ALTER TABLE digital_human_assets ADD COLUMN kind VARCHAR(8) NOT NULL DEFAULT 'cloud' COMMENT 'cloud=火山形象ID / video=本地上传视频' AFTER cloud_id;
ALTER TABLE digital_human_assets ADD COLUMN video_url VARCHAR(512) DEFAULT NULL COMMENT '本地视频形象 URL(D2)' AFTER preview_url;
-- F4a 发布账号：create_publish_plans 关联账号
ALTER TABLE create_publish_plans ADD COLUMN account_id BIGINT DEFAULT NULL COMMENT '发布账号(F4a)' AFTER publish_status;

-- F4a 发布账号表（抖音/快手/小红书/B站，用户级）
CREATE TABLE IF NOT EXISTS create_publish_accounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL COMMENT '所属用户',
  platform VARCHAR(32) NOT NULL COMMENT 'douyin/kuaishou/xiaohongshu/bilibili',
  account_name VARCHAR(128) NOT NULL COMMENT '账号昵称',
  avatar_url VARCHAR(512) DEFAULT NULL COMMENT '头像 URL',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending=待授权 active=已绑定 failed=失效',
  bound_at DATETIME DEFAULT NULL COMMENT '绑定时间',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pa_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='口播工坊发布账号(F4a)';
