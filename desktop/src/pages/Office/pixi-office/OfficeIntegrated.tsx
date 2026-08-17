// AI办公室集成视图 v3.1 — 接真实后端数据 + 工具栏真实功能
// 统计/任务流来自 GET /tasks；AI 员工来自 GET /teams/agents；
// 新建任务/安排会议 = 创建真实任务；导出日报 = 本地聚合生成文本文件；
// 全部暂停/继续 = 暂停/恢复画布场景（ticker）

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Empty, Form, Input, Modal, Select, Tag, message } from 'antd'
import OfficeCanvas from './OfficeCanvas'
import styles from './office.module.css'
import type { OfficeScene } from '../scene/OfficeScene'
import {
  listTasks,
  createTask,
  listN8nWorkflows,
  type N8nWorkflowItem,
  type TaskStatus,
  type TaskType,
} from '@/api/task-api'
import { listInstances as listHermesInstances, getCallLogs } from '@/api/hermes-api'
import { listSelectableAgents, listMembers } from '@/api/team-api'
import type { SelectableAgent } from '@/types/team'
import { AGENT_ROSTER } from '../scene/layout/officeLayout'

// ─── 展示映射 ───

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'blue' },
  running: { label: '执行中', color: 'cyan' },
  success: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
  cancelled: { label: '已取消', color: 'default' },
};

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  chat: '对话',
  workflow: '工作流',
  skill: '技能',
  multi_agent: '多智能体',
  codex: 'Codex',
};

/** 三源统一任务流条目 */
interface OfficeFeedItem {
  key: string
  title: string
  source: 'office' | 'hermes' | 'n8n'
  sourceLabel: string
  statusLabel: string
  statusColor: string
  typeLabel: string
  createdAt: string
}

const SOURCE_COLOR: Record<OfficeFeedItem['source'], string> = {
  office: 'geekblue',
  hermes: 'purple',
  n8n: 'orange',
}

const HERMES_STATUS_META: Record<string, { label: string; color: string }> = {
  success: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
  timeout: { label: '超时', color: 'orange' },
  running: { label: '执行中', color: 'cyan' },
}

const AGENT_STATE_LABEL: Record<string, string> = {
  working: '工作中',
  idle: '空闲',
  thinking: '思考中',
  walking: '走动',
  talking: '对话中',
}

function hexToNumber(hex?: string): number | null {
  if (!hex) return null
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  return parseInt(m[1], 16)
}

/** 默认员工名单（无团队任务时显示） */
const DEFAULT_ROSTER: Array<{ id: string; name: string; color: number; task?: string }> =
  AGENT_ROSTER.map((r) => ({ id: r.id, name: r.name, color: r.color, task: r.task }))

// ─── 样式 ───

function formatTime(iso?: string | null): string {
  if (!iso) return '-'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '-'
  const diff = Date.now() - t
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return Math.floor(diff / minute) + ' 分钟前';
  if (diff < day) return Math.floor(diff / hour) + ' 小时前';
  const d = new Date(t);
  return d.getMonth() + 1 + '-' + d.getDate();
}

// ─── 组件 ───

