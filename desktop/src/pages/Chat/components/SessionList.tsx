// 会话列表组件
// - 分组显示：置顶 / 今日 / 昨天 / 7天内 / 更早
// - 每条会话显示：标题、最后消息预览、时间、模型图标
// - 右键菜单：置顶/取消置顶、重命名、删除
// - 顶部：新建对话按钮 + 搜索框
// - 新建对话：调用 POST /chat/sessions
// - 搜索：调用 GET /chat/sessions?keyword=xxx
// - 会话切换：点击会话项加载消息列表

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Button, Dropdown, Input, message, Modal } from 'antd'
import type { MenuProps } from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  DeleteOutlined,
  EditOutlined,
  PushpinOutlined,
  PushpinFilled
} from '@ant-design/icons'
import * as chatApi from '@/api/chat-api'
import type { ChatSession, CreateSessionDto } from '@/types/chat'
import { SessionItem } from './SessionItem'
import styles from '../styles.module.css'

interface SessionListProps {
  /** 当前选中的会话 ID */
  activeSessionId: number | null
  /** 默认模型 ID（用于新建会话） */
  defaultModelId: string
  /** 默认 Agent ID（可选） */
  defaultAgentId?: number
  /** 选择会话回调 */
  onSelectSession: (session: ChatSession) => void
  /** 会话列表刷新触发器（外部修改时递增以触发刷新） */
  refreshTrigger?: number
}

/** 会话分组 key */
type GroupKey = 'pinned' | 'today' | 'yesterday' | 'week' | 'earlier'

/** 分组标题 */
const GROUP_TITLES: Record<GroupKey, string> = {
  pinned: '置顶',
  today: '今天',
  yesterday: '昨天',
  week: '7 天内',
  earlier: '更早'
}

/** 分组顺序 */
const GROUP_ORDER: GroupKey[] = ['pinned', 'today', 'yesterday', 'week', 'earlier']

/** 计算会话所属分组 */
function getGroupKey(session: ChatSession): GroupKey {
  if (session.pinned) return 'pinned'
  const d = new Date(session.lastMessageAt || session.updatedAt)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 7)

  if (d >= today) return 'today'
  if (d >= yesterday) return 'yesterday'
  if (d >= weekAgo) return 'week'
  return 'earlier'
}

/** 简短预览（外部传入或从 session 推断） */
function getPreview(session: ChatSession): string {
  // 后端列表接口若包含 lastMessage 字段可直接使用，这里降级为 title
  const s = session as unknown as { lastMessage?: string }
  return s.lastMessage || ''
}

