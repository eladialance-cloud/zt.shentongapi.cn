// 画中画待用建议中转（pip-suggestions.ts）单测
// 覆盖：脏数据容错、去重、上限、位置/大小归一、移除/清空、由混剪条目构造
import {
  DEFAULT_PIP_POSITION,
  DEFAULT_PIP_SCALE,
  PIP_SUGGESTIONS_KEY,
  PIP_SUGGESTIONS_LIMIT,
  addPipSuggestion,
  clearPipSuggestions,
  normalizePipPosition,
  normalizePipScale,
  parsePipSuggestions,
  readPipSuggestions,
  removePipSuggestion,
  removePipSuggestions,
  toPipSuggestion,
  type PipStorage,
  type PipSuggestion,
} from '@/pages/OralWorkshop/pip-suggestions'

/** 内存 Storage（jsdom 的 localStorage 可用，但注入 fake 才能断言写入内容与故障分支） */
function fakeStorage(seed?: string) {
  const map = new Map<string, string>()
  if (seed !== undefined) map.set(PIP_SUGGESTIONS_KEY, seed)
  const storage: PipStorage = {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v)
    },
  }
  return { storage, map, raw: () => map.get(PIP_SUGGESTIONS_KEY) ?? null }
}

const entry = (over: Partial<PipSuggestion> = {}): PipSuggestion => ({
  url: 'https://cdn.example.com/a.png',
  position: 'tr',
  scale: 0.25,
  subtitle: '第一句字幕',
  addedAt: '2026-09-14T00:00:00.000Z',
  ...over,
})

describe('取值归一', () => {
  it('位置非法值回落默认，合法值保留', () => {
    expect(normalizePipPosition('br')).toBe('br')
    expect(normalizePipPosition('center')).toBe('center')
    expect(normalizePipPosition('nope')).toBe(DEFAULT_PIP_POSITION)
    expect(normalizePipPosition(undefined)).toBe(DEFAULT_PIP_POSITION)
  })

  it('大小钳制到 0.05~1，非法值回落默认', () => {
    expect(normalizePipScale(0.5)).toBe(0.5)
    expect(normalizePipScale(9)).toBe(1)
    expect(normalizePipScale(0.001)).toBe(0.05)
    expect(normalizePipScale('abc')).toBe(DEFAULT_PIP_SCALE)
    expect(normalizePipScale(-1)).toBe(DEFAULT_PIP_SCALE)
  })
})

describe('parsePipSuggestions 脏数据容错', () => {
  it('空串/null/非 JSON/非数组都返回空数组', () => {
    expect(parsePipSuggestions(null)).toEqual([])
    expect(parsePipSuggestions('')).toEqual([])
    expect(parsePipSuggestions('{')).toEqual([])
    expect(parsePipSuggestions('{"url":"x"}')).toEqual([])
    expect(parsePipSuggestions('123')).toEqual([])
  })

  it('丢弃没有 url 的条目，保留有 url 的条目', () => {
    const raw = JSON.stringify([
      { url: 'https://a/1.png', subtitle: 'A' },
      { subtitle: '没有 url' },
      { url: '   ' },
      null,
      'string',
    ])
    const list = parsePipSuggestions(raw)
    expect(list).toHaveLength(1)
    expect(list[0].url).toBe('https://a/1.png')
    expect(list[0].subtitle).toBe('A')
    expect(list[0].position).toBe(DEFAULT_PIP_POSITION)
    expect(list[0].scale).toBe(DEFAULT_PIP_SCALE)
  })

  it('时间段与 jobId 非法时不写入，合法时保留', () => {
    const list = parsePipSuggestions(
      JSON.stringify([
        { url: 'https://a/1.png', startSec: '3', endSec: 8, jobId: 12 },
        { url: 'https://a/2.png', startSec: 'x', jobId: 0 },
      ]),
    )
    expect(list[0].startSec).toBe(3)
    expect(list[0].endSec).toBe(8)
    expect(list[0].jobId).toBe(12)
    expect(list[1].startSec).toBeUndefined()
    expect(list[1].jobId).toBeUndefined()
  })
})

