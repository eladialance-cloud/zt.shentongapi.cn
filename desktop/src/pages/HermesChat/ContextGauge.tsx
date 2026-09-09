// 上下文窗口条：展示最新一轮 prompt 占用模型上下文窗口的比例
// 对齐上游 ContextGauge；深瞳无 cache 数据，故仅展示 used/window。
import { Tooltip } from 'antd';
import { contextWindowForModel, fmtTokens } from './contextWindow';

export interface ContextGaugeProps {
  /** 当前选中的模型 id（用于推断上下文窗口） */
  model?: string;
  /** 最新一轮 prompt tokens（usage.input） */
  used: number;
}

export function ContextGauge({ model, used }: ContextGaugeProps) {
  const window = contextWindowForModel(model);
  const pct = window > 0 ? Math.min(100, Math.round((used / window) * 100)) : 0;
  const left = 100 - pct;
  const size = 26;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;

  const content = (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e8e8e8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1890ff"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span style={{ position: 'absolute', fontSize: 9, color: '#666', lineHeight: 1 }}>{pct}</span>
    </div>
  );

  return (
    <Tooltip
      title={(
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>上下文窗口</div>
          <div>已占用 {pct}%（可用 {left}%）</div>
          <div>{fmtTokens(used)} / {fmtTokens(window)} tokens</div>
        </div>
      )}
    >
      {content}
    </Tooltip>
  );
}