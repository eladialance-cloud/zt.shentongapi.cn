// 全局错误边界组件
// 捕获子组件树渲染错误，显示友好的错误提示页面，避免白屏

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Result, Button, Typography } from 'antd'

const { Paragraph, Text } = Typography

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleGoHome = (): void => {
    window.location.href = '/admin/'
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { error, errorInfo } = this.state

    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: '#0f172a'
        }}
      >
        <Result
          status="error"
          title="页面渲染异常"
          subTitle="抱歉，页面在渲染过程中发生了错误。您可以尝试刷新页面或返回首页。"
          extra={[
            <Button type="primary" key="reload" onClick={this.handleReload}>
              刷新页面
            </Button>,
            <Button key="home" onClick={this.handleGoHome}>
              返回首页
            </Button>
          ]}
        >
          {error && (
            <div style={{ textAlign: 'left', maxWidth: 600, margin: '0 auto' }}>
              <Paragraph>
                <Text strong>错误信息：</Text>
              </Paragraph>
              <Paragraph>
                <Text code style={{ wordBreak: 'break-all' }}>
                  {error.toString()}
                </Text>
              </Paragraph>
              {errorInfo && errorInfo.componentStack && (
                <>
                  <Paragraph>
                    <Text strong>组件堆栈：</Text>
                  </Paragraph>
                  <Paragraph>
                    <pre
                      style={{
                        fontSize: 12,
                        color: '#94a3b8',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}
                    >
                      {errorInfo.componentStack}
                    </pre>
                  </Paragraph>
                </>
              )}
            </div>
          )}
        </Result>
      </div>
    )
  }
}

export default ErrorBoundary
