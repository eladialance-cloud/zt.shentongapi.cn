// 个人设置 · 一键组队（对标 RRClaw「一键创建 AI 自动化团队」）
// 选择套餐 → 一条流水线建好「飞书多维表格 + 各官署 SOUL + Agent + 定时任务」
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, List, Popconfirm, Progress, Space, Steps, Tag, Typography, message } from 'antd'
import { CrownOutlined, RocketOutlined, ThunderboltOutlined } from '@ant-design/icons'

const { Paragraph, Text } = Typography

interface Preset {
  id: string
  name: string
  description: string
  officials: string[]
  recommended: boolean
}

interface ProgressEvent {
  step: string
  message?: string
  current?: string
  completed?: number
  total?: number
  error?: string
}

interface CreationResult {
  ok: boolean
  presetId: string
  officials: string[]
  created: string[]
  removed: string[]
  failed: Array<{ step: string; official?: string; error: string }>
  cronCreated?: number
  cronSkipped?: number
  cronDeduped?: number
  cronFixed?: number
  error?: string
}

const OFFICIAL_LABEL: Record<string, string> = {
  taizi: '太子',
  zhongshu: '中书省',
  menxia: '门下省',
  shangshu: '尚书省',
  libu: '礼部',
  hubu: '户部',
  libu_hr: '吏部',
  bingbu: '兵部',
  xingbu: '刑部',
  gongbu: '工部',
  zaochao: '司礼监',
  qintianjian: '钦天监',
}

const STEP_LABEL: Record<string, string> = {
  cleanup: '清理旧配置',
  bitable: '创建飞书多维表格',
  soul: '写入官署 SOUL',
  agent: '创建 Agent',
  cron: '创建定时任务',
  strategic: '生成战略文档',
  seed: '预填模板',
  done: '完成',
}

const STEP_ORDER = ['cleanup', 'bitable', 'agent', 'soul', 'strategic', 'seed', 'cron', 'done']

const ICONS: Record<string, React.ReactNode> = {
  starter: <ThunderboltOutlined />,
  standard: <CrownOutlined />,
  flagship: <RocketOutlined />,
}