describe('读写与增删', () => {
  it('存储不可用（未注入且无 localStorage 实现）时读写不抛错', () => {
    const broken: PipStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(readPipSuggestions(broken)).toEqual([])
    expect(() => addPipSuggestion(entry(), broken)).not.toThrow()
    expect(clearPipSuggestions(broken)).toEqual([])
  })

  it('add 写入并可读回', () => {
    const { storage } = fakeStorage()
    addPipSuggestion(entry(), storage)
    const list = readPipSuggestions(storage)
    expect(list).toHaveLength(1)
    expect(list[0].url).toBe('https://cdn.example.com/a.png')
  })

  it('同一 url + 同一字幕视为同一条 → 覆盖去重', () => {
    const { storage } = fakeStorage()
    addPipSuggestion(entry({ scale: 0.5 }), storage)
    addPipSuggestion(entry({ scale: 0.8 }), storage)
    const list = readPipSuggestions(storage)
    expect(list).toHaveLength(1)
    expect(list[0].scale).toBe(0.8)
  })

  it('同 url 不同字幕算两条', () => {
    const { storage } = fakeStorage()
    addPipSuggestion(entry({ subtitle: 'A' }), storage)
    addPipSuggestion(entry({ subtitle: 'B' }), storage)
    expect(readPipSuggestions(storage)).toHaveLength(2)
  })

  it('超过上限丢最旧', () => {
    const { storage } = fakeStorage()
    for (let i = 0; i < PIP_SUGGESTIONS_LIMIT + 3; i += 1) {
      addPipSuggestion(entry({ url: 'https://cdn.example.com/' + i + '.png', subtitle: 'S' + i }), storage)
    }
    const list = readPipSuggestions(storage)
    expect(list).toHaveLength(PIP_SUGGESTIONS_LIMIT)
    expect(list[list.length - 1].url).toBe('https://cdn.example.com/' + (PIP_SUGGESTIONS_LIMIT + 2) + '.png')
    expect(list.some((it) => it.url === 'https://cdn.example.com/0.png')).toBe(false)
  })

  it('removePipSuggestion 按索引移除', () => {
    const { storage } = fakeStorage()
    addPipSuggestion(entry({ url: 'https://a/1.png' }), storage)
    addPipSuggestion(entry({ url: 'https://a/2.png' }), storage)
    addPipSuggestion(entry({ url: 'https://a/3.png' }), storage)
    const left = removePipSuggestion(1, storage)
    expect(left.map((it) => it.url)).toEqual(['https://a/1.png', 'https://a/3.png'])
    expect(readPipSuggestions(storage).map((it) => it.url)).toEqual(['https://a/1.png', 'https://a/3.png'])
  })

  it('removePipSuggestions 批量移除（「全部加入」场景）', () => {
    const { storage } = fakeStorage()
    for (const n of [1, 2, 3, 4]) addPipSuggestion(entry({ url: 'https://a/' + n + '.png' }), storage)
    const left = removePipSuggestions([0, 2], storage)
    expect(left.map((it) => it.url)).toEqual(['https://a/2.png', 'https://a/4.png'])
  })

  it('clear 清空并写回空数组', () => {
    const { storage, raw } = fakeStorage()
    addPipSuggestion(entry(), storage)
    expect(clearPipSuggestions(storage)).toEqual([])
    expect(raw()).toBe('[]')
    expect(readPipSuggestions(storage)).toEqual([])
  })
})

describe('toPipSuggestion 由混剪条目构造', () => {
  it('无匹配素材返回 null', () => {
    expect(toPipSuggestion({ subtitle: 'A' })).toBeNull()
    expect(toPipSuggestion({ subtitle: 'A', matched: {} })).toBeNull()
    expect(toPipSuggestion({ subtitle: 'A', matched: { url: '  ' } })).toBeNull()
  })

  it('有匹配素材时带上字幕/关键词/素材名/位置与大小', () => {
    const s = toPipSuggestion({
      subtitle: '第二句',
      keyword: '效率',
      matched: { url: 'https://cdn.example.com/b.mp4', name: '效率短片', type: 'video' },
      pip: { position: 'bl', scale: 0.4 },
      jobId: 7,
    })
    expect(s).not.toBeNull()
    expect(s?.url).toBe('https://cdn.example.com/b.mp4')
    expect(s?.subtitle).toBe('第二句')
    expect(s?.keyword).toBe('效率')
    expect(s?.name).toBe('效率短片')
    expect(s?.type).toBe('video')
    expect(s?.position).toBe('bl')
    expect(s?.scale).toBe(0.4)
    expect(s?.jobId).toBe(7)
    expect(typeof s?.addedAt).toBe('string')
  })

  it('缺位置/大小时回落默认值', () => {
    const s = toPipSuggestion({ subtitle: 'A', matched: { url: 'https://cdn.example.com/c.png' } })
    expect(s?.position).toBe(DEFAULT_PIP_POSITION)
    expect(s?.scale).toBe(DEFAULT_PIP_SCALE)
  })

  it('构造出的条目可直接入库并被读回', () => {
    const { storage } = fakeStorage()
    const s = toPipSuggestion({ subtitle: 'A', matched: { url: 'https://cdn.example.com/d.png' } })
    expect(s).not.toBeNull()
    addPipSuggestion(s as PipSuggestion, storage)
    expect(readPipSuggestions(storage)).toHaveLength(1)
  })
})
