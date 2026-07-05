// 应用根组件 - 负责全局配置与路由挂载
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { RouterProvider } from 'react-router-dom';
import router from '@/router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import '@/styles/global.css';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#6366f1',
          borderRadius: 8,
          borderRadiusLG: 12,
          colorBgLayout: '#f1f5f9',
          fontSize: 14,
        },
      }}
    >
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </ConfigProvider>
  );
}
