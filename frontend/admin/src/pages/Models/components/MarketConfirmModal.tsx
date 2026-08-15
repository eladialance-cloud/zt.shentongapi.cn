import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import { marketImportModels } from '@/api/admin-model-api'
import type { MarketPresetItem } from '@/types/admin-model'
import styles from './market.module.css'

interface RowState {
  presetKey: string
  displayName: string
  enabled: boolean
  priceOverrides: Record<string, unknown>
}

type PriceKey =
  | 'inputPricePerToken'
  | 'outputPricePerToken'
  | 'pricePerImage'
  | 'pricePerCall'
  | 'pricePerMinute'

const PRICE_LABEL: Record<PriceKey, string> = {
  inputPricePerToken: '输入 分/千token',
  outputPricePerToken: '输出 分/千token',
  pricePerImage: '分/张',
  pricePerCall: '分/次',
  pricePerMinute: '分/分钟'
}

/** 按调用模式给出需要编辑的积分字段（对应计费模式） */
function priceKeysOf(p: MarketPresetItem): PriceKey[] {
  switch (p.callMode) {
    case 'image':
    case 'image_edit':
    case 'ocr':
      return ['pricePerImage']
    case 'video':
    case 'video_edit':
      return []
    case 'stt':
    case 'voice_conversion':
    case 'realtime':
      return ['pricePerMinute']
    case 'tts':
    case 'music':
    case 'rerank':
    case 'embedding':
      return ['pricePerCall']
    default:
      return ['inputPricePerToken', 'outputPricePerToken']
  }
}

function defaultRow(p: MarketPresetItem): RowState {
  const r = p.referencePrice ?? {}
  return {
    presetKey: p.key,
    displayName: p.name,
    enabled: true,
    priceOverrides: {
      inputPricePerToken: r.inputPricePerToken,
      outputPricePerToken: r.outputPricePerToken,
      pricePerImage: r.pricePerImage,
      pricePerCall: r.pricePerCall,
      pricePerMinute: r.pricePerMinute,
      videoPerSecond: r.videoPerSecond
    }
  }
}

