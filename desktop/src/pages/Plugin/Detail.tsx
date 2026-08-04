// 插件详情页 - v0.3.1
// 顶部：插件名称 + 版本 + 作者 + 安装按钮
// Tabs：详情（描述 + 截图 + 使用说明）/ 版本（版本历史表格）/ 评论（评论列表 + 添加评论表单）
// 调用 GET /plugins/:id、GET /plugins/:id/versions、GET /plugins/:id/comments

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Breadcrumb,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  List,
  Rate,
  Row,
  Skeleton,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined,
  BookOutlined,
  CalendarOutlined,
  DownloadOutlined,
  HistoryOutlined,
  HomeOutlined,
  MessageOutlined,
  StarOutlined,
  UserOutlined
} from '@ant-design/icons'
import SkillTag from '@/components/SkillTag'
import * as pluginApi from '@/api/plugin-api'
import type { Plugin, PluginType } from '@/types/plugin'
import styles from './styles.module.css'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

/** 占位版本历史 */
interface VersionRecord {
  version: string
  releaseNote: string
  createdAt: string
}

/** 占位评论 */
interface CommentRecord {
  id: number
  user: string
  rating: number
  content: string
  createdAt: string
}

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

function pluginTypeToSkillType(type: PluginType): 'flow' | 'reasoning' | 'tool' {
  switch (type) {
    case 'workflow':
      return 'flow'
    case 'knowledge_base':
      return 'reasoning'
    case 'tool':
    case 'connector':
    default:
      return 'tool'
  }
}

const PLACEHOLDER_VERSIONS: VersionRecord[] = [
  { version: '1.2.0', releaseNote: '新增批量调用支持，优化大文件解析性能', createdAt: '2026-07-10' },
  { version: '1.1.0', releaseNote: '修复偶发超时问题，提升稳定性', createdAt: '2026-06-22' },
  { version: '1.0.0', releaseNote: '初始版本发布', createdAt: '2026-05-15' }
]

const PLACEHOLDER_COMMENTS: CommentRecord[] = [
  { id: 1, user: '张三', rating: 5, content: '使用流畅，文档清晰，强烈推荐。', createdAt: '2026-07-12' },
  { id: 2, user: '李四', rating: 4, content: '功能丰富，期待支持更多格式。', createdAt: '2026-07-08' },
  { id: 3, user: '王五', rating: 5, content: '完美集成到我的工作流，效率提升明显。', createdAt: '2026-06-30' }
]

