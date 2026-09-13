// 素材管理页（对标 RRClaw 5 Tab）— 结构守卫测试
// 锚点：src/pages/Materials/index.tsx
import { MATERIAL_TABS } from '@/pages/Materials/tabs';

describe('素材管理 5 Tab', () => {
  it('恰好 5 个 Tab，顺序为 合成视频/融合素材/形象视频/音频素材/知识库', () => {
    expect(MATERIAL_TABS.map((t) => t.label)).toEqual([
      '合成视频',
      '融合素材',
      '形象视频',
      '音频素材',
      '知识库',
    ]);
  });

  it('Tab key 唯一且非空', () => {
    const keys = MATERIAL_TABS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.length > 0)).toBe(true);
  });
});
