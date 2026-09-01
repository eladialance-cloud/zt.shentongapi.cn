/**
 * Office WebSocket 客户端 — 对接后端 SyncGateway (Socket.IO)
 *
 * 订阅事件:
 * - office:employee-status   →  员工状态更新
 * - hermes:task-completed    →  任务完成
 *
 * 使用 socket.io-client 连接后端 /sync 命名空间
 */

import { io, Socket } from "socket.io-client";
import type { AIEmployeeStatus } from "@/components/AIEmployeeCard";

/** WebSocket 推送的状态更新 */
export interface OfficeStatusUpdate {
  employeeId: string;
  status: AIEmployeeStatus;
  reason?: string;
  task?: string;
  completed?: boolean;
  error?: string;
  timestamp: string;
}

/** Office WebSocket 客户端接口 */
export interface OfficeWebSocketClient {
  subscribe(callback: (update: OfficeStatusUpdate) => void): () => void;
  connect(): void;
  disconnect(): void;
}

/**
 * 创建 Office WebSocket 客户端
 *
 * 连接策略:
 * 1. 优先读取 VITE_WS_URL 环境变量作为 Socket.IO 服务地址
 * 2. 回退到 VITE_API_BASE_URL 同域
 * 3. 开发环境使用 localhost:3001
 * 4. 连接 /sync 命名空间
 */
export function createOfficeWebSocket(): OfficeWebSocketClient {
  let baseUrl = "";
  try {
    const envUrl = (import.meta as any).env?.VITE_WS_URL;
    if (envUrl) {
      baseUrl = envUrl;
    } else {
      const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || "";
      if (apiBase) {
        // 将 http(s)://host/api 提取为 http(s)://host
        baseUrl = apiBase.replace(/\/api$/, "");
      }
    }
  } catch {
    // import.meta.env 不可用
  }

  if (!baseUrl || baseUrl === "undefined") {
    baseUrl = "http://localhost:3001";
  }

  return new RealOfficeWebSocketClient(baseUrl);
}

class RealOfficeWebSocketClient implements OfficeWebSocketClient {
  private socket: Socket | null = null;
  private listeners: Array<(update: OfficeStatusUpdate) => void> = [];
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  subscribe(callback: (update: OfficeStatusUpdate) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  connect(): void {
    if (this.socket?.connected) return;

    const token = this.getAccessToken();

    this.socket = io(`${this.baseUrl}/sync`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    this.socket.on("connect", () => {
      console.log("[OfficeWS] Connected to SyncGateway");
    });

    this.socket.on("office:employee-status", (data: any) => {
      try {
        const update: OfficeStatusUpdate = {
          employeeId: data.employeeId ?? data.payload?.employeeId,
          status: data.status ?? data.payload?.status,
          reason: data.reason ?? data.payload?.reason,
          task: data.task ?? data.payload?.task,
          completed: data.completed ?? data.payload?.completed,
          error: data.error ?? data.payload?.error,
          timestamp: data.timestamp ?? new Date().toISOString(),
        };
        this.listeners.forEach((cb) => cb(update));
      } catch (err) {
        console.warn("[OfficeWS] Failed to parse message:", err);
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[OfficeWS] Disconnected:", reason);
    });

    this.socket.on("connect_error", (err) => {
      console.warn("[OfficeWS] Connection error:", err.message);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners = [];
  }

  private getAccessToken(): string | undefined {
    try {
      // 从 zustand auth store 读取 token
      const store = (window as any).__ZUSTAND_AUTH_STORE__;
      if (store?.getState) {
        return store.getState().accessToken;
      }
    } catch {}
    // 回退: 直接读取 localStorage
    try {
      const authState = localStorage.getItem("auth-storage");
      if (authState) {
        const parsed = JSON.parse(authState);
        return parsed?.state?.accessToken;
      }
    } catch {}
    return undefined;
  }
}
