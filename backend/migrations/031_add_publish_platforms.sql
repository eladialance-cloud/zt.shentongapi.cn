-- 031: 发布账号真实绑定（桌面端扫码）+ 平台开关 + 素材向量化预留
-- 1) create_publish_accounts 加真实登录态字段（对标 platform_accounts：display_name/cookies/last_login_at/status）
ALTER TABLE create_publish_accounts ADD COLUMN display_name VARCHAR(128) DEFAULT NULL COMMENT '平台显示名称（登录后回填）' AFTER account_name;
ALTER TABLE create_publish_accounts ADD COLUMN cookies TEXT DEFAULT NULL COMMENT '平台登录态 cookie（AES-256-GCM 加密）' AFTER avatar_url;
ALTER TABLE create_publish_accounts ADD COLUMN last_login_at DATETIME DEFAULT NULL COMMENT '最后登录时间' AFTER bound_at;
ALTER TABLE create_publish_accounts ADD COLUMN login_status VARCHAR(16) NOT NULL DEFAULT 'offline' COMMENT '登录态: online/expired/offline' AFTER status;

-- 2) 发布平台开关（管理后台只做开关；账号绑定在桌面端完成）
CREATE TABLE IF NOT EXISTS create_oral_workshop_publish_platforms (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(32) NOT NULL UNIQUE COMMENT '平台 id: douyin/kuaishou/bilibili/xiaohongshu/xigua/wx_channels',
  display_name VARCHAR(64) NOT NULL COMMENT '平台显示名',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  remark VARCHAR(255) DEFAULT NULL COMMENT '说明',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='口播工坊发布平台开关(P0-G3)';

INSERT INTO create_oral_workshop_publish_platforms (platform, display_name, enabled, sort_order, remark) VALUES
('douyin', '抖音', 1, 1, '扫码登录绑定'),
('kuaishou', '快手', 1, 2, '扫码登录绑定'),
('xiaohongshu', '小红书', 1, 3, '扫码登录绑定；自动发布受限，建议手动'),
('bilibili', 'B站', 1, 4, '扫码/账号登录绑定'),
('xigua', '西瓜视频', 1, 5, '扫码登录绑定'),
('wx_channels', '蝴蝶号', 1, 6, '微信视频号，扫码登录绑定')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), sort_order = VALUES(sort_order);

-- 3) 素材库向量化字段：oral_workshop_materials 已于 P3 合并至 media_assets，无需补列
