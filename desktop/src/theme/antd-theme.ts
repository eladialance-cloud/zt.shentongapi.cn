import type { ThemeConfig } from 'antd';

/**
 * Ant Design v5 Theme — 方案C: Glassmorphism Enterprise Blue
 * 玻璃态侧栏 + 浅色主题
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2563EB',
    colorPrimaryHover: '#3B82F6',
    colorPrimaryActive: '#1D4ED8',

    colorSuccess: '#16A34A',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    colorInfo: '#3B82F6',
    colorLink: '#2563EB',

    colorTextBase: '#1E293B',
    colorText: '#1E293B',
    colorTextSecondary: '#475569',
    colorTextTertiary: '#475569',
    colorTextQuaternary: '#64748B',

    colorBgBase: '#FFFFFF',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBgLayout: '#F1F5F9',
    colorBgSpotlight: '#F1F5F9',

    colorBorder: '#E2E8F0',
    colorBorderSecondary: '#E9EFF8',

    fontFamily: "Inter, 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 12,
    fontSizeXL: 20,
    fontSizeHeading1: 32,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,

    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,

    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
    boxShadowSecondary: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',

    motionDurationFast: '0.12s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.35s',
  },
  components: {
    Layout: {
      bodyBg: '#F8FAFC',
      headerBg: 'rgba(255, 255, 255, 0.72)',
      siderBg: 'transparent',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(37, 99, 235, 0.08)',
      itemColor: '#475569',
      itemSelectedColor: '#2563EB',
      itemHoverBg: 'rgba(37, 99, 235, 0.04)',
    },
    Card: {
      paddingLG: 20,
      borderRadiusLG: 16,
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
    },
    Button: {
      borderRadius: 10,
      borderRadiusLG: 12,
      primaryShadow: '0 0 16px rgba(37, 99, 235, 0.2)',
    },
  },
};
