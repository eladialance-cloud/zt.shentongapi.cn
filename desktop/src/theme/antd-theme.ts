import type { ThemeConfig } from 'antd';

/**
 * Ant Design v5 暗色主题映射
 * 所有色值与 design-tokens.css 保持一致
 */
export const antdTheme: ThemeConfig = {
  algorithm: undefined, // 不使用 antd 内置暗色算法，手动映射
  token: {
    // Brand
    colorPrimary: '#4F6EF7',
    colorPrimaryHover: '#6B86FF',
    colorPrimaryActive: '#3D5BD9',

    // Semantic
    colorSuccess: '#34D399',
    colorWarning: '#FBBF24',
    colorError: '#F87171',
    colorInfo: '#60A5FA',
    colorLink: '#4F6EF7',

    // Text
    colorTextBase: '#E6EDF3',
    colorText: '#E6EDF3',
    colorTextSecondary: '#8B949E',
    colorTextTertiary: '#6E7681',
    colorTextQuaternary: '#484F58',

    // Background
    colorBgBase: '#161B22',
    colorBgContainer: '#161B22',
    colorBgElevated: '#1C2333',
    colorBgLayout: '#0D1117',
    colorBgSpotlight: '#21283A',

    // Border
    colorBorder: '#30363D',
    colorBorderSecondary: '#21262D',

    // Typography
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    fontSize: 13,
    fontSizeLG: 16,
    fontSizeSM: 12,
    fontSizeXL: 20,
    fontSizeHeading1: 32,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 18,
    fontSizeHeading5: 16,

    // Radius
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    borderRadiusXS: 4,

    // Shadows
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    boxShadowSecondary: '0 2px 8px rgba(0, 0, 0, 0.3)',

    // Motion
    motionDurationFast: '0.12s',
    motionDurationMid: '0.2s',
    motionDurationSlow: '0.32s',

    // Layout
    controlHeight: 32,
    controlHeightLG: 40,
    controlHeightSM: 24,
    controlHeightXS: 16,

    wireframe: false,
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 32,
      controlHeightLG: 40,
      controlHeightSM: 24,
      colorPrimary: '#4F6EF7',
      colorPrimaryHover: '#6B86FF',
      colorPrimaryActive: '#3D5BD9',
    },
    Card: {
      borderRadiusLG: 8,
      colorBgContainer: '#161B22',
      colorBorderSecondary: '#30363D',
      boxShadowTertiary: '0 2px 8px rgba(0, 0, 0, 0.3)',
    },
    Modal: {
      borderRadiusLG: 8,
      colorBgElevated: '#21283A',
      contentBg: '#1C2333',
      headerBg: '#1C2333',
      titleColor: '#E6EDF3',
    },
    Drawer: {
      borderRadiusLG: 8,
      colorBgElevated: '#1C2333',
    },
    Input: {
      borderRadius: 6,
      colorBgContainer: '#0D1117',
      colorBorder: '#30363D',
      activeBorderColor: '#4F6EF7',
      hoverBorderColor: '#484F58',
      activeShadow: '0 0 0 2px rgba(79, 110, 247, 0.12)',
    },
    InputNumber: {
      borderRadius: 6,
      colorBgContainer: '#0D1117',
      colorBorder: '#30363D',
      activeBorderColor: '#4F6EF7',
      activeShadow: '0 0 0 2px rgba(79, 110, 247, 0.12)',
    },
    Select: {
      borderRadius: 6,
      colorBgContainer: '#0D1117',
      colorBorder: '#30363D',
      optionSelectedBg: 'rgba(79, 110, 247, 0.12)',
      optionActiveBg: 'rgba(79, 110, 247, 0.08)',
    },
    Tabs: {
      titleFontSize: 13,
      titleFontSizeLG: 16,
      colorBorderSecondary: '#30363D',
      itemActiveColor: '#E6EDF3',
      itemSelectedColor: '#4F6EF7',
      itemHoverColor: '#8B949E',
      inkBarColor: '#4F6EF7',
    },
    Tag: {
      borderRadiusSM: 4,
    },
    Progress: {
      defaultColor: '#4F6EF7',
    },
    Dropdown: {
      colorBgElevated: '#1C2333',
      controlItemBgHover: 'rgba(79, 110, 247, 0.08)',
      controlItemBgActive: 'rgba(79, 110, 247, 0.12)',
    },
    Menu: {
      colorBgContainer: '#1C2333',
      colorItemBgSelected: 'rgba(79, 110, 247, 0.12)',
      colorItemBgActive: 'rgba(79, 110, 247, 0.08)',
      colorItemText: '#8B949E',
      colorItemTextSelected: '#E6EDF3',
      colorItemTextHover: '#E6EDF3',
      colorActiveBarBorderSize: 0,
    },
    Tooltip: {
      colorBgSpotlight: '#21283A',
      colorTextLightSolid: '#E6EDF3',
    },
    Table: {
      colorBgContainer: '#1C2333',
      colorBorderSecondary: '#30363D',
      headerBg: '#161B22',
      headerColor: '#8B949E',
      rowHoverBg: 'rgba(79, 110, 247, 0.04)',
    },
    Pagination: {
      colorBgContainer: 'transparent',
      colorBorder: '#30363D',
      itemActiveBg: 'rgba(79, 110, 247, 0.12)',
    },
    Badge: {
      colorBgContainer: '#1C2333',
    },
    Avatar: {
      colorBgContainer: '#30363D',
    },
    Divider: {
      colorSplit: '#30363D',
    },
    Spin: {
      colorPrimary: '#4F6EF7',
    },
    Empty: {
      colorText: '#6E7681',
      colorTextDisabled: '#484F58',
    },
    Skeleton: {
      colorBgContainer: '#161B22',
      gradientFromColor: '#1C2333',
      gradientToColor: '#21283A',
    },
    Notification: {
      colorBgElevated: '#1C2333',
    },
    Message: {
      colorBgElevated: '#1C2333',
      contentBg: '#1C2333',
    },
    Switch: {
      colorPrimary: '#4F6EF7',
      colorPrimaryHover: '#6B86FF',
    },
    Radio: {
      colorPrimary: '#4F6EF7',
      colorPrimaryHover: '#6B86FF',
      buttonSolidCheckedBg: '#4F6EF7',
      buttonSolidCheckedColor: '#FFFFFF',
      buttonSolidCheckedHoverBg: '#6B86FF',
    },
    Checkbox: {
      colorPrimary: '#4F6EF7',
      colorPrimaryHover: '#6B86FF',
    },
    DatePicker: {
      borderRadius: 6,
      colorBgContainer: '#0D1117',
      colorBorder: '#30363D',
      colorBgElevated: '#21283A',
    },
    Popover: {
      colorBgElevated: '#21283A',
    },
    Collapse: {
      colorBgContainer: '#1C2333',
      colorBorderSecondary: '#30363D',
    },
    Tree: {
      colorBgContainer: 'transparent',
      colorText: '#8B949E',
      nodeSelectedBg: 'rgba(79, 110, 247, 0.12)',
      nodeSelectedColor: '#E6EDF3',
    },
    Slider: {
      colorPrimary: '#4F6EF7',
      colorPrimaryBorder: '#30363D',
      handleColor: '#4F6EF7',
    },
  },
};

export default antdTheme;