export default function OfficeIntegrated() {
  const sceneRef = useRef<OfficeScene | null>(null);
  const pendingRosterRef = useRef<Array<{ id: string; name: string; color: number; task?: string }> | null>(null);
  const [createForm] = Form.useForm();
  const [meetingForm] = Form.useForm();

  const [taskTotal, setTaskTotal] = useState(0);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [agents, setAgents] = useState<SelectableAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState<'today' | 'completed' | 'pending' | null>(null);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [sceneAgents, setSceneAgents] = useState<Array<{ id: string; name: string; state?: string; currentTask?: string }>>([]);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [feed, setFeed] = useState<OfficeFeedItem[]>([]);
  const [hermesTotal, setHermesTotal] = useState(0);
  const [n8nTotal, setN8nTotal] = useState(0);

  /** 加载 Hermes 任务（每个实例取最近 5 条） */
  const loadHermesFeed = useCallback(async (): Promise<OfficeFeedItem[]> => {
    try {
      const instances = await listHermesInstances();
      const pages = await Promise.all(
        instances.slice(0, 3).map((inst) =>
          getCallLogs(inst.id, { page: 1, pageSize: 5 }).catch(() => null),
        ),
      );
      const items: OfficeFeedItem[] = [];
      let count = 0;
      for (const page of pages) {
        if (!page) continue;
        count += page.total || page.list.length;
        for (const log of page.list || []) {
          const meta = HERMES_STATUS_META[log.status] || { label: log.status, color: 'default' };
          items.push({
            key: 'hermes-' + log.id,
            title: log.target || log.callType || 'Hermes 任务',
            source: 'hermes',
            sourceLabel: 'Hermes',
            statusLabel: meta.label,
            statusColor: meta.color,
            typeLabel: log.callType || '',
            createdAt: log.createdAt || '',
          });
        }
      }
      setHermesTotal(count);
      return items;
    } catch {
      return [];
    }
  }, []);

  /** 加载 N8N 定时任务 */
  const loadN8nFeed = useCallback(async (): Promise<OfficeFeedItem[]> => {
    try {
      const result = await listN8nWorkflows({ page: 1, pageSize: 20 });
      setN8nTotal(result.total);
      return (result.list || []).map((wf: N8nWorkflowItem) => {
        const last = wf.lastExecutionStatus || 'unknown';
        const meta =
          last === 'success'
            ? { label: '上次成功', color: 'green' }
            : last === 'error'
              ? { label: '上次失败', color: 'red' }
              : last === 'running'
                ? { label: '运行中', color: 'cyan' }
                : wf.active
                  ? { label: '定时启用', color: 'blue' }
                  : { label: '未启用', color: 'default' };
        return {
          key: 'n8n-' + wf.id,
          title: wf.name || wf.workflowId || 'N8N 定时任务',
          source: 'n8n',
          sourceLabel: 'N8N',
          statusLabel: meta.label,
          statusColor: meta.color,
          typeLabel: '定时任务',
          createdAt: wf.lastExecutedAt || wf.createdAt || '',
        };
      });
    } catch {
      return [];
    }
  }, []);

  /** 从 Hermes 最新任务找到关联的 OPC 团队，返回动态员工名单 */
  const loadOfficeRoster = useCallback(async (): Promise<Array<{ id: string; name: string; color: number; task?: string }> | null> => {
    try {
      const instances = await listHermesInstances();
      const pages = await Promise.all(
        instances.slice(0, 3).map((inst) =>
          getCallLogs(inst.id, { page: 1, pageSize: 5 }).catch(() => null),
        ),
      );
      for (const page of pages) {
        if (!page) continue;
        for (const log of page.list || []) {
          if (log.teamId != null) {
            const members = await listMembers(log.teamId).catch(() => []);
            if (members.length > 0) {
              return members
                .filter((m) => m.isActive !== false)
                .map((m, i) => ({
                  id: 'team-' + m.agentId,
                  name: m.agentName || m.roleTitle || '员工' + (i + 1),
                  color: hexToNumber(m.themeColor) ?? AGENT_ROSTER[i % AGENT_ROSTER.length]?.color ?? 0x2563eb,
                  task: m.roleTitle,
                }));
            }
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const applyRoster = useCallback(
    (roster: Array<{ id: string; name: string; color: number; task?: string }> | null) => {
      pendingRosterRef.current = roster;
      if (roster) {
        sceneRef.current?.setRoster(roster);
      } else {
        // 无团队任务：恢复默认名单，并保留用户在本地改过的名字
        let fallback = DEFAULT_ROSTER;
        try {
          const raw = localStorage.getItem('office_agent_names');
          if (raw) {
            const map = JSON.parse(raw) as Record<string, string>;
            fallback = DEFAULT_ROSTER.map((r) =>
              map[r.id] ? { ...r, name: map[r.id] } : r,
            );
          }
        } catch {
          // 忽略损坏的本地缓存
        }
        sceneRef.current?.setRoster(fallback);
      }
    },
    [],
  );

  const loadData = useCallback(async () => {
    try {
      const [all, done, agentList, hermesItems, n8nItems, roster] = await Promise.all([
        listTasks({ page: 1, pageSize: 8 }),
        listTasks({ page: 1, pageSize: 1, status: 'success' }),
        listSelectableAgents().catch(() => [] as SelectableAgent[]),
        loadHermesFeed(),
        loadN8nFeed(),
        loadOfficeRoster(),
      ]);
      applyRoster(roster);
      setTaskTotal(all.total);
      setCompletedTotal(done.total);
      setAgents(agentList);

      const officeFeed: OfficeFeedItem[] = all.list.map((t) => {
        const meta = STATUS_META[t.status];
        return {
          key: 'office-' + t.id,
          title: t.title || '(未命名任务)',
          source: 'office',
          sourceLabel: 'AI办公室',
          statusLabel: meta.label,
          statusColor: meta.color,
          typeLabel: TASK_TYPE_LABEL[t.taskType] || t.taskType,
          createdAt: t.createdAt,
        };
      });

      const merged = [...officeFeed, ...hermesItems, ...n8nItems]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 12);
      setFeed(merged);

      const [q, r] = await Promise.all([
        listTasks({ page: 1, pageSize: 1, status: 'queued' }),
        listTasks({ page: 1, pageSize: 1, status: 'running' }),
      ]);
      setPendingTotal(q.total + r.total);
    } catch {
      // 数据加载失败不打断使用，数字保持当前值
    } finally {
      setLoading(false);
    }
  }, [loadHermesFeed, loadN8nFeed, loadOfficeRoster, applyRoster]);

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => { void loadData(); }, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleTogglePause = () => {
    setPaused((prev) => {
      const next = !prev;
      sceneRef.current?.setPaused(next);
      message.success(next ? '已暂停全部 AI 员工' : '已恢复全部 AI 员工');
      return next;
    });
  };

  const handleCreateTask = async () => {
    const values = await createForm.validateFields();
    setSubmitting(true);
    try {
      await createTask({
        taskType: values.taskType || 'multi_agent',
        title: values.title,
        inputText: values.description || undefined,
      });
      message.success('任务已创建');
      setCreateOpen(false);
      createForm.resetFields();
      void loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建失败';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMeeting = async () => {
    const values = await meetingForm.validateFields();
    setSubmitting(true);
    try {
      const participants = (values.participants || []) as number[];
      const names = participants
        .map((id) => agents.find((a) => a.id === id)?.name)
        .filter((n): n is string => Boolean(n))
        .join('、');
      await createTask({
        taskType: 'multi_agent',
        title: '会议：' + values.title,
        inputText:
          '会议主题：' +
          values.title +
          '；时间：' +
          (values.time || '待定') +
          '；参与人：' +
          (names || '待定') +
          '。请协调相关 AI 员工做好准备并输出会议纪要。',
      });
      message.success('会议任务已创建，AI 员工将处理');
      setMeetingOpen(false);
      meetingForm.resetFields();
      void loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建失败';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportReport = () => {
    const date = new Date();
    const lines: string[] = [];
    lines.push('深瞳 AI 办公室日报');
    lines.push('日期：' + date.toLocaleDateString('zh-CN'));
    lines.push('生成时间：' + date.toLocaleTimeString('zh-CN'));
    lines.push('');
    lines.push('任务总数：' + (taskTotal + hermesTotal + n8nTotal));
    lines.push('已完成：' + completedTotal);
    lines.push('待处理（排队/执行中）：' + pendingTotal);
    lines.push('AI 员工：' + (sceneRef.current?.getAgents().length ?? 0) + ' 名');
    lines.push('');
    lines.push('—— 最近任务（AI办公室 / Hermes / N8N）——');
    if (feed.length === 0) {
      lines.push('（暂无任务）');
    } else {
      for (const t of feed) {
        lines.push('- [' + t.sourceLabel + '] ' + t.title + '（' + t.statusLabel + '）' + (t.createdAt ? '时间 ' + formatTime(t.createdAt) : ''));
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AI办公室日报-' + date.toISOString().slice(0, 10) + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    message.success('日报已导出');
  };
  const openTaskModal = (mode: 'today' | 'completed' | 'pending') => {
    setTaskModalMode(mode);
  };

  const openAgentModal = () => {
    setSceneAgents(
      (sceneRef.current?.getAgents() ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        state: a.state,
        currentTask: a.currentTask,
      })),
    );
    setAgentModalOpen(true);
  };

  const handleRename = () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) {
      message.warning('请输入新名字');
      return;
    }
    try {
      const raw = localStorage.getItem('office_agent_names');
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      map[renameTarget.id] = name;
      localStorage.setItem('office_agent_names', JSON.stringify(map));
      sceneRef.current?.renameAgent(renameTarget.id, name);
      message.success('已重命名为「' + name + '」');
      setRenameTarget(null);
      setSceneAgents((prev) =>
        prev.map((a) => (a.id === renameTarget.id ? { ...a, name } : a)),
      );
    } catch {
      message.error('重命名失败');
    }
  };


  const detailItems =
    taskModalMode === 'completed'
      ? feed.filter((i) => i.statusLabel === '已完成' || i.statusLabel === '上次成功')
      : taskModalMode === 'pending'
        ? feed.filter(
            (i) =>
              i.statusLabel === '排队中' ||
              i.statusLabel === '执行中' ||
              i.statusLabel === '运行中' ||
              i.statusLabel === '定时启用',
          )
        : feed;

  const stats = [
    { label: '今日任务', value: loading ? '…' : String(taskTotal + hermesTotal + n8nTotal), hint: '三源合计', online: false, onClick: () => openTaskModal('today') },
    { label: '已完成', value: loading ? '…' : String(completedTotal), hint: '累计完成', online: false, onClick: () => openTaskModal('completed') },
    { label: '待处理', value: loading ? '…' : String(pendingTotal), hint: '排队/执行中', online: false, onClick: () => openTaskModal('pending') },
    { label: 'AI 员工', value: loading ? '…' : (sceneRef.current?.getAgents().length ?? 0) + ' 名', hint: '点击查看/改名', online: true, onClick: openAgentModal },
  ];

  const toolbarItems = [
    { icon: paused ? '▶' : '⏸', label: paused ? '全部继续' : '全部暂停', primary: false, onClick: handleTogglePause },
    { icon: '◷', label: '任务调度', primary: false, onClick: () => openTaskModal('today') },
    { icon: '□', label: '安排会议', primary: false, onClick: () => setMeetingOpen(true) },
    { icon: '+', label: '新建任务', primary: true, onClick: () => setCreateOpen(true) },
    { icon: '⇩', label: '导出日报', primary: false, onClick: handleExportReport },
  ];

  return (
    <div className={styles.page}>
      {/* 顶部统计卡片 */}
      <div className={styles.statsBar}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            onClick={stat.onClick}
            title={`${stat.label}：点击查看详情`}
            className={styles.statCard}
          >
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={styles.statValue}>{stat.value}</span>
            <span className={styles.statHint}>
              {stat.online && <span className={styles.statDot} />}
              {stat.hint}
            </span>
          </div>
        ))}
      </div>

      {/* 中间区域：画布 + 右侧任务流 */}
      <div className={styles.mainArea}>
        {/* 画布区 */}
        <div className={styles.canvasColumn}>
          <div className={styles.canvasWrap}>
            <OfficeCanvas onSceneReady={(scene) => { sceneRef.current = scene; if (pendingRosterRef.current) scene.setRoster(pendingRosterRef.current); }} />
          </div>

          {/* 底部工具栏 */}
          <div className={styles.toolbar}>
            {toolbarItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={item.primary ? styles.toolbarBtnPrimary : styles.toolbarBtn}
              >
                <span className={styles.toolbarIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 右侧任务流面板 */}
        <div className={styles.sidePanel}>
          {/* 当前任务流 */}
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>任务流（AI办公室 / Hermes / N8N）</h3>
            {feed.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={loading ? '加载中…' : '暂无任务，点击「新建任务」创建'}
                style={{ margin: '16px 0' }}
              />
            ) : (
              <div className={styles.feedList}>
                {feed.map((item) => (
                  <div key={item.key} className={styles.feedItem}>
                    <div className={styles.feedItemTop}>
                      <span className={styles.feedItemTitle}>
                        {item.title}
                      </span>
                      <Tag color={item.statusColor} style={{ margin: 0, fontSize: 10, lineHeight: '16px', flexShrink: 0 }}>{item.statusLabel}</Tag>
                    </div>
                    <div className={styles.feedItemMeta}>
                      <span>
                        <Tag color={SOURCE_COLOR[item.source]} style={{ marginRight: 4, fontSize: 9, lineHeight: '14px' }}>{item.sourceLabel}</Tag>
                        {item.typeLabel}
                      </span>
                      <span>{item.createdAt ? formatTime(item.createdAt) : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 实时动态 */}
          <div className={styles.panel + ' ' + styles.panelFlex}>
            <h3 className={styles.panelTitle}>实时动态</h3>
            {feed.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无动态" style={{ margin: '16px 0' }} />
            ) : (
              <div className={styles.dynamicList}>
                {feed.slice(0, 5).map((item) => (
                  <div key={item.key} className={styles.dynamicRow}>
                    <span className={styles.dynamicDot + ' ' + (item.statusLabel === '已完成' ? styles.dotSuccess : item.statusLabel === '失败' ? styles.dotError : item.statusLabel === '执行中' ? styles.dotRunning : styles.dotIdle)} />
                    <div className={styles.dynamicText}>
                      <span className={styles.dynamicTitle}>
                        <strong>{item.title}</strong> {item.statusLabel}
                      </span>
                      <span className={styles.dynamicTime}>{item.createdAt ? formatTime(item.createdAt) : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新建任务弹窗 */}
      <Modal
        title="新建任务"
        open={createOpen}
        onOk={() => void handleCreateTask()}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="title" label="任务标题" rules={[{ required: true, message: '请输入任务标题' }]}>
            <Input placeholder="例如：整理本周销售数据" maxLength={256} />
          </Form.Item>
          <Form.Item name="taskType" label="任务类型" initialValue="multi_agent">
            <Select
              options={[
                { value: 'multi_agent', label: '多智能体协作' },
                { value: 'chat', label: '对话' },
                { value: 'skill', label: '技能' },
                { value: 'workflow', label: '工作流' },
                { value: 'codex', label: 'Codex' },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={3} placeholder="补充任务要求（可选）" maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 任务列表弹窗（三源） */}
      <Modal
        title={taskModalMode === 'completed' ? '已完成任务' : taskModalMode === 'pending' ? '待处理任务' : '全部任务'}
        open={taskModalMode !== null}
        onCancel={() => setTaskModalMode(null)}
        footer={null}
        width={640}
      >
        {detailItems.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" style={{ margin: '24px 0' }} />
        ) : (
          <div className={styles.modalList}>
            {detailItems.map((item) => (
              <div key={item.key} className={styles.modalItem}>
                <div className={styles.modalItemTop}>
                  <span className={styles.modalItemTitle}>{item.title}</span>
                  <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Tag color={SOURCE_COLOR[item.source]} style={{ margin: 0, fontSize: 10 }}>{item.sourceLabel}</Tag>
                    <Tag color={item.statusColor} style={{ margin: 0, fontSize: 10 }}>{item.statusLabel}</Tag>
                  </span>
                </div>
                <div className={styles.modalItemSub}>
                  {item.typeLabel}
                  {item.createdAt ? ' · ' + new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* AI 员工弹窗（画布员工 + 改名） */}
      <Modal title="AI 员工" open={agentModalOpen} onCancel={() => setAgentModalOpen(false)} footer={null} width={480}>
        {sceneAgents.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未加载到员工" style={{ margin: '24px 0' }} />
        ) : (
          <div className={styles.agentList}>
            {sceneAgents.map((agent) => (
              <div
                key={agent.id}
                className={styles.agentRow}
              >
                <span className={styles.agentAvatar}>
                  {agent.name ? agent.name.slice(0, 1) : '员'}
                </span>
                <div className={styles.agentInfo}>
                  <div className={styles.agentName}>{agent.name}</div>
                  <div className={styles.agentState}>
                    {AGENT_STATE_LABEL[agent.state || ''] || agent.state || '未知状态'}
                    {agent.currentTask ? ' · ' + agent.currentTask : ''}
                  </div>
                </div>
                <Button
                  size="small"
                  onClick={() => {
                    setRenameTarget({ id: agent.id, name: agent.name });
                    setRenameValue(agent.name);
                  }}
                >
                  改名
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 重命名员工弹窗 */}
      <Modal
        title="重命名员工"
        open={renameTarget !== null}
        onOk={handleRename}
        onCancel={() => setRenameTarget(null)}
        okText="保存"
        cancelText="取消"
        width={360}
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRename}
          placeholder="输入新名字"
          maxLength={16}
          style={{ marginTop: 12 }}
        />
      </Modal>

      {/* 安排会议弹窗 */}
      <Modal
        title="安排会议"
        open={meetingOpen}
        onOk={() => void handleCreateMeeting()}
        onCancel={() => setMeetingOpen(false)}
        confirmLoading={submitting}
        okText="创建会议任务"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={meetingForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="title" label="会议主题" rules={[{ required: true, message: '请输入会议主题' }]}>
            <Input placeholder="例如：Q3 季度规划会" maxLength={128} />
          </Form.Item>
          <Form.Item name="time" label="会议时间">
            <Input placeholder="例如：明天 10:00（可选）" maxLength={64} />
          </Form.Item>
          <Form.Item name="participants" label="参与人（AI 员工）">
            <Select
              mode="multiple"
              allowClear
              placeholder={agents.length ? '选择参与会议的 AI 员工' : '暂无可选 AI 员工'}
              options={agents.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 底部间距 */}
      <div style={{ height: 10, flexShrink: 0 }} />
    </div>
  );
}
