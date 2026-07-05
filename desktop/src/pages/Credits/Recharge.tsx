// 积分中心 - 充值页
// SubTask 6.2
// 套餐选择 + 支付渠道（微信/支付宝/Stripe）+ 确认充值 → 返回支付链接/二维码

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
  LinkOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getRechargePlans, createRecharge } from '@/api/credits-api'
import type {
  RechargePlan,
  PaymentMethod,
  RechargeResult
} from '@/types/credits'
import styles from './styles.module.css'

const { Text } = Typography

export default function Recharge() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<RechargePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat')
  const [payResult, setPayResult] = useState<RechargeResult | null>(null)

  useEffect(() => {
    void loadPlans()
  }, [])

  const loadPlans = async () => {
    setLoading(true)
    try {
      const data = await getRechargePlans()
      setPlans(data || [])
      // 默认选中推荐套餐
      const recommended = data.find((p) => p.isRecommended)
      if (recommended) {
        setSelectedPlanId(recommended.id)
      } else if (data.length > 0) {
        setSelectedPlanId(data[0].id)
      }
    } catch (err) {
      console.error('[Recharge] load plans failed:', err)
      message.error('加载套餐失败')
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
      message.success('订单已创建，请完成支付')
    } catch (err) {
      console.error('[Recharge] create order failed:', err)
      message.error('创建订单失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    if (payResult) {
      setPayResult(null)
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
        <PayResultView result={payResult} method={paymentMethod} />
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
                <ThunderboltOutlined style={{ color: '#a5b4fc', marginRight: 6 }} />
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

/** 支付结果展示（二维码 / 链接占位） */
function PayResultView({
  result,
  method
}: {
  result: RechargeResult
  method: PaymentMethod
}) {
  const methodLabel =
    method === 'wechat' ? '微信支付' : method === 'alipay' ? '支付宝' : 'Stripe'
  return (
    <div className={styles.payResult}>
      <Result
        status="info"
        title={<span style={{ color: '#e6edf3' }}>订单已创建</span>}
        subTitle={
          <span style={{ color: '#8b949e' }}>
            订单号：{result.orderId} · 支付方式：{methodLabel}
          </span>
        }
      />
      <div style={{ marginTop: 8 }}>
        {result.qrCode ? (
          <div>
            <div className={styles.qrPlaceholder}>
              <QrcodeOutlined style={{ fontSize: 64 }} />
              <br />
              二维码占位
            </div>
            <Text className={styles.payUrl}>
              <Tag color="purple">二维码内容</Tag>
              {result.qrCode}
            </Text>
          </div>
        ) : (
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
        )}
      </div>
      <div style={{ marginTop: 16 }}>
        <Text style={{ color: '#8b949e', fontSize: 12 }}>
          支付完成后积分将自动到账，余额变更通过 WebSocket 实时推送。
        </Text>
      </div>
    </div>
  )
}
