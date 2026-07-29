/**
 * Office — AI办公室主页面
 *
 * Spec upgrade-office-to-isometric-25d Task 1:
 *   - 移除 3D 分支 (OfficeScene / AgentSprite / styles.module.css)
 *   - 不再提供 3D/2D 视图切换，始终渲染等距 2.5D 画布 (通过 Office2DPage 内部使用 OfficeIsoCanvas)
 */

import { useState, useCallback, useEffect } from 'react';
import { Button, Drawer, Tag, Progress, Spin, message, Modal, Select, Input } from 'antd';
import Office2DPage from './Office2DPage';
import { OUTFIT_COLORS, teamMembersToAgents, type AgentInfo } from './office-config';
import {
  getInstance,
  startInstance,
  stopInstance,
  listInstances,
  executeTask
} from '@/api/hermes-api';
import * as opcApi from '@/api/opc-api';
import { listPublishedAnnouncements } from '@/api/announcement-api';
import type { CallType, HermesInstance } from '@/types/hermes';
import type { OPCTeam, TeamMember } from '@/types/opc';

const STATUS_TAG_MAP: Record<string, { color: string; text: string }> = {
  working:     { color: 'cyan',   text: '工作中' },
  idle:        { color: 'default', text: '空闲' },
  error:       { color: 'red',    text: '异常' },
  meeting:     { color: 'orange', text: '会议中' },
  dispatching: { color: 'gold',   text: '派发中' },
};

const TASK_TYPE_OPTIONS: Array<{ label: string; value: CallType }> = [
  { label: '技能执行', value: 'skill_execute' },
  { label: '工具调用', value: 'tool_call' },
  { label: 'Agent调用', value: 'agent_invoke' },
  { label: '工作流执行', value: 'workflow_run' },
];

