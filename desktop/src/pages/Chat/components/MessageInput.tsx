// 消息输入区组件
// - 附件按钮（Upload）+ 文本输入（TextArea）+ 发送按钮
// - 支持多文件上传，上传进度显示
// - 上传完成后在输入框上方显示文件列表
// - 发送消息时附带附件信息

import { useState, useRef, type KeyboardEvent } from 'react'
import { Button, Input, message, Progress, Tooltip, Upload } from 'antd'
import type { UploadProps } from 'antd'
import {
  PaperClipOutlined,
  SendOutlined,
  CloseOutlined,
  FileOutlined
} from '@ant-design/icons'
import { uploadFile } from '@/api/file-api'
import type { UploadResult } from '@/types/chat'
import styles from '../styles.module.css'

interface MessageInputProps {
  /** 发送消息回调 */
  onSend: (content: string, attachments: UploadResult[]) => void
  /** 是否正在发送中（流式响应期间） */
  sending?: boolean
  /** 中断发送回调 */
  onAbort?: () => void
  /** 占位文案 */
  placeholder?: string
}

/** 附件项（含上传进度） */
interface AttachmentItem {
  uid: string
  file: File
  status: 'uploading' | 'done' | 'error'
  progress: number
  result?: UploadResult
}

export function MessageInput({
  onSend,
  sending = false,
  onAbort,
  placeholder = '输入消息，Enter 发送，Shift+Enter 换行...'
}: MessageInputProps) {
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const uidCounter = useRef(0)

  /** 自定义上传逻辑（不使用 antd 的 action） */
  const handleUpload = async (file: File) => {
    const uid = `att-${++uidCounter.current}`
    const item: AttachmentItem = {
      uid,
      file,
      status: 'uploading',
      progress: 0
    }
    setAttachments((prev) => [...prev, item])

    try {
      const result = await uploadFile(file, (percent) => {
        setAttachments((prev) =>
          prev.map((a) => (a.uid === uid ? { ...a, progress: percent } : a))
        )
      })
      setAttachments((prev) =>
        prev.map((a) =>
          a.uid === uid ? { ...a, status: 'done', progress: 100, result } : a
        )
      )
    } catch (err) {
      console.error('[MessageInput] upload failed:', err)
      setAttachments((prev) =>
        prev.map((a) => (a.uid === uid ? { ...a, status: 'error' } : a))
      )
      message.error(`文件「${file.name}」上传失败`)
    }
  }

  /** Upload 组件配置（手动控制，不自动上传） */
  const uploadProps: UploadProps = {
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      void handleUpload(file)
      // 返回 false 阻止 antd 自动上传
      return false
    }
  }

  /** 移除附件 */
  const handleRemoveAttachment = (uid: string) => {
    setAttachments((prev) => prev.filter((a) => a.uid !== uid))
  }

  /** 发送 */
  const handleSend = () => {
    const text = content.trim()
    const pendingUploads = attachments.filter((a) => a.status === 'uploading')
    if (pendingUploads.length > 0) {
      message.warning('请等待附件上传完成')
      return
    }
    if (!text && attachments.length === 0) return

    const doneAttachments = attachments
      .filter((a): a is AttachmentItem & { result: UploadResult } =>
        a.status === 'done' && !!a.result
      )
      .map((a) => a.result)

    onSend(text, doneAttachments)
    setContent('')
    setAttachments([])
  }

  /** 键盘事件：Enter 发送，Shift+Enter 换行 */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (sending) return
      handleSend()
    }
  }

  /** 格式化文件大小 */
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  return (
    <div className={styles.inputArea}>
      {attachments.length > 0 && (
        <div className={styles.attachmentList}>
          {attachments.map((a) => (
            <div key={a.uid} className={styles.attachmentItem}>
              <FileOutlined />
              <span>{a.file.name}</span>
              <span style={{ color: '#6e7681', fontSize: 11 }}>
                {formatSize(a.file.size)}
              </span>
              {a.status === 'uploading' && (
                <Progress
                  type="circle"
                  size={14}
                  percent={a.progress}
                  showInfo={false}
                />
              )}
              {a.status === 'done' && <span style={{ color: '#34d399' }}>✓</span>}
              {a.status === 'error' && <span style={{ color: '#ef4444' }}>×</span>}
              <CloseOutlined
                className={styles.attachmentRemove}
                onClick={() => handleRemoveAttachment(a.uid)}
              />
            </div>
          ))}
        </div>
      )}
      <div className={styles.inputRow}>
        <Upload {...uploadProps}>
          <Tooltip title="添加附件">
            <Button
              type="default"
              icon={<PaperClipOutlined />}
              className={styles.uploadBtn}
              disabled={sending}
            />
          </Tooltip>
        </Upload>
        <Input.TextArea
          className={styles.textArea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoSize={{ minRows: 1, maxRows: 6 }}
          disabled={sending}
          bordered={false}
        />
        {sending ? (
          <Tooltip title="停止生成">
            <Button
              danger
              onClick={onAbort}
              className={styles.sendBtn}
            >
              停止
            </Button>
          </Tooltip>
        ) : (
          <Tooltip title="发送 (Enter)">
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={!content.trim() && attachments.length === 0}
              className={styles.sendBtn}
            />
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export default MessageInput
