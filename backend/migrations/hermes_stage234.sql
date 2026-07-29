-- Hermes 模块阶段2-4迭代：数据库迁移
-- 1. 给 hermes_skills 表添加新字段（category, avg_rating, rating_count, tags, changelog）
-- 2. 创建 hermes_skill_ratings 评分表
-- 3. 预置技能包数据（10条，含分类和标签）

-- ============================================================
-- 1. 扩展 hermes_skills 表
-- ============================================================
-- exec_config 字段已在 hermes_stage1.sql 中添加，此处不再重复
ALTER TABLE `hermes_skills` ADD COLUMN `category` VARCHAR(64) NULL COMMENT '技能分类';
ALTER TABLE `hermes_skills` ADD COLUMN `avg_rating` DECIMAL(3,2) DEFAULT 0.00 COMMENT '平均评分';
ALTER TABLE `hermes_skills` ADD COLUMN `rating_count` INT DEFAULT 0 COMMENT '评分数';
ALTER TABLE `hermes_skills` ADD COLUMN `tags` JSON NULL COMMENT '标签数组';
ALTER TABLE `hermes_skills` ADD COLUMN `changelog` TEXT NULL COMMENT '更新日志';

-- ============================================================
-- 2. 创建评分表
-- ============================================================
CREATE TABLE IF NOT EXISTS `hermes_skill_ratings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `skill_id` BIGINT NOT NULL,
  `rating` INT NOT NULL,
  `comment` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_skill` (`user_id`, `skill_id`),
  INDEX `idx_hermes_rating_user` (`user_id`),
  INDEX `idx_hermes_rating_skill` (`skill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. 预置技能包数据
-- ============================================================

-- 文档处理类
INSERT INTO `hermes_skills` (`name`, `description`, `author`, `price_per_minute`, `install_count`, `version`, `is_active`, `category`, `tags`, `avg_rating`, `rating_count`, `exec_config`, `created_at`, `updated_at`) VALUES
('PDF摘要生成', '上传PDF文件，自动提取正文并生成结构化摘要', '深瞳官方', 5, 0, '1.0.0', true, '文档处理', '["pdf","摘要","文档"]', 4.50, 2,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/document/summary","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"content\\":\\"{{input.content}}\\",\\"maxLength\\":{{input.maxLength}}}","timeoutMs":30000,"inputSchema":{"content":{"type":"string","required":true},"maxLength":{"type":"number","required":false}}}',
  NOW(), NOW()),

('语音转文字', '基于 Whisper 模型将语音文件转换为文字', '深瞳官方', 10, 0, '1.0.0', true, '文档处理', '["whisper","语音","ASR"]', 4.80, 5,
  '{"type":"shell","command":"whisper --model base --output_format json --output_dir /tmp/whisper_out {{input.file}}","timeoutMs":120000,"inputSchema":{"file":{"type":"string","required":true}}}',
  NOW(), NOW()),

('网页内容提取', '提取网页正文内容，去除广告、导航等无关元素', '深瞳官方', 2, 0, '1.0.0', true, '文档处理', '["网页","提取","爬虫"]', 4.20, 1,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/extract","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"url\\":\\"{{input.url}}\\"}","timeoutMs":15000,"inputSchema":{"url":{"type":"string","required":true}}}',
  NOW(), NOW()),

('图片OCR识别', '对图片进行文字识别，支持中英文', '深瞳官方', 3, 0, '1.0.0', true, '文档处理', '["OCR","图片","识别"]', 4.00, 0,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/ocr","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"image\\":\\"{{input.image}}\\",\\"lang\\":\\"{{input.lang}}\\"}","timeoutMs":30000,"inputSchema":{"image":{"type":"string","required":true},"lang":{"type":"string","required":false}}}',
  NOW(), NOW());

-- Agent 编排类
INSERT INTO `hermes_skills` (`name`, `description`, `author`, `price_per_minute`, `install_count`, `version`, `is_active`, `category`, `tags`, `avg_rating`, `rating_count`, `exec_config`, `created_at`, `updated_at`) VALUES
('智能问答Agent', '基于知识库的智能问答，支持多轮对话', '深瞳官方', 8, 0, '1.0.0', true, 'AI Agent', '["问答","知识库","对话"]', 4.60, 3,
  '{"type":"script","language":"javascript","code":"const resp = await fetch(\\\"/api/agent/chat\\\", {\\n  method: \\\"POST\\\",\\n  headers: { \\\"Content-Type\\\": \\\"application/json\\\" },\\n  body: JSON.stringify({ message: input.question, sessionId: input.sessionId })\\n});\\nreturn resp.json();","timeoutMs":60000,"inputSchema":{"question":{"type":"string","required":true},"sessionId":{"type":"string","required":false}}}',
  NOW(), NOW()),

('代码审查', '对代码进行自动化审查，发现潜在问题', '深瞳官方', 6, 0, '1.0.0', true, 'AI Agent', '["代码","审查","review"]', 4.30, 1,
  '{"type":"script","language":"javascript","code":"const resp = await fetch(\\\"/api/agent/code-review\\\", {\\n  method: \\\"POST\\\",\\n  headers: { \\\"Content-Type\\\": \\\"application/json\\\" },\\n  body: JSON.stringify({ code: input.code, language: input.language })\\n});\\nreturn resp.json();","timeoutMs":60000,"inputSchema":{"code":{"type":"string","required":true},"language":{"type":"string","required":true}}}',
  NOW(), NOW());

-- 工具调用类
INSERT INTO `hermes_skills` (`name`, `description`, `author`, `price_per_minute`, `install_count`, `version`, `is_active`, `category`, `tags`, `avg_rating`, `rating_count`, `exec_config`, `created_at`, `updated_at`) VALUES
('MCP文件搜索', '通过MCP协议搜索本地文件', '深瞳官方', 1, 0, '1.0.0', true, '工具调用', '["MCP","文件","搜索"]', 3.80, 0,
  '{"type":"script","language":"javascript","code":"return { status: \\\"pending\\\", message: \\\"请通过 tool_call 类型调用\\\" };","timeoutMs":10000,"inputSchema":{"keyword":{"type":"string","required":true},"path":{"type":"string","required":false}}}',
  NOW(), NOW()),

('翻译助手', '多语言翻译，支持中英日韩等语言', '深瞳官方', 2, 0, '1.0.0', true, '工具调用', '["翻译","多语言","translate"]', 4.70, 4,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/translate","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"text\\":\\"{{input.text}}\\",\\"from\\":\\"{{input.from}}\\",\\"to\\":\\"{{input.to}}\\"}","timeoutMs":15000,"inputSchema":{"text":{"type":"string","required":true},"from":{"type":"string","required":false},"to":{"type":"string","required":true}}}',
  NOW(), NOW());

-- 数据处理类
INSERT INTO `hermes_skills` (`name`, `description`, `author`, `price_per_minute`, `install_count`, `version`, `is_active`, `category`, `tags`, `avg_rating`, `rating_count`, `exec_config`, `created_at`, `updated_at`) VALUES
('数据清洗', '对 CSV/JSON 数据进行清洗、去重、格式化', '深瞳官方', 3, 0, '1.0.0', true, '数据处理', '["数据","清洗","去重"]', 4.10, 1,
  '{"type":"script","language":"javascript","code":"const data = input.data || [];\\nconst field = input.field || \\\"id\\\";\\nconst seen = new Set();\\nconst cleaned = data.filter(item => {\\n  const key = item[field];\\n  if (seen.has(key)) return false;\\n  seen.add(key);\\n  return true;\\n});\\nreturn { original: data.length, cleaned: cleaned.length, data: cleaned };","timeoutMs":30000,"inputSchema":{"data":{"type":"array","required":true},"field":{"type":"string","required":false}}}',
  NOW(), NOW()),

('文本情感分析', '分析文本的情感倾向（正面/负面/中性）', '深瞳官方', 2, 0, '1.0.0', true, '数据处理', '["情感","NLP","分析"]', 4.40, 2,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/sentiment","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"text\\":\\"{{input.text}}\\"}","timeoutMs":15000,"inputSchema":{"text":{"type":"string","required":true}}}',
  NOW(), NOW());

-- ============================================================
-- 4. 示例评分数据
-- ============================================================
INSERT INTO `hermes_skill_ratings` (`user_id`, `skill_id`, `rating`, `comment`, `created_at`) VALUES
(1, 2, 5, '识别准确率很高，中文识别效果出乎意料', NOW()),
(1, 5, 4, '多轮对话体验不错，偶尔会有上下文丢失', NOW()),
(1, 8, 5, '翻译质量很好，速度快', NOW()),
(2, 2, 4, '效果不错但耗积分有点多', NOW()),
(2, 8, 5, '多语言翻译很实用，推荐', NOW()),
(2, 10, 4, '情感分析准确度可以接受', NOW()),
(3, 5, 5, '智能问答比预期好很多', NOW()),
(3, 8, 4, '翻译不错，某些专业术语需要优化', NOW()),
(3, 6, 4, '代码审查发现了几个潜在bug', NOW()),
(3, 10, 5, '情感分析很准确', NOW()),
(1, 10, 4, '基本够用，期待支持更多语言', NOW()),
(2, 5, 5, '知识库问答非常好用', NOW()),
(2, 6, 4, '代码审查功能实用', NOW()),
(3, 2, 5, '语音转文字效率提升明显', NOW()),
(1, 1, 4, 'PDF摘要生成的质量不错', NOW()),
(3, 1, 5, '节省了大量阅读时间', NOW()),
(2, 1, 5, '摘要准确，格式清晰', NOW()),
(3, 8, 5, '翻译速度和质量都满意', NOW());
