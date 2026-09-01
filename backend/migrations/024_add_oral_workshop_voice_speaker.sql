-- 024: create_oral_workshop_jobs 增加任务级官方音色 speaker_id（seed-tts-2.0 音色池选择）
ALTER TABLE create_oral_workshop_jobs ADD COLUMN voice_speaker_id VARCHAR(128) DEFAULT NULL COMMENT '任务级官方音色 speaker_id' AFTER voice_model_version;
