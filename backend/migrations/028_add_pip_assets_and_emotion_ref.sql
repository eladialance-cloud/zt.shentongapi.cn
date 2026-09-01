-- 028: P3 画中画素材（D4/E6）+ 情感参考音频（C6）
-- 画中画：任务级 pip_assets JSON 数组 [{url, position, scale, startSec?, endSec?}]，videoEdit 叠加
ALTER TABLE create_oral_workshop_jobs ADD COLUMN pip_assets TEXT DEFAULT NULL COMMENT '画中画素材 JSON' AFTER bgm_volume;
-- 注：voice_assets 已于 P3 合并至 media_assets，emotion_ref_audio 存 meta JSON
