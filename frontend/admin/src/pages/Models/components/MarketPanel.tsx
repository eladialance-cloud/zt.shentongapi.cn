import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  message,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd'
import { CheckOutlined, ShoppingOutlined } from '@ant-design/icons'
import {
  fetchMarketPresets,
  fetchMarketVendors
} from '@/api/admin-model-api'
import type { MarketPresetItem, MarketVendor } from '@/types/admin-model'
import MarketProviderModal from './MarketProviderModal'
import MarketConfirmModal from './MarketConfirmModal'
import styles from './market.module.css'

const TYPE_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '文本', value: 'text' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '语音', value: 'audio' }
]

/** callMode -> 输出类型（用于类型筛选 chips） */
const OUTPUT_BY_MODE: Record<string, string> = {
  text_chat: 'text',
  embedding: 'text',
  rerank: 'text',
  vision: 'text',
  ocr: 'text',
  image: 'image',
  image_edit: 'image',
  video: 'video',
  video_edit: 'video',
  music: 'audio',
  stt: 'text',
  tts: 'audio',
  voice_conversion: 'audio',
  realtime: 'text'
}

function formatPrice(p: MarketPresetItem): string {
  const r = p.referencePrice
  if (!r) return '积分待定'
  if (r.videoPerSecond) {
    return Object.entries(r.videoPerSecond)
      .map(([k, v]) => `${k} ${v}分/秒`)
      .join(' · ')
  }
  if (r.pricePerImage != null) return `${r.pricePerImage} 分/张`
  if (r.pricePerCall != null) return `${r.pricePerCall} 分/次`
  if (r.pricePerMinute != null) return `${r.pricePerMinute} 分/分钟`
  const input = r.inputPricePerToken ?? 0
  const output = r.outputPricePerToken ?? 0
  return `输入 ${input} / 输出 ${output} 分/千token`
}

/** 模型市场：选厂商 -> 勾选模型 -> 确认添加（两行式） */
export default function MarketPanel() {
  const [vendors, setVendors] = useState<MarketVendor[]>([])
  const [vendorKey, setVendorKey] = useState('')
  const [presets, setPresets] = useState<MarketPresetItem[]>([])
  const [loadingVendors, setLoadingVendors] = useState(false)
  const [loadingPresets, setLoadingPresets] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<MarketPresetItem[]>([])
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    void loadVendors()
  }, [])

  async function loadVendors() {
    setLoadingVendors(true)
    try {
      const list = await fetchMarketVendors()
      setVendors(list)
      if (list.length > 0 && !vendorKey) {
        setVendorKey(list[0].vendor)
      }
    } catch (err) {
      message.error((err as Error)?.message || '加载厂商失败')
    } finally {
      setLoadingVendors(false)
    }
  }

  useEffect(() => {
    if (!vendorKey) return
    setSelected([])
    setKeyword('')
    setTypeFilter('all')
    void loadPresets(vendorKey)
  }, [vendorKey])

  async function loadPresets(vendor: string) {
    setLoadingPresets(true)
    try {
      const list = await fetchMarketPresets(vendor)
      setPresets(list)
    } catch (err) {
      message.error((err as Error)?.message || '加载预设失败')
    } finally {
      setLoadingPresets(false)
    }
  }

  const filtered = useMemo(() => {
    return presets.filter((p) => {
      if (typeFilter !== 'all' && OUTPUT_BY_MODE[p.callMode] !== typeFilter) return false
      if (keyword) {
        const hay = `${p.name} ${p.upstreamModelId} ${p.recommendedScenarioTags.join(' ')}`
        if (!hay.includes(keyword)) return false
      }
      return true
    })
  }, [presets, typeFilter, keyword])

  const selectedKeys = useMemo(() => new Set(selected.map((s) => s.key)), [selected])

  function toggle(p: MarketPresetItem) {
    setSelected((prev) =>
      prev.some((x) => x.key === p.key)
        ? prev.filter((x) => x.key !== p.key)
        : [...prev, p]
    )
  }

  const vendor = vendors.find((v) => v.vendor === vendorKey)

  return (
    <div className={styles.market}>
      <div className={styles.marketTop}>
        <Space wrap>
          <Select
            style={{ width: 240 }}
            value={vendorKey || undefined}
            placeholder="选择厂商"
            loading={loadingVendors}
            onChange={(v) => setVendorKey(String(v))}
            options={vendors.map((v) => ({ label: v.nameSuggestion, value: v.vendor }))}
          />
          <Button
            icon={<ShoppingOutlined />}
            onClick={() => setProviderModalOpen(true)}
            disabled={!vendor}
          >
            {vendor?.hasProvider ? '更换 / 新建供应商' : '创建供应商'}
          </Button>
        </Space>
        <Segmented
          value={typeFilter}
          onChange={(v) => setTypeFilter(String(v))}
          options={TYPE_OPTIONS}
        />
        <Input.Search
          allowClear
          placeholder="搜索模型名 / ID / 场景"
          style={{ width: 260 }}
          onSearch={(v) => setKeyword(v.trim())}
        />
      </div>

      <div className={styles.marketGrid}>
        {loadingPresets ? (
          <Spin style={{ margin: '48px auto', display: 'block' }} />
        ) : filtered.length === 0 ? (
          <Empty
            style={{ margin: '48px auto' }}
            description={
              vendorKey === 'relay'
                ? '中转 / 自建暂无标准预设，请使用「添加第三方供应商」高级流程'
                : '没有匹配的模型预设'
            }
          />
        ) : (
          filtered.map((p) => (
            <Card
              key={p.key}
              size="small"
              hoverable
              onClick={() => toggle(p)}
              className={selectedKeys.has(p.key) ? styles.marketCardSelected : styles.marketCard}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space wrap size={4}>
                  {selectedKeys.has(p.key) && <CheckOutlined style={{ color: '#1677ff' }} />}
                  <Typography.Text strong>{p.name}</Typography.Text>
                  <Badge
                    status={p.verified ? 'success' : 'warning'}
                    text={p.verified ? '已验证' : '未验证'}
                  />
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {p.upstreamModelId}
                  {p.requiresActivation ? '（需开通）' : ''}
                </Typography.Text>
                <Space wrap size={4}>
                  <Tag color="blue">{p.callMode}</Tag>
                  {p.recommendedScenarioTags.slice(0, 3).map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatPrice(p)}
                </Typography.Text>
              </Space>
            </Card>
          ))
        )}
      </div>

      {selected.length > 0 && (
        <div className={styles.marketBar}>
          <Typography.Text>
            已选 <Typography.Text strong>{selected.length}</Typography.Text> 个模型：
            {selected.slice(0, 5).map((s) => s.name).join('、')}
            {selected.length > 5 && ' 等'}
          </Typography.Text>
          <Space>
            <Button onClick={() => setSelected([])}>清空</Button>
            <Button type="primary" onClick={() => setConfirmOpen(true)}>
              确认添加 ({selected.length})
            </Button>
          </Space>
        </div>
      )}

      <MarketProviderModal
        open={providerModalOpen}
        vendor={vendor ?? null}
        onClose={() => setProviderModalOpen(false)}
        onSaved={() => {
          setProviderModalOpen(false)
          void loadVendors()
        }}
      />

      <MarketConfirmModal
        open={confirmOpen}
        items={selected}
        providerId={vendor?.hasProvider ? (vendor.providerId ?? 0) : 0}
        providerName={vendor?.nameSuggestion ?? ''}
        onClose={() => setConfirmOpen(false)}
        onDone={() => {
          setConfirmOpen(false)
          setSelected([])
        }}
      />
    </div>
  )
}