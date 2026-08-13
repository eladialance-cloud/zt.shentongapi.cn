// 工具调用展示组件
// 显示工具调用标签：工具名称
// 展开后显示：输入参数、输出结果、执行耗时、积分消耗
// 状态：running（转圈）/ success（绿色对勾）/ failed（红色叉）
// 视频任务：运行中显示实时进度条 + 阶段文案，完成后内嵌成片播放器

import { useState } from "react";
import { Tooltip } from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  ToolOutlined,
  DownOutlined,
  RightOutlined,
  GoldOutlined,
} from "@ant-design/icons";
import type { ToolCallInfo } from "@/types/chat";
import styles from "../styles.module.css";

interface ToolCallBadgeProps {
  toolCall: ToolCallInfo;
  /** 默认是否展开 */
  defaultExpanded?: boolean;
}

/** 状态图标 */
function StatusIcon({ status }: { status: ToolCallInfo["status"] }) {
  if (status === "running") {
    return <LoadingOutlined className={styles.toolCallStatusRunning} spin />;
  }
  if (status === "success") {
    return <CheckCircleFilled className={styles.toolCallStatusSuccess} />;
  }
  return <CloseCircleFilled className={styles.toolCallStatusFailed} />;
}

/** 格式化耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** 安全 stringify */
function safeStringify(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 视频任务阶段文案：英文状态映射为中文 */
function stageText(stage: string): string {
  const map: Record<string, string> = {
    queued: "排队中",
    pending: "排队中",
    running: "生成中",
    generating: "生成中",
    completed: "已完成",
    failed: "生成失败",
  };
  return map[stage] || stage;
}

export function ToolCallBadge({
  toolCall,
  defaultExpanded = false,
}: ToolCallBadgeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const statusText =
    toolCall.status === "running"
      ? "执行中"
      : toolCall.status === "success"
        ? "执行完成"
        : "执行失败";

  const hasProgress =
    toolCall.status === "running" &&
    typeof toolCall.progress === "number" &&
    toolCall.progress >= 0;

  const percent = hasProgress
    ? Math.min(100, Math.max(0, Math.round(toolCall.progress as number)))
    : 0;

  return (
    <div className={styles.toolCallBadge}>
      <div
        className={styles.toolCallHeader}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        {expanded ? <DownOutlined /> : <RightOutlined />}
        <ToolOutlined />
        <span className={styles.toolCallName}>{toolCall.name}</span>
        <StatusIcon status={toolCall.status} />
        <span style={{ color: "var(--color-text-tertiary)" }}>{statusText}</span>
        {toolCall.stage && toolCall.status === "running" && (
          <span style={{ color: "var(--color-text-tertiary)" }}>
            · {stageText(toolCall.stage)}
          </span>
        )}
        {hasProgress && (
          <span style={{ color: "var(--color-brand)" }}>· {percent}%</span>
        )}
        {toolCall.status !== "running" && (
          <Tooltip title="执行耗时">
            <span style={{ color: "var(--color-text-tertiary)" }}>
              · {formatDuration(toolCall.duration)}
            </span>
          </Tooltip>
        )}
        {toolCall.creditsCost > 0 && (
          <Tooltip title="积分消耗">
            <span style={{ color: "#34d399" }}>
              · <GoldOutlined style={{ fontSize: 11 }} /> {toolCall.creditsCost}
            </span>
          </Tooltip>
        )}
      </div>
      {hasProgress && (
        <div className={styles.toolCallProgressWrap}>
          <div
            className={styles.toolCallProgressTrack}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={styles.toolCallProgressFill}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
      {expanded && (
        <div className={styles.toolCallBody}>
          <div className={styles.toolCallRow}>
            <span className={styles.toolCallRowLabel}>输入:</span>
            <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
              {safeStringify(toolCall.input)}
            </pre>
          </div>
          {toolCall.videoUrl && (
            <div className={styles.toolCallRow}>
              <span className={styles.toolCallRowLabel}>成片:</span>
              <video
                className={styles.toolCallVideo}
                src={toolCall.videoUrl}
                controls
                playsInline
                preload="metadata"
              />
            </div>
          )}
          {toolCall.status !== "running" && (
            <div className={styles.toolCallRow}>
              <span className={styles.toolCallRowLabel}>输出:</span>
              <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
                {safeStringify(toolCall.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCallBadge;
