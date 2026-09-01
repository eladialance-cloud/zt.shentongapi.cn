-- Hermes 模块阶段1迭代：数据库迁移
-- 1. 给 create_hermes_skills 表添加 exec_config 字段
-- 2. 预置技能包数据

-- ============================================================
-- 1. 添加 exec_config 字段
-- ============================================================
ALTER TABLE `create_hermes_skills` ADD COLUMN `exec_config` JSON NULL COMMENT '执行配置（JSON）';

-- ============================================================
-- 2. 预置技能包数据
-- ============================================================

-- 文档处理类
INSERT INTO `create_hermes_skills` (`name`, `description`, `author`, `price_per_minute`, `install_count`, `version`, `is_active`, `exec_config`, `created_at`, `updated_at`) VALUES
('PDF摘要生成', '上传PDF文件，自动提取正文并生成结构化摘要', '深瞳官方', 5, 0, '1.0.0', true,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/document/summary","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"content\\":\\"{{input.content}}\\",\\"maxLength\\":{{input.maxLength}}}","timeoutMs":30000,"inputSchema":{"content":{"type":"string","required":true},"maxLength":{"type":"number","required":false}}}',
  NOW(), NOW()),

('语音转文字', '基于 Whisper 模型将语音文件转换为文字', '深瞳官方', 10, 0, '1.0.0', true,
  '{"type":"shell","command":"whisper --model base --output_format json --output_dir /tmp/whisper_out {{input.file}}","timeoutMs":120000,"inputSchema":{"file":{"type":"string","required":true}}}',
  NOW(), NOW()),

('网页内容提取', '提取网页正文内容，去除广告、导航等无关元素', '深瞳官方', 2, 0, '1.0.0', true,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/extract","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"url\\":\\"{{input.url}}\\"}","timeoutMs":15000,"inputSchema":{"url":{"type":"string","required":true}}}',
  NOW(), NOW()),

('图片OCR识别', '对图片进行文字识别，支持中英文', '深瞳官方', 3, 0, '1.0.0', true,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/ocr","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"image\\":\\"{{input.image}}\\",\\"lang\\":\\"{{input.lang}}\\"}","timeoutMs":30000,"inputSchema":{"image":{"type":"string","required":true},"lang":{"type":"string","required":false}}}',
  NOW(), NOW());

-- Agent 编排类
INSERT INTO `create_hermes_skills` (`name`, `description`, `author`, `price_per_minute`, `install_count`, `version`, `is_active`, `exec_config`, `created_at`, `updated_at`) VALUES
('智能问答Agent', '基于知识库的智能问答，支持多轮对话', '深瞳官方', 8, 0, '1.0.0', true,
  '{"type":"script","language":"javascript","code":"// 调用后端 Agent 接口\\nconst resp = await fetch(\\\"/api/agent/chat\\\", {\\n  method: \\\"POST\\\",\\n  headers: { \\\"Content-Type\\\": \\\"application/json\\\" },\\n  body: JSON.stringify({ message: input.question, sessionId: input.sessionId })\\n});\\nreturn resp.json();","timeoutMs":60000,"inputSchema":{"question":{"type":"string","required":true},"sessionId":{"type":"string","required":false}}}',
  NOW(), NOW()),

('代码审查', '对代码进行自动化审查，发现潜在问题', '深瞳官方', 6, 0, '1.0.0', true,
  '{"type":"script","language":"javascript","code":"const resp = await fetch(\\\"/api/agent/code-review\\\", {\\n  method: \\\"POST\\\",\\n  headers: { \\\"Content-Type\\\": \\\"application/json\\\" },\\n  body: JSON.stringify({ code: input.code, language: input.language })\\n});\\nreturn resp.json();","timeoutMs":60000,"inputSchema":{"code":{"type":"string","required":true},"language":{"type":"string","required":true}}}',
  NOW(), NOW());

-- 工具调用类
INSERT INTO `create_hermes_skills` (`name`, `description`, `author`, `price_per_minute`, `install_count`, `version`, `is_active`, `exec_config`, `created_at`, `updated_at`) VALUES
('MCP文件搜索', '通过MCP协议搜索本地文件', '深瞳官方', 1, 0, '1.0.0', true,
  '{"type":"script","language":"javascript","code":"// 通过 MCP 调用文件搜索工具\\n// 实际由 Hermes 编排引擎转发到 MCP Service\\nreturn { status: \\\"pending\\\", message: \\\"请通过 tool_call 类型调用\\\" };","timeoutMs":10000,"inputSchema":{"keyword":{"type":"string","required":true},"path":{"type":"string","required":false}}}',
  NOW(), NOW()),

('翻译助手', '多语言翻译，支持中英日韩等语言', '深瞳官方', 2, 0, '1.0.0', true,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/translate","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"text\\":\\"{{input.text}}\\",\\"from\\":\\"{{input.from}}\\",\\"to\\":\\"{{input.to}}\\"}","timeoutMs":15000,"inputSchema":{"text":{"type":"string","required":true},"from":{"type":"string","required":false},"to":{"type":"string","required":true}}}',
  NOW(), NOW());

-- 数据处理类
INSERT INTO `create_hermes_skills` (`name`, `description`, `author`, `price_per_minute`, `install_count`, `version`, `is_active`, `exec_config`, `created_at`, `updated_at`) VALUES
('数据清洗', '对 CSV/JSON 数据进行清洗、去重、格式化', '深瞳官方', 3, 0, '1.0.0', true,
  '{"type":"script","language":"javascript","code":"// 数据清洗脚本\\nconst data = input.data || [];\\nconst field = input.field || \\\"id\\\";\\n// 去重\\nconst seen = new Set();\\nconst cleaned = data.filter(item => {\\n  const key = item[field];\\n  if (seen.has(key)) return false;\\n  seen.add(key);\\n  return true;\\n});\\nreturn { original: data.length, cleaned: cleaned.length, data: cleaned };","timeoutMs":30000,"inputSchema":{"data":{"type":"array","required":true},"field":{"type":"string","required":false}}}',
  NOW(), NOW()),

('文本情感分析', '分析文本的情感倾向（正面/负面/中性）', '深瞳官方', 2, 0, '1.0.0', true,
  '{"type":"api","url":"https://api.shentongapi.cn/v1/sentiment","method":"POST","headers":{"Content-Type":"application/json"},"bodyTemplate":"{\\"text\\":\\"{{input.text}}\\"}","timeoutMs":15000,"inputSchema":{"text":{"type":"string","required":true}}}',
  NOW(), NOW());
