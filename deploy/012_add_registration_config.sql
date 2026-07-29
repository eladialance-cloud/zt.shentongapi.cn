-- 注册配置：邀请码默认不必填
INSERT INTO `system_config` (`section`, `config_value`, `description`)
VALUES ('registration', '{"inviteCodeRequired": false}', '注册配置：邀请码是否必填')
ON DUPLICATE KEY UPDATE `config_value` = VALUES(`config_value`), `description` = VALUES(`description`);

-- 验证
SELECT * FROM `system_config` WHERE `section` = 'registration';
