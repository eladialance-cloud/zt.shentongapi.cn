// 顶栏 - v4.0 Kimi 风格
// 40px: Logo(点击回仪表盘) + 搜索框 + 主题切换 + 通知 + 积分余额 + 头像菜单

import { useNavigate } from "react-router-dom";
import { Avatar, Badge, Dropdown, Input, Popover, Tooltip, type MenuProps } from "antd";
import {
  BellOutlined,
  GiftOutlined,
  LogoutOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Moon, Sun } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useCreditsStore } from "@/store/credits";
import {
  useSettingsStore,
  resolveThemeMode,
  systemPrefersDark,
} from "@/store/settings";
import styles from "./styles.module.css";

interface NotificationItem {
  id: number;
  title: string;
  time: string;
  read: boolean;
}

/** Mock 通知列表 */
const NOTIFICATIONS: NotificationItem[] = [
  { id: 1, title: "欢迎使用深瞳AI-智能中台", time: "刚刚", read: false },
  { id: 2, title: "您的积分已到账", time: "1 小时前", read: false },
  { id: 3, title: "系统已更新到最新版本", time: "昨天", read: true },
];

export default function TopBar() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const balance = useCreditsStore((s) => s.balance);

  const themeMode = useSettingsStore((s) => s.theme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const effectiveTheme = resolveThemeMode(themeMode, systemPrefersDark());
  const isDark = effectiveTheme === "dark";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const userMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "个人设置",
      onClick: () => navigate("/settings"),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      onClick: handleLogout,
    },
  ];

  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;

  const notificationContent = (
    <div className={styles.notificationList}>
      {NOTIFICATIONS.length === 0 ? (
        <div className={styles.notificationEmpty}>暂无通知</div>
      ) : (
        NOTIFICATIONS.map((n) => (
          <div key={n.id} className={styles.notificationItem}>
            <div className={styles.notificationTitle}>
              {!n.read && <span className={styles.notificationDot} />}
              {n.title}
            </div>
            <div className={styles.notificationTime}>{n.time}</div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className={styles.topbar}>
      {/* 左侧:Logo（点击回仪表盘） */}
      <div className={styles.topbarLeft}>
        <span
          className={styles.logo}
          onClick={() => navigate("/dashboard")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate("/dashboard");
          }}
        >
          深瞳AI
        </span>
      </div>

      {/* 中间:搜索框 */}
      <div className={styles.topbarCenter}>
        <Input.Search
          placeholder="搜索 Agent/工作流/知识库..."
          className={styles.searchInput}
          size="middle"
          variant="filled"
        />
      </div>

      {/* 右侧:主题 + 通知 + 积分 + 头像 */}
      <div className={styles.topbarRight}>
        <Tooltip title={isDark ? "切换到浅色" : "切换到深色"}>
          <span
            className={styles.iconBtn}
            onClick={toggleTheme}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") toggleTheme();
            }}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </span>
        </Tooltip>

        <Popover
          content={notificationContent}
          title="通知"
          trigger="click"
          placement="bottomRight"
        >
          <Badge count={unreadCount} size="small">
            <BellOutlined className={styles.iconBtn} />
          </Badge>
        </Popover>

        <div
          className={styles.creditsBadge}
          onClick={() => navigate("/credits")}
          role="button"
          tabIndex={0}
        >
          <GiftOutlined />
          <span>{balance}</span>
        </div>

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <div className={styles.avatarWrap}>
            <Avatar
              size={28}
              icon={<UserOutlined />}
              src={user?.avatar}
              className={styles.avatar}
            />
            <span className={styles.username}>{user?.username || "用户"}</span>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
