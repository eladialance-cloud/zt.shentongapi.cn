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
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  DeleteOutlined,
  SettingOutlined
} from '@ant-design/icons'
import * as pluginApi from '@/api/plugin-api'
import type { Plugin, PluginType } from '@/types/plugin'
import styles from './styles.module.css'

/** 类型标签 className 映射 */
function typeTagClass(type: PluginType): string {
  switch (type) {
    case 'tool':
      return styles.typeTagTool
    case 'connector':
      return styles.typeTagConnector
    case 'knowledge_base':
      return styles.typeTagKb
    case 'workflow':
      return styles.typeTagWorkflow
    default:
      return ''
  }
}

/** 类型中文显示 */
function typeLabel(type: PluginType): string {
  switch (type) {
    case 'tool':
      return '工具'
    case 'connector':
      return '连接器'
    case 'knowledge_base':
      return '知识库'
    case 'workflow':
      return '工作流'
    default:
      return type
  }
}

export default function InstalledPlugins() {
  const navigate = useNavigate()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [configuring, setConfiguring] = useState<Plugin | null>(null)
  const [configForm] = Form.useForm()
  const [savingConfig, setSavingConfig] = useState(false)

  /** 加载已安装插件列表 */
  const loadPlugins = useCallback(async () => {
    setLoading(true)
    try {
      const list = await pluginApi.listInstalledPlugins()
      setPlugins(list || [])
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
  const handleToggleEnabled = async (plugin: Plugin, enabled: boolean) => {
    try {
      if (enabled) {
        await pluginApi.enablePlugin(plugin.id)
        message.success(`插件 ${plugin.name} 已启用`)
      } else {
        await pluginApi.disablePlugin(plugin.id)
        message.success(`插件 ${plugin.name} 已禁用`)
      }
      // 本地同步状态
      setPlugins((prev) =>
        prev.map((p) => (p.id === plugin.id ? { ...p, isEnabled: enabled } : p))
      )
    } catch (err) {
      console.error('[InstalledPlugins] toggle failed:', err)
      message.error('操作失败: ' + (err as Error).message)
    }
  }

  /** 卸载插件 */
  const handleUninstall = async (plugin: Plugin) => {
    try {
      await pluginApi.uninstallPlugin(plugin.id)
      message.success(`插件 ${plugin.name} 已卸载`)
      setPlugins((prev) => prev.filter((p) => p.id !== plugin.id))
    } catch (err) {
      console.error('[InstalledPlugins] uninstall failed:', err)
      message.error('卸载失败: ' + (err as Error).message)
    }
  }

  /** 打开配置弹窗 */
  const handleOpenConfig = (plugin: Plugin) => {
    setConfiguring(plugin)
    configForm.resetFields()
    // 用当前配置值初始化表单（若 configSchema 中字段为字符串则填字符串）
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
      await pluginApi.updatePluginConfig(configuring.id, values as Record<string, unknown>)
      message.success(`插件 ${configuring.name} 配置已保存`)
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
  const columns: TableColumnsType<Plugin> = [
    {
      title: '插件名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Plugin) => (
        <span style={{ color: '#e6edf3', fontWeight: 500 }}>
          {name}
          {record.isOfficial && (
            <span className={styles.officialBadge} style={{ marginLeft: 8 }}>
              官方
            </span>
          )}
        </span>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ color: '#8b949e', fontSize: 12 }}>{v}</span>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t: PluginType) => (
        <Tag className={`${styles.typeTag} ${typeTagClass(t)}`}>
          {typeLabel(t)}
        </Tag>
      )
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (v: string) => <span style={{ color: '#8b949e' }}>v{v}</span>
    },
    {
      title: '启用',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 80,
      render: (enabled: boolean, record: Plugin) => (
        <Switch
          checked={!!enabled}
          onChange={(checked) => handleToggleEnabled(record, checked)}
        />
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: Plugin) => (
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
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              卸载
            </Button>
          </Popconfirm>
        </div>
      )
    }
  ]

  /** 渲染配置表单字段（基于 configSchema，未提供时仅显示一个 JSON 文本框） */
  const renderConfigFields = () => {
    if (!configuring) return null
    const schema = configuring.configSchema as
      | { properties?: Record<string, { type?: string; title?: string; description?: string }> }
      | undefined

    if (!schema?.properties || Object.keys(schema.properties).length === 0) {
      return (
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
      )
    }

    return Object.entries(schema.properties).map(([key, prop]) => (
      <Form.Item
        key={key}
        label={prop.title || key}
        name={key}
        tooltip={prop.description}
      >
        <Input.Password placeholder={`请输入 ${prop.title || key}`} />
      </Form.Item>
    ))
  }

  return (
    <div className={styles.pageContainer}>
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

      <Spin spinning={loading}>
        <div className={styles.installedTableWrapper}>
          <Table<Plugin>
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
        title={configuring ? `配置 - ${configuring.name}` : '配置'}
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
          {renderConfigFields()}
        </Form>
      </Modal>
    </div>
  )
}
