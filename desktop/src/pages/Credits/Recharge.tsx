// 积分中心 - 充值页
// 真实支付：选档位 → 下单 → 展示真实二维码/支付链接 → 轮询支付结果 → 到账刷新余额

import { useEffect, useState } from 'react'
import {
  Card,
  Button,
  Radio,
  Spin,
  message,
  Typography,
  Tag,
  Result,
  Tooltip
} from 'antd'
import {
  RollbackOutlined,
  DollarOutlined,
  WechatOutlined,
  AlipayOutlined,
  ThunderboltOutlined,
  QrcodeOutlined,
  LinkOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'
import { QRCodeSVG } from 'qrcode.react'
import { useNavigate } from 'react-router-dom'
import { getRechargePlans, createRecharge, getRechargeStatus } from '@/api/credits-api'
import { useCreditsStore } from '@/store/credits'
import { BusinessError } from '@/utils/errors'
import type {
  RechargePlan,
  PaymentMethod,
  RechargeResult
} from '@/types/credits'
import styles from './styles.module.css'

const { Text } = Typography

/** 轮询间隔（毫秒） */
const POLL_INTERVAL = 2000
/** 最长轮询时长（5 分钟） */
const POLL_TIMEOUT = 5 * 60 * 1000

export default function Recharge() {
  const navigate = useNavigate()
  const fetchBalance = useCreditsStore((s) => s.fetchBalance)
  const [plans, setPlans] = useState<RechargePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat')
  const [payResult, setPayResult] = useState<RechargeResult | null>(null)
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    void loadPlans()
  }, [])

  // 支付结果轮询：支付成功后刷新余额并返回积分中心
  useEffect(() => {
    if (!payResult || paid) return
    let timer: ReturnType<typeof setInterval> | undefined
    const startedAt = Date.now()

    const poll = async () => {
      try {
        const st = await getRechargeStatus(payResult.orderId)
        if (st.status === 'paid') {
          if (timer) window.clearInterval(timer)
          setPaid(true)
          message.success('支付成功，积分已到账')
          await fetchBalance()
          setTimeout(() => navigate('/credits'), 1200)
        } else if (Date.now() - startedAt > POLL_TIMEOUT) {
          if (timer) window.clearInterval(timer)
          message.info('支付确认超时，可点击「重新查询」')
        }
      } catch (err) {
        // 轮询失败静默，下一轮继续
        console.error('[Recharge] poll status failed:', err)
      }
    }

    timer = window.setInterval(() => void poll(), POLL_INTERVAL)
    void poll()
    return () => {
      if (timer) window.clearInterval(timer)
    }
  }, [payResult, paid, fetchBalance, navigate])

  const loadPlans = async () => {
    setLoading(true)
    try {
      const data = await getRechargePlans()
      setPlans(data || [])
      const recommended = data.find((p) => p.isRecommended)
      if (recommended) {
        setSelectedPlanId(recommended.id)
      } else if (data.length > 0) {
        setSelectedPlanId(data[0].id)
      }
    } catch (err) {
      console.error('[Recharge] load plans failed:', err)
      message.error(err instanceof BusinessError ? err.message : '加载套餐失败')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (selectedPlanId == null) {
      message.warning('请选择充值套餐')
      return
    }
    setSubmitting(true)
    try {
      const result = await createRecharge({
        planId: selectedPlanId,
        paymentMethod
      })
      setPayResult(result)
      setPaid(false)
      message.success('订单已创建，请完成支付')
    } catch (err) {
      console.error('[Recharge] create order failed:', err)
      message.error(err instanceof BusinessError ? err.message : '创建订单失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    if (payResult) {
      setPayResult(null)
      setPaid(false)
      return
    }
    navigate('/credits')
  }

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <DollarOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>积分充值</h1>
            <div className={styles.subtitle}>选择套餐完成支付</div>
          </div>
        </div>
        <Button
          icon={<RollbackOutlined />}
          onClick={handleBack}
          className={styles.backBtn}
        >
          {payResult ? '重新选择' : '返回余额'}
        </Button>
      </div>

      {payResult ? (
        <PayResultView result={payResult} method={paymentMethod} paid={paid} />
      ) : (
        <Spin spinning={loading}>
          {/* 套餐列表 */}
          <div className={styles.sectionTitle}>
            <ThunderboltOutlined />
            选择充值套餐
          </div>
          <div className={styles.plansGrid}>
            {plans.map((plan) => {
              const selected = plan.id === selectedPlanId
              const cls = [
                styles.planCard,
                selected ? styles.planCardSelected : '',
                plan.isRecommended ? styles.planCardRecommended : ''
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <Card
                  key={plan.id}
                  className={cls}
                  bordered={false}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  {plan.isRecommended && (
                    <div className={styles.recommendBadge}>推荐</div>
                  )}
                  <div className={styles.planName}>{plan.name}</div>
                  <div>
                    <span className={styles.planCredits}>
                      {plan.credits.toLocaleString()}
                    </span>
                    <span className={styles.planCreditsUnit}>积分</span>
                  </div>
                  {plan.bonusCredits > 0 && (
                    <div className={styles.planBonus}>
                      赠送 {plan.bonusCredits.toLocaleString()} 积分
                    </div>
                  )}
                  <div className={styles.planPrice}>
                    <span className={styles.planPriceCurrency}>
                      {plan.currency === 'CNY' ? '¥' : plan.currency || '¥'}
                    </span>
                    {plan.price}
                  </div>
                </Card>
              )
            })}
            {!loading && plans.length === 0 && (
              <div className={styles.emptyState}>暂无可用套餐</div>
            )}
          </div>

          {/* 支付方式 */}
          <div className={styles.paymentSection}>
            <div className={styles.sectionTitle}>
              <DollarOutlined />
              选择支付方式
            </div>
            <Radio.Group
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <Radio.Button value="wechat" style={{ marginRight: 8 }}>
                <WechatOutlined style={{ color: '#34d399', marginRight: 6 }} />
                微信支付
              </Radio.Button>
              <Radio.Button value="alipay" style={{ marginRight: 8 }}>
                <AlipayOutlined style={{ color: '#3b82f6', marginRight: 6 }} />
                支付宝
              </Radio.Button>
              <Radio.Button value="stripe">
                <ThunderboltOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
                Stripe
              </Radio.Button>
            </Radio.Group>

            <Button
              type="primary"
              size="large"
              className={styles.confirmBtn}
              loading={submitting}
              disabled={selectedPlanId == null}
              onClick={handleConfirm}
            >
              确认充值
            </Button>
          </div>
        </Spin>
      )}
    </div>
  )
}

