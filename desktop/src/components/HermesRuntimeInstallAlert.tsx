// Hermes 运行时缺失提示 + 一键安装（P2.5 技能中心 / 进化页共用）
// 主进程 hermes-skills / hermes-evolution 在运行时缺失时返回
// “Hermes 运行时未安装或未配置”；此处给出下载入口、进度与失败兜底。
// 复用 window.runtime.download('hermes')（与「本地服务管理」同链路，约 130MB，含断点续传）。

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Progress, Space } from "antd";
import { DownloadOutlined } from "@ant-design/icons";

const MISSING_RUNTIME = "Hermes 运行时未安装或未配置";

export default function HermesRuntimeInstallAlert({
  error,
  onReady,
  onClose,
}: {
  error: string | null;
  onReady?: () => void;
  onClose?: () => void;
}) {
  const missing = !!error && error.includes(MISSING_RUNTIME);
  const [downloading, setDownloading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!downloading) return;
    const off = window.runtime?.onDownloadProgress?.((p) => {
      if (p.name === "hermes") setPercent(p.percent ?? 0);
    });
    return () => off?.();
  }, [downloading]);

  const handleInstall = useCallback(async () => {
    setDownloading(true);
    setFailed(false);
    setPercent(0);
    try {
      const ok = await window.runtime?.download("hermes");
      if (!ok) {
        setFailed(true);
      } else {
        setPercent(100);
        await onReady?.();
      }
    } catch {
      setFailed(true);
    } finally {
      setDownloading(false);
    }
  }, [onReady]);

  if (!error) return null;
  if (!missing) {
    return (
      <Alert
        type="error"
        showIcon
        message={error}
        closable={!!onClose}
        onClose={onClose}
        style={{ marginBottom: 16 }}
      />
    );
  }
  return (
    <Alert
      type="warning"
      showIcon
      message="需要安装 Hermes 运行时"
      description={
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <span>
            本地 Hermes 运行时（约 130MB）未安装。它与「本地服务管理」共用同一套运行时，
            装一次即可、无需重复下载；安装后即可使用技能中心 / 进化页 / Hermes 编排，
            也可到「本地服务管理」页手动安装。
          </span>
          {downloading ? (
            <Progress percent={Math.round(percent)} size="small" />
          ) : failed ? (
            <span style={{ color: "var(--color-error, #ff4d4f)" }}>
              下载失败，请检查网络后重试，或到「本地服务管理」页手动安装。
            </span>
          ) : null}
          <Button
            type="primary"
            size="small"
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={() => void handleInstall()}
          >
            {downloading ? "下载中…" : "安装 Hermes 运行时"}
          </Button>
        </Space>
      }
      style={{ marginBottom: 16 }}
    />
  );
}