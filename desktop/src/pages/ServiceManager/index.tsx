// 客户端本地服务管理 - 服务状态面板（Task 16）
// SubTask 16.1: 三个服务状态卡片（OpenClaw/N8N/MCP）
// SubTask 16.3: 监听 service:error 弹窗通知
// 通过 IPC 实时更新状态 + 轮询 CPU/内存

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Button,
  Spin,
  Empty,
  Tooltip,
  Popconfirm,
  notification,
  message,
  Progress,
} from "antd";
import {
  RollbackOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CloudServerOutlined,
  ApartmentOutlined,
  ApiOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import {
  listServices,
  startService,
  stopService,
  restartService,
  onServiceStatusChanged,
  onServiceError,
  installService,
  onInstallProgress,
  getRuntimeDir,
  chooseRuntimeDir,
} from "@/api/service-manager-api";
import type {
  ServiceName,
  ServiceInfo,
  ServiceStatus,
  RuntimeDirInfo,
} from "@/types/service-manager";
import styles from "./styles.module.css";

/** 服务图标映射 */
const SERVICE_ICONS: Record<ServiceName, React.ReactNode> = {
  openclaw: <CloudServerOutlined style={{ color: "#6366f1" }} />,
  n8n: <ApartmentOutlined style={{ color: "#8b5cf6" }} />,
  mcp: <ApiOutlined style={{ color: "#06b6d4" }} />,
  hermes: <ApiOutlined style={{ color: "#f59e0b" }} />,
  "video-claw": <VideoCameraOutlined style={{ color: "#ec4899" }} />,
};

/** 状态展示配置 */
const STATUS_CONFIG: Record<
  ServiceStatus,
  { label: string; className: string }
> = {
  running: { label: "运行中", className: styles.statusRunning },
  stopped: { label: "已停止", className: styles.statusStopped },
  starting: { label: "启动中", className: styles.statusStarting },
  error: { label: "错误", className: styles.statusError },
  unknown: { label: "未知", className: styles.statusUnknown },
};

/** 格式化时间 */
function formatTime(value: string | undefined | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 格式化字节数 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export default function ServiceManager() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  /** 正在执行操作的服务（防止重复点击） */
  const [busy, setBusy] = useState<Set<ServiceName>>(new Set());
  /** 正在安装/下载运行时的服务 */
  const [installing, setInstalling] = useState<Set<ServiceName>>(new Set());
  /** 安装进度（0-100） */
  const [progress, setProgress] = useState<Partial<Record<ServiceName, number>>>({});
  /** 运行时下载安装位置信息 */
  const [runtimeDir, setRuntimeDir] = useState<RuntimeDirInfo | null>(null);
  /** 位置加载失败原因 */
  const [runtimeDirError, setRuntimeDirError] = useState<string | null>(null);
  /** 正在选择目录 */
  const [choosingDir, setChoosingDir] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const list = await listServices();
      setServices(list || []);
    } catch (err) {
      console.error("[ServiceManager] load failed:", err);
      // electronAPI 不可用时给出空列表占位
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 加载运行时下载安装位置（失败时展示原因，可重试）
  const loadRuntimeDir = useCallback(() => {
    // 主进程获取磁盘信息（statfs）在异常磁盘/网络盘上可能长时间阻塞，
    // 加 8s 超时兜底：超时展示默认位置并提示可重试，避免界面永远“加载中”
    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error("获取磁盘信息超时，已回退默认位置")), 8000);
      if (typeof (t as unknown as { unref?: () => void }).unref === "function") (t as unknown as { unref: () => void }).unref();
    });
    void Promise.race([getRuntimeDir(), timeout])
      .then((info) => {
        setRuntimeDir(info);
        setRuntimeDirError(info.error ? String(info.error) : null);
      })
      .catch((err) => {
        console.error("[ServiceManager] getRuntimeDir failed:", err);
        setRuntimeDir(null);
        setRuntimeDirError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    loadRuntimeDir();
  }, [loadRuntimeDir]);

  // 监听状态变更事件，实时更新对应服务
  useEffect(() => {
    const unsub = onServiceStatusChanged((payload) => {
      setServices((prev) => {
        const idx = prev.findIndex((s) => s.name === payload.name);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = payload.info;
        return next;
      });
    });
    return () => {
      unsub();
    };
  }, []);

  // 监听服务错误事件，弹窗通知
  useEffect(() => {
    const unsub = onServiceError((payload) => {
      notification.error({
        key: `service-error-${payload.name}`,
        message: `服务异常：${payload.name}`,
        description: `${payload.message}（已重试 ${payload.retryCount} 次）`,
        duration: 0,
      });
    });
    return () => {
      unsub();
    };
  }, []);

  // 监听安装进度事件，实时更新进度条
  useEffect(() => {
    const unsub = onInstallProgress((payload) => {
      setProgress((prev) => ({ ...prev, [payload.name]: payload.percent }));
    });
    return () => {
      unsub();
    };
  }, []);

  // 轮询刷新 CPU/内存（2s 一次）
  useEffect(() => {
    const timer = setInterval(() => {
      void loadData();
    }, 2000);
    return () => clearInterval(timer);
  }, [loadData]);

  const setBusyFor = (name: ServiceName, value: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (value) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const handleStart = async (name: ServiceName) => {
    setBusyFor(name, true);
    try {
      const ok = await startService(name);
      if (ok) message.success(`${name} 已启动`);
      else message.warning(`${name} 启动中，请稍候`);
      void loadData();
    } catch (err) {
      console.error("[ServiceManager] start failed:", err);
      message.error(`启动失败: ${(err as Error).message}`);
    } finally {
      setBusyFor(name, false);
    }
  };

  const handleStop = async (name: ServiceName) => {
    setBusyFor(name, true);
    try {
      await stopService(name);
      message.success(`${name} 已停止`);
      void loadData();
    } catch (err) {
      console.error("[ServiceManager] stop failed:", err);
      message.error(`停止失败: ${(err as Error).message}`);
    } finally {
      setBusyFor(name, false);
    }
  };

  const handleRestart = async (name: ServiceName) => {
    setBusyFor(name, true);
    try {
      const ok = await restartService(name);
      if (ok) message.success(`${name} 已重启`);
      else message.warning(`${name} 重启中，请稍候`);
      void loadData();
    } catch (err) {
      console.error("[ServiceManager] restart failed:", err);
      message.error(`重启失败: ${(err as Error).message}`);
    } finally {
      setBusyFor(name, false);
    }
  };

  /** 更改运行时下载安装位置（方案 B：不迁移已下载内容） */
  const handleChooseDir = async () => {
    setChoosingDir(true);
    try {
      const result = await chooseRuntimeDir();
      if (result.ok) {
        message.success(`下载安装位置已更新：${result.path}`);
        const info = await getRuntimeDir();
        setRuntimeDir(info);
      } else if (!result.canceled) {
        message.error(`设置失败：${result.error ?? "未知错误"}`);
      }
    } catch (err) {
      console.error("[ServiceManager] choose dir failed:", err);
      message.error(`设置失败：${(err as Error).message}`);
    } finally {
      setChoosingDir(false);
    }
  };

  const handleInstall = async (name: ServiceName) => {
    setInstalling((prev) => new Set(prev).add(name));
    setProgress((prev) => ({ ...prev, [name]: 0 }));
    try {
      const ok = await installService(name);
      if (ok) message.success(`${name} 安装完成并已启动`);
      else message.warning(`${name} 安装失败，请检查网络或稍后重试`);
      void loadData();
    } catch (err) {
      console.error("[ServiceManager] install failed:", err);
      message.error(`安装失败: ${(err as Error).message}`);
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      void loadData();
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <ApartmentOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>本地服务管理</h1>
            <div className={styles.subtitle}>
              管理 OpenClaw / N8N / MCP Gateway 三个本地服务进程
            </div>
          </div>
        </div>
        <Button
          icon={<RollbackOutlined />}
          onClick={() => navigate("/dashboard")}
          className={styles.backBtn}
        >
          返回主页
        </Button>
      </div>

      {/* 下载安装位置设置条 */}
      <div className={styles.locationBar}>
        <FolderOpenOutlined className={styles.locationIcon} />
        <span className={styles.locationLabel}>下载安装位置</span>
        {runtimeDirError ? (
          <span className={styles.locationError}>
            位置加载失败：{runtimeDirError}
            <Button
              size="small"
              className={styles.locationBtn}
              icon={<ReloadOutlined />}
              onClick={() => void loadRuntimeDir()}
            >
              重试
            </Button>
          </span>
        ) : (
          <Tooltip title={runtimeDir?.path ?? "-"}>
            <span className={styles.locationPath}>
              {runtimeDir?.path ?? "加载中..."}
            </span>
          </Tooltip>
        )}
        <span className={styles.locationSpace}>
          {runtimeDir
            ? `剩余 ${formatBytes(runtimeDir.freeBytes)} / 共 ${formatBytes(runtimeDir.totalBytes)}`
            : ""}
        </span>
        <Button
          size="small"
          className={styles.locationBtn}
          icon={<FolderOpenOutlined />}
          loading={choosingDir}
          onClick={() => void handleChooseDir()}
        >
          更改位置
        </Button>
        <span className={styles.locationTip}>
          更改后仅对之后下载生效
        </span>
      </div>

      <Spin spinning={loading}>
        {services.length === 0 && !loading ? (
          <div className={styles.emptyWrap}>
            <Empty description="暂无服务信息（electronAPI 不可用）" />
          </div>
        ) : (
          <div className={styles.grid}>
            {services.map((svc) => {
              const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.unknown;
              const isRunning = svc.status === "running";
              const isBusy = busy.has(svc.name);
              return (
                <Card key={svc.name} className={styles.card} bordered={false}>
                  {/* 头部：服务名 + 状态 */}
                  <div className={styles.cardHeader}>
                    <div className={styles.serviceName}>
                      {SERVICE_ICONS[svc.name]}
                      {svc.displayName}
                    </div>
                    <span className={`${styles.statusBadge} ${cfg.className}`}>
                      <span className={styles.statusDot} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* 错误信息 */}
                  {svc.status === "error" && svc.error && (
                    <div className={styles.errorMsg}>⚠️ {svc.error}</div>
                  )}

                  {/* 指标 */}
                  <div className={styles.metrics}>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>端口</span>
                      <span className={styles.metricValue}>{svc.port}</span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>PID</span>
                      <span className={styles.metricValue}>
                        {svc.pid ?? "-"}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>启动时间</span>
                      <span className={styles.metricValue}>
                        {formatTime(svc.startTime)}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>CPU / 内存</span>
                      <span className={styles.metricValue}>
                        {isRunning
                          ? `${svc.cpuUsage != null ? svc.cpuUsage.toFixed(1) : "-"}% / ${svc.memoryUsage != null ? svc.memoryUsage + " MB" : "-"}`
                          : "-"}
                      </span>
                    </div>
                  </div>

                  {/* 安装进度 */}
                  {installing.has(svc.name) && (
                    <div className={styles.installProgress}>
                      <Progress percent={progress[svc.name] ?? 0} size="small" />
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className={styles.actions}>
                    <Tooltip title="启动">
                      <Button
                        className={styles.primaryBtn}
                        icon={<PlayCircleOutlined />}
                        loading={isBusy}
                        disabled={isRunning}
                        onClick={() => handleStart(svc.name)}
                      >
                        启动
                      </Button>
                    </Tooltip>
                    <Popconfirm
                      title={`确定停止 ${svc.displayName} 吗？`}
                      onConfirm={() => handleStop(svc.name)}
                      okText="停止"
                      cancelText="取消"
                      disabled={!isRunning}
                    >
                      <Tooltip title="停止">
                        <Button
                          className={styles.dangerBtn}
                          icon={<StopOutlined />}
                          loading={isBusy}
                          disabled={!isRunning}
                        >
                          停止
                        </Button>
                      </Tooltip>
                    </Popconfirm>
                    <Button
                      className={styles.ghostBtn}
                      icon={<ReloadOutlined />}
                      loading={isBusy}
                      onClick={() => handleRestart(svc.name)}
                    >
                      重启
                    </Button>
                    <Tooltip title={isRunning ? "服务运行中，请先停止" : "下载并安装运行时"}>
                      <Button
                        className={styles.primaryBtn}
                        icon={<DownloadOutlined />}
                        loading={installing.has(svc.name)}
                        disabled={isRunning || installing.has(svc.name)}
                        onClick={() => handleInstall(svc.name)}
                      >
                        {installing.has(svc.name) ? "安装中" : "安装/修复"}
                      </Button>
                    </Tooltip>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Spin>
    </div>
  );
}
