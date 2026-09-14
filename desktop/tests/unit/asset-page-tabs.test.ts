// 素材库页结构守卫（2026-09-14 收敛为「单层 · 两库」）
// 锚点：src/pages/Assets/index.tsx
//
// 收敛原因：本页原先有两层 Tab ——
//   外层「素材库 / 合成视频 / 形象视频 / 音频素材 / 知识库」
//   内层「用户输入库 / 生成素材库」
// 外层后 4 项与内层是同一批 media_assets（形象 / 声音的创建入口本来就在「口播工坊」，
// 「知识库」在侧边栏另有独立入口），属重复入口 + 两层歧义。
// 收敛后本页只有一层：用户输入库 / 生成素材库（类别是该层下的二级过滤）。
import * as fs from 'node:fs'
import * as path from 'node:path'

const ASSETS_DIR = path.join(__dirname, '../../src/pages/Assets')
const INDEX_SRC = fs.readFileSync(path.join(ASSETS_DIR, 'index.tsx'), 'utf8')

/** 去掉注释行后再断言：注释里会解释被删项，避免文案断言误判 */
const CODE = INDEX_SRC
  .split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
  .join('\n')

describe('素材库页结构（单层两库）', () => {
  it('只渲染两库本体，页面级不再有 Tabs', () => {
    expect(CODE).toContain('<AssetLibraryTab />')
    expect(CODE).not.toMatch(/<Tabs/)
    expect(CODE).not.toMatch(/from ["']antd["']/)
  })

  it('不再挂载已废弃的重复面板与旧 Tab 定义', () => {
    for (const dead of ['ComposeTab', 'DigitalTab', 'AudioTab', 'KnowledgeTab', 'ASSET_LIBRARY_TABS', './panels/']) {
      expect(CODE).not.toContain(dead)
    }
  })

  it('不再出现重复入口文案', () => {
    for (const dead of ['合成视频', '形象视频', '音频素材', '知识库', '融合素材']) {
      expect(CODE).not.toContain(dead)
    }
  })

  it('废弃面板文件已删除', () => {
    const dead = [
      'tabs.ts',
      'panels/ComposeTab.tsx',
      'panels/DigitalTab.tsx',
      'panels/AudioTab.tsx',
      'panels/KnowledgeTab.tsx',
      'panels/shared.ts',
    ]
    for (const f of dead) {
      expect(fs.existsSync(path.join(ASSETS_DIR, f))).toBe(false)
    }
  })
})
