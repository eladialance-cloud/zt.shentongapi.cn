// 深瞳 AI 智能中台 - 主题配置 (Ant Design Design Token)
// 科技感深色品牌视觉系统

export const theme = {
  // 主色 - 靛蓝
  primaryColor: '#6366f1',
  successColor: '#10b981',
  warningColor: '#f59e0b',
  errorColor: '#ef4444',

  // 中性色
  textColorPrimary: 'rgba(0, 0, 0, 0.88)',
  textColorSecondary: 'rgba(0, 0, 0, 0.65)',
  textColorTertiary: 'rgba(0, 0, 0, 0.45)',
  borderColor: '#e5e7eb',
  bgLayout: '#f1f5f9',
  bgContainer: '#ffffff',

  // 圆角
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,

  // 字体
  fontFamily:
    "'HarmonyOS Sans', 'PingFang SC', '思源黑体 CN', 'Source Han Sans CN', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontSize: 14,
  fontSizeLG: 16,
  fontSizeXL: 20,

  // 间距
  padding: 16,
  paddingLG: 24,
  margin: 16,
  marginLG: 24,
} as const;

export default theme;
