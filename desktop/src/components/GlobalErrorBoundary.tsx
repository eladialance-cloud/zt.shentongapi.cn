import { Component, ErrorInfo, ReactNode } from 'react'
import { Button, Result } from 'antd'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[GlobalErrorBoundary] caught error:', error, errorInfo)
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  handleGoHome = (): void => {
    this.setState({ hasError: false, error: null })
    window.location.hash = '#/'
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-container)' }}>
          <Result
            status="error"
            title="出错了"
            subTitle={this.state.error?.message || ''}
            style={{ background: 'transparent' }}
            extra={[
              <Button key="reload" type="primary" onClick={this.handleReload}>
                刷新
              </Button>,
              <Button key="home" onClick={this.handleGoHome}>
                返回首页
              </Button>
            ]}
          />
        </div>
      )
    }
    return this.props.children
  }
}

export default GlobalErrorBoundary