export function SessionList({
  activeSessionId,
  defaultModelId,
  defaultAgentId,
  onSelectSession,
  refreshTrigger
}: SessionListProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [renamingSession, setRenamingSession] = useState<ChatSession | null>(null)
  const [renameValue, setRenameValue] = useState('')

  /** 加载会话列表 */
  const loadSessions = useCallback(async (kw?: string) => {
    setLoading(true)
    try {
      const result = await chatApi.listSessions({ keyword: kw || undefined, pageSize: 100 })
      setSessions(result.list || [])
    } catch (err) {
      console.error('[SessionList] load sessions failed:', err)
      // 失败时不弹错误，保持现有列表
    } finally {
      setLoading(false)
    }
  }, [])

  /** 初始加载 + refreshTrigger 变化时重新加载 */
  useEffect(() => {
    void loadSessions()
  }, [loadSessions, refreshTrigger])

  /** 搜索防抖 */
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSessions(keyword)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword])

  /** 新建会话 */
  const handleNewSession = async () => {
    if (creating) return
    setCreating(true)
    try {
      const dto: CreateSessionDto = {
        title: '新对话',
        modelId: defaultModelId,
        agentId: defaultAgentId
      }
      const session = await chatApi.createSession(dto)
      setSessions((prev) => [session, ...prev])
      onSelectSession(session)
      message.success('已创建新对话')
    } catch (err) {
      console.error('[SessionList] create session failed:', err)
      message.error('创建对话失败')
    } finally {
      setCreating(false)
    }
  }

  /** 切换置顶 */
  const handleTogglePin = async (session: ChatSession) => {
    try {
      await chatApi.updateSession(session.id, { pinned: !session.pinned })
      setSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, pinned: !s.pinned } : s))
      )
    } catch (err) {
      console.error('[SessionList] toggle pin failed:', err)
      message.error('操作失败')
    }
  }

  /** 删除会话 */
  const handleDelete = (session: ChatSession) => {
    Modal.confirm({
      title: '删除对话',
      content: `确定删除「${session.title}」吗？删除后无法恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await chatApi.deleteSession(session.id)
          setSessions((prev) => prev.filter((s) => s.id !== session.id))
          message.success('已删除')
          // 如果删除的是当前选中的会话，触发清空
          if (session.id === activeSessionId) {
            onSelectSession(null as unknown as ChatSession)
          }
        } catch (err) {
          console.error('[SessionList] delete failed:', err)
          message.error('删除失败')
        }
      }
    })
  }

  /** 重命名 */
  const handleRenameStart = (session: ChatSession) => {
    setRenamingSession(session)
    setRenameValue(session.title)
  }

  const handleRenameConfirm = async () => {
    if (!renamingSession) return
    const title = renameValue.trim()
    if (!title) {
      message.warning('标题不能为空')
      return
    }
    try {
      await chatApi.updateSession(renamingSession.id, { title })
      setSessions((prev) =>
        prev.map((s) => (s.id === renamingSession.id ? { ...s, title } : s))
      )
      setRenamingSession(null)
      message.success('已重命名')
    } catch (err) {
      console.error('[SessionList] rename failed:', err)
      message.error('重命名失败')
    }
  }

  /** 右键菜单 */
  const getContextMenu = (session: ChatSession): MenuProps['items'] => [
    {
      key: 'pin',
      icon: session.pinned ? <PushpinFilled /> : <PushpinOutlined />,
      label: session.pinned ? '取消置顶' : '置顶',
      onClick: () => handleTogglePin(session)
    },
    {
      key: 'rename',
      icon: <EditOutlined />,
      label: '重命名',
      onClick: () => handleRenameStart(session)
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => handleDelete(session)
    }
  ]

  /** 分组 */
  const grouped = useMemo(() => {
    const map: Record<GroupKey, ChatSession[]> = {
      pinned: [],
      today: [],
      yesterday: [],
      week: [],
      earlier: []
    }
    sessions.forEach((s) => {
      map[getGroupKey(s)].push(s)
    })
    // 每组内按时间倒序
    Object.keys(map).forEach((k) => {
      map[k as GroupKey].sort(
        (a, b) =>
          new Date(b.lastMessageAt || b.updatedAt).getTime() -
          new Date(a.lastMessageAt || a.updatedAt).getTime()
      )
    })
    return map
  }, [sessions])

  return (
    <div className={styles.sessionList}>
      <div className={styles.sessionListHeader}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={creating}
          onClick={handleNewSession}
          className={styles.newChatBtn}
          block
        >
          新建对话
        </Button>
        <Input
          allowClear
          size="small"
          placeholder="搜索对话..."
          prefix={<SearchOutlined style={{ color: '#6e7681' }} />}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <div className={styles.sessionListBody}>
        {loading && sessions.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#6e7681', fontSize: 12 }}>
            加载中...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#6e7681', fontSize: 12 }}>
            {keyword ? '未找到匹配的对话' : '点击上方按钮开始对话'}
          </div>
        ) : (
          GROUP_ORDER.map((key) => {
            const list = grouped[key]
            if (list.length === 0) return null
            return (
              <div key={key}>
                <div className={styles.sessionGroupTitle}>{GROUP_TITLES[key]}</div>
                {list.map((session) => (
                  <Dropdown
                    key={session.id}
                    menu={{ items: getContextMenu(session) }}
                    trigger={['contextMenu']}
                  >
                    <div>
                      <SessionItem
                        session={session}
                        active={session.id === activeSessionId}
                        preview={getPreview(session)}
                        onClick={() => onSelectSession(session)}
                      />
                    </div>
                  </Dropdown>
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* 重命名 Modal */}
      <Modal
        title="重命名对话"
        open={!!renamingSession}
        onOk={handleRenameConfirm}
        onCancel={() => setRenamingSession(null)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRenameConfirm}
          maxLength={64}
          showCount
        />
      </Modal>
    </div>
  )
}

export default SessionList
