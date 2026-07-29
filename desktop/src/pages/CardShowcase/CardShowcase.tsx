/**
 * CardShowcase — Agent 卡片 & 工作流卡片预览展示页
 *
 * 用于在浏览器中直接预览 AgentCard 和 WorkflowCard 组件效果
 * 路由：/showcase
 */

import { useState } from 'react'
import { RobotOutlined, ThunderboltOutlined } from '@ant-design/icons'
import AgentCard from '@/components/AgentCard'
import WorkflowCard from '@/components/WorkflowCard'
import type { Agent } from '@/types/agent'
import type { WorkflowTemplate, WorkflowExecutionStatus } from '@/types/workflow'
import styles from './CardShowcase.module.css'

// ===== Mock 数据 =====
const MOCK_AGENTS: Agent[] = [
  {
    id: 1, name: '智能代码助手', description: '基于 GPT-4 的编程助手，支持 Python、TypeScript、Go 等 20+ 语言的代码生成、调试和重构。', avatar: '', category: 'programming', tags: ['代码生成', 'Debug', 'Refactor', 'Code Review'], rating: 4.8, ratingCount: 1247, callCount: 45600, pricePerCall: 5, pricePerToken: { input: 0.01, output: 0.02 }, creatorType: 'official', creatorName: 'Official', isOfficial: true, isFavorited: true
  },
  {
    id: 2, name: '公文写作专家', description: '擅长政府公文、商务报告、会议纪要等正式文体的撰写与润色。', avatar: '', category: 'copywriting', tags: ['公文', '报告', '润色'], rating: 4.6, ratingCount: 389, callCount: 12300, pricePerCall: 3, pricePerToken: { input: 0.005, output: 0.01 }, creatorType: 'official', creatorName: 'Official', isOfficial: true, isFavorited: false
  },
  {
    id: 3, name: '数据分析官', description: '上传 Excel/CSV，自动生成数据摘要、可视化图表和分析报告。', avatar: '', category: 'data_analysis', tags: ['Excel', '可视化', '报告'], rating: 4.9, ratingCount: 2103, callCount: 89000, pricePerCall: 0, pricePerToken: { input: 0, output: 0 }, creatorType: 'user', creatorName: 'DataMaster', isOfficial: false, isFavorited: false
  },
  {
    id: 4, name: '日程管理AI', description: '智能日程安排，自动识别会议冲突，优化时间分配。', avatar: '', category: 'office', tags: ['日程', '会议', '提醒'], rating: 4.3, ratingCount: 156, callCount: 3400, pricePerCall: 2, pricePerToken: { input: 0.005, output: 0.005 }, creatorType: 'user', creatorName: 'Scheduler', isOfficial: false, isFavorited: true
  },
  {
    id: 5, name: '万能翻译器', description: '支持 100+ 语言互译，保留原文语气和格式，适用于商务文档和日常对话。', avatar: '', category: 'other', tags: ['翻译', '多语言', '商务'], rating: 4.7, ratingCount: 892, callCount: 23400, pricePerCall: 1, pricePerToken: { input: 0.002, output: 0.004 }, creatorType: 'official', creatorName: 'Official', isOfficial: true, isFavorited: false
  },
  {
    id: 6, name: 'SQL 查询生成器', description: '自然语言转 SQL，支持 MySQL、PostgreSQL、ClickHouse 等数据库。', avatar: '', category: 'programming', tags: ['SQL', 'NL2SQL', '数据库'], rating: 4.5, ratingCount: 534, callCount: 15600, pricePerCall: 4, pricePerToken: { input: 0.01, output: 0.015 }, creatorType: 'user', creatorName: 'DBHero', isOfficial: false, isFavorited: false
  },
]

const MOCK_WORKFLOWS: (WorkflowTemplate & { lastStatus?: WorkflowExecutionStatus })[] = [
  {
    id: 1, name: '邮件自动分类', description: '根据邮件内容自动分类到对应文件夹，支持自定义分类规则和优先级。', category: 'automation', usageCount: 8920, pricePerExecution: 2, lastStatus: 'success'
  },
  {
    id: 2, name: 'CRM 数据同步', description: '自动将表单数据同步到 CRM 系统，支持字段映射和数据清洗。', category: 'integration', usageCount: 3450, pricePerExecution: 5, lastStatus: 'failed'
  },
  {
    id: 3, name: '销售报表生成', description: '每日定时拉取销售数据，生成可视化报表并发送到指定邮箱。', category: 'data_processing', usageCount: 12700, pricePerExecution: 3, lastStatus: 'success'
  },
  {
    id: 4, name: '工单自动派发', description: '根据工单内容智能匹配处理人，自动分配并通知。', category: 'automation', usageCount: 5670, pricePerExecution: 0, lastStatus: 'running'
  },
  {
    id: 5, name: 'API 健康检查', description: '定时调用 API 端点，异常时自动告警并记录日志。', category: 'integration', usageCount: 23400, pricePerExecution: 1, lastStatus: 'success'
  },
  {
    id: 6, name: '图片批量压缩', description: '上传图片自动压缩到指定大小，保留质量，批量下载。', category: 'data_processing', usageCount: 890, pricePerExecution: 0,
  },
]

type TabKey = 'agent' | 'workflow'

export default function CardShowcase() {
  const [tab, setTab] = useState<TabKey>('agent')

  return (
    <div className={styles.page}>
      {/* 页面标题 */}
      <div className={styles.header}>
        <h1 className={styles.title}>卡片组件预览</h1>
        <p className={styles.subtitle}>AgentCard & WorkflowCard — 赛博科技深色 + 玻璃拟态</p>
      </div>

      {/* Tab 切换 */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'agent' ? styles.tabActive : ''}`}
          onClick={() => setTab('agent')}
        >
          <RobotOutlined />
          <span>Agent 卡片</span>
        </button>
        <button
          className={`${styles.tab} ${tab === 'workflow' ? styles.tabActive : ''}`}
          onClick={() => setTab('workflow')}
        >
          <ThunderboltOutlined />
          <span>工作流卡片</span>
        </button>
      </div>

      {/* 卡片展示区 */}
      {tab === 'agent' ? (
        <div className={styles.grid}>
          {MOCK_AGENTS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onUse={() => console.log('use', agent.name)}
              onToggleFav={() => console.log('fav', agent.name)}
              onOpenDetail={() => console.log('detail', agent.name)}
            />
          ))}
        </div>
      ) : (
        <div className={styles.grid}>
          {MOCK_WORKFLOWS.map((wf) => (
            <WorkflowCard
              key={wf.id}
              template={wf}
              lastExecutionStatus={wf.lastStatus}
              onUse={() => console.log('use', wf.name)}
              onOpenDetail={() => console.log('detail', wf.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
