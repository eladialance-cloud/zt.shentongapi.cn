-- ============================================================
-- 001_create_agent_department.sql
-- Agent部门分类表（动态分类替代固定enum）
-- ============================================================

CREATE TABLE IF NOT EXISTS `agent_department` (
  `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL COMMENT '部门名称',
  `code` VARCHAR(32) NOT NULL COMMENT '部门编码，如 office/programming/copywriting/data_analysis/other',
  `icon` VARCHAR(256) NULL COMMENT '图标URL',
  `sort_order` INT DEFAULT 0 COMMENT '排序',
  `is_active` TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent部门分类表';
