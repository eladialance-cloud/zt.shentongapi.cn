// 对话自动沉淀提示：显示「已沉淀到知识库 / Hermes 记忆」，支持一键撤回
import { Alert, Button, Space } from "antd"
import { BookOutlined, UndoOutlined } from "@ant-design/icons"
import { useState } from "react"
import type { SedimentNotice as SedimentNoticeData } from "@/store/chat-stream"

interface Props {
  notice: SedimentNoticeData | null
  onUndo: () => Promise<boolean>
  onDismiss: () => void
}

export default function SedimentNotice({ notice, onUndo, onDismiss }: Props) {
  const [undoing, setUndoing] = useState(false)
  if (!notice) return null
  const targetLabel = notice.target === "knowledge_base" ? "知识库" : "Hermes 记忆"
  return (
    <div style={{ padding: "0 16px", marginBottom: 8 }}>
      <Alert
        type="success"
        showIcon
        icon={<BookOutlined />}
        message={notice.alreadyExisted ? "📌 内容已沉淀过，未重复入库" : `📌 已沉淀到${targetLabel}`}
        description={notice.title || undefined}
        closable
        onClose={onDismiss}
        action={
          <Space>
            <Button
              size="small"
              icon={<UndoOutlined />}
              loading={undoing}
              onClick={() => {
                setUndoing(true)
                void onUndo().finally(() => setUndoing(false))
              }}
            >
              撤回
            </Button>
          </Space>
        }
      />
    </div>
  )
}