// 我的-统一本地内容列表：严格只显示本地已下载（官方/自定义/对话安装），点击进本地详情
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppstoreOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  PlusOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Button, Card, Empty, Popconfirm, Spin, Tag, message } from 'antd'
import * as hermesApi from '@/api/hermes-api'
import * as pluginApi from '@/api/plugin-api'
import * as marketApi from '@/api/market-api'
import type { InstalledRecord, MarketItemType } from '@/types/market'
import styles from './styles.module.css'

const TYPE_META: Record<MarketItemType, { label: string; icon: React.ReactNode }> = {
  plugin: { label: '插件', icon: <AppstoreOutlined /> },
  workflow: { label: '工作流', icon: <DeploymentUnitOutlined /> },
  agent: { label: 'Agent', icon: <RobotOutlined /> },
  skill: { label: '技能包', icon: <ThunderboltOutlined /> },
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  official: { label: '官方下载', color: 'gold' },
  custom: { label: '自定义', color: 'purple' },
  chat: { label: '对话安装', color: 'green' },
}

export default function InstalledList({
  type,
  embedded = false,
}: {
  type: MarketItemType
  embedded?: boolean
}) {
  const navigate = useNavigate()
  const [records, setRecords] = useState<InstalledRecord[]>([])
  const [loading, setLoading] = useState(false)

  /** 拉取官方市场最新版本号,用于「可更新」标记(仅官方来源) */
  const loadOfficialVersions = useCallback(async (): Promise<Map<string, string>> => {
    // Agent/工作流市场列表暂不返回版本号,列表侧跳过;详情页用下载元数据检测
    const m = new Map<string, string>()
    try {
      if (type === 'skill') {
        const list = await hermesApi.listSkillMarket()
        for (const s of list || []) if (s.version) m.set(String(s.id), s.version)
      } else if (type === 'plugin') {
        const res = await pluginApi.listMarketPlugins({ page: 1, pageSize: 100 })
        for (const p of res.list || []) if (p.version) m.set(String(p.id), p.version)
      }
    } catch (err) {
      console.warn('[InstalledList] 官方版本比对失败:', err)
    }
    return m
  }, [type])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [list, latest] = await Promise.all([
        marketApi.listInstalled(),
        loadOfficialVersions(),
      ])
      setRecords(
        list
          .filter((r) => r.type === type)
          .map((r) =>
            r.source === 'official' && latest.has(String(r.id))
              ? { ...r, latestVersion: latest.get(String(r.id)) }
              : r,
          ),
      )
    } catch (err) {
      console.error('[InstalledList] load failed:', err)
      message.error('加载本地内容失败')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [type, loadOfficialVersions])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleImport = async () => {
    const res = await marketApi.importDir(type)
    if (!res.ok) {
      if (res.error) message.error(res.error)
      return
    }
    if (res.record) {
      message.success(`已导入「${res.record.name}」`)
      void loadData()
    }
  }

  const handleUninstall = async (r: InstalledRecord) => {
    try {
      const res = await marketApi.uninstall(type, r.id)
      if (!res.ok) throw new Error(res.error || '卸载失败')
      message.success(`已卸载「${r.name}」`)
      setRecords((prev) =>
        prev.filter((x) => !(x.type === r.type && String(x.id) === String(r.id))),
      )
    } catch (err) {
      message.error('卸载失败: ' + (err as Error).message)
    }
  }

  const openDetail = (r: InstalledRecord) => {
    navigate(`/skill-market/detail/${r.type}/${encodeURIComponent(String(r.id))}`)
  }

  const meta = TYPE_META[type]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button icon={<PlusOutlined />} onClick={handleImport}>
          自定义添加
        </Button>
      </div>
      <Spin spinning={loading}>
        {records.length === 0 && !loading ? (
          <Empty
            description="暂无已下载内容，去官方市场下载或点击「自定义添加」导入"
            style={{ marginTop: 48 }}
          />
        ) : (
          <div className={styles.agentGrid}>
            {records.map((r) => {
              const src = SOURCE_META[r.source || 'official'] || SOURCE_META.official
              const updatable = r.latestVersion && r.latestVersion !== r.version
              return (
                <Card
                  key={`${r.type}-${String(r.id)}`}
                  className={styles.agentCard}
                  bordered={false}
                  hoverable
                  onClick={() => openDetail(r)}
                >
                  <div className={styles.agentBody}>
                    <div className={styles.agentHeader}>
                      <div className={styles.agentAvatar}>{meta.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className={styles.agentName}
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={r.name}
                        >
                          {r.name}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <Tag color={src.color} style={{ marginRight: 4 }}>
                            {src.label}
                          </Tag>
                          {updatable ? (
                            <Tag color="orange">可更新</Tag>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div
                      className={styles.agentDesc}
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={r.dir}
                    >
                      版本 {r.version} · {r.dir}
                    </div>
                    <div className={styles.agentActions} onClick={(e) => e.stopPropagation()}>
                      <Popconfirm
                        title={`确定卸载「${r.name}」吗？`}
                        onConfirm={() => handleUninstall(r)}
                        okText="卸载"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />}>
                          卸载
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </Spin>
    </div>
  )
}
