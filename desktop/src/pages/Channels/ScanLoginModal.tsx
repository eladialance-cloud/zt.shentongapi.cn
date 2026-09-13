// 扫码登录弹窗 — 桌面端扫码事件流（waiting → scanned → success / expired → 重试）
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Steps, Tag, Typography } from "antd";
import {
  QrcodeOutlined, LoadingOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, ReloadOutlined,
} from "@ant-design/icons";
import type { ChannelPlatformMeta } from "@/types/channel";

/** 与主进程 platform-login.ts 的 ScanPhase 保持一致 */
export type ScanPhase = "waiting" | "scanned" | "confirmed" | "expired" | "success" | "error";

export interface ScanStatusEvent {
  platform: string;
  scanId: string;
  phase: ScanPhase;
  retryable: boolean;
  displayName?: string;
  message?: string;
}

interface Props {
  open: boolean;
  platform: ChannelPlatformMeta | null;
  onClose: () => void;
  /** 登录成功回调（用于刷新渠道列表） */
  onSuccess?: (platform: string, displayName?: string) => void;
}

const PHASE_STEP: Record<ScanPhase, number> = {
  waiting: 0,
  scanned: 1,
  confirmed: 1,
  success: 2,
  expired: 0,
  error: 0,
};

const PHASE_TAG: Partial<Record<ScanPhase, { color: string; text: string }>> = {
  waiting: { color: "processing", text: "等待扫码" },
  scanned: { color: "warning", text: "已扫码，待手机确认" },
  confirmed: { color: "warning", text: "已确认" },
  success: { color: "success", text: "登录成功" },
  expired: { color: "error", text: "二维码已失效" },
  error: { color: "error", text: "登录失败" },
};

export default function ScanLoginModal({ open, platform, onClose, onSuccess }: Props) {
  const [phase, setPhase] = useState<ScanPhase>("waiting");
  const [message, setMessage] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const scanIdRef = useRef<string>("");
  const platformRef = useRef<string>("");

  const start = useCallback(async (target: ChannelPlatformMeta) => {
    const api = window.electronAPI?.platformAccount;
    if (!api?.startScan) {
      setSupported(false);
      setMessage("当前环境不支持扫码登录，请在桌面端使用");
      return;
    }
    setBusy(true);
    setPhase("waiting");
    setMessage("");
    setDisplayName("");
    try {
      // 复用已有扫码会话（弹窗重开时）
      const cur = await api.getScanStatus?.(target.platform);
      if (cur?.active && cur.scanId) {
        scanIdRef.current = cur.scanId;
        platformRef.current = target.platform;
        return;
      }
      const r = await api.startScan(target.platform);
      if (!r?.ok) {
        setPhase("error");
        setMessage(r?.error || "启动扫码失败");
        return;
      }
      scanIdRef.current = r.scanId ?? "";
      platformRef.current = target.platform;
    } catch (err) {
      setPhase("error");
      setMessage((err as Error).message || String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // 打开时启动扫码
  useEffect(() => {
    if (open && platform) void start(platform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platform?.platform]);

  // 订阅扫码阶段推送（按 scanId 过滤，避免串号）
  useEffect(() => {
    const api = window.electronAPI?.platformAccount;
    if (!api?.onScanStatus) return;
    const off = api.onScanStatus((evt: ScanStatusEvent) => {
      if (!evt) return;
      if (platformRef.current && evt.platform !== platformRef.current) return;
      setPhase(evt.phase);
      if (evt.message) setMessage(evt.message);
      if (evt.displayName) setDisplayName(evt.displayName);
      if (evt.phase === "success") {
        onSuccess?.(evt.platform, evt.displayName);
      }
    });
    return off;
  }, [onSuccess]);

  const handleClose = () => {
    // 未成功则取消后台扫码会话，避免僵尸登录窗
    if (phase !== "success") {
      void window.electronAPI?.platformAccount?.cancelScan?.();
    }
    onClose();
  };

  const tag = PHASE_TAG[phase] ?? { color: "default", text: phase };

  return (
    <Modal
      open={open}
      title={platform ? `${platform.emoji} ${platform.label} · 扫码登录` : "扫码登录"}
      onCancel={handleClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Tag color={tag.color} icon={phase === "waiting" ? <LoadingOutlined /> : phase === "success" ? <CheckCircleOutlined /> : phase === "expired" || phase === "error" ? <ExclamationCircleOutlined /> : undefined}>
            {tag.text}
          </Tag>
          <div>
            {(phase === "expired" || phase === "error") && platform ? (
              <Button icon={<ReloadOutlined />} type="primary" loading={busy} onClick={() => void start(platform)}>
                刷新二维码
              </Button>
            ) : null}
            <Button style={{ marginLeft: 8 }} onClick={handleClose}>
              {phase === "success" ? "完成" : "取消"}
            </Button>
          </div>
        </div>
      }
      width={460}
      maskClosable={false}
      destroyOnClose
    >
      <Steps
        size="small"
        current={PHASE_STEP[phase] ?? 0}
        status={phase === "expired" || phase === "error" ? "error" : phase === "success" ? "finish" : "process"}
        items={[{ title: "打开登录窗口" }, { title: "手机确认" }, { title: "完成" }]}
        style={{ marginBottom: 16 }}
      />

      {!supported ? (
        <Alert type="warning" showIcon message="当前环境不支持扫码登录" description="请在桌面端客户端使用该功能。" />
      ) : phase === "success" ? (
        <Alert
          type="success"
          showIcon
          message="登录成功"
          description={`登录态已加密保存到本地${displayName ? `，账号：${displayName}` : ""}。发布时会自动复用该会话。`}
        />
      ) : (
        <>
          <div style={{ textAlign: "center", padding: "20px 0", border: "1px dashed var(--color-border, #d9d9d9)", borderRadius: 8, marginBottom: 12 }}>
            <QrcodeOutlined style={{ fontSize: 64, color: phase === "expired" ? "#dc2626" : "#1677ff" }} />
            <div style={{ marginTop: 8, color: "var(--color-text-secondary)", fontSize: 13 }}>
              {phase === "expired" ? "二维码已失效，请点击「刷新二维码」" : "登录窗口已打开，请在弹出的窗口中扫码"}
            </div>
          </div>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            说明：桌面端会弹出 {platform?.label} 官方登录页，你在其中完成扫码即可；本窗口会实时显示扫码进度。
          </Typography.Paragraph>
        </>
      )}

      {message ? (
        <Alert style={{ marginTop: 12 }} type={phase === "expired" || phase === "error" ? "warning" : "info"} showIcon message={message} />
      ) : null}
    </Modal>
  );
}