export default function TeamPreset() {
  const api = window.electronAPI as unknown as {
    team?: {
      listPresets(): Promise<{
        ok: boolean
        defaultPresetId: string
        currentPresetId?: string | null
        installedOfficials?: string[]
        presets: Preset[]
      }>
      /** 当前官署编制（一键组队选的套餐；无落盘记录=全集） */
      currentRoster(): Promise<{
        ok: boolean
        presetId: string | null
        officials: string[]
        installed: string[]
        isDefault: boolean
      }>
      creationStatus(): Promise<{ ok: boolean; isRunning: boolean; lastResult: CreationResult | null }>
      create(presetId: string): Promise<CreationResult>
      syncSoul(officials?: string[]): Promise<{ ok: boolean; synced: number; totalReplaced: number; items: Array<{ official: string; ok: boolean; replaced?: number; missing?: string[]; error?: string }> }>
      soulStatus(): Promise<{ ok: boolean; statuses: Array<{ official: string; total: number; linked: number }>; allLinked: boolean }>
      onCreationProgress(cb: (p: ProgressEvent) => void): () => void
    }
  }

  const [presets, setPresets] = useState<Preset[]>([])
  const [selected, setSelected] = useState('standard')
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [result, setResult] = useState<CreationResult | null>(null)
  const [soulStatus, setSoulStatus] = useState<Array<{ official: string; total: number; linked: number }>>([])
  const [syncing, setSyncing] = useState(false)
  /** 当前编制（选了什么套餐 / 磁盘装了什么） */
  const [roster, setRoster] = useState<{
    presetId: string | null
    officials: string[]
    installed: string[]
    isDefault: boolean
  } | null>(null)

  /** 读取当前编制：任务中心/办公室也按它过滤展示 */
  const loadRoster = useCallback(async () => {
    if (!api?.team?.currentRoster) return
    try {
      const r = await api.team.currentRoster()
      setRoster({
        presetId: r.presetId ?? null,
        officials: Array.isArray(r.officials) ? r.officials : [],
        installed: Array.isArray(r.installed) ? r.installed : [],
        isDefault: !!r.isDefault,
      })
    } catch {
      // 读取失败不阻塞页面（按未选择套餐处理）
    }
  }, [api])

  const loadSoulStatus = useCallback(async () => {
    if (!api?.team?.soulStatus) return
    try {
      const r = await api.team.soulStatus()
      setSoulStatus(r.statuses)
    } catch {
      // 忽略
    }
  }, [api])

  useEffect(() => {
    void loadSoulStatus()
  }, [loadSoulStatus])

  useEffect(() => {
    if (!api?.team) return
    void (async () => {
      const r = await api.team!.listPresets()
      setPresets(r.presets)
      // 有落盘编制时优先选中它（否则每次进来都默认 standard，看起来像选过的被改了）
      setSelected(r.currentPresetId || r.defaultPresetId || 'standard')
      const s = await api.team!.creationStatus()
      if (s.isRunning) setCreating(true)
      if (s.lastResult) setResult(s.lastResult)
      await loadRoster()
    })()
    const off = api.team.onCreationProgress((p) => {
      setProgress(p)
      if (p.step === 'done') {
        setCreating(false)
        void loadSoulStatus()
      }
    })
    return () => off?.()
  }, [api, loadSoulStatus, loadRoster])

  /** 回填飞书表链接到各官署 SOUL（占位符 → 真实链接） */
  const onSyncSoul = useCallback(async () => {
    if (!api?.team?.syncSoul) return
    setSyncing(true)
    try {
      const r = await api.team.syncSoul()
      if (r.ok) message.success(`已同步 ${r.synced} 个官署 SOUL，替换 ${r.totalReplaced} 处表链接`)
      else message.warning('部分官署 SOUL 同步失败，请查看明细')
      const missing = r.items.filter((i) => i.missing && i.missing.length > 0)
      if (missing.length > 0) {
        message.info(`仍有 ${missing.reduce((n, i) => n + (i.missing?.length ?? 0), 0)} 处占位符未回填（对应表尚未创建）`)
      }
      void loadSoulStatus()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }, [api, loadSoulStatus])

  const onCreate = useCallback(async () => {
    if (!api?.team) return
    setCreating(true)
    setResult(null)
    setProgress({ step: 'cleanup', message: '开始创建…' })
    try {
      const r = await api.team.create(selected)
      setResult(r)
      if (r.ok) {
        message.success('一键组队完成')
        void loadRoster()
      }
      else message.warning(r.error || '组队未全部完成，请查看下方明细')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }, [api, selected, loadRoster])

  if (!api?.team) {
    return <Alert type="warning" showIcon message="当前环境不支持一键组队（仅桌面端可用）" />
  }

  const currentStepIndex = progress ? Math.max(0, STEP_ORDER.indexOf(progress.step)) : 0

  // 当前编制摘要（让「选了什么 / 装了什么」一眼可见）
  const rosterLabels = (roster?.officials ?? []).map((o) => OFFICIAL_LABEL[o] ?? o)
  const extraInstalled = (roster?.installed ?? []).filter((o) => !(roster?.officials ?? []).includes(o))
  const currentPresetName = roster?.presetId
    ? presets.find((p) => p.id === roster.presetId)?.name ?? roster.presetId
    : null

  return (
    <Card title="一键组队" extra={<Tag color="blue">三省六部编制</Tag>}>
      {roster && (
        <Alert
          type={extraInstalled.length > 0 ? 'warning' : roster.isDefault ? 'info' : 'success'}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            roster.isDefault
              ? '当前编制：尚未选择套餐（暂按全集 12 个官署处理）'
              : `当前编制：${currentPresetName ?? roster.presetId} · ${roster.officials.length} 个官署`
          }
          description={
            <div style={{ fontSize: 12, lineHeight: 1.9 }}>
              <div>编制内：{rosterLabels.join('、') || '（空）'}</div>
              <div>
                磁盘已装：{roster.installed.length} 个
                {extraInstalled.length > 0
                  ? `（多出 ${extraInstalled.length} 个不在编制内：${extraInstalled.map((o) => OFFICIAL_LABEL[o] ?? o).join('、')}）`
                  : '（与编制一致）'}
              </div>
              <div style={{ color: 'var(--color-text-tertiary)' }}>
                任务中心与 AI 办公室只展示编制内的官署；编制外的官署不参与派发。
              </div>
            </div>
          }
          action={
            extraInstalled.length > 0 ? (
              <Popconfirm
                title="移除编制外的官署？"
                description="会删除这些官署的 Agent profile 与它们的默认定时任务（飞书表数据保留）。"
                okText="确认移除"
                cancelText="取消"
                onConfirm={onCreate}
              >
                <Button size="small" danger loading={creating}>
                  按编制清理
                </Button>
              </Popconfirm>
            ) : undefined
          }
        />
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="说明"
        description={
          <Paragraph style={{ marginBottom: 0 }}>
            选好套餐后，系统会按「创建飞书多维表格 → 创建 Agent → 写入官署 SOUL → 生成战略文档 → 创建定时任务」的顺序一键搭好整个 AI 官署班子。
            已是该套餐时只做增量补齐；换套餐会在现有飞书表里新增新官署、并移除套餐外的官署（飞书数据保留）。
          </Paragraph>
        }
      />

      <List
        grid={{ gutter: 12, xs: 1, sm: 1, md: 3, lg: 3 }}
        dataSource={presets}
        renderItem={(p) => (
          <List.Item>
            <Card
              hoverable
              size="small"
              onClick={() => setSelected(p.id)}
              style={{
                borderColor: selected === p.id ? '#1677ff' : undefined,
                borderWidth: selected === p.id ? 2 : 1,
              }}
              title={
                <Space>
                  {ICONS[p.id]}
                  {p.name}
                  {p.recommended && <Tag color="gold">推荐</Tag>}
                  {selected === p.id && <Tag color="blue">已选</Tag>}
                </Space>
              }
            >
              <Paragraph type="secondary" style={{ minHeight: 44, marginBottom: 8 }}>
                {p.description}
              </Paragraph>
              <div>
                {p.officials.map((o) => (
                  <Tag key={o} style={{ marginBottom: 4 }}>
                    {OFFICIAL_LABEL[o] ?? o}
                  </Tag>
                ))}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                共 {p.officials.length} 个官署
              </Text>
            </Card>
          </List.Item>
        )}
      />

      <Space style={{ marginTop: 16 }} wrap>
        <Button type="primary" size="large" loading={creating} onClick={onCreate}>
          一键创建 AI 官署团队
        </Button>
        {creating && <Tag color="processing">{progress?.message || '进行中…'}</Tag>}
        <Button onClick={onSyncSoul} loading={syncing} disabled={creating}>
          回填飞书表链接到 SOUL
        </Button>
      </Space>

      {soulStatus.length > 0 && (
        <Card size="small" title="官署 SOUL 表链接回填状态" style={{ marginTop: 16 }}>
          <Space wrap>
            {soulStatus.map((s) => {
              const done = s.total > 0 && s.linked === s.total
              return (
                <Tag key={s.official} color={done ? 'green' : s.linked > 0 ? 'orange' : 'default'}>
                  {OFFICIAL_LABEL[s.official] ?? s.official} {s.linked}/{s.total}
                </Tag>
              )
            })}
          </Space>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            未回填的占位符会原样保留在 SOUL 中（不伪造链接），建表成功后点「回填飞书表链接到 SOUL」即可写入。
          </div>
        </Card>
      )}

      {(creating || progress) && (
        <div style={{ marginTop: 20 }}>
          <Steps
            direction="vertical"
            size="small"
            current={currentStepIndex}
            items={STEP_ORDER.map((s) => ({
              title: STEP_LABEL[s] ?? s,
              status:
                progress && STEP_ORDER.indexOf(progress.step) > STEP_ORDER.indexOf(s)
                  ? 'finish'
                  : progress?.error && progress.step === s
                    ? 'error'
                    : undefined,
              description: progress?.step === s ? progress.message : undefined,
            }))}
          />
          {progress?.total ? (
            <Progress percent={Math.round(((progress.completed ?? 0) / progress.total) * 100)} />
          ) : null}
        </div>
      )}

      {result && (
        <Alert
          style={{ marginTop: 20 }}
          type={result.ok ? 'success' : 'warning'}
          showIcon
          message={result.ok ? '一键组队完成' : '组队完成但存在失败项'}
          description={
            <div>
              <div>
                编制：{result.officials.map((o) => OFFICIAL_LABEL[o] ?? o).join('、')}
              </div>
              <div>
                新增官署：{result.created.length ? result.created.map((o) => OFFICIAL_LABEL[o] ?? o).join('、') : '无'}
              </div>
              {result.removed.length > 0 && (
                <div>移除官署：{result.removed.map((o) => OFFICIAL_LABEL[o] ?? o).join('、')}</div>
              )}
              <div>
                定时任务：新建 {result.cronCreated ?? 0} 条
                {result.cronSkipped ? `（已存在跳过 ${result.cronSkipped} 条）` : ''}
                {result.cronFixed ? `（修正排期 ${result.cronFixed} 条）` : ''}
                {result.cronDeduped ? `（清理历史重复 ${result.cronDeduped} 条）` : ''}
              </div>
              {result.failed.length > 0 && (
                <div style={{ color: '#cf1322' }}>
                  失败：{result.failed.map((f) => `${STEP_LABEL[f.step] ?? f.step}${f.official ? `(${f.official})` : ''}: ${f.error}`).join('；')}
                </div>
              )}
            </div>
          }
        />
      )}
    </Card>
  )
}
