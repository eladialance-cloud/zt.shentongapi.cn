-- 027: create_publish_plans 增加发布状态跟踪（F5）；E3 BGM 库表（系统级，管理后台维护）
ALTER TABLE create_publish_plans ADD COLUMN publish_status VARCHAR(16) NOT NULL DEFAULT 'unpublish' COMMENT '发布状态: unpublish/publishing/success/failed/partial' AFTER status;

CREATE TABLE IF NOT EXISTS oral_workshop_bgm (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL COMMENT '音乐名',
  url VARCHAR(512) NOT NULL COMMENT '音乐文件 URL（/uploads/ 或公网）',
  category VARCHAR(64) DEFAULT NULL COMMENT '分类/标签',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='口播工坊系统 BGM 库';
