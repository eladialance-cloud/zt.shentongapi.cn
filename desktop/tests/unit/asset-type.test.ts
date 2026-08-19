// 素材库类型 Tab 分组纯函数单测
// 覆盖：assetGroup 的 image/video/audio/file+text*/file+非 text/未知分组与边界（空 mime、大小写），
//       matchAssetTab 的 Tab 命中规则（other 仅命中 all）
import { assetGroup, matchAssetTab, filterAssetsByTab, paginateFiltered } from '@/pages/Assets/asset-group'
import type { MediaAsset } from '@/api/media-asset-api'

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 1,
    userId: 1,
    sourceType: 'manual',
    title: '素材',
    assetType: 'file',
    url: 'https://example.com/a.txt',
    mimeType: null,
    archived: false,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('assetGroup 分组', () => {
  it('image/video 按 assetType 直接归组', () => {
    expect(assetGroup(asset({ assetType: 'image' }))).toBe('image')
    expect(assetGroup(asset({ assetType: 'video' }))).toBe('video')
    expect(assetGroup(asset({ assetType: 'image', mimeType: 'application/octet-stream' }))).toBe('image')
  })

  it('audio 归为 other', () => {
    expect(assetGroup(asset({ assetType: 'audio' }))).toBe('other')
    expect(assetGroup(asset({ assetType: 'audio', mimeType: 'audio/mpeg' }))).toBe('other')
  })

  it('file + text/* mimeType → 文案', () => {
    expect(assetGroup(asset({ assetType: 'file', mimeType: 'text/plain' }))).toBe('text')
    expect(assetGroup(asset({ assetType: 'file', mimeType: 'text/markdown' }))).toBe('text')
    expect(assetGroup(asset({ assetType: 'file', mimeType: 'text/html' }))).toBe('text')
  })

  it('file + 非 text mimeType → 文档', () => {
    expect(assetGroup(asset({ assetType: 'file', mimeType: 'application/pdf' }))).toBe('document')
    expect(assetGroup(asset({ assetType: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))).toBe('document')
    expect(assetGroup(asset({ assetType: 'file', mimeType: 'image/png' }))).toBe('document')
  })

  it('file + mimeType 为空/缺失 → 文档', () => {
    expect(assetGroup(asset({ assetType: 'file', mimeType: null }))).toBe('document')
    expect(assetGroup(asset({ assetType: 'file', mimeType: '' }))).toBe('document')
    expect(assetGroup(asset({ assetType: 'file' }))).toBe('document')
  })

  it('text/ 前缀大小写不敏感，含前后空白时正常分组', () => {
    expect(assetGroup(asset({ assetType: 'file', mimeType: 'Text/Plain' }))).toBe('text')
    expect(assetGroup(asset({ assetType: 'file', mimeType: '  text/markdown  ' }))).toBe('text')
  })

  it('未知 assetType → other', () => {
    expect(assetGroup({ assetType: 'unknown', mimeType: null } as unknown as MediaAsset)).toBe('other')
    expect(assetGroup({ assetType: 'bogus', mimeType: 'text/plain' } as unknown as MediaAsset)).toBe('other')
  })
})

describe('matchAssetTab Tab 过滤', () => {
  it('all 命中所有分组（含音频/未知）', () => {
    const samples = [
      asset({ assetType: 'image' }),
      asset({ assetType: 'video' }),
      asset({ assetType: 'audio' }),
      asset({ assetType: 'file', mimeType: 'text/plain' }),
      asset({ assetType: 'file', mimeType: 'application/pdf' }),
    ]
    for (const s of samples) {
      expect(matchAssetTab(s, 'all')).toBe(true)
    }
  })

  it('图片 Tab 只命中 image', () => {
    expect(matchAssetTab(asset({ assetType: 'image' }), 'image')).toBe(true)
    expect(matchAssetTab(asset({ assetType: 'video' }), 'image')).toBe(false)
    expect(matchAssetTab(asset({ assetType: 'file', mimeType: 'image/png' }), 'image')).toBe(false)
  })

  it('视频 Tab 只命中 video', () => {
    expect(matchAssetTab(asset({ assetType: 'video' }), 'video')).toBe(true)
    expect(matchAssetTab(asset({ assetType: 'image' }), 'video')).toBe(false)
  })

  it('文案 Tab 命中 text/* 分组', () => {
    expect(matchAssetTab(asset({ assetType: 'file', mimeType: 'text/plain' }), 'text')).toBe(true)
    expect(matchAssetTab(asset({ assetType: 'file', mimeType: 'text/markdown' }), 'text')).toBe(true)
    expect(matchAssetTab(asset({ assetType: 'file', mimeType: 'application/pdf' }), 'text')).toBe(false)
  })

  it('文档 Tab 命中 file + 非 text（或空 mime）', () => {
    expect(matchAssetTab(asset({ assetType: 'file', mimeType: 'application/pdf' }), 'document')).toBe(true)
    expect(matchAssetTab(asset({ assetType: 'file', mimeType: null }), 'document')).toBe(true)
    expect(matchAssetTab(asset({ assetType: 'file', mimeType: 'text/plain' }), 'document')).toBe(false)
  })

  it('音频/未知 only 命中 all', () => {
    expect(matchAssetTab(asset({ assetType: 'audio' }), 'all')).toBe(true)
    expect(matchAssetTab(asset({ assetType: 'audio' }), 'image')).toBe(false)
    expect(matchAssetTab(asset({ assetType: 'audio' }), 'video')).toBe(false)
    expect(matchAssetTab(asset({ assetType: 'audio' }), 'text')).toBe(false)
    expect(matchAssetTab(asset({ assetType: 'audio' }), 'document')).toBe(false)
  })
})

describe('filterAssetsByTab 列表过滤', () => {
  it('混合列表按 Tab 分组过滤', () => {
    const list = [
      asset({ id: 1, assetType: 'image' }),
      asset({ id: 2, assetType: 'video' }),
      asset({ id: 3, assetType: 'file', mimeType: 'text/plain' }),
      asset({ id: 4, assetType: 'file', mimeType: 'application/pdf' }),
      asset({ id: 5, assetType: 'audio' }),
    ]
    expect(filterAssetsByTab(list, 'all').map((a) => a.id)).toEqual([1, 2, 3, 4, 5])
    expect(filterAssetsByTab(list, 'image').map((a) => a.id)).toEqual([1])
    expect(filterAssetsByTab(list, 'video').map((a) => a.id)).toEqual([2])
    expect(filterAssetsByTab(list, 'text').map((a) => a.id)).toEqual([3])
    expect(filterAssetsByTab(list, 'document').map((a) => a.id)).toEqual([4])
  })
})

function textAsset(id: number): MediaAsset {
  return asset({ id, assetType: 'file', mimeType: 'text/plain', title: '文案' + id })
}

function docAsset(id: number): MediaAsset {
  return asset({ id, assetType: 'file', mimeType: 'application/pdf', title: '文档' + id })
}

describe('paginateFiltered 过滤 + 本地分页', () => {
  it('混合文本/文档翻页：按 Tab 过滤后分页', () => {
    const all = [
      ...Array.from({ length: 26 }, (_, i) => textAsset(i + 1)),
      ...Array.from({ length: 3 }, (_, i) => docAsset(100 + i)),
    ]
    const page1 = paginateFiltered(all, 'text', 1, 12)
    expect(page1.total).toBe(26)
    expect(page1.page).toBe(1)
    expect(page1.list).toHaveLength(12)
    expect(page1.list.every((a) => a.mimeType === 'text/plain')).toBe(true)

    const page3 = paginateFiltered(all, 'text', 3, 12)
    expect(page3.list).toHaveLength(2) // 26 = 12 + 12 + 2
    expect(page3.list[0].id).toBe(25)

    const docPage = paginateFiltered(all, 'document', 1, 12)
    expect(docPage.total).toBe(3)
    expect(docPage.list.map((a) => a.id)).toEqual([100, 101, 102])
  })

  it('空结果：空列表或无匹配 Tab 返回空', () => {
    expect(paginateFiltered([], 'text', 1, 12)).toEqual({ list: [], total: 0, page: 1 })
    const onlyImages = [asset({ id: 1, assetType: 'image' })]
    expect(paginateFiltered(onlyImages, 'document', 2, 12)).toEqual({ list: [], total: 0, page: 2 })
  })

  it('上限截断边界：恰好 2000 条时末页正常、越界页为空', () => {
    const all = Array.from({ length: 2000 }, (_, i) => textAsset(i + 1))
    const page20 = paginateFiltered(all, 'text', 20, 100)
    expect(page20.total).toBe(2000)
    expect(page20.list).toHaveLength(100)
    const page21 = paginateFiltered(all, 'text', 21, 100)
    expect(page21.list).toHaveLength(0)
    expect(page21.total).toBe(2000)
  })

  it('超过聚合上限（2001 条）时 total 以传入列表为准', () => {
    const all = Array.from({ length: 2001 }, (_, i) => textAsset(i + 1))
    const res = paginateFiltered(all, 'text', 1, 100)
    expect(res.total).toBe(2001) // 截断发生在页面拉取层，纯函数按传入数组计算
    expect(res.list).toHaveLength(100)
  })
})
