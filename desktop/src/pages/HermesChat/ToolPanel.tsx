// /tools 工具目录面板：网关已连接时优先拉 commands.catalog，否则用本地目录
import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Modal, Spin, Tag, Alert } from 'antd';
import type { HermesGatewayHandle } from '@/services/hermes-gateway-client';
import { TOOL_CATALOG, groupToolsByCategory, type ToolCatalogEntry } from './toolCatalog';

export interface ToolPanelProps {
  open: boolean;
  onClose: () => void;
  /** 当前网关句柄（可能为 null；connected 时尝试拉目录） */
  gateway?: HermesGatewayHandle | null;
  /** 点击导航类工具时的跳转（info 类条目） */
  onNavigate?: (path: string) => void;
}

const NAV_PATHS: Record<string, string> = {
  '/skills': '/skill-market',
  '/discover': '/skill-market',
  '/providers': '/settings',
  '/schedules': '/automation',
  '/gateway': '/services',
  '/kanban': '/task-center',
  '/agents': '/agent-market',
  '/office': '/office',
};

async function loadGatewayCatalog(gateway: HermesGatewayHandle): Promise<ToolCatalogEntry[] | null> {
  try {
    const r = await gateway.request<unknown>('commands.catalog')
    const raw = r.ok ? r.result : null
    if (!raw || !Array.isArray(raw)) return null
    const mapped: ToolCatalogEntry[] = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const name = typeof rec.name === 'string' ? rec.name : typeof rec.command === 'string' ? rec.command : ''
      const desc = typeof rec.description === 'string' ? rec.description : ''
      const category = (rec.category || 'info') as ToolCatalogEntry['category']
      if (name) mapped.push({ category: ['chat', 'agent', 'tools', 'info'].includes(category) ? category : 'info', name, description: desc })
    }
    return mapped.length ? mapped : null
  } catch {
    return null
  }
}

export function ToolPanel({ open, onClose, gateway, onNavigate }: ToolPanelProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<ToolCatalogEntry[]>([]);
  const [source, setSource] = useState<'gateway' | 'local'>('local');

  useEffect(() => {
    if (!open) return
    let mounted = true
    setLoading(true)
    const run = async () => {
      if (gateway?.connected) {
        const gw = await loadGatewayCatalog(gateway)
        if (mounted && gw) {
          setEntries(gw)
          setSource('gateway')
          setLoading(false)
          return
        }
      }
      if (mounted) {
        setEntries(TOOL_CATALOG)
        setSource('local')
        setLoading(false)
      }
    }
    void run()
    return () => { mounted = false }
  }, [open, gateway])

  const groups = groupToolsByCategory(entries)

  const handleClick = useCallback((item: ToolCatalogEntry) => {
    if (item.category === 'info' && NAV_PATHS[item.name] && onNavigate) {
      onNavigate(NAV_PATHS[item.name])
      onClose()
    }
  }, [onNavigate, onClose])

  return (
    <Modal title="Hermes 工具 / 命令目录" open={open} onCancel={onClose} footer={null} width={560}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={source === 'gateway' ? '来源：Hermes 网关 commands.catalog' : '来源：本地工具目录（网关未连接或未返回目录）'}
      />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : groups.length === 0 ? (
        <Empty description="暂无工具信息" />
      ) : (
        groups.map((g) => (
          <div key={g.category} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{g.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
              {g.items.map((item) => (
                <div key={item.name} style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag style={{ marginRight: 0 }}>{item.name}</Tag>
                    {NAV_PATHS[item.name] && (
                      <Button size="small" type="link" style={{ padding: 0 }} onClick={() => handleClick(item)}>打开</Button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>{item.description}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </Modal>
  );
}