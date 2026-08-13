/**
 * VideoClaw — AI 视频（本地视频生成工作台，Task 4）
 * 状态机：stopped -> 引导卡（启动/安装）-> starting -> running(iframe)
 * 通过 IPC 实时订阅状态变更，无需手动刷新
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Result, Spin, Tag, Typography } from "antd";
import {
  PlayCircleOutlined,
  ReloadOutlined,
  DownloadOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import {
  listServices,
  startService,
  installService,
  onServiceStatusChanged,
} from "@/api/service-manager-api";
import type { ServiceInfo } from "@/types/service-manager";

const VIDEO_CLAW_PORT = 3000;
const VIDEO_CLAW_URL = `http://127.0.0.1:${VIDEO_CLAW_PORT}`;

export default function VideoClaw() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [svc, setSvc] = useState<ServiceInfo | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listServices();
      setSvc(list.find((s) => s.name === "video-claw") ?? null);
    } catch (err) {
      console.error("[VideoClaw] load failed:", err);
      setSvc(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsub = onServiceStatusChanged((payload) => {
      if (payload.name !== "video-claw") return;
      setSvc(payload.info);
    });
    return unsub;
  }, [load]);

  const handleStart = async () => {
    setBusy(true);
    try {
      await startService("video-claw");
    } catch (err) {
      console.error("[VideoClaw] start failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = async () => {
    setBusy(true);
    try {
      await installService("video-claw");
    } catch (err) {
      console.error("[VideoClaw] install failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const status = svc?.status ?? "stopped";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--glass-bg, #f1f5f9)",
        overflow: "hidden",
      }}
    >
      {/* 顶部标题栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: "1px solid var(--glass-border, #e2e8f0)",
          background: "#fff",
          flexShrink: 0,
        }}
      >
        <VideoCameraOutlined style={{ color: "#ec4899", fontSize: 18 }} />
        <Typography.Text strong>AI 视频（VideoClaw）</Typography.Text>
        <Tag
          color={
            status === "running"
              ? "success"
              : status === "starting"
              ? "processing"
              : status === "error"
              ? "error"
              : "default"
          }
        >
          {status === "running"
            ? "运行中"
            : status === "starting"
            ? "启动中"
            : status === "error"
            ? "异常"
            : "未启动"}
        </Tag>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {loading ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Spin tip="加载服务状态中..." />
          </div>
        ) : status === "running" ? (
          <iframe
            title="VideoClaw"
            src={VIDEO_CLAW_URL}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              overflow: "auto",
            }}
          >
            <Card style={{ width: 560 }} bordered>
              {status === "error" ? (
                <Result
                  status="error"
                  title="AI 视频服务启动失败"
                  subTitle={svc?.error || "请点击重试，或到「服务」页安装/修复运行时。"}
                  extra={[
                    <Button
                      key="retry"
                      type="primary"
                      icon={<ReloadOutlined />}
                      loading={busy}
                      onClick={() => void handleStart()}
                    >
                      重试启动
                    </Button>,
                    <Button
                      key="install"
                      icon={<DownloadOutlined />}
                      loading={busy}
                      onClick={() => void handleInstall()}
                    >
                      安装/修复运行时
                    </Button>,
                  ]}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Typography.Text type="secondary">
                      AI 视频服务尚未启动，启动后即可在本地生成文生视频 / 图生视频
                    </Typography.Text>
                  }
                >
                  <Button
                    type="primary"
                    size="large"
                    icon={<PlayCircleOutlined />}
                    loading={busy}
                    onClick={() => void handleStart()}
                  >
                    启动服务
                  </Button>
                  <div style={{ marginTop: 12 }}>
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      loading={busy}
                      onClick={() => void handleInstall()}
                    >
                      首次使用请先安装运行时
                    </Button>
                  </div>
                </Empty>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
