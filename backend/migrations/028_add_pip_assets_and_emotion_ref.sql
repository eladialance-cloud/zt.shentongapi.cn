-- 028: P3 画中画素材（D4/E6）+ 情感参考音频（C6）
-- 画中画：任务级 pip_assets JSON 数组 [{url, position, scale, startSec?, endSec?}]，videoEdit 叠加
ALTER TABLE oral_workshop_jobs ADD COLUMN pip_assets TEXT DEFAULT NULL COMMENT '画中画素材 JSON' AFTER bgm_volume;
-- 情感参考音频：声音克隆时可选附带的情绪素材（火山 extra_params）
ALTER TABLE voice_assets ADD COLUMN emotion_ref_audio VARCHAR(512) DEFAULT NULL COMMENT '情感参考音频 URL' AFTER demo_audio;
