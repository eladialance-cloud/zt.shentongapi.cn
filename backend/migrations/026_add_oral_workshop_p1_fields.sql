-- 026: create_oral_workshop_jobs 增加人设多维度字段（B4）、用户级配音参数（C4）、BGM（E3）与软删除（F3）
ALTER TABLE create_oral_workshop_jobs ADD COLUMN style VARCHAR(512) DEFAULT NULL COMMENT '口播风格' AFTER persona;
ALTER TABLE create_oral_workshop_jobs ADD COLUMN target_audience VARCHAR(255) DEFAULT NULL COMMENT '目标受众' AFTER style;
ALTER TABLE create_oral_workshop_jobs ADD COLUMN goal VARCHAR(2000) DEFAULT NULL COMMENT '创作目标' AFTER target_audience;
ALTER TABLE create_oral_workshop_jobs ADD COLUMN voice_speech_rate DECIMAL(4,2) DEFAULT NULL COMMENT '语速 0.5-1.5' AFTER voice_speaker_id;
ALTER TABLE create_oral_workshop_jobs ADD COLUMN voice_loudness_rate DECIMAL(5,2) DEFAULT NULL COMMENT '音量增益 -20~20' AFTER voice_speech_rate;
ALTER TABLE create_oral_workshop_jobs ADD COLUMN voice_emotion VARCHAR(16) DEFAULT NULL COMMENT '情感' AFTER voice_loudness_rate;
ALTER TABLE create_oral_workshop_jobs ADD COLUMN bgm_url VARCHAR(512) DEFAULT NULL COMMENT 'BGM URL' AFTER voice_emotion;
ALTER TABLE create_oral_workshop_jobs ADD COLUMN bgm_volume DECIMAL(3,2) DEFAULT NULL COMMENT 'BGM 音量 0-1' AFTER bgm_url;
ALTER TABLE create_oral_workshop_jobs ADD COLUMN deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间' AFTER updated_at;
ALTER TABLE digital_human_assets ADD COLUMN description VARCHAR(512) DEFAULT NULL COMMENT '形象描述' AFTER preview_url;
