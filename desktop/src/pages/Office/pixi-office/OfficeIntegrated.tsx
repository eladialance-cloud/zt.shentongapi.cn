/**
 * AI办公室集成视图 v3.0
 * 基于参考项目重写：Spine 角色 + PNG 桌椅 + 等距办公室背景
 * 布局：中间画布 + 底部工具栏 + 右侧任务流面板
 */

import { useEffect, useState, useRef } from 'react'
import OfficeCanvas from './OfficeCanvas'
import { OfficeScene } from '../scene/OfficeScene'

// ─── 静态数据（来自参考项目 officeDashboardChrome） ───

const TASKS = [
  { title: '市场调研', owner: '王明', progress: 72, tone: '#4a90d9', status: '进行中' },
  { title: '文案撰写', owner: '陈书', progress: 60, tone: '#f5c542', status: '进行中' },
  { title: '合规审核', owner: '赵审', progress: 30, tone: '#9b6dd7', status: '进行中' },
  { title: '打包汇报', owner: '刘市', progress: 0, tone: '#4ecdc4', status: '等待开始' },
]

const ACTIVITIES = [
  { agent: '李研', text: '扫描信息源', time: '09:42' },
  { agent: '陈书', text: '起草标书章节', time: '09:38' },
  { agent: '王明', text: '等待主管签批', time: '09:31' },
  { agent: '赵审', text: '检查合规条目', time: '09:24' },
]

const TOOLBAR_ITEMS = [
  { icon: '⏸', label: '全部暂停', primary: false },
  { icon: '▶', label: '全部继续', primary: false },
  { icon: '◷', label: '任务调度', primary: false },
  { icon: '□', label: '安排会议', primary: false },
  { icon: '+', label: '新建任务', primary: true },
  { icon: '⇩', label: '导出日报', primary: false },
]

const STATS = [
  { label: '今日任务', value: '6', hint: '进行中' },
  { label: '已完成', value: '13', hint: '今日完成' },
  { label: '待处理', value: '2', hint: '阻塞事项' },
  { label: 'AI 员工', value: '6/6', hint: '全部在线', online: true },
]

// ─── 样式 ───

const panelStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: '14px 16px',
  flexShrink: 0,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1e293b',
  margin: '0 0 10px',
}

// ─── 组件 ───

export default function OfficeIntegrated() {
  const [, forceUpdate] = useState(0)
  const sceneRef = useRef<OfficeScene | null>(null)

  // 触发刷新（重新读取 scene.getAgents）
  const handleRefresh = () => {
    forceUpdate((n) => n + 1)
  }

  // 工具栏按钮（暂为 UI 占位）
  const handleToolbarClick = (label: string) => {
    console.log('[Office] toolbar:', label)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#f1f5f9',
      gap: 0,
    }}>
      {/* 顶部统计卡片 */}
      <div style={{
        display: 'flex',
        gap: 10,
        padding: '10px 14px',
        flexShrink: 0,
        background: 'transparent',
      }}>
        {STATS.map((stat) => (
          <div key={stat.label} style={{
            ...panelStyle,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '10px 14px',
          }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>{stat.label}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{stat.value}</span>
            <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
              {stat.online && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />}
              {stat.hint}
            </span>
          </div>
        ))}
      </div>

      {/* 中间区域：画布 + 右侧任务流 */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        gap: 10,
        padding: '0 14px',
      }}>
        {/* 画布区 */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <OfficeCanvas />
          </div>

          {/* 底部工具栏 */}
          <div style={{
            ...panelStyle,
            display: 'flex',
            gap: 8,
            padding: '8px 12px',
            justifyContent: 'center',
          }}>
            {TOOLBAR_ITEMS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleToolbarClick(item.label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 14px',
                  border: item.primary ? 'none' : '1px solid #e2e8f0',
                  background: item.primary ? '#2563eb' : '#fff',
                  color: item.primary ? '#fff' : '#475569',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: item.primary ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 13 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 右侧任务流面板 */}
        <div style={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
        }}>
          {/* 当前任务流 */}
          <div style={panelStyle}>
            <h3 style={sectionTitleStyle}>当前任务流</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TASKS.map((task) => (
                <div key={task.title} style={{
                  padding: '8px 10px',
                  background: '#f8fafc',
                  borderRadius: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{task.title}</span>
                    <span style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: task.status === '进行中' ? '#dbeafe' : '#f1f5f9',
                      color: task.status === '进行中' ? '#2563eb' : '#64748b',
                    }}>
                      {task.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{task.owner}</div>
                  <div style={{
                    height: 4,
                    background: '#e2e8f0',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${task.progress}%`,
                      height: '100%',
                      background: task.tone,
                      borderRadius: 2,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textAlign: 'right' }}>{task.progress}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* 实时动态 */}
          <div style={{ ...panelStyle, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <h3 style={sectionTitleStyle}>实时动态</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ACTIVITIES.map((act, i) => (
                <div key={i} style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#22c55e',
                    marginTop: 5,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, color: '#1e293b' }}>
                      <strong>{act.agent}</strong> {act.text}
                    </span>
                    <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>{act.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 底部间距 */}
      <div style={{ height: 10, flexShrink: 0 }} />
    </div>
  )
}
