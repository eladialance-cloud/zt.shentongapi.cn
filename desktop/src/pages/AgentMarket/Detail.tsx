// Agent 市场 - 详情页
// SubTask 7.2
// 顶部：头像/名称/描述/分类/评分/调用次数 + 使用示例 + 定价 + 评价列表 + 收藏 + 使用按钮
// 不展示 systemPrompt

import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  Button,
  Rate,
  Spin,
  Tag,
  Empty,
  List,
  Avatar,
  Form,
  Modal,
  Input,
  message
} from 'antd'
import {
  RollbackOutlined,
  CrownOutlined,
  ThunderboltOutlined,
  HeartOutlined,
  HeartFilled,
  FireOutlined,
  RobotOutlined,
  UserOutlined,
  MessageOutlined,
  StarOutlined
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getMarketDetail,
  getMarketReviews,
  createReview,
  favoriteAgent,
  unfavoriteAgent
} from '@/api/agent-api'
import type { Agent, AgentReview } from '@/types/agent'
import styles from './styles.module.css'

export default function AgentDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const agentId = Number(id)

  const [loading, setLoading] = useState(true)
  const [agent, setAgent] = useState<Agent | null>(null)
  const [reviews, setReviews] = useState<AgentReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)

  const loadDetail = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getMarketDetail(agentId)
      setAgent(data)
    } catch (err) {
      console.error('[AgentDetail] load failed:', err)
      message.error('加载 Agent 详情失败')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true)
    try {
      const data = await getMarketReviews(agentId)
      setReviews(data || [])
    } catch (err) {
      console.error('[AgentDetail] load reviews failed:', err)
    } finally {
      setReviewsLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    void loadDetail()
    void loadReviews()
  }, [loadDetail, loadReviews])

  const handleToggleFav = async () => {
    if (!agent) return
    const wasFav = !!agent.isFavorited
    setAgent({ ...agent, isFavorited: !wasFav })
    try {
      if (wasFav) {
        await unfavoriteAgent(agent.id)
        message.success('已取消收藏')
      } else {
        await favoriteAgent(agent.id)
        message.success('已收藏')
      }
    } catch (err) {
      setAgent({ ...agent, isFavorited: wasFav })
      console.error('[AgentDetail] toggle fav failed:', err)
      message.error('操作失败')
    }
  }

  const handleUse = () => {
    navigate(`/chat?agentId=${agentId}`)
  }

  const handleSubmitReview = async (values: { rating: number; comment: string }) => {
    try {
      await createReview(agentId, {
        rating: values.rating,
        comment: values.comment
      })
      message.success('评价已提交')
      setReviewModalOpen(false)
      void loadReviews()
    } catch (err) {
      console.error('[AgentDetail] submit review failed:', err)
      message.error('提交评价失败')
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ textAlign: 'center', paddingTop: 80 }}>
          <Spin size="large" />
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className={styles.page}>
        <Empty description="Agent 不存在或已下架" style={{ marginTop: 80 }} />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/agents')} className={styles.backBtn}>
            返回市场
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* 顶部标题 */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <RobotOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>Agent 详情</h1>
            <div className={styles.subtitle}>查看 Agent 详细信息与评价</div>
          </div>
        </div>
        <Button
          icon={<RollbackOutlined />}
          onClick={() => navigate('/agents')}
          className={styles.backBtn}
        >
          返回市场
        </Button>
      </div>

      {/* 顶部信息卡 */}
      <Card className={styles.detailCard} bordered={false}>
        <div className={styles.detailHeader}>
          <div className={styles.detailAvatar}>
            {agent.avatar ? (
              <img
                src={agent.avatar}
                alt={agent.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              agent.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className={styles.detailInfo}>
            <div className={styles.detailName}>
              {agent.isOfficial && (
                <span className={styles.officialBadge}>
                  <CrownOutlined /> 官方
                </span>
              )}
              <span>{agent.name}</span>
            </div>
            <div className={styles.detailDesc}>{agent.description || '暂无描述'}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <Tag color="blue">{agent.category}</Tag>
              {agent.tags?.map((tag, idx) => (
                <Tag key={idx}>{tag}</Tag>
              ))}
              {agent.creatorName && (
                <Tag color="purple">
                  <UserOutlined /> {agent.creatorName}
                </Tag>
              )}
            </div>
            <div className={styles.detailStats}>
              <div className={styles.detailStat}>
                <span className={styles.detailStatLabel}>评分</span>
                <span className={styles.detailStatValue}>
                  <Rate
                    disabled
                    allowHalf
                    value={agent.rating}
                    character={<ThunderboltOutlined className={styles.ratingStar} />}
                    style={{ fontSize: 14 }}
                  />
                  <span style={{ marginLeft: 6 }}>{agent.rating.toFixed(1)}</span>
                </span>
              </div>
              <div className={styles.detailStat}>
                <span className={styles.detailStatLabel}>评价数</span>
                <span className={styles.detailStatValue}>{agent.ratingCount}</span>
              </div>
              <div className={styles.detailStat}>
                <span className={styles.detailStatLabel}>调用次数</span>
                <span className={styles.detailStatValue}>
                  <FireOutlined style={{ color: '#fb923c', marginRight: 4 }} />
                  {agent.callCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button
              icon={
                agent.isFavorited ? <HeartFilled /> : <HeartOutlined />
              }
              onClick={handleToggleFav}
              className={
                agent.isFavorited
                  ? `${styles.favBtn} ${styles.favBtnActive}`
                  : styles.favBtn
              }
            >
              {agent.isFavorited ? '已收藏' : '收藏'}
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<ThunderboltOutlined />}
              className={styles.useAgentBtn}
              onClick={handleUse}
            >
              使用此 Agent
            </Button>
          </div>
        </div>
      </Card>

      {/* 使用示例（不使用 react-markdown，采用 pre 标签） */}
      {agent.usageExample && (
        <Card className={styles.sectionCard} bordered={false} title={
          <span className={styles.sectionTitle}>
            <MessageOutlined /> 使用示例
          </span>
        }>
          <pre className={styles.usageExample}>{agent.usageExample}</pre>
        </Card>
      )}

      {/* 定价信息 */}
      <Card className={styles.sectionCard} bordered={false} title={
        <span className={styles.sectionTitle}>
          <ThunderboltOutlined /> 定价信息
        </span>
      }>
        <div className={styles.priceTable}>
          <div className={styles.priceItem}>
            <div className={styles.priceItemLabel}>每次调用</div>
            <div className={styles.priceItemValue}>
              {agent.pricePerCall === 0 ? '免费' : `${agent.pricePerCall} 积分`}
            </div>
          </div>
          <div className={styles.priceItem}>
            <div className={styles.priceItemLabel}>输入 Token（/千）</div>
            <div className={styles.priceItemValue}>
              {agent.pricePerToken.input} 积分
            </div>
          </div>
          <div className={styles.priceItem}>
            <div className={styles.priceItemLabel}>输出 Token（/千）</div>
            <div className={styles.priceItemValue}>
              {agent.pricePerToken.output} 积分
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#8b949e' }}>
          计费流程：调用时冻结预估积分 → 完成后按实际 Token 用量结算 → 退还多余冻结。
          创作者将获得分成收益。
        </div>
      </Card>

      {/* 评价列表 */}
      <Card
        className={styles.sectionCard}
        bordered={false}
        title={
          <span className={styles.sectionTitle}>
            <StarOutlined /> 用户评价（{reviews.length}）
          </span>
        }
        extra={
          <Button type="primary" ghost onClick={() => setReviewModalOpen(true)}>
            写评价
          </Button>
        }
      >
        <Spin spinning={reviewsLoading}>
          {reviews.length === 0 && !reviewsLoading ? (
            <Empty description="暂无评价" />
          ) : (
            <List
              dataSource={reviews}
              renderItem={(review) => (
                <List.Item className={styles.reviewItem}>
                  <div style={{ width: '100%' }}>
                    <div className={styles.reviewHeader}>
                      <div className={styles.reviewUser}>
                        <Avatar
                          size="small"
                          src={review.avatar}
                          icon={<UserOutlined />}
                        />
                        <span>{review.username}</span>
                        <Rate
                          disabled
                          allowHalf
                          value={review.rating}
                          style={{ fontSize: 12, marginLeft: 8 }}
                        />
                      </div>
                      <span className={styles.reviewTime}>
                        {new Date(review.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className={styles.reviewComment}>{review.comment}</div>
                  </div>
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Card>

      {/* 评价表单弹窗 */}
      <ReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        onSubmit={handleSubmitReview}
      />
    </div>
  )
}

/** 评价表单弹窗 */
function ReviewModal({
  open,
  onClose,
  onSubmit
}: {
  open: boolean
  onClose: () => void
  onSubmit: (values: { rating: number; comment: string }) => Promise<void>
}) {
  const [form] = Form.useForm<{ rating: number; comment: string }>()
  const [submitting, setSubmitting] = useState(false)

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await onSubmit(values)
      form.resetFields()
    } catch {
      // 校验失败或提交失败
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="写评价"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText="提交"
      cancelText="取消"
    >
      <Form form={form} layout="vertical" initialValues={{ rating: 5 }}>
        <Form.Item
          name="rating"
          label="评分"
          rules={[{ required: true, message: '请选择评分' }]}
        >
          <Rate allowHalf />
        </Form.Item>
        <Form.Item
          name="comment"
          label="评价内容"
          rules={[{ required: true, message: '请输入评价内容' }]}
        >
          <Input.TextArea rows={4} placeholder="分享你使用此 Agent 的体验" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
