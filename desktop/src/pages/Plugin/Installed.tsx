// 已安装插件页
// 布局：Tab 导航 + 已安装插件表格（启用/禁用开关、配置按钮、卸载按钮）+ 配置弹窗
// 调用 GET /plugins/installed、POST /plugins/:id/enable|disable、PATCH /plugins/:id/config、DELETE /plugins/:id

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Spin,
  Switch,
  Table,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  DeleteOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import * as pluginApi from '@/api/plugin-api'
import * as marketApi from '@/api/market-api'
import type { InstalledPluginRow } from '@/types/plugin'
import type { InstalledRecord } from '@/types/market'
import styles from './styles.module.css'

export default function InstalledPlugins({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  type PluginRow = InstalledPluginRow & { installDir?: string }
  const [plugins, setPlugins] = useState<PluginRow[]>([])
  const [loading, setLoading] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [configuring, setConfiguring] = useState<InstalledPluginRow | null>(null)
  const [configForm] = Form.useForm()
  const [savingConfig, setSavingConfig] = useState(false)

  /** 加载已安装插件列表 */
  const loadPlugins = useCallback(async () => {
    setLoading(true)
    try {
      const [res, localList] = await Promise.all([
        pluginApi.listInstalledPlugins().catch(() => null),
        marketApi.listInstalled().catch(() => [] as InstalledRecord[]),
      ])
      // 本地下载的插件优先展示
      const localRows: PluginRow[] = localList
        .filter((r) => r.type === 'plugin')
        .map((r) => ({
          id: -(r.id + 100000), // 负 id 避免与云端行冲突（仅作表格 key）
          pluginId: r.id,
          enabled: true,
          isInstalled: true,
          installedAt: r.installedAt,
          installDir: r.dir,
          plugin: {
            id: r.id,
            name: r.name,
            description: '',
            version: r.version,
            isOfficial: true,
          },
        }))
      const cloudRows = (res?.list || []) as PluginRow[]
      setPlugins([...localRows, ...cloudRows])
    } catch (err) {
      console.error('[InstalledPlugins] load failed:', err)
      message.error('加载已安装插件失败')
      setPlugins([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlugins()
  }, [loadPlugins])

  /** 启用/禁用切换 */
  const handleToggleEnabled = async (plugin: InstalledPluginRow, enabled: boolean) => {
    try {
      if (enabled) {
        await pluginApi.enablePlugin(plugin.pluginId)
        message.success(`插件 ${plugin.plugin.name} 已启用`)
      } else {
        await pluginApi.disablePlugin(plugin.pluginId)
        message.success(`插件 ${plugin.plugin.name} 已禁用`)
      }
      // 本地同步状态
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, enabled } : p)),
      )
    } catch (err) {
      console.error('[InstalledPlugins] toggle failed:', err)
      message.error('操作失败: ' + (err as Error).message)
    }
  }

  /** 卸载插件 */
  const handleUninstall = async (plugin: PluginRow) => {
    try {
      if (plugin.installDir) {
        const r = await marketApi.uninstall('plugin', plugin.pluginId)
        if (!r.ok) throw new Error(r.error || '本地卸载失败')
      } else {
        await pluginApi.uninstallPlugin(plugin.pluginId)
      }
      message.success(`插件 ${plugin.plugin.name} 已卸载`)
      setPlugins((prev) => prev.filter((p) => p.id !== plugin.id))
    } catch (err) {
      console.error('[InstalledPlugins] uninstall failed:', err)
      message.error('卸载失败: ' + (err as Error).message)
    }
  }

  /** 打开配置弹窗 */
  const handleOpenConfig = (plugin: InstalledPluginRow) => {
    setConfiguring(plugin)
    configForm.resetFields()
    // 用当前配置值初始化表单
    if (plugin.config && typeof plugin.config === 'object') {
      configForm.setFieldsValue(plugin.config)
    }
    setConfigOpen(true)
  }

  /** 保存配置 */
  const handleSaveConfig = async () => {
    if (!configuring) return
    try {
      const values = await configForm.validateFields()
      setSavingConfig(true)
      await pluginApi.updatePluginConfig(configuring.pluginId, values as Record<string, unknown>)
      message.success(`插件 ${configuring.plugin.name} 配置已保存`)
      setConfigOpen(false)
      setConfiguring(null)
      // 刷新列表
      void loadPlugins()
    } catch (err) {
      console.error('[InstalledPlugins] save config failed:', err)
      message.error('保存配置失败: ' + (err as Error).message)
    } finally {
      setSavingConfig(false)
    }
  }

  /** 表格列 */
  const columns: TableColumnsType<InstalledPluginRow> = [
    {
      title: '插件名称',
      dataIndex: ['plugin', 'name'],
      key: 'name',
      render: (name: string, record: InstalledPluginRow) => (
        <span style={{ color: '#e6edf3', fontWeight: 500 }}>
          {name}
          {record.plugin.isOfficial && (
            <span className={styles.officialBadge} style={{ marginLeft: 8 }}>
              官方
            </span>
          )}
        </span>
      ),
    },
    {
      title: '描述',
      dataIndex: ['plugin', 'description'],
      key: 'description',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{v}</span>
      ),
    },
    {
      title: '版本',
      dataIndex: ['plugin', 'version'],
      key: 'version',
      width: 80,
      render: (v: string) => <span style={{ color: 'var(--color-text-tertiary)' }}>v{v}</span>
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, record: InstalledPluginRow) => (
        <Switch
          checked={!!enabled}
          onChange={(checked) => handleToggleEnabled(record, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: InstalledPluginRow) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size="small"
            className={styles.backBtn}
            icon={<SettingOutlined />}
            onClick={() => handleOpenConfig(record)}
          >
            配置
          </Button>
          <Popconfirm
            title="确定卸载该插件吗？"
            description="卸载后将清除本地配置"
            onConfirm={() => handleUninstall(record)}
            okText="卸载"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              卸载
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ]

  return (
    <div className={styles.pageContainer}>
      {!embedded && (
        <>
          <div className={styles.pageHeader}>
            <div className={styles.pageTitle}>
              <AppstoreOutlined />
              <span>已安装插件</span>
            </div>
            <Button className={styles.backBtn} icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>
              返回
            </Button>
          </div>

          {/* Tab 导航 */}
          <div className={styles.tabNav}>
            <div className={styles.tabItem} onClick={() => navigate('/plugins')}>
              插件市场
            </div>
            <div
              className={`${styles.tabItem} ${styles.tabItemActive}`}
              onClick={() => navigate('/plugins/installed')}
            >
              已安装
            </div>
            <div className={styles.tabItem} onClick={() => navigate('/plugins/logs')}>
              调用记录
            </div>
          </div>
        </>
      )}

      <Spin spinning={loading}>
        <div className={styles.installedTableWrapper}>
          <Table<InstalledPluginRow>
            columns={columns}
            dataSource={plugins}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: '暂无已安装插件' }}
          />
        </div>
      </Spin>

      {/* 配置弹窗 */}
      <Modal
        title={configuring ? `配置 - ${configuring.plugin.name}` : '配置'}
        open={configOpen}
        onOk={handleSaveConfig}
        onCancel={() => {
          setConfigOpen(false)
          setConfiguring(null)
        }}
        confirmLoading={savingConfig}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        className={styles.configModal}
      >
        <Form form={configForm} layout="vertical" className={styles.configForm}>
          <Form.Item
            label="配置 JSON"
            name="__config_json"
            tooltip="直接输入 JSON 格式的配置"
          >
            <Input.TextArea
              rows={6}
              placeholder='{"apiKey":"xxx"}'
              className={styles.jsonCell}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
