// 积分中心 - 余额总览页
// SubTask 6.1
// 顶部卡片：当前余额（大字体）+ 冻结积分 + 累计充值 + 累计消费 + 充值按钮

import { useEffect } from 'react'
import { Card, Statistic, Button, message, Skeleton } from 'antd'
import {
  WalletOutlined,
  LockOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
  PieChartOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useCreditsStore } from '@/store/credits'
import styles from './styles.module.css'

export default function CreditsOverview() {
  const navigate = useNavigate()
  const { balance, frozenBalance, totalRecharged, totalConsumed, loaded, fetchBalance } =
    useCreditsStore()

  useEffect(() => {
    void fetchBalance()
  }, [fetchBalance])

  const handleRefresh = async () => {
    try {
      await fetchBalance()
      message.success('余额已刷新')
    } catch {
      message.error('刷新失败')
    }
  }

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <WalletOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>积分中心</h1>
            <div className={styles.subtitle}>管理您的积分余额、充值与流水</div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          className={styles.backBtn}
        >
          刷新余额
        </Button>
      </div>

      {!loaded ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <>
          {/* 余额主卡片 */}
          <Card className={styles.balanceCard} bordered={false}>
            <div className={styles.balanceRow}>
              <div className={styles.balanceMain}>
                <div className={styles.balanceLabel}>当前余额</div>
                <div>
                  <span className={styles.balanceValue}>{balance.toLocaleString()}</span>
                  <span className={styles.balanceUnit}>积分</span>
                </div>
              </div>
              <Button
                type="primary"
                size="large"
                icon={<DollarOutlined />}
                className={styles.rechargeBtn}
                onClick={() => navigate('/credits/recharge')}
              >
                立即充值
              </Button>
            </div>
          </Card>

          {/* 统计卡片 */}
          <div className={styles.statsGrid}>
            <Card className={styles.statCard} bordered={false}>
              <Statistic
                title={<span style={{ color: '#8b949e' }}>冻结积分</span>}
                value={frozenBalance}
                prefix={<LockOutlined style={{ color: '#fbbf24' }} />}
                valueStyle={{ color: '#fbbf24' }}
              />
            </Card>
            <Card className={styles.statCard} bordered={false}>
              <Statistic
                title={<span style={{ color: '#8b949e' }}>累计充值</span>}
                value={totalRecharged}
                prefix={<ArrowUpOutlined style={{ color: '#34d399' }} />}
                valueStyle={{ color: '#34d399' }}
              />
            </Card>
            <Card className={styles.statCard} bordered={false}>
              <Statistic
                title={<span style={{ color: '#8b949e' }}>累计消费</span>}
                value={totalConsumed}
                prefix={<ArrowDownOutlined style={{ color: '#f87171' }} />}
                valueStyle={{ color: '#f87171' }}
              />
            </Card>
          </div>
        </>
      )}

      {/* 快捷入口 */}
      <div className={styles.actionsGrid}>
        <Card
          className={styles.actionCard}
          bordered={false}
          onClick={() => navigate('/credits/recharge')}
        >
          <div className={styles.actionInner}>
            <DollarOutlined className={styles.actionIcon} />
            <div className={styles.actionText}>
              <span className={styles.actionTitle}>充值</span>
              <span className={styles.actionDesc}>购买积分套餐</span>
            </div>
          </div>
        </Card>
        <Card
          className={styles.actionCard}
          bordered={false}
          onClick={() => navigate('/credits/transactions')}
        >
          <div className={styles.actionInner}>
            <UnorderedListOutlined className={styles.actionIcon} />
            <div className={styles.actionText}>
              <span className={styles.actionTitle}>流水查询</span>
              <span className={styles.actionDesc}>查看所有积分变动</span>
            </div>
          </div>
        </Card>
        <Card
          className={styles.actionCard}
          bordered={false}
          onClick={() => navigate('/credits/consumption')}
        >
          <div className={styles.actionInner}>
            <PieChartOutlined className={styles.actionIcon} />
            <div className={styles.actionText}>
              <span className={styles.actionTitle}>消费明细</span>
              <span className={styles.actionDesc}>对话 / 插件 / 工作流</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 底部说明 */}
      <div style={{ marginTop: 24, padding: '12px 16px', background: 'rgba(17, 24, 39, 0.6)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: 10 }}>
        <ThunderboltOutlined style={{ color: '#818cf8', marginRight: 8 }} />
        <span style={{ color: '#8b949e', fontSize: 12 }}>
          积分用于对话调用、插件调用、工作流执行等。后端采用三阶段计费（冻结 → 结算 → 退补），余额变更将通过 WebSocket 实时推送。
        </span>
      </div>
    </div>
  )
}
