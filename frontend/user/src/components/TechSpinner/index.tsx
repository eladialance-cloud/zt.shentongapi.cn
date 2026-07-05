// 加载动画组件
import { Spin } from 'antd';
import styles from './styles.module.css';

interface TechSpinnerProps {
  size?: 'small' | 'default' | 'large';
  tip?: string;
  fullscreen?: boolean;
}

/** 科技感加载动画，用于页面加载与异步操作反馈 */
export function TechSpinner({
  size = 'default',
  tip,
  fullscreen = false,
}: TechSpinnerProps) {
  if (fullscreen) {
    return (
      <div className={styles.fullscreen}>
        <Spin size="large" tip={tip} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Spin size={size} tip={tip} />
    </div>
  );
}

export default TechSpinner;
