// 错误边界 - 捕获子组件渲染异常，展示降级 UI
// 对齐开发文档-前端开发指南.md 8.x 错误处理
import { Component, type ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // 实际项目可上报到监控平台 (Sentry / 自建埋点)
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="500"
          title="页面出错了"
          subTitle={this.state.error?.message || '发生未知错误'}
          extra={
            <Button type="primary" onClick={this.handleReload}>
              刷新页面
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
