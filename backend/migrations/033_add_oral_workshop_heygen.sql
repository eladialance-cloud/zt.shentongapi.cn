-- 口播工坊：HeyGen 数字人（M4+）——digital_human_assets 增加 talking photo 图片列
-- 对应实体：backend/src/modules/oral-workshop/entities/digital-human-asset.entity.ts
-- kind 扩展：cloud=火山形象ID / video=本地上传视频 / image=HeyGen talking photo 图片 / avatar=HeyGen 预置形象

ALTER TABLE digital_human_assets ADD COLUMN image_url VARCHAR(512) DEFAULT NULL COMMENT 'HeyGen talking photo 图片 URL(kind=image)' AFTER preview_url;

ALTER TABLE digital_human_assets MODIFY COLUMN kind VARCHAR(8) NOT NULL DEFAULT 'cloud' COMMENT 'cloud=火山形象ID / video=本地上传视频 / image=HeyGen talking photo 图片 / avatar=HeyGen 预置形象';
