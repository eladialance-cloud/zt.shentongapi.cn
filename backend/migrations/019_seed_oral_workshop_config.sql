-- 口播工坊引擎开关配置（M8-4）
-- 对应：backend/src/modules/admin-system/admin-system.service.ts 的 DEFAULT_SECTION_CONFIG.oral_workshop
-- 说明：volcano=火山方舟（默认）/ local=本地 IndexTTS2 v2.0（预留，未接入）；管理后台 系统参数-口播工坊 可见可改
INSERT INTO system_config (section, config_value, description)
VALUES (
  'oral_workshop',
  JSON_OBJECT('voiceEngine', 'volcano', 'digitalHumanEngine', 'volcano', 'watermarkEnabled', TRUE, 'maxConcurrentJobs', 2),
  '口播工坊引擎开关（voiceEngine/digitalHumanEngine: volcano|local）'
)
ON DUPLICATE KEY UPDATE description = VALUES(description);