export default function PluginDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const pluginId = id ? Number(id) : NaN

  const [plugin, setPlugin] = useState<Plugin | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('detail')
  const [commentForm] = Form.useForm()
  const [submittingComment, setSubmittingComment] = useState(false)
  const [comments, setComments] = useState<CommentRecord[]>(PLACEHOLDER_COMMENTS)

  const loadPlugin = useCallback(async () => {
    if (!Number.isFinite(pluginId)) return
    setLoading(true)
    try {
      // 后端未提供单独的 market detail 端点，使用 listMarketPlugins 查找
      const result = await pluginApi.listMarketPlugins({ keyword: String(pluginId) })
      const found = (result.list || []).find((p) => p.id === pluginId)
      setPlugin(found || null)
    } catch (err) {
      console.error('[PluginDetail] load failed:', err)
      message.error('加载插件详情失败')
      setPlugin(null)
    } finally {
      setLoading(false)
    }
  }, [pluginId])

  useEffect(() => {
    void loadPlugin()
  }, [loadPlugin])

  const handleInstall = async () => {
    if (!plugin) return
    setInstalling(true)
    try {
      await pluginApi.installPlugin(plugin.id)
      message.success(`插件 ${plugin.name} 安装成功`)
      setPlugin({ ...plugin, isInstalled: true })
    } catch (err) {
      console.error('[PluginDetail] install failed:', err)
      message.error('安装失败: ' + (err as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  const handleUse = () => {
    if (!plugin) return
    message.info(`即将使用插件 ${plugin.name}，请在对话页选择该插件`)
    navigate('/chat')
  }

  const handleBack = () => {
    navigate('/plugins')
  }

  const handleSubmitComment = async () => {
    try {
      const values = await commentForm.validateFields()
      setSubmittingComment(true)
      // TODO(backend): 调用 POST /plugins/:id/comments
      const newComment: CommentRecord = {
        id: Date.now(),
        user: '我',
        rating: values.rating ?? 5,
        content: values.content,
        createdAt: new Date().toISOString().slice(0, 10)
      }
      setComments((prev) => [newComment, ...prev])
      commentForm.resetFields()
      message.success('评论已提交（占位）')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[PluginDetail] submit comment failed:', err)
    } finally {
      setSubmittingComment(false)
    }
  }

  const versionColumns: TableColumnsType<VersionRecord> = [
    { title: '版本', dataIndex: 'version', key: 'version', width: 120 },
    { title: '更新说明', dataIndex: 'releaseNote', key: 'releaseNote' },
    {
      title: '发布时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140
    }
  ]

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  if (!plugin) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.emptyState}>
          <MessageOutlined className={styles.emptyStateIcon} />
          <div className={styles.emptyStateText}>插件不存在或加载失败</div>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>返回市场</Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageContainer}>
      <Breadcrumb
        className={styles.breadcrumb}
        items={[
          { title: <><HomeOutlined /> 首页</> },
          { title: '插件市场', href: '/plugins' },
          { title: plugin.name }
        ]}
      />

      {/* 顶部：插件信息 + 安装按钮 */}
      <Card className={styles.detailHeaderCard} bordered={false}>
        <Row gutter={[24, 16]} align="middle">
          <Col flex="auto">
            <div className={styles.detailTitleRow}>
              <div className={styles.pluginIconLarge}>
                <BookOutlined />
              </div>
              <div>
                <Title level={3} style={{ margin: 0 }}>{plugin.name}</Title>
                <div className={styles.detailMeta}>
                  <Tag>v{plugin.version}</Tag>
                  <Text type="secondary">
                    <UserOutlined /> {plugin.author}
                  </Text>
                  <SkillTag type={pluginTypeToSkillType(plugin.type)} size="small">
                    {typeLabel(plugin.type)}
                  </SkillTag>
                  {plugin.isOfficial && <Tag color="processing">官方</Tag>}
                  <Text type="secondary">
                    <StarOutlined /> {plugin.rating?.toFixed(1) ?? '-'}
                  </Text>
                  <Text type="secondary">
                    <DownloadOutlined /> {plugin.callCount ?? 0} 次
                  </Text>
                </div>
              </div>
            </div>
          </Col>
          <Col flex="none">
            <div className={styles.detailActions}>
              {plugin.isInstalled ? (
                <Button type="primary" size="large" onClick={handleUse}>使用</Button>
              ) : (
                <Button
                  type="primary"
                  size="large"
                  icon={<DownloadOutlined />}
                  loading={installing}
                  onClick={handleInstall}
                >
                  安装
                </Button>
              )}
              <Button size="large" icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
            </div>
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'detail',
            label: <><BookOutlined /> 详情</>,
            children: (
              <Card className={styles.detailCard} bordered={false}>
                <Paragraph>
                  <Text strong>描述</Text>
                </Paragraph>
                <Paragraph type="secondary">{plugin.description}</Paragraph>

                <Paragraph>
                  <Text strong>截图</Text>
                </Paragraph>
                <Row gutter={[12, 12]}>
                  {[1, 2, 3].map((i) => (
                    <Col xs={24} sm={8} key={i}>
                      <div className={styles.screenshotPlaceholder}>
                        <BookOutlined style={{ fontSize: 32, color: 'var(--color-text-tertiary)' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>截图 {i}</Text>
                      </div>
                    </Col>
                  ))}
                </Row>

                <Paragraph style={{ marginTop: 16 }}>
                  <Text strong>使用说明</Text>
                </Paragraph>
                <Paragraph type="secondary">
                  1. 点击右上角「安装」按钮完成插件安装。<br />
                  2. 安装完成后，在「已安装」页可启用 / 禁用插件，并配置参数。<br />
                  3. 在对话页选择该插件即可调用，调用结果会显示在工具调用面板中。<br />
                  4. 调用记录可在「调用记录」页查看。
                </Paragraph>

                {Boolean(plugin.configSchema) && (
                  <>
                    <Paragraph>
                      <Text strong>配置 Schema</Text>
                    </Paragraph>
                    <pre className={styles.schemaBlock}>{JSON.stringify(plugin.configSchema, null, 2)}</pre>
                  </>
                )}
              </Card>
            )
          },
          {
            key: 'versions',
            label: <><HistoryOutlined /> 版本</>,
            children: (
              <Card className={styles.detailCard} bordered={false}>
                <Table<VersionRecord>
                  columns={versionColumns}
                  dataSource={PLACEHOLDER_VERSIONS}
                  rowKey="version"
                  size="middle"
                  pagination={false}
                />
              </Card>
            )
          },
          {
            key: 'comments',
            label: <><MessageOutlined /> 评论</>,
            children: (
              <Card className={styles.detailCard} bordered={false}>
                <div className={styles.commentFormWrap}>
                  <Title level={5}>发表评论</Title>
                  <Form form={commentForm} layout="vertical">
                    <Form.Item name="rating" label="评分" initialValue={5}>
                      <Rate />
                    </Form.Item>
                    <Form.Item
                      name="content"
                      label="评论内容"
                      rules={[{ required: true, message: '请输入评论内容' }]}
                    >
                      <TextArea placeholder="说说你对这个插件的看法..." autoSize={{ minRows: 3, maxRows: 6 }} />
                    </Form.Item>
                    <Button type="primary" loading={submittingComment} onClick={handleSubmitComment}>
                      提交评论
                    </Button>
                  </Form>
                </div>

                <div className={styles.commentListWrap}>
                  <Title level={5}>全部评论（{comments.length}）</Title>
                  {comments.length === 0 ? (
                    <Empty description="暂无评论" />
                  ) : (
                    <List
                      itemLayout="horizontal"
                      dataSource={comments}
                      renderItem={(item) => (
                        <List.Item>
                          <List.Item.Meta
                            avatar={
                              <div className={styles.commentAvatar}>
                                {item.user.charAt(0)}
                              </div>
                            }
                            title={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Text strong>{item.user}</Text>
                                <Rate disabled value={item.rating} style={{ fontSize: 12 }} />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  <CalendarOutlined /> {item.createdAt}
                                </Text>
                              </div>
                            }
                            description={item.content}
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              </Card>
            )
          }
        ]}
      />
    </div>
  )
}
