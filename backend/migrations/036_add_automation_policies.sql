-- 自动化安全策略表（A2 管理后台：高危操作/敏感域名黑名单）
CREATE TABLE IF NOT EXISTS automation_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  policy_key VARCHAR(64) NOT NULL COMMENT '策略键（high_risk_ops/domain_blacklist）',
  policy_value JSON NOT NULL COMMENT '策略内容（数组）',
  description VARCHAR(512) DEFAULT NULL COMMENT '策略说明',
  updated_by BIGINT DEFAULT NULL COMMENT '最后修改管理员',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_automation_policies_key (policy_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='自动化安全策略';

INSERT IGNORE INTO automation_policies (policy_key, policy_value, description) VALUES
('high_risk_ops', '["delete_file","format_disk","execute_system_command","modify_system_config"]', '高危操作类型（需 IM 二次确认）'),
('domain_blacklist', '[]', '敏感域名黑名单（浏览器自动化）');