// 支付配置页
//
// 功能：微信 / 支付宝 / Stripe 三个渠道卡片
// 每个渠道可编辑商户参数 + 启用开关；当前为模拟支付阶段
// API: GET /admin/payment-configs、PUT /admin/payment-configs/:channel

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Spin,
  Switch,
  Tag,
  message
} from 'antd'
import {
  AlipayCircleOutlined,
  CreditCardOutlined,
  EditOutlined,
  ReloadOutlined,
  WechatOutlined
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { getPaymentConfigs, updatePaymentConfig } from '@/api/admin-payment-api'
import type {
  PaymentChannel,
  PaymentChannelConfig,
  PaymentConfig
} from '@/types/admin-payment'
import styles from './styles.module.css'

interface ChannelField {
  key: keyof PaymentChannelConfig
  label: string
  placeholder?: string
  textarea?: boolean
}

const CHANNEL_META: Record<
  PaymentChannel,
  { label: string; desc: string; color: string; icon: ReactNode; fields: ChannelField[] }
> = {
  wechat: {
    label: '微信支付',
    desc: '微信 Native 扫码支付（微信商户平台）',
    color: '#07C160',
    icon: <WechatOutlined />,
    fields: [
      { key: 'appId', label: 'AppID', placeholder: 'wx 开头的应用 ID' },
      { key: 'mchId', label: '商户号', placeholder: '微信支付商户号 MCHID' },
      { key: 'serialNo', label: '商户证书序列号', placeholder: 'API 证书序列号（apiclient_cert 序列号）' },
      { key: 'apiV3Key', label: 'APIv3 密钥', placeholder: '32 位 APIv3 密钥' },
      { key: 'privateKey', label: '商户 API 私钥', textarea: true, placeholder: 'apiclient_key.pem 内容（PKCS8）' },
      { key: 'platformPublicKey', label: '微信支付平台公钥', textarea: true, placeholder: '用于回调验签的微信支付平台公钥（PEM）' },
      { key: 'notifyUrl', label: '支付回调地址', placeholder: 'https://zt.shentongapi.cn/api/payments/wechat/notify' }
    ]
  },
  alipay: {
    label: '支付宝',
    desc: '支付宝当面付 / 电脑网站支付',
    color: '#1677FF',
    icon: <AlipayCircleOutlined />,
    fields: [
      { key: 'appId', label: '应用 AppID', placeholder: '开放平台应用 ID' },
      { key: 'merchantPrivateKey', label: '应用私钥', textarea: true, placeholder: '应用私钥（RSA2）' },
      { key: 'alipayPublicKey', label: '支付宝公钥', textarea: true, placeholder: '支付宝公钥' },
      { key: 'notifyUrl', label: '支付回调地址', placeholder: 'https://zt.shentongapi.cn/api/payments/alipay/notify' }
    ]
  },
  stripe: {
    label: 'Stripe',
    desc: 'Stripe Checkout（海外支付）',
    color: '#635BFF',
    icon: <CreditCardOutlined />,
    fields: [
      { key: 'secretKey', label: 'Secret Key', placeholder: 'sk_ 开头' },
      { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_ 开头' },
      { key: 'webhookSecret', label: 'Webhook Secret', placeholder: 'whsec_ 开头' },
      { key: 'successUrl', label: '成功跳转地址', placeholder: 'https://zt.shentongapi.cn/landing/pay-success' },
      { key: 'cancelUrl', label: '取消跳转地址', placeholder: 'https://zt.shentongapi.cn/landing/pay-cancel' }
    ]
  }
}

export default function PaymentConfigPage() {
  const [configs, setConfigs] = useState<PaymentConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<PaymentConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const configMap = useMemo(() => {
    const map: Partial<Record<PaymentChannel, PaymentConfig>> = {}
    configs.forEach((c) => {
      map[c.channel] = c
    })
    return map
  }, [configs])

  const realEnabled = useMemo(
    () =>
      (Object.keys(configMap) as PaymentChannel[]).some(
        (c) => configMap[c]?.enabled && !configMap[c]?.isMock
      ),
    [configMap]
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPaymentConfigs()
      setConfigs(data)
    } catch (err) {
      message.error('加载支付配置失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleToggle = async (cfg: PaymentConfig, enabled: boolean) => {
    try {
      await updatePaymentConfig(cfg.channel, { enabled })
      setConfigs((prev) => prev.map((c) => (c.channel === cfg.channel ? { ...c, enabled } : c)))
      message.success(enabled ? `${CHANNEL_META[cfg.channel].label}已启用` : `${CHANNEL_META[cfg.channel].label}已停用`)
    } catch (err) {
      message.error('更新状态失败')
      console.error(err)
    }
  }

  const handleMockToggle = async (cfg: PaymentConfig, real: boolean) => {
    try {
      await updatePaymentConfig(cfg.channel, { isMock: !real })
      setConfigs((prev) =>
        prev.map((c) => (c.channel === cfg.channel ? { ...c, isMock: !real } : c))
      )
      message.success(
        real
          ? `${CHANNEL_META[cfg.channel].label}已切换为真实支付`
          : `${CHANNEL_META[cfg.channel].label}已切换为模拟支付`
      )
    } catch (err) {
      message.error('更新模拟状态失败')
      console.error(err)
    }
  }

  const openEdit = (cfg: PaymentConfig) => {
    setEditing(cfg)
    const meta = CHANNEL_META[cfg.channel]
    const values: Record<string, unknown> = {
      displayName: cfg.displayName || meta.label
    }
    // 后端已对密钥脱敏为 '***' 占位：不回填到输入框，留空表示保持不变
    const raw = cfg.config || {}
    meta.fields.forEach((f) => {
      const v = raw[f.key]
      if (v !== undefined && v !== null && v !== '***') {
        values[f.key] = v
      }
    })
    form.resetFields()
    form.setFieldsValue(values)
  }

  const handleSave = async () => {
    if (!editing) return
    try {
      const values = await form.validateFields()
      const meta = CHANNEL_META[editing.channel]
      const config: PaymentChannelConfig = {}
      meta.fields.forEach((f) => {
        const v = values[f.key]
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          config[f.key] = String(v)
        }
      })
      setSaving(true)
      await updatePaymentConfig(editing.channel, {
        displayName: values.displayName,
        config
      })
      message.success('保存成功')
      setEditing(null)
      loadData()
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error('保存失败')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <CreditCardOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>支付配置</h1>
            <div className={styles.subtitle}>配置微信 / 支付宝 / Stripe 商户参数，并控制渠道启停</div>
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          刷新
        </Button>
      </div>

      <Alert
        type={realEnabled ? 'success' : 'info'}
        showIcon
        style={{ marginBottom: 16 }}
        message={realEnabled ? '真实支付已启用' : '当前为模拟支付配置'}
        description={
          realEnabled
            ? '已启用真实支付渠道：用户下单将调用微信 / 支付宝 / Stripe 真实网关，支付成功回调后积分自动到账。'
            : '配置商户参数后，在渠道卡片上关闭「模拟支付」开关并启用渠道，用户下单即走真实支付。'
        }
      />

      <Spin spinning={loading}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {(Object.keys(CHANNEL_META) as PaymentChannel[]).map((channel) => {
            const meta = CHANNEL_META[channel]
            const cfg = configMap[channel]
            const enabled = !!cfg?.enabled
            const cfgKeys = cfg?.config ? Object.keys(cfg.config).filter((k) => cfg.config[k as keyof PaymentChannelConfig]) : []
            return (
              <Card
                key={channel}
                style={{ borderTop: `3px solid ${meta.color}` }}
                title={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: meta.color, fontSize: 18 }}>{meta.icon}</span>
                    {cfg?.displayName || meta.label}
                  </span>
                }
                extra={
                  <Tag color={enabled ? 'green' : 'default'}>{enabled ? '已启用' : '未启用'}</Tag>
                }
              >
                <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>{meta.desc}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: '#cbd5e1' }}>启用渠道</span>
                  <Switch
                    checked={enabled}
                    onChange={(v) => cfg && handleToggle(cfg, v)}
                    disabled={!cfg}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: '#cbd5e1' }}>模拟支付</span>
                  <Switch
                    checked={!cfg?.isMock}
                    onChange={(v) => cfg && handleMockToggle(cfg, v)}
                    disabled={!cfg}
                    checkedChildren="真实"
                    unCheckedChildren="模拟"
                  />
                </div>
                {cfgKeys.length > 0 ? (
                  <div style={{ color: '#7dd3fc', fontSize: 12, marginBottom: 12 }}>已配置 {cfgKeys.length} 项参数</div>
                ) : (
                  <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>尚未配置商户参数</div>
                )}
                <Button
                  type="primary"
                  ghost
                  icon={<EditOutlined />}
                  onClick={() => cfg && openEdit(cfg)}
                  disabled={!cfg}
                >
                  编辑配置
                </Button>
              </Card>
            )
          })}
        </div>
      </Spin>

      <Modal
        title={`编辑${editing ? CHANNEL_META[editing.channel].label : ''}配置`}
        open={!!editing}
        onOk={handleSave}
        onCancel={() => setEditing(null)}
        confirmLoading={saving}
        width={560}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="displayName" label="渠道名称">
            <Input maxLength={32} />
          </Form.Item>
          {editing &&
            CHANNEL_META[editing.channel].fields.map((f) => {
              const masked = (editing.config?.[f.key]) === '***'
              const ph = masked ? '已配置，留空保持不变（重新填写将覆盖）' : f.placeholder
              return (
                <Form.Item key={f.key} name={f.key} label={f.label}>
                  {f.textarea ? (
                    <Input.TextArea rows={3} placeholder={ph} />
                  ) : (
                    <Input placeholder={ph} />
                  )}
                </Form.Item>
              )
            })}
        </Form>
      </Modal>
    </div>
  )
}
