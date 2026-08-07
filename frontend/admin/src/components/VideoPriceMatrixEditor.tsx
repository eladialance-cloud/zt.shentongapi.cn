// 视频价格矩阵编辑器（分辨率 × 时长 表格）
// 数据形状：{ "720p": { "5": 10, "10": 18 }, "1080p": { "5": 20, "10": 36 } }
// - 行 = 分辨率，列 = 时长（秒）
// - 单元格 = 该规格生成一条视频扣除的积分（可留空 = 不提供该规格）

import { useMemo, useState } from 'react'
import { Button, InputNumber, Table, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, MinusCircleOutlined } from '@ant-design/icons'
import type { TableColumnsType } from 'antd'

export interface VideoPriceMatrixEditorProps {
  /** 当前矩阵值 */
  value?: Record<string, Record<string, number>> | null
  /** 变更回调（undefined = 清空） */
  onChange?: (next: Record<string, Record<string, number>> | undefined) => void
  /** 默认分辨率列表 */
  defaultResolutions?: string[]
  /** 默认时长列表（秒） */
  defaultDurations?: number[]
}

const DEFAULT_RESOLUTIONS = ['720p', '1080p']
const DEFAULT_DURATIONS = [5, 10]

/** 解析矩阵为 { resolutions, durations, cells: Record<res, Record<dur, number>> } */
function parseMatrix(
  value?: Record<string, Record<string, number>> | null,
  defRes: string[] = DEFAULT_RESOLUTIONS,
  defDur: number[] = DEFAULT_DURATIONS,
) {
  const resolutions: string[] = []
  const durations: number[] = []
  const cells: Record<string, Record<number, number | undefined>> = {}

  const v = value && typeof value === 'object' ? value : {}
  for (const res of Object.keys(v)) {
    if (!resolutions.includes(res)) resolutions.push(res)
    const row = v[res] || {}
    for (const durStr of Object.keys(row)) {
      const dur = Number(durStr)
      if (Number.isFinite(dur) && !durations.includes(dur)) durations.push(dur)
      if (!cells[res]) cells[res] = {}
      const price = Number(row[durStr])
      cells[res][dur] = Number.isFinite(price) ? price : undefined
    }
  }
  for (const r of defRes) if (!resolutions.includes(r)) resolutions.push(r)
  for (const d of defDur) if (!durations.includes(d)) durations.push(d)
  return { resolutions, durations, cells }
}

function VideoPriceMatrixEditorImpl({
  value,
  onChange,
  defaultResolutions = DEFAULT_RESOLUTIONS,
  defaultDurations = DEFAULT_DURATIONS,
}: VideoPriceMatrixEditorProps) {
  const initial = useMemo(() => parseMatrix(value, defaultResolutions, defaultDurations), [])
  const [resolutions, setResolutions] = useState<string[]>(initial.resolutions)
  const [durations, setDurations] = useState<number[]>(initial.durations)
  const [cells, setCells] = useState<Record<string, Record<number, number | undefined>>>(initial.cells)

  /** 计算并上抛完整矩阵 */
  const emit = (
    nextRes: string[],
    nextDur: number[],
    nextCells: Record<string, Record<number, number | undefined>>,
  ) => {
    const out: Record<string, Record<string, number>> = {}
    for (const res of nextRes) {
      const row: Record<string, number> = {}
      for (const dur of nextDur) {
        const p = nextCells[res]?.[dur]
        if (p != null && Number.isFinite(p) && p >= 0) row[String(dur)] = p
      }
      if (Object.keys(row).length > 0) out[res] = row
    }
    onChange?.(Object.keys(out).length > 0 ? out : undefined)
  }

  const setCell = (res: string, dur: number, price: number | null) => {
    const nextCells = { ...cells }
    if (!nextCells[res]) nextCells[res] = {}
    if (price == null) delete nextCells[res][dur]
    else nextCells[res][dur] = price
    setCells(nextCells)
    emit(resolutions, durations, nextCells)
  }

  const addResolution = () => {
    const name = prompt('请输入分辨率，如 1440p：')
    if (!name || !name.trim()) return
    const nextRes = [...resolutions, name.trim()]
    setResolutions(nextRes)
    emit(nextRes, durations, cells)
  }

  const removeResolution = (res: string) => {
    const nextRes = resolutions.filter((r) => r !== res)
    const nextCells = { ...cells }
    delete nextCells[res]
    setResolutions(nextRes)
    setCells(nextCells)
    emit(nextRes, durations, nextCells)
  }

  const addDuration = () => {
    const raw = prompt('请输入时长（秒），如 15：')
    const d = Number(raw)
    if (!raw || !Number.isFinite(d) || d <= 0) return
    const nextDur = [...durations, d]
    setDurations(nextDur)
    emit(resolutions, nextDur, cells)
  }

  const removeDuration = (dur: number) => {
    const nextDur = durations.filter((d) => d !== dur)
    setDurations(nextDur)
    emit(resolutions, nextDur, cells)
  }

  const columns: TableColumnsType<{ resolution: string }> = [
    {
      title: '分辨率 \ 时长',
      dataIndex: 'resolution',
      key: 'resolution',
      width: 90,
      fixed: 'left',
      render: (res: string) => <b style={{ textTransform: 'uppercase' }}>{res}</b>,
    },
    ...durations.map((dur) => ({
      title: (
        <span>
          {dur}s
          <Tooltip title="删除该时长列">
            <Button
              type="text"
              size="small"
              icon={<MinusCircleOutlined />}
              style={{ color: '#ef4444', marginLeft: 4 }}
              onClick={() => removeDuration(dur)}
            />
          </Tooltip>
        </span>
      ),
      key: String(dur),
      width: 90,
      align: 'center' as const,
      render: (_: unknown, record: { resolution: string }) => (
        <InputNumber
          min={0}
          precision={1}
          size="small"
          style={{ width: '100%' }}
          placeholder="-"
          value={cells[record.resolution]?.[dur]}
          onChange={(v) => setCell(record.resolution, dur, v)}
        />
      ),
    })),
    {
      title: (
        <Tooltip title="添加分辨率行">
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={addResolution} />
        </Tooltip>
      ),
      key: 'actions',
      width: 40,
      align: 'center' as const,
      render: (_: unknown, record: { resolution: string }) => (
        <Tooltip title="删除该行">
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            style={{ color: '#ef4444' }}
            onClick={() => removeResolution(record.resolution)}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      <Table
        rowKey="resolution"
        size="small"
        columns={columns}
        dataSource={resolutions.map((r) => ({ resolution: r }))}
        pagination={false}
        locale={{ emptyText: '暂无矩阵行' }}
      />
      <Button type="dashed" block icon={<PlusOutlined />} onClick={addDuration} style={{ marginTop: 8 }}>
        添加时长列
      </Button>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
        空格留空表示不提供该规格；数字 = 用户生成一条该规格视频扣除的积分
      </div>
    </div>
  )
}

export const VideoPriceMatrixEditor = VideoPriceMatrixEditorImpl
export default VideoPriceMatrixEditor