export default function Office() {
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [teams, setTeams] = useState<OPCTeam[]>([]);
  const [bulletins, setBulletins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // 派发任务弹窗状态
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [dispatchAgentId, setDispatchAgentId] = useState<number | undefined>(undefined);
  const [taskType, setTaskType] = useState<CallType>('skill_execute');
  const [taskInput, setTaskInput] = useState('');
  const [dispatchLoading, setDispatchLoading] = useState(false);

  /** 加载 Agent 列表 */
  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      // K2 fix: 增加 8s 超时保护，防止后端不可达时页面永久转圈
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('请求超时')), 8000)
      );

      // 1. 加载团队列表（opcApi.listTeams 已从分页对象提取 .list）
      const teamList = await Promise.race([
        opcApi.listTeams(),
        timeoutPromise,
      ]) as OPCTeam[];
      setTeams(teamList || []);

      // 2. 并行加载所有 Hermes 实例（用于匹配 Agent 详情：名称、状态、技能）
      let instances: HermesInstance[] = [];
      try {
        instances = await listInstances();
      } catch (err) {
        console.error('[Office] load hermes instances failed', err);
      }

      // 3. 对每个团队加载 Agent 仓库（agentId 列表）
      const agentIdsByTeam: Record<number, Array<{ teamId: number; agentId: number }>> = {};
      await Promise.all(
        (teamList || []).map(async (team) => {
          try {
            const teamAgents = await opcApi.listMembers(team.id);
            agentIdsByTeam[team.id] = (teamAgents || []).map((a: TeamMember) => ({
              teamId: team.id,
              agentId: a.agentId,
            }));
          } catch (err) {
            console.error(`[Office] load team agents for team ${team.id} failed`, err);
            agentIdsByTeam[team.id] = [];
          }
        })
      );

      // 4. 转换为 AgentInfo（用 Hermes 实例匹配 agentId 获取详情）
      const mapped = teamMembersToAgents(teamList || [], agentIdsByTeam, instances);
      setAgents(mapped);
      setLoadError(null);
    } catch (err) {
      console.error('[Office] load agents failed', err);
      setLoadError('加载团队和成员列表失败，请检查 OPC 服务是否正常');
      setAgents([]);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  /** 加载公告（每 60 秒轮询）
   * K10 fix: /admin/announcements 端点需要 adminToken，普通用户调用会 401。
   *   首次失败后停止轮询，避免持续 401 错误。*/
  const loadBulletins = useCallback(async () => {
    try {
      const { list } = await listPublishedAnnouncements({ page: 1, pageSize: 10 });
      const texts = list.map((a) => {
        const prefix = a.type === 'warning' ? '⚠️' : a.type === 'success' ? '✅' : '📢';
        return `${prefix} ${a.title}`;
      });
      setBulletins(texts);
      return true;
    } catch (err) {
      console.error('[Office] load bulletins failed', err);
      setBulletins([]);
      return false;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let active = true;
    void loadBulletins().then((ok) => {
      if (ok && active) {
        timer = setInterval(() => {
          void loadBulletins();
        }, 60000);
      }
    });
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [loadBulletins]);

  const handleAgentClick = useCallback(async (agent: AgentInfo) => {
    setSelectedAgent(agent);
    setDrawerOpen(true);
    try {
      const inst = await getInstance(agent.id);
      const status: AgentInfo['status'] =
        inst.status === 'running' ? 'working' :
        inst.status === 'error' ? 'error' : 'idle';
      setSelectedAgent((prev) => prev ? {
        ...prev,
        status,
        currentTask: status === 'working' ? '处理任务中' : null,
        progress: status === 'working' ? Math.min(100, inst.resourceUsage?.cpuPercent ?? 0) : 0,
      } : prev);
    } catch (err) {
      console.error('[Office] get instance detail failed', err);
    }
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  /** 启动/停止 Agent */
  const handleToggleAgent = useCallback(async (agent: AgentInfo) => {
    setStarting(true);
    try {
      if (agent.status === 'idle' || agent.status === 'error') {
        await startInstance(agent.id);
        message.success(`${agent.name} 已启动`);
      } else {
        await stopInstance(agent.id);
        message.success(`${agent.name} 已停止`);
      }
      const inst = await getInstance(agent.id);
      const status: AgentInfo['status'] =
        inst.status === 'running' ? 'working' :
        inst.status === 'error' ? 'error' : 'idle';
      const updated: AgentInfo = {
        ...agent,
        status,
        currentTask: status === 'working' ? '处理任务中' : null,
        progress: status === 'working' ? Math.min(100, inst.resourceUsage?.cpuPercent ?? 0) : 0,
      };
      setSelectedAgent(updated);
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      console.error('[Office] toggle agent failed', err);
      message.error('操作失败');
    } finally {
      setStarting(false);
    }
  }, []);

  /** 打开派发任务弹窗 */
  const handleDispatchTask = useCallback(() => {
    if (agents.length === 0) {
      message.warning('暂无可用的 Agent 实例');
      return;
    }
    // 默认选中第一个 agent
    setDispatchAgentId(agents[0].id);
    setTaskType('skill_execute');
    setTaskInput('');
    setDispatchModalOpen(true);
  }, [agents]);

  /** 提交派发任务 */
  const handleSubmitTask = useCallback(async () => {
    if (!dispatchAgentId) {
      message.warning('请选择目标 Agent');
      return;
    }
    if (!taskInput.trim()) {
      message.warning('请输入任务内容');
      return;
    }

    setDispatchLoading(true);
    try {
      const dto = {
        callType: taskType,
        input: { text: taskInput.trim() },
        target: taskType === 'skill_execute' ? '通用技能' : taskType === 'tool_call' ? '通用工具' : taskType === 'agent_invoke' ? '通用Agent' : '通用工作流',
      };
      const result = await executeTask(dispatchAgentId, dto);
      const statusText = result.status === 'success'
        ? '执行成功'
        : result.status === 'failed'
          ? '执行失败'
          : result.status === 'timeout'
            ? '执行超时'
            : '执行完成';
      message.success(`任务${statusText}`);
      // 刷新 agent 列表
      void loadAgents();
      setDispatchModalOpen(false);
      setTaskInput('');
    } catch (err) {
      console.error('[Office] dispatch task failed', err);
      message.error('任务派发失败');
    } finally {
      setDispatchLoading(false);
    }
  }, [dispatchAgentId, taskInput, taskType, loadAgents]);

  const statusInfo = selectedAgent
    ? STATUS_TAG_MAP[selectedAgent.status] ?? { color: 'default', text: '未知' }
    : null;

  const outfitColor = selectedAgent
    ? OUTFIT_COLORS[selectedAgent.outfit] ?? '#e0e0e0'
    : '#e0e0e0';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '12px 16px',
      gap: 12,
      background: 'var(--color-bg-layout)',
    }}>
      {/* ====== 头部 ====== */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🏢</span>
          <h2 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-purple) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            AI办公室
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 派发任务 */}
          <Button
            type="primary"
            onClick={handleDispatchTask}
            style={{
              background: 'linear-gradient(135deg, #00d4ff 0%, #b026ff 100%)',
              border: 'none',
              fontWeight: 600,
              fontSize: '12px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 0 8px rgba(0, 212, 255, 0.3)',
            }}
          >
            + 派发任务
          </Button>
        </div>
      </div>

      {/* ====== 内容区：等距 2.5D 画布 ====== */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(22, 119, 255, 0.06)',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            {/* 等距 2.5D 画布 (Office2DPage 内部使用 OfficeIsoCanvas) */}
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              padding: 12,
            }}>
              <Office2DPage embedded />
            </div>

            {/* 错误提示浮层 */}
            {loadError && (
              <div style={{
                position: 'absolute',
                top: 8,
                left: 8,
                right: 8,
                padding: '8px 16px',
                background: 'rgba(255, 77, 79, 0.15)',
                border: '1px solid rgba(255, 77, 79, 0.4)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px',
                zIndex: 20,
                backdropFilter: 'blur(4px)',
                pointerEvents: 'auto',
              }}>
                <span style={{ color: '#ff4d4f' }}>
                  ⚠️ {loadError}
                </span>
                <Button size="small" onClick={() => void loadAgents()} style={{ marginLeft: '12px' }}>
                  重试
                </Button>
              </div>
            )}

            {/* 空数据提示浮层 - 仅在明确无团队且无加载错误时显示，但不遮挡画布 */}
            {agents.length === 0 && !loadError && !loading && (
              <div style={{
                position: 'absolute',
                bottom: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                color: 'var(--color-text-tertiary)',
                fontSize: '12px',
                background: 'rgba(5, 8, 22, 0.7)',
                padding: '4px 12px',
                borderRadius: '4px',
                border: '1px solid rgba(0, 212, 255, 0.1)',
                backdropFilter: 'blur(4px)',
                pointerEvents: 'none',
                zIndex: 15,
                whiteSpace: 'nowrap',
              }}>
                后端未返回团队数据，当前展示模拟环境
              </div>
            )}
          </>
        )}
      </div>

      {/* ====== Agent详情 Drawer ====== */}
      <Drawer
        title={null}
        open={drawerOpen}
        onClose={handleCloseDrawer}
        width={360}
        styles={{
          header: { display: 'none' },
          body: {
            background: 'var(--color-bg-layout)',
            padding: '20px',
          },
        }}
        closeIcon={false}
      >
        {selectedAgent && statusInfo && (
          <div>
            {/* 头部头像 + 名字 + 状态 */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{
                width: 48,
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
                borderRadius: '50%',
                background: outfitColor,
                color: '#fff',
                fontSize: 20,
                fontWeight: 700,
              }}>
                {selectedAgent.name.charAt(0)}
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}>
                {selectedAgent.name}
              </div>
              <div style={{
                fontSize: 13,
                color: 'var(--color-text-secondary)',
              }}>
                {selectedAgent.position}
              </div>
              <Tag
                color={statusInfo.color}
                style={{
                  marginTop: 4,
                  fontSize: '11px',
                  borderRadius: '4px',
                }}
              >
                {statusInfo.text}
              </Tag>
            </div>

            {/* 状态信息 */}
            <div style={{ marginBottom: 16, marginTop: 16 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-primary)',
                letterSpacing: '0.5px',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}>
                状态信息
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 0',
                fontSize: 13,
              }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>当前任务</span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {selectedAgent.currentTask ?? '无'}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 0',
                fontSize: 13,
              }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>进度</span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {selectedAgent.progress}%
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <Progress
                  percent={selectedAgent.progress}
                  strokeColor={outfitColor}
                  trailColor="rgba(255, 255, 255, 0.05)"
                  size="small"
                />
              </div>
            </div>

            {/* 技能 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-primary)',
                letterSpacing: '0.5px',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}>
                技能
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
              }}>
                {selectedAgent.skills.map((skill) => (
                  <Tag
                    key={skill}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      background: 'rgba(22, 119, 255, 0.08)',
                      border: '1px solid rgba(22, 119, 255, 0.2)',
                      color: 'var(--color-primary)',
                      borderRadius: 4,
                    }}
                  >
                    {skill}
                  </Tag>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              <Button
                block
                type="primary"
                style={{
                  background: 'linear-gradient(135deg, #00d4ff 0%, #b026ff 100%)',
                  border: 'none',
                  height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                }}
                disabled={selectedAgent.status === 'error'}
                loading={starting}
                onClick={() => handleToggleAgent(selectedAgent)}
              >
                {selectedAgent.status === 'idle' ? '启动' : '停止'}
              </Button>
              <Button
                block
                onClick={handleCloseDrawer}
                style={{
                  height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(0, 212, 255, 0.06)',
                  border: '1px solid rgba(0, 212, 255, 0.15)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                关闭
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ====== 派发任务弹窗 ====== */}
      <Modal
        title="派发任务"
        open={dispatchModalOpen}
        onCancel={() => setDispatchModalOpen(false)}
        onOk={handleSubmitTask}
        confirmLoading={dispatchLoading}
        okText="派发"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>选择 Agent</div>
            <Select
              style={{ width: '100%' }}
              value={dispatchAgentId}
              onChange={setDispatchAgentId}
              options={agents.map((a) => ({
                label: `${a.name} (${a.position})`,
                value: a.id,
              }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>任务类型</div>
            <Select
              style={{ width: '100%' }}
              value={taskType}
              onChange={setTaskType}
              options={TASK_TYPE_OPTIONS}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>任务内容</div>
            <Input.TextArea
              rows={4}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="请输入任务描述..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
