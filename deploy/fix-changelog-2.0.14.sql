UPDATE client_versions SET changelog='修复：点击历史对话白屏（工具调用历史数据容错）' WHERE platform='win' AND version='2.0.14';
SELECT version, changelog FROM client_versions WHERE platform='win' AND version='2.0.14';
