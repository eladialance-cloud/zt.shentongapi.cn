// 素材库页标签（2026-09-13 原「素材管理」并入素材库）— 结构守卫测试
// 锚点：src/pages/Assets/index.tsx
import { ASSET_LIBRARY_TABS } from '@/pages/Assets/tabs';

describe('素材库页 Tab', () => {
  const labels: readonly string[] = ASSET_LIBRARY_TABS.map((t) => t.label);
  const keys: readonly string[] = ASSET_LIBRARY_TABS.map((t) => t.key);

  it('恰好 5 个 Tab，顺序为 素材库/合成视频/形象视频/音频素材/知识库', () => {
    expect([...labels]).toEqual(['素材库', '合成视频', '形象视频', '音频素材', '知识库']);
  });

  it('Tab key 唯一且非空', () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.length > 0)).toBe(true);
  });

  it('不再包含已删除的「融合素材」（与素材库本体重复）', () => {
    expect(keys).not.toContain('fusion');
    expect(labels).not.toContain('融合素材');
  });
});