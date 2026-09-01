-- 009_create_pricing_config.sql
-- 积分计费配置：消耗倍率、等级折扣、充值汇率
-- 在 system_config 表中新增 pricing section（代码层使用，不需要建表）
-- 在 credits_config 表中新增 pricing_multipliers 配置项

-- 1. MembershipPlanEntity 补充字段：level, period, benefits
-- 当前 entity 缺少 level/period/benefits 字段，前端 type 已有定义
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS level INT DEFAULT 0;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS period VARCHAR(32) DEFAULT '月';
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS benefits JSON;

-- 2. AgentEntity 补充定价模型关联字段
-- modelPricingStrategy: 'model' = 使用模型表价格, 'agent' = 使用 Agent 自身价格, 'hybrid' = 模型价格+Agent加价
ALTER TABLE eco_agents ADD COLUMN IF NOT EXISTS pricing_strategy VARCHAR(16) DEFAULT 'model';

-- 3. credit_transactions 补充 model_id 字段（记录计费关联的模型）
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS model_id VARCHAR(64);
