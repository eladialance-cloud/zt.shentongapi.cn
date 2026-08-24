-- 素材中心：向量化检索扩展列
-- 对应实体：backend/src/modules/media-assets/entities/media-asset.entity.ts
-- 幂等：列已存在时跳过（启动迁移 db-migration.ts 也会自动补列）

ALTER TABLE media_assets ADD COLUMN description TEXT NULL COMMENT '素材描述（向量化检索文本）';
ALTER TABLE media_assets ADD COLUMN vector_status VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT '向量化状态 none|pending|ready|failed';
ALTER TABLE media_assets ADD COLUMN meta JSON NULL COMMENT '素材扩展元数据（时长/分辨率/封面）';
