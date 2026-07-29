-- ============================================================
-- RAG 模块 SQL 迁移：为 knowledge_base_chunks 添加 FULLTEXT 索引
-- 项目：深瞳AI智能中台 (shentong-ai-backend)
-- 日期：2026-07-09
-- 说明：支持 RAG 模块基于 MySQL FULLTEXT 的全文检索
-- ============================================================

-- 检查并添加 FULLTEXT 索引（使用存储过程实现幂等）
-- 注意：MySQL 8.0 的 InnoDB 支持 FULLTEXT 索引（仅限 CHAR/VARCHAR/TEXT 列）

-- 如果索引已存在则先删除（确保幂等）
-- 注意：FULLTEXT 索引名由 MySQL 自动生成或手动指定
ALTER TABLE `knowledge_base_chunks`
  DROP INDEX IF EXISTS `ft_chunks_content`;

-- 添加 FULLTEXT 索引到 content 列
-- 使用 ngram 解析器以支持中文分词（MySQL 8.0+）
-- ngram_token_size 默认为 2，可通过系统变量 ngram_token_size 调整
ALTER TABLE `knowledge_base_chunks`
  ADD FULLTEXT INDEX `ft_chunks_content` (`content`) WITH PARSER ngram;

-- 验证索引创建
-- 执行后可运行以下查询确认：
-- SHOW INDEX FROM knowledge_base_chunks WHERE Index_type = 'FULLTEXT';

-- ============================================================
-- 可选：调整 ngram_token_size（需要重启 MySQL，影响所有 FULLTEXT 索引）
-- 对于中文检索，token_size=2 通常足够
-- 如需修改，在 my.cnf / my.ini 中添加：
-- [mysqld]
-- ngram_token_size=2
-- ============================================================
