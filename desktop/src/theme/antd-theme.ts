import type { ThemeConfig } from 'antd';
import { theme as antdThemeAlgorithm } from 'antd';

/**
 * Ant Design v5 Theme — 深瞳AI Kimi 风格极简体系
 * 浅色：defaultAlgorithm | 深色：darkAlgorithm
 * 品牌蓝 #1F6FEB（Kimi 深蓝），近黑文字 + 白/浅灰分层 + 1px 细边框
 */

const baseTokens = {
  colorPrimary: '#1F6FEB',
  colorPrimaryHover: '#1B5FD6',
  colorPrimaryActive: '#1850C0',

  colorSuccess: '#16A34A',
  colorWarning: '#F59E0B',
  colorError: '#DC2626',
  colorInfo: '#1F6FEB',
  colorLink: '#1F6FEB',

  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  fontSize: 14,
  fontSizeLG: 16,
  fontSizeSM: 12,
  fontSizeXL: 20,
  fontSizeHeading1: 32,
  fontSizeHeading2: 24,
  fontSizeHeading3: 20,

  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,

  motionDurationFast: '0.15s',
  motionDurationMid: '0.2s',
  motionDurationSlow: '0.35s',
} as const;

const lightTokens = {
  ...baseTokens,
  colorTextBase: '#18181B',
  colorText: '#18181B',
  colorTextSecondary: '#5C5C5E',
  colorTextTertiary: '#8E8E93',
  colorTextQuaternary: '#B0B0B5',

  colorBgBase: '#FFFFFF',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  colorBgLayout: '#F7F7F8',
  colorBgSpotlight: '#F7F7F8',

  colorBorder: '#E4E4E7',
  colorBorderSecondary: '#ECECEE',

  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)',
  boxShadowSecondary: '0 1px 2px rgba(0,0,0,0.04)',
};

const darkTokens = {
  ...baseTokens,
  colorPrimary: '#3B82F6',
  colorPrimaryHover: '#4C93F7',
  colorPrimaryActive: '#2E6FE0',
  colorLink: '#3B82F6',
  colorInfo: '#3B82F6',

  colorSuccess: '#4ADE80',
  colorWarning: '#FBBF24',
  colorError: '#F87171',

  colorTextBase: '#F5F5F5',
  colorText: '#F5F5F5',
  colorTextSecondary: '#A6A6AB',
  colorTextTertiary: '#8E8E93',
  colorTextQuaternary: '#6E6E73',

  colorBgBase: '#1E1E1E',
  colorBgContainer: '#2A2A2A',
  colorBgElevated: '#2A2A2A',
  colorBgLayout: '#1E1E1E',
  colorBgSpotlight: '#232323',

  colorBorder: '#3A3A3C',
  colorBorderSecondary: '#333336',

  boxShadow: '0 1px 2px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.3)',
  boxShadowSecondary: '0 1px 2px rgba(0,0,0,0.2)',
};

const sharedComponents = {
  Layout: {
    bodyBg: '#FFFFFF',
    headerBg: '#FFFFFF',
    siderBg: '#F7F7F8',
  },
  Menu: {
    itemBg: 'transparent',
    itemSelectedBg: 'rgba(31, 111, 235, 0.08)',
    itemColor: '#5C5C5E',
    itemSelectedColor: '#1F6FEB',
    itemHoverBg: '#F2F2F3',
  },
  Card: {
    paddingLG: 20,
    borderRadiusLG: 12,
    boxShadow: 'none',
  },
  Button: {
    borderRadius: 8,
    borderRadiusLG: 10,
  },
};

const darkComponents = {
  Layout: {
    bodyBg: '#1E1E1E',
    headerBg: '#1E1E1E',
    siderBg: '#232323',
  },
  Menu: {
    itemBg: 'transparent',
    itemSelectedBg: 'rgba(59, 130, 246, 0.16)',
    itemColor: '#A6A6AB',
    itemSelectedColor: '#3B82F6',
    itemHoverBg: '#323232',
  },
  Card: {
    paddingLG: 20,
    borderRadiusLG: 12,
    boxShadow: 'none',
  },
  Button: {
    borderRadius: 8,
    borderRadiusLG: 10,
  },
};

/** 浅色主题（默认） */
export const lightTheme: ThemeConfig = {
  algorithm: antdThemeAlgorithm.defaultAlgorithm,
  token: lightTokens,
  components: sharedComponents,
};

/** 深色主题 */
export const darkTheme: ThemeConfig = {
  algorithm: antdThemeAlgorithm.darkAlgorithm,
  token: darkTokens,
  components: darkComponents,
};

/** 兼容旧引用（按当前主题返回对应配置） */
export const antdTheme: ThemeConfig = lightTheme;

export default antdTheme;
