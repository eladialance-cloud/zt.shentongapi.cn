// 主窗口骨架 - 方案B(顶部 Tab + 卡片仪表盘)
// Layout 结构:顶栏(48px) + Tab 栏(44px) + 内容区(flex:1) + 底栏(32px)
// 深色赛博风格,背景 #0a0e1a,主色 #6366f1/#00d4ff
// Ctrl+K 唤起命令面板

import { useCallback, useEffect, useState } from "react";
import { httpClient } from "@/api/http-client";
import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import TopTabs from "./TopTabs";
import StatusBar from "@/components/StatusBar";
import CommandPalette from "@/components/CommandPalette";
import BackendUnavailable from "@/components/BackendUnavailable";
import styles from "./styles.module.css";

export default function MainLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [checkingBackend, setCheckingBackend] = useState(true);

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

  // Check backend availability on mount and periodically every 30s
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    
    async function check() {
      try {
        await httpClient.get("/health", { timeout: 3000 });
        if (!cancelled) {
          setBackendAvailable(true);
          setCheckingBackend(false);
        }
      } catch {
        if (!cancelled) {
          setBackendAvailable(false);
          setCheckingBackend(false);
        }
      }
    }
    
    check();
    timer = setInterval(check, 30000);
    
    return () => { 
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div className={styles.layout}>
      <TopBar />
      <TopTabs />
      {/* Backend offline warning banner */}
      {!checkingBackend && !backendAvailable && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(248,113,113,0.15), rgba(251,191,36,0.1))',
          borderBottom: '1px solid rgba(248,113,113,0.3)',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          flexShrink: 0,
        }}>
          <span>⚠️ 后端服务未响应 — 团队、Agent、工作流、插件等功能可能无法使用</span>
          <span 
            onClick={() => { setCheckingBackend(true); setBackendAvailable(true); }}
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
      <div className={styles.content}>
        <Outlet />
      </div>
      <StatusBar />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}