-- 006_payment_config.sql
-- 支付配置初始化：在 system_config 表中插入 payment section 默认配置
-- 管理后台可通过 系统参数 > 支付配置 Tab 修改

INSERT INTO `system_config` (`section`, `config_value`, `description`, `created_at`, `updated_at`)
SELECT 'payment',
       JSON_OBJECT(
         'wechat', JSON_OBJECT(
           'appId', '',
           'mchId', '',
           'apiV3Key', '',
           'serialNo', '',
           'privateKeyPath', '',
           'publicKeyPath', '',
           'notifyUrl', '',
           'callbackIps', '',
           'enabled', false
         ),
         'alipay', JSON_OBJECT(
           'appId', '',
           'privateKey', '',
           'publicKey', '',
           'notifyUrl', '',
           'enabled', false
         ),
         'stripe', JSON_OBJECT(
           'secretKey', '',
           'webhookSecret', '',
           'enabled', false
         )
       ),
       '支付渠道配置（微信/支付宝/Stripe），管理后台可编辑',
       NOW(),
       NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `system_config` WHERE `section` = 'payment'
);
