// 聊天气泡 - v0.3.1 共享组件 Task 3
// 5 种类型：text/icon/thinking/emotion/voice
import styles from './styles.module.css'

export type ChatBubbleType = 'text' | 'icon' | 'thinking' | 'emotion' | 'voice'
export type ChatBubbleRole = 'user' | 'assistant' | 'system'

export interface ChatBubbleProps {
  type: ChatBubbleType
  role: ChatBubbleRole
  content: string
  timestamp?: string
  avatar?: string
}

export default function ChatBubble({
  type,
  role,
  content,
  timestamp,
  avatar
}: ChatBubbleProps) {
  const isUser = role === 'user'
  const isSystem = role === 'system'
  const roleClass = isUser
    ? styles.user
    : isSystem
      ? styles.system
      : styles.assistant

  const renderContent = () => {
    if (type === 'thinking') {
      return (
        <span className={styles.thinking}>
          <span className={`${styles.dot} ${styles.dot1}`}>.</span>
          <span className={`${styles.dot} ${styles.dot2}`}>.</span>
          <span className={`${styles.dot} ${styles.dot3}`}>.</span>
        </span>
      )
    }
    if (type === 'voice') {
      return (
        <span className={styles.waveform}>
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className={styles.bar}
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
          <span className={styles.duration}>{content}</span>
        </span>
      )
    }
    if (type === 'emotion') {
      return <span className={styles.emotion}>{content}</span>
    }
    if (type === 'icon') {
      return <span className={styles.icon}>{content}</span>
    }
    return <span className={styles.text}>{content}</span>
  }

  return (
    <div className={`${styles.wrap} ${roleClass} animate-scale-in`}>
      {avatar && !isUser && <div className={styles.avatar}>{avatar}</div>}
      <div className={styles.bubble}>
        {renderContent()}
        {timestamp && <div className={styles.timestamp}>{timestamp}</div>}
      </div>
    </div>
  )
}
