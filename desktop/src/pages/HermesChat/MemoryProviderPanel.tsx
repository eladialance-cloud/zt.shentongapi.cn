// Hermes 第三方记忆 Provider 面板：激活/停用 + env（API Key）配置 + 官方外链
// 配置经主进程持久化到 userData/hermes-chat/memory-provider.json；实际调用第三方存储需联调。
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Input, Spin, Tooltip } from 'antd';
import { CheckOutlined, ExportOutlined } from '@ant-design/icons';
import { MEMORY_PROVIDERS } from '@shared/memory-providers';
import type { HermesMemoryProviderConfig } from '@shared/types';

export interface MemoryProviderPanelProps {
  /** 预留：当前未按 persona 隔离，后续可扩展 per-profile 配置 */
  profileId?: string;
}

export function MemoryProviderPanel(_props: MemoryProviderPanelProps) {
  const api = window.electronAPI?.hermesMemoryProvider;
  const [config, setConfig] = useState<HermesMemoryProviderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [envEdits, setEnvEdits] = useState<Record<string, Record<string, string>>>({});

  const applyConfig = useCallback((next: HermesMemoryProviderConfig) => {
    setConfig(next);
    const edits: Record<string, Record<string, string>> = {};
    for (const p of MEMORY_PROVIDERS) {
      edits[p.name] = { ...(next.providers?.[p.name] || {}) };
    }
    setEnvEdits(edits);
  }, []);

  const load = useCallback(async () => {
    if (!api) { setError('当前环境未启用深瞳机器人记忆 Provider 配置'); setLoading(false); return; }
    setLoading(true);
    try {
      const next = await api.get();
      applyConfig(next || { active: '', providers: {} });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api, applyConfig]);

  useEffect(() => { void load(); }, [load]);

  const activate = async (name: string) => {
    if (!api) return;
    setBusy(name);
    try {
      applyConfig(await api.setActive(name));
    } catch { /* 忽略，保留旧状态 */ } finally { setBusy(null); }
  };

  const deactivate = async () => {
    if (!api) return;
    setBusy('deactivate');
    try {
      applyConfig(await api.setActive(''));
    } catch { /* 忽略 */ } finally { setBusy(null); }
  };

  const saveEnv = async (name: string, key: string) => {
    if (!api) return;
    const value = envEdits[name]?.[key] || '';
    try {
      applyConfig(await api.setEnv(name, key, value));
      setSavedKey(name + '::' + key);
      setTimeout(() => setSavedKey(null), 2000);
    } catch { /* 忽略 */ }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 16 }}><Spin /></div>;
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="第三方记忆 Provider 为深瞳机器人提供高级长期记忆；内置记忆（MEMORY.md / USER.md）始终保留。此面板管理激活与密钥，实际调用第三方存储需填入 API Key 并完成联调。"
      />
      {error && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={error} />}
      <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
        当前激活：
        {config?.active ? <strong style={{ color: '#1890ff' }}>{config.active}</strong> : '无（仅使用内置记忆）'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
        {MEMORY_PROVIDERS.map((p) => {
          const isActive = config?.active === p.name;
          return (
            <div
              key={p.name}
              style={{
                border: isActive ? '1px solid #1890ff' : '1px solid #f0f0f0',
                borderRadius: 8,
                padding: 12,
                background: isActive ? '#e6f7ff' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong>{p.name}</strong>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isActive && (
                    <span style={{ color: '#1890ff', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <CheckOutlined style={{ fontSize: 11 }} /> 激活
                    </span>
                  )}
                  {p.url && (
                    <Tooltip title="打开提供商官网">
                      <Button size="small" type="text" icon={<ExportOutlined />} onClick={() => window.open(p.url!, '_blank')} />
                    </Tooltip>
                  )}
                </span>
              </div>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>{p.description}</div>
              {p.envVars.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {p.envVars.map((key) => (
                    <div key={key}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 2 }}>
                        <span>{key}</span>
                        {savedKey === p.name + '::' + key && <span style={{ color: '#52c41a' }}>已保存</span>}
                      </label>
                      <Input.Password
                        size="small"
                        placeholder={'输入 ' + key}
                        value={envEdits[p.name]?.[key] || ''}
                        onChange={(e) => setEnvEdits((prev) => ({ ...prev, [p.name]: { ...(prev[p.name] || {}), [key]: e.target.value } }))}
                        onBlur={() => void saveEnv(p.name, key)}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div>
                {isActive ? (
                  <Button size="small" danger disabled={busy !== null} onClick={() => void deactivate()}>停用</Button>
                ) : (
                  <Button type="primary" size="small" loading={busy === p.name} disabled={busy !== null && busy !== p.name} onClick={() => void activate(p.name)}>激活</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}