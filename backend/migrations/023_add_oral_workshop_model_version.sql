-- 023_add_oral_workshop_model_version.sql
-- 口播工坊任务：配音音质/数字人清晰度档位（用户任务级选择，对应后台 V1/V2 模型配置）
ALTER TABLE oral_workshop_jobs
  ADD COLUMN voice_model_version varchar(8) NULL DEFAULT NULL AFTER voice_id,
  ADD COLUMN dh_model_version varchar(8) NULL DEFAULT NULL AFTER digital_human_id;
