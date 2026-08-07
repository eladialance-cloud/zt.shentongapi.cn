// 消息列表组件 - 中间消息区
// 渲染消息气泡，区分用户/助手
// - 用户附件：图片缩略图 / 视频播放器 / 文件 chip
// - 助手消息：轻量 Markdown 媒体渲染（图片/视频内嵌）
// - 助手消息底部显示计费信息（流式完成后）
// - 自动滚动到底部

import { useEffect, useRef } from "react";
import { Avatar, Image } from "antd";
import { RobotOutlined, UserOutlined } from "@ant-design/icons";
import type { ChatMessage } from "@/types/chat";
import { MediaRenderer } from "@/components/MediaRenderer";
import { resolveMediaUrl, isImageMime, isVideoMime } from "@/utils/media";
import { ToolCallBadge } from "./ToolCallBadge";
import { CreditsBadge } from "./CreditsBadge";
import styles from "../styles.module.css";

interface MessageListProps {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 正在流式生成的助手消息内容（追加在最后） */
  streamingContent?: string;
  /** 是否正在流式中 */
  streaming?: boolean;
  /** 流式期间收到的工具调用 */
  streamingToolCalls?: ChatMessage["toolCalls"];
}

/** 格式化时间 */
function formatTime(date: Date): string {
  const d = new Date(date);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 单个附件渲染：图片缩略图 / 视频播放器 / 文件 chip */
function AttachmentView({ att }: { att: NonNullable<ChatMessage["attachments"]>[number] }) {
  const mime = att.mimeType || ""
  const name = att.fileName || att.url?.split("/").pop() || "附件"
  const url = resolveMediaUrl(att.url)

  if (isImageMime(mime)) {
    return (
      <Image
        src={url}
        alt={name}
        width={160}
        className={styles.messageAttachmentImage}
        preview={{ mask: "查看大图" }}
      />
    )
  }
  if (isVideoMime(mime)) {
    return (
      <video
        className={styles.messageAttachmentVideo}
        src={url}
        controls
        preload="metadata"
      />
    )
  }
  return (
    <span className={styles.attachmentChip}>
      📎 {name}
    </span>
  )
}

export function MessageList({
  messages,
  streamingContent,
  streaming = false,
  streamingToolCalls,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /** 自动滚动到底部 */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingContent, streamingToolCalls]);

  return (
    <div className={styles.messageListContainer} ref={containerRef}>
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        return (
          <div
            key={msg.id}
            className={`${styles.messageRow} ${isUser ? styles.messageRowUser : ""}`}
          >
            <Avatar
              size={32}
              icon={isUser ? <UserOutlined /> : <RobotOutlined />}
              className={`${styles.messageAvatar} ${
                isUser
                  ? styles.messageAvatarUser
                  : styles.messageAvatarAssistant
              }`}
            />
            <div
              className={`${styles.messageBubbleWrap} ${
                isUser ? styles.messageBubbleWrapUser : ""
              }`}
            >
              <div
                className={`${styles.messageBubble} ${
                  isUser
                    ? styles.messageBubbleUser
                    : styles.messageBubbleAssistant
                }`}
              >
                {isUser ? (
                  msg.content
                ) : (
                  <MediaRenderer content={msg.content} />
                )}
              </div>
              {/* 附件展示 */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className={styles.messageAttachments}>
                  {msg.attachments.map((att) => (
                    <AttachmentView key={att.fileId || att.url || att.fileName} att={att} />
                  ))}
                </div>
              )}
              {/* 工具调用 */}
              {!isUser &&
                msg.toolCalls &&
                msg.toolCalls.map((tc) => (
                  <ToolCallBadge key={tc.id} toolCall={tc} />
                ))}
              {/* 元信息 */}
              <div className={styles.messageMeta}>
                <span>{formatTime(msg.createdAt)}</span>
                {!isUser && msg.creditsCost != null && msg.creditsCost > 0 && (
                  <CreditsBadge cost={msg.creditsCost} />
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* 流式生成中的消息（助手消息，左对齐） */}
      {streaming && (
        <div className={styles.messageRow}>
          <Avatar
            size={32}
            icon={<RobotOutlined />}
            className={`${styles.messageAvatar} ${styles.messageAvatarAssistant}`}
          />
          <div className={styles.messageBubbleWrap}>
            {streamingToolCalls && streamingToolCalls.length > 0 && (
              <>
                {streamingToolCalls.map((tc) => (
                  <ToolCallBadge key={tc.id} toolCall={tc} />
                ))}
              </>
            )}
            <div
              className={`${styles.messageBubble} ${styles.messageBubbleAssistant} ${styles.messageBubbleStreaming}`}
            >
              {streamingContent ? (
                <MediaRenderer content={streamingContent} />
              ) : (
                "..."
              )}
            </div>
            <div className={styles.messageMeta}>
              <span>生成中...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageList;
