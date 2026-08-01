/**
 * BackendUnavailable - 后端不可用时的友好提示组件
 * 当后端 API 无法连接时，展示帮助信息和诊断建议
 */
import { Button, Result } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface BackendUnavailableProps {
  /** 重试回调 */
  onRetry?: () => void;
  /** 自定义错误描述 */
  description?: string;
}

export default function BackendUnavailable({ onRetry, description }: BackendUnavailableProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 400,
      padding: 24,
    }}>
      <Result
        status="warning"
        title="无法连接到后端服务"
        subTitle={description || '请确保后端服务 (http://localhost:3001) 已启动'}
        extra={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {onRetry && (
              <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
                重试
              </Button>
            )}
            <Button onClick={() => window.location.hash = '#/services'}>
              检查本地服务
            </Button>
            <Button onClick={() => window.location.hash = '#/settings'}>
              系统设置
            </Button>
          </div>
        }
      />
    </div>
  );
}