/** 支付结果展示（真实二维码 / 支付链接 + 状态轮询提示） */
function PayResultView({
  result,
  method,
  paid
}: {
  result: RechargeResult
  method: PaymentMethod
  paid: boolean
}) {
  const methodLabel =
    method === 'wechat' ? '微信支付' : method === 'alipay' ? '支付宝' : 'Stripe'

  const openPayUrl = () => {
    const api = (window as unknown as { electronAPI?: { openExternal?: (url: string) => Promise<void> } })
      .electronAPI
    if (api?.openExternal) {
      void api.openExternal(result.payUrl).catch(() => {
        window.open(result.payUrl, '_blank')
      })
    } else {
      window.open(result.payUrl, '_blank')
    }
  }

  return (
    <div className={styles.payResult}>
      <Result
        status={paid ? 'success' : 'info'}
        title={
          <span style={{ color: '#e6edf3' }}>
            {paid ? '支付成功，积分已到账' : '订单已创建，请完成支付'}
          </span>
        }
        subTitle={
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            订单号：{result.orderId} · 支付方式：{methodLabel}
          </span>
        }
      />
      <div style={{ marginTop: 8 }}>
        {result.qrCode ? (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-block',
                padding: 12,
                background: '#fff',
                borderRadius: 8
              }}
            >
              <QRCodeSVG value={result.qrCode} size={200} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Text style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                请使用{methodLabel}扫码完成支付
              </Text>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Tooltip title="点击复制支付链接">
              <Button
                type="dashed"
                icon={<LinkOutlined />}
                onClick={() => {
                  if (result.payUrl) {
                    void navigator.clipboard?.writeText?.(result.payUrl)
                    message.success('支付链接已复制')
                  }
                }}
              >
                复制支付链接
              </Button>
            </Tooltip>
            <div style={{ marginTop: 12 }}>
              <Button
                type="primary"
                icon={<QrcodeOutlined />}
                onClick={openPayUrl}
              >
                去支付（浏览器打开）
              </Button>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 16 }}>
        <Text style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
          {paid ? (
            <>
              <CheckCircleOutlined style={{ color: '#34d399', marginRight: 4 }} />
              积分已到账，正在返回积分中心…
            </>
          ) : (
            '支付成功后积分将自动到账，页面将自动刷新余额（约 2-5 秒）。'
          )}
        </Text>
      </div>
    </div>
  )
}
