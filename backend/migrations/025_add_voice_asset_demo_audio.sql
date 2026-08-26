-- 025: voice_assets 增加克隆试听音频 demo_audio（火山复刻响应 demo_audio，用于「我的声音」试听）
ALTER TABLE voice_assets ADD COLUMN demo_audio VARCHAR(512) DEFAULT NULL COMMENT '克隆试听音频 URL（demo_audio）' AFTER speaker_id;
