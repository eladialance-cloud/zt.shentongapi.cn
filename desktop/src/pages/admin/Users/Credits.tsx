// 积分账户管理页 - SubTask 18.3
//
// 功能：
// - 搜索用户(输入用户名/ID)
// - 展示用户积分账户:余额/冻结/累计充值/累计消费/版本号
// - 手动调整余额(modal:金额正负 + 备注)→ 写入 admin_adjust 流水
// - 展示该用户最近 50 条流水

import { useCallback, useState } from 'react'
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Spin,
  Table,
  Tag,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ReloadOutlined,
  SearchOutlined,
  WalletOutlined,
  EditOutlined
} from '@ant-design/icons'
import {
  adjustUserCredits,
  getUserCreditsAccount,
  listUserCreditTransactions
} from '@/api/admin-user-api'
import type {
  AdminCreditTransaction,
  AdminCreditsAccount
} from '@/types/admin-user'
import styles from './styles.module.css'

interface AdjustFormValues {
  amount: number
  remark: string
}

export default function AdminUserCredits() {
  const [searchKey, setSearchKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [account, setAccount] = useState<AdminCreditsAccount | null>(null)
  const [transactions, setTransactions] = useState<AdminCreditTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [form] = Form.useForm<AdjustFormValues>()
  const [saving, setSaving] = useState(false)

  const loadAccount = useCallback(async (key: string) => {
    const id = Number(key.trim())
    if (!key.trim() || Number.isNaN(id)) {
      message.warning('请输入有效的用户 ID')
      return
    }
    setLoading(true)
    setAccount(null)
    setTransactions([])
    try {
      const acc = await getUserCreditsAccount(id)
      setAccount(acc)
      // 加载流水
      setTxLoading(true)
      try {
        const list = await listUserCreditTransactions(id, 50)
        setTransactions(list || [])
      } catch (err) {
        console.error('[UserCredits] load tx failed:', err)
        message.error('加载流水失败')
      } finally {
        setTxLoading(false)
      }
    } catch (err) {
      console.error('[UserCredits] load account failed:', err)
      message.error('加载积分账户失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearch = () => {
    if (!searchKey.trim()) {
      message.warning('请输入用户 ID')
      return
    }
    void loadAccount(searchKey)
  }

  const handleAdjust = async () => {
    if (!account) return
    try {
      const values = await form.validateFields()
      if (values.amount === 0) {
        message.warning('金额不能为 0')
        return
      }
      setSaving(true)
      await adjustUserCredits(account.userId, {
        amount: values.amount,
        remark: values.remark
      })
      message.success('积分调整成功')
      setAdjustOpen(false)
      form.resetFields()
      // 重新加载账户与流水
      void loadAccount(String(account.userId))
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[UserCredits] adjust failed:', err)
      message.error('积分调整失败')
    } finally {
      setSaving(false)
    }
  }

  const txColumns: TableColumnsType<AdminCreditTransaction> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <span style={{ color: '#8b949e' }}>{t}</span>
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (t: string) => <Tag color="blue">{t}</Tag>
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (v: number) => (
        <span className={v >= 0 ? styles.amountPositive : styles.amountNegative}>
          {v >= 0 ? '+' : ''}
          {v}
        </span>
      )
    },
    {
      title: '变动前余额',
      dataIndex: 'balanceBefore',
      key: 'balanceBefore',
      width: 120
    },
    {
      title: '变动后余额',
      dataIndex: 'balanceAfter',
      key: 'balanceAfter',
      width: 120
    },
    { title: '来源', dataIndex: 'source', key: 'source', width: 120 },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (v: string) => <span style={{ color: '#94a3b8' }}>{v || '-'}</span>
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <WalletOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>积分账户管理</h1>
            <div className={styles.subtitle}>查询用户积分账户并手动调整余额</div>
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            placeholder="输入用户 ID"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            onPressEnter={handleSearch}
            className={styles.searchBox}
            allowClear
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            className={styles.primaryBtn}
          >
            搜索
          </Button>
        </div>
        {account && (
          <Button
            icon={<EditOutlined />}
            onClick={() => setAdjustOpen(true)}
            className={styles.primaryBtn}
          >
            手动调整余额
          </Button>
        )}
      </div>

      <Spin spinning={loading}>
        {!account && !loading ? (
          <Empty description="请输入用户 ID 查询积分账户" style={{ marginTop: 80 }} />
        ) : (
          account && (
            <>
              <div className={styles.accountGrid}>
                <div className={styles.accountItem}>
                  <div className={styles.accountLabel}>用户</div>
                  <div className={styles.accountValue}>
                    {account.username} #{account.userId}
                  </div>
                </div>
                <div className={styles.accountItem}>
                  <div className={styles.accountLabel}>余额</div>
                  <div className={styles.accountValue}>
                    {account.balance.toLocaleString()}
                  </div>
                </div>
                <div className={styles.accountItem}>
                  <div className={styles.accountLabel}>冻结</div>
                  <div className={styles.accountValue}>
                    {account.frozenBalance.toLocaleString()}
                  </div>
                </div>
                <div className={styles.accountItem}>
                  <div className={styles.accountLabel}>累计充值</div>
                  <div className={styles.accountValue}>
                    {account.totalRecharged.toLocaleString()}
                  </div>
                </div>
                <div className={styles.accountItem}>
                  <div className={styles.accountLabel}>累计消费</div>
                  <div className={styles.accountValue}>
                    {account.totalConsumed.toLocaleString()}
                  </div>
                </div>
                <div className={styles.accountItem}>
                  <div className={styles.accountLabel}>版本号</div>
                  <div className={styles.accountValue}>{account.version}</div>
                </div>
              </div>

              <div className={styles.sectionTitle}>
                <ReloadOutlined /> 最近 50 条流水
              </div>
              <Spin spinning={txLoading}>
                {transactions.length === 0 && !txLoading ? (
                  <Empty description="暂无流水" style={{ marginTop: 40 }} />
                ) : (
                  <div className={styles.tableWrap}>
                    <Table<AdminCreditTransaction>
                      rowKey="id"
                      columns={txColumns}
                      dataSource={transactions}
                      pagination={false}
                      size="middle"
                      scroll={{ x: 880 }}
                    />
                  </div>
                )}
              </Spin>
            </>
          )
        )}
      </Spin>

      <Modal
        title={`手动调整余额 - ${account?.username || ''}`}
        open={adjustOpen}
        onCancel={() => setAdjustOpen(false)}
        onOk={handleAdjust}
        confirmLoading={saving}
        okText="确认调整"
        cancelText="取消"
        destroyOnClose
      >
        <Form<AdjustFormValues> form={form} layout="vertical">
          <Form.Item
            name="amount"
            label="调整金额(正数为增加,负数为扣减)"
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="如 100 或 -50"
              step={1}
            />
          </Form.Item>
          <Form.Item
            name="remark"
            label="备注"
            rules={[{ required: true, message: '请输入备注' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="调整原因(将记录到 admin_adjust 流水)"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