/** 模型市场：确认添加页（逐行改积分/上架 + 批量操作 + 批量创建） */
export default function MarketConfirmModal(props: {
  open: boolean
  items: MarketPresetItem[]
  providerId: number
  providerName: string
  onClose: () => void
  onDone: () => void
}) {
  const { open, items, providerId, providerName, onClose, onDone } = props
  const [rows, setRows] = useState<RowState[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [batchPrice, setBatchPrice] = useState<number | null>(null)

  useEffect(() => {
    if (open) setRows(items.map((p) => defaultRow(p)))
  }, [open, items])

  function patch(row: RowState, next: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.presetKey === row.presetKey ? { ...r, ...next } : r)))
  }

  function patchPrice(row: RowState, key: string, value: number | null | Record<string, number>) {
    setRows((prev) =>
      prev.map((r) =>
        r.presetKey === row.presetKey
          ? { ...r, priceOverrides: { ...r.priceOverrides, [key]: value } }
          : r
      )
    )
  }

  const videoTiers = useMemo(() => {
    const tiers = new Set<string>()
    for (const p of items) {
      for (const k of Object.keys(p.referencePrice?.videoPerSecond ?? {})) tiers.add(k)
    }
    return [...tiers]
  }, [items])

  function applyBatchPrice() {
    if (batchPrice == null) {
      message.warning('请先输入批量积分')
      return
    }
    setRows((prev) =>
      prev.map((r) => {
        const p = items.find((x) => x.key === r.presetKey)
        const keys = p ? priceKeysOf(p) : []
        const nextOverrides = { ...r.priceOverrides }
        for (const k of keys) nextOverrides[k] = batchPrice
        return { ...r, priceOverrides: nextOverrides }
      })
    )
    message.success('已应用到文本/图片/语音等模型的积分（视频模型请逐档修改）')
  }

  function setAllEnabled(enabled: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, enabled })))
  }

  function renderPriceEditor(row: RowState) {
    const p = items.find((x) => x.key === row.presetKey)
    if (!p) return null
    const keys = priceKeysOf(p)
    if (keys.length === 0) {
      return (
        <Space size={4} wrap>
          {videoTiers.map((tier) => (
            <span key={tier} style={{ whiteSpace: 'nowrap' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {tier}
              </Typography.Text>
              <InputNumber
                size="small"
                min={0}
                precision={2}
                style={{ width: 80, marginLeft: 4 }}
                value={(row.priceOverrides.videoPerSecond as Record<string, number> | undefined)?.[tier]}
                onChange={(v) => {
                  const cur = { ...((row.priceOverrides.videoPerSecond as Record<string, number>) ?? {}) }
                  if (v == null) delete cur[tier]
                  else cur[tier] = Number(v)
                  patchPrice(row, 'videoPerSecond', cur)
                }}
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                分/秒
              </Typography.Text>
            </span>
          ))}
        </Space>
      )
    }
    return (
      <Space size={8} wrap>
        {keys.map((k) => (
          <span key={k} style={{ whiteSpace: 'nowrap' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {PRICE_LABEL[k]}
            </Typography.Text>
            <InputNumber
              size="small"
              min={0}
              precision={2}
              style={{ width: 100, marginLeft: 4 }}
              value={row.priceOverrides[k] as number | undefined}
              onChange={(v) => patchPrice(row, k, v)}
            />
          </span>
        ))}
      </Space>
    )
  }

  const columns = [
    {
      title: '显示名',
      dataIndex: 'displayName',
      width: 180,
      render: (v: string, row: RowState) => (
        <Input
          value={v}
          maxLength={128}
          onChange={(e) => patch(row, { displayName: e.target.value })}
        />
      )
    },
    {
      title: '上游模型 ID',
      width: 180,
      render: (_: unknown, row: RowState) => {
        const p = items.find((x) => x.key === row.presetKey)
        return (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {p?.upstreamModelId}
          </Typography.Text>
        )
      }
    },
    {
      title: '类型',
      width: 120,
      render: (_: unknown, row: RowState) => {
        const p = items.find((x) => x.key === row.presetKey)
        return <Tag color="blue">{p?.callMode ?? row.presetKey}</Tag>
      }
    },
    { title: '积分', render: (_: unknown, row: RowState) => renderPriceEditor(row) },
    {
      title: '上架',
      width: 70,
      dataIndex: 'enabled',
      render: (v: boolean, row: RowState) => (
        <Checkbox checked={v} onChange={(e) => patch(row, { enabled: e.target.checked })} />
      )
    }
  ]

  async function handleSubmit() {
    if (!providerId) return
    setSubmitting(true)
    try {
      const res = await marketImportModels({
        providerId,
        items: rows.map((r) => {
          const overrides: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(r.priceOverrides)) {
            if (v !== undefined && v !== null && v !== '') overrides[k] = v
          }
          return {
            presetKey: r.presetKey,
            displayName: r.displayName,
            enabled: r.enabled,
            priceOverrides: overrides
          }
        })
      })
      if (res.failed > 0) {
        const errs = (res.results ?? [])
          .filter((r) => !r.ok && r.error)
          .slice(0, 3)
          .map((r) => r.error)
          .join('；')
        message.warning(`创建完成：成功 ${res.imported}，失败 ${res.failed}${errs ? '：' + errs : ''}`, 6)
      } else {
        message.success(`成功创建 ${res.imported} 个模型`)
      }
      onDone()
    } catch (err) {
      message.error((err as Error)?.message || '批量创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`确认添加（${providerName}）`}
      open={open}
      onCancel={onClose}
      width={960}
      footer={
        <Space>
          <Button onClick={onClose} disabled={submitting}>返回</Button>
          <Button
            type="primary"
            loading={submitting}
            disabled={!providerId || rows.length === 0}
            onClick={() => void handleSubmit()}
          >
            批量创建 ({rows.length})
          </Button>
        </Space>
      }
    >
      {!providerId && (
        <Alert
          style={{ marginBottom: 12 }}
          type="warning"
          showIcon
          message="尚未创建该厂商的供应商"
          description="请关闭本窗口，先点击「创建供应商」填入 API Key 后再来确认添加。"
        />
      )}
      <div className={styles.marketTop} style={{ marginBottom: 12 }}>
        <Space wrap>
          <Typography.Text>批量改积分：</Typography.Text>
          <InputNumber
            min={0}
            precision={2}
            value={batchPrice}
            onChange={(v) => setBatchPrice(v)}
            placeholder="积分"
          />
          <Button onClick={applyBatchPrice}>应用到所有</Button>
          <Button onClick={() => setAllEnabled(true)}>全部上架</Button>
          <Button onClick={() => setAllEnabled(false)}>全部下架</Button>
        </Space>
      </div>
      <Table
        rowKey="presetKey"
        size="small"
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: 720 }}
      />
    </Modal>
  )
}