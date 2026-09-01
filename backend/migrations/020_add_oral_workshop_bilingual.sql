-- 口播工坊：双语字幕开关
-- 对应实体：backend/src/modules/oral-workshop/entities/oral-workshop-job.entity.ts
-- 幂等：列已存在时跳过（启动迁移 db-migration.ts 也会自动补列）

ALTER TABLE create_oral_workshop_jobs ADD COLUMN bilingual TINYINT(1) NOT NULL DEFAULT 0 COMMENT '双语字幕开关';
