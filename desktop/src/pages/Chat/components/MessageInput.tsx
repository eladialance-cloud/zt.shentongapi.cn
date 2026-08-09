// 消息输入区组件
// - 附件按钮（Upload）+ 文本输入（TextArea）+ 发送按钮
// - 支持多文件上传，上传进度显示
// - 上传完成后在输入框上方显示文件列表
// - 发送消息时附带附件信息

import { useState, useRef, type ChangeEvent, type KeyboardEvent } from 'react'
import { Button, Dropdown, Input, message, Progress, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  SendOutlined,
  CloseOutlined,
  FileOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  PictureOutlined,
  VideoCameraOutlined,
  PlusOutlined,
  ExperimentOutlined
} from '@ant-design/icons'
import { uploadFile } from '@/api/file-api'
import type { UploadResult } from '@/types/chat'
import { isImageMime, isVideoMime } from '@/utils/media'
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
  /** 打开文生图/文生视频弹窗 */
  onOpenGeneration?: (type: 'image' | 'video') => void
}

/** 附件项（含上传进度） */
interface AttachmentItem {
  uid: string
  file: File
  status: 'uploading' | 'done' | 'error'
  progress: number
  result?: UploadResult
  /** 本地预览 URL（图片/视频） */
  previewUrl?: string
}

export function MessageInput({
  onSend,
  sending = false,
  onAbort,
  placeholder = '输入消息，Enter 发送，Shift+Enter 换行...',
  onOpenGeneration,
}: MessageInputProps) {
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const uidCounter = useRef(0)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

    const previewUrl = isImageMime(file.type) || isVideoMime(file.type) ? URL.createObjectURL(file) : ''

    try {

      const result = await uploadFile(file, (percent) => {

        setAttachments((prev) =>

          prev.map((a) => (a.uid === uid ? { ...a, progress: percent } : a))

        )

      })

      setAttachments((prev) =>

        prev.map((a) =>

          a.uid === uid ? { ...a, status: 'done', progress: 100, result, previewUrl } : a

        )

      )

    } catch (err) {

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      console.error('[MessageInput] upload failed:', err)
      setAttachments((prev) =>
        prev.map((a) => (a.uid === uid ? { ...a, status: 'error' } : a))
      )
      message.error(`文件「${file.name}」上传失败`)
    }
  }

  /** 隐藏 input 选择文件后统一走 handleUpload */
  const handleFilesPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach((file) => void handleUpload(file))
    }
    e.target.value = ''
  }

  /** + 号菜单：上传图片/视频/文件 + 文生图/文生视频 */
  const handlePlusMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'upload-image') imageInputRef.current?.click()
    else if (key === 'upload-video') videoInputRef.current?.click()
    else if (key === 'upload-file') fileInputRef.current?.click()
    else if (key === 'gen-image') onOpenGeneration?.('image')
    else if (key === 'gen-video') onOpenGeneration?.('video')
  }

  /** 移除附件 */
  const handleRemoveAttachment = (uid: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.uid === uid)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.uid !== uid)
    })
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
              {a.previewUrl && isImageMime(a.file.type) && (
                <img
                  src={a.previewUrl}
                  alt={a.file.name}
                  className={styles.attachmentPreviewImg}
                />
              )}
              {a.previewUrl && isVideoMime(a.file.type) && (
                <video
                  src={a.previewUrl}
                  className={styles.attachmentPreviewVideo}
                  muted
                />
              )}
              {!a.previewUrl && <FileOutlined />}
              <span>{a.file.name}</span>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
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
              {a.status === 'done' && <CheckCircleFilled style={{ color: '#34d399' }} />}
              {a.status === 'error' && <CloseCircleFilled style={{ color: '#ef4444' }} />}
              <CloseOutlined
                className={styles.attachmentRemove}
                onClick={() => handleRemoveAttachment(a.uid)}
              />
            </div>
          ))}
        </div>
      )}
      <div className={styles.inputRow}>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'upload-image', icon: <PictureOutlined />, label: '上传图片' },
              { key: 'upload-video', icon: <VideoCameraOutlined />, label: '上传视频' },
              { key: 'upload-file', icon: <FileOutlined />, label: '上传文件' },
              ...(onOpenGeneration
                ? [
                    { type: 'divider' as const },
                    { key: 'gen-image', icon: <ExperimentOutlined />, label: '文生图（扣除积分）' },
                    { key: 'gen-video', icon: <ExperimentOutlined />, label: '文生视频（扣除积分）' },
                  ]
                : []),
            ],
            onClick: handlePlusMenuClick,
          }}
        >
          <Tooltip title="添加附件 / 生成媒体">
            <Button
              type="default"
              icon={<PlusOutlined />}
              className={styles.uploadBtn}
              disabled={sending}
            />
          </Tooltip>
        </Dropdown>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesPicked}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesPicked}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesPicked}
        />
        <Input.TextArea
          className={styles.textArea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoSize={{ minRows: 2, maxRows: 8 }}
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
