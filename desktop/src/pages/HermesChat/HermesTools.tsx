// Hermes Tools 面板（对齐上游 Tools.tsx：工具集启停开关 + MCP + Skills）
// 数据源：hermesTools.get/setEnabled（config.yaml platform_toolsets.cli）、
//        hermesTools.listMcp / hermesMcp.syncFromBackend（MCP 由深瞳后端同步）、
//        hermesSkills.list / installLocal（本地技能中心）。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Tabs, Switch, Input, Button, Alert, Empty, Spin, Space } from 'antd'
import {
  ToolOutlined, ApiOutlined, AppstoreOutlined, ReloadOutlined,
  CloudSyncOutlined, FolderOpenOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store/auth'
import type { HermesToolsetInfo, HermesMcpServerInfo, HermesSkillItem } from '@shared/types'
import { TOOL_ICONS, FALLBACK_TOOL_ICON } from './toolMeta'
import styles from './hermesTools.module.css'

export interface HermesToolsProps {
  open: boolean
  onClose: () => void
}

type TabKey = 'tools' | 'mcp' | 'skills'

function ServerGlyph(): JSX.Element {
  return (
    <span className={styles.mcpLogo}>
      <ApiOutlined />
    </span>
  )
}

export function HermesTools({ open, onClose }: HermesToolsProps): JSX.Element {
  const accessToken = useAuthStore((s) => s.accessToken)
  const [active, setActive] = useState<TabKey>('tools')
  const [toolsets, setToolsets] = useState<HermesToolsetInfo[]>([])
  const [mcpServers, setMcpServers] = useState<HermesMcpServerInfo[]>([])
  const [skills, setSkills] = useState<HermesSkillItem[]>([])
  const [loading, setLoading] = useState(false)
  const [mcpSearch, setMcpSearch] = useState('')
  const [mcpError, setMcpError] = useState('')
  const [mcpMessage, setMcpMessage] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [skillError, setSkillError] = useState('')
  const [skillMessage, setSkillMessage] = useState('')

  const loadToolsets = useCallback(async () => {
    const api = window.electronAPI?.hermesTools
    if (!api) return
    const r = await api.get()
    if (r.ok && r.toolsets) setToolsets(r.toolsets)
  }, [])

  const loadMcp = useCallback(async () => {
    const api = window.electronAPI?.hermesTools
    if (!api) return
    const r = await api.listMcp()
    if (r.ok && r.servers) setMcpServers(r.servers)
    else setMcpError(r.error || '读取 MCP 失败')
  }, [])

  const loadSkills = useCallback(async () => {
    const api = window.electronAPI?.hermesSkills
    if (!api) return
    const r = await api.list()
    if (r.ok && r.items) { setSkills(r.items); setSkillError('') }
    else setSkillError(r.error || '读取技能失败')
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setMcpError(''); setSkillError('')
    try {
      await Promise.all([loadToolsets(), loadMcp(), loadSkills()])
    } finally {
      setLoading(false)
    }
  }, [loadToolsets, loadMcp, loadSkills])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  async function toggleToolset(t: HermesToolsetInfo): Promise<void> {
    const api = window.electronAPI?.hermesTools
    if (!api) return
    setToolsets((prev) => prev.map((x) => (x.key === t.key ? { ...x, enabled: !t.enabled } : x)))
    const r = await api.setEnabled(t.key, !t.enabled)
    if (r.ok && r.toolsets) setToolsets(r.toolsets)
  }

  async function syncMcp(): Promise<void> {
    const api = window.electronAPI?.hermesMcp
    if (!api) return
    setMcpError(''); setMcpMessage('')
    if (!accessToken) { setMcpError('未登录，无法从后端同步 MCP'); return }
    const r = await api.syncFromBackend(accessToken)
    if (r.ok) setMcpMessage('已同步 ' + (r.count ?? 0) + ' 个 MCP')
    else setMcpError(r.error || '同步失败')
    await loadMcp()
  }

  function installLocalSkill(): void {
    void window.electronAPI?.hermesSkills?.installLocal?.().then((r) => {
      if (r?.ok) { setSkillMessage('技能已安装'); void loadSkills() }
      else setSkillError(r?.error || '安装失败')
    })
  }

  const filteredMcp = useMemo(() => {
    if (!mcpSearch.trim()) return mcpServers
    const q = mcpSearch.toLowerCase()
    return mcpServers.filter((s) => s.name.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q))
  }, [mcpServers, mcpSearch])

  const filteredSkills = useMemo(() => {
    if (!skillSearch.trim()) return skills
    const q = skillSearch.toLowerCase()
    return skills.filter((s) => s.name.toLowerCase().includes(q) || (s.source || '').toLowerCase().includes(q))
  }, [skills, skillSearch])

  const toolsTab = (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="工具集开关写入深瞳机器人 config.yaml `platform_toolsets.cli`，深瞳机器人重启后生效；MCP 由深瞳后端同步管理。" />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : toolsets.length === 0 ? (
        <Empty description="暂无工具集信息" />
      ) : (
        <div className={styles.toolsetGrid}>
          {toolsets.map((t) => (
            <div key={t.key} className={styles.toolsetRow + ' ' + (t.enabled ? styles.on : styles.disabled)}>
              <span className={styles.toolsetIcon}>{TOOL_ICONS[t.key] || FALLBACK_TOOL_ICON}</span>
              <div className={styles.toolsetInfo}>
                <div className={styles.toolsetLabel}>{t.label}</div>
                <div className={styles.toolsetDesc}>{t.description}</div>
              </div>
              <Switch className={styles.toolsetSwitch} size="small" checked={t.enabled} onChange={() => void toggleToolset(t)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const mcpTab = (
    <div>
      <div className={styles.mcpSearch}>
        <Input allowClear prefix={<SearchOutlined />} placeholder="搜索 MCP 服务器" value={mcpSearch} onChange={(e) => setMcpSearch(e.target.value)} />
        <Space>
          <Button size="small" icon={<CloudSyncOutlined />} onClick={() => void syncMcp()}>从后端同步</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void refresh()}>刷新</Button>
        </Space>
      </div>
      {mcpError && <Alert type="error" showIcon style={{ marginBottom: 10 }} message={mcpError} />}
      {mcpMessage && <Alert type="success" showIcon style={{ marginBottom: 10 }} message={mcpMessage} />}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : filteredMcp.length === 0 ? (
        <Empty description={mcpSearch.trim() ? '没有匹配的 MCP' : '暂无 MCP 服务器'} />
      ) : (
        <div className={styles.mcpTable}>
          <div className={styles.mcpHead}>
            <span>服务器</span><span>类型</span><span>命令 / URL</span><span>启用</span>
          </div>
          {filteredMcp.map((s) => (
            <div key={s.name} className={styles.mcpRow + ' ' + (s.enabled ? '' : styles.off)}>
              <div className={styles.mcpNameCell}>
                <ServerGlyph />
                <span className={styles.mcpName} title={s.name}>{s.name}</span>
              </div>
              <div><span className={styles.mcpChip + ' ' + (s.type === 'http' ? styles.http : '')}>{s.type === 'http' ? 'HTTP' : s.type === 'stdio' ? 'STDIO' : '未知'}</span></div>
              <div className={styles.mcpCmd} title={s.detail}>{s.detail || '—'}</div>
              <div className={styles.mcpCell}>
                <Switch size="small" checked={s.enabled} disabled />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className={styles.footerNote}>MCP 的增删改由深瞳后端管理；此页仅展示深瞳机器人 config 当前配置，并从后端同步启用项。</div>
    </div>
  )

  const skillsTab = (
    <div>
      <div className={styles.skillsSearch}>
        <Input allowClear prefix={<SearchOutlined />} placeholder="搜索技能" value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} />
        <Space>
          <Button size="small" icon={<FolderOpenOutlined />} onClick={installLocalSkill}>本地安装</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void refresh()}>刷新</Button>
        </Space>
      </div>
      {skillError && <Alert type="error" showIcon style={{ marginBottom: 10 }} message={skillError} />}
      {skillMessage && <Alert type="success" showIcon style={{ marginBottom: 10 }} message={skillMessage} />}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : filteredSkills.length === 0 ? (
        <Empty description={skillSearch.trim() ? '没有匹配的技能' : '暂无技能'} />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {filteredSkills.map((s) => (
            <div key={s.name} className={styles.skillRow}>
              <AppstoreOutlined />
              <span className={styles.skillName}>{s.name}</span>
              {s.source && <span className={styles.skillSource}>{s.source}</span>}
              {s.version && <span className={styles.skillBadge}>{s.version}</span>}
              {s.builtin && <span className={styles.skillBadge}>内置</span>}
            </div>
          ))}
        </Space>
      )}
    </div>
  )

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={840} title="深瞳机器人工具 / 能力" destroyOnClose>
      <Tabs
        activeKey={active}
        onChange={(k) => setActive(k as TabKey)}
        items={[
          { key: 'tools', label: (<span><ToolOutlined /> 工具集</span>), children: toolsTab },
          { key: 'mcp', label: (<span><ApiOutlined /> MCP</span>), children: mcpTab },
          { key: 'skills', label: (<span><AppstoreOutlined /> 技能</span>), children: skillsTab },
        ]}
      />
    </Modal>
  )
}

export default HermesTools