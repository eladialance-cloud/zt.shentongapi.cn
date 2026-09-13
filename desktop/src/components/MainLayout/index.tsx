// 主窗口骨架 — v3.0 Glassmorphism Enterprise Blue (方案C)
// 结构: TopBar(52px) + [GlassSidebar(240/64px) | Content(flex:1)] + StatusBar(24px)
// Ctrl+K 唤起命令面板

import { useCallback, useEffect, useState } from "react";
import { httpClient } from "@/api/http-client";
import { useSystemStore } from "@/store/system";
import { useAuthStore } from "@/store";
import { startScheduledRunner, stopScheduledRunner } from "@/scheduler/scheduled-runner";
import { decideSchedulerMode, type SchedulerMode } from "@/scheduler/scheduler-mode";
import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";
import CommandPalette from "@/components/CommandPalette";
import styles from "./styles.module.css";

export default function MainLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { backendAvailable, checkingBackend, setChecking, setBackendOnline } = useSystemStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setPaletteOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function check() {
      try {
        await httpClient.get("/health", { timeout: 15000 });
        if (!cancelled) {
          setBackendOnline();
          setChecking(false);
        }
      } catch {
        if (!cancelled) {
          useSystemStore.getState().setBackendOffline();
          setChecking(false);
        }
      }
    }

    check();
    timer = setInterval(check, 30000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [setBackendOnline, setChecking]);


  // 定时任务执行方：先问主进程常驻引擎的状态，再决定谁跑（避免启动瞬间双跑）
  // 初值 null = 「还没问出结果」，此时两边都不启动，彻底杜绝启动瞬间双跑
  const [schedulerMode, setSchedulerMode] = useState<SchedulerMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    const api = window.electronAPI?.cronEngine;
    const hasApi = !!api?.getState;
    const apply = (state: { enabled?: boolean } | null | undefined) => {
      if (cancelled) return;
      setSchedulerMode(decideSchedulerMode(state, hasApi));
    };
    if (hasApi) api.getState().then(apply).catch(() => apply(null));
    else apply(null);
    const unsubscribe = api?.onEvent?.((payload) => {
      if (payload?.type === "state") apply(payload);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // 只有判定为「渲染层执行」时才启动轮询；主进程引擎负责时渲染层保持停止
  useEffect(() => {
    if (schedulerMode === null) return; // 主进程状态还没回来：先不启动，等判定结果
    if (schedulerMode !== "renderer") {
      stopScheduledRunner();
      return;
    }
    startScheduledRunner(() => useAuthStore.getState().accessToken);
    return () => stopScheduledRunner();
  }, [schedulerMode]);
  return (
    <div className={styles.layout}>
      <TopBar />

      {!checkingBackend && !backendAvailable && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          flexShrink: 0,
        }}>
          <span>⚠ 后端服务未响应 — 请检查服务状态</span>
          <span
            onClick={() => { setChecking(true); setBackendOnline(); }}
            style={{
              color: 'var(--color-brand)',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            重试
          </span>
        </div>
      )}

      <div className={styles.main}>
        <Sidebar />
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>

      <StatusBar />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
