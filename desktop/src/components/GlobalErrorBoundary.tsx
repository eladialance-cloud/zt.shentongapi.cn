import { Component, ErrorInfo, ReactNode } from "react";
import { Button, Result, Collapse, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[GlobalErrorBoundary] caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const errorStack = this.state.error?.stack || "";
      const componentStack = this.state.errorInfo?.componentStack || "";
      const isDev =
        typeof import.meta !== "undefined" &&
        (import.meta as Record<string, unknown>).env != null &&
        (import.meta as Record<string, Record<string, unknown>>).env.DEV ===
          true;

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-bg-container)",
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 640, width: "100%" }}>
            <Result
              status="error"
              title="页面发生错误"
              subTitle={this.state.error?.message || "未知错误"}
              style={{ background: "transparent" }}
              extra={[
                <Button
                  key="retry"
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={this.handleRetry}
                >
                  重试
                </Button>,
                <Button key="reload" onClick={this.handleReload}>
                  刷新页面
                </Button>,
              ]}
            />

            {isDev && (errorStack || componentStack) && (
              <Collapse
                ghost
                items={[
                  {
                    key: "details",
                    label: "错误详情（点击展开）",
                    children: (
                      <div
                        style={{ fontSize: 12, fontFamily: "monospace" }}
                      >
                        {errorStack && (
                          <div style={{ marginBottom: 12 }}>
                            <Text
                              strong
                              style={{
                                color: "var(--color-text-tertiary)",
                              }}
                            >
                              Error Stack:
                            </Text>
                            <Paragraph
                              code
                              style={{
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                maxHeight: 200,
                                overflow: "auto",
                                marginTop: 4,
                              }}
                            >
                              {errorStack}
                            </Paragraph>
                          </div>
                        )}
                        {componentStack && (
                          <div>
                            <Text
                              strong
                              style={{
                                color: "var(--color-text-tertiary)",
                              }}
                            >
                              Component Stack:
                            </Text>
                            <Paragraph
                              code
                              style={{
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                                maxHeight: 200,
                                overflow: "auto",
                                marginTop: 4,
                              }}
                            >
                              {componentStack}
                            </Paragraph>
                          </div>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            )}

            {!isDev && (errorStack || componentStack) && (
              <Text
                type="secondary"
                style={{
                  display: "block",
                  textAlign: "center",
                  marginTop: 16,
                }}
              >
                如问题持续出现，请联系技术支持
              </Text>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default GlobalErrorBoundary;