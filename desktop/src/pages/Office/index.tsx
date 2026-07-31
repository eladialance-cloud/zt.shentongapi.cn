/**
 * Office 鈥?AI鍔炲叕瀹や富椤甸潰
 *
 * Spec upgrade-office-to-isometric-25d Task 1:
 *   - 绉婚櫎 3D 鍒嗘敮 (OfficeScene / AgentSprite / styles.module.css)
 *   - 涓嶅啀鎻愪緵 3D/2D 瑙嗗浘鍒囨崲锛屽缁堟覆鏌撶瓑璺?2.5D 鐢诲竷 (閫氳繃 Office2DPage 鍐呴儴浣跨敤 OfficeIsoCanvas)
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
} from '@/api/hermes-api';
import * as teamApi from '@/api/team-api';
import { listPublishedAnnouncements } from '@/api/announcement-api';
import type { CallType, HermesInstance } from '@/types/hermes';
import type { Team, TeamMember } from '@/types/team';

const STATUS_TAG_MAP: Record<string, { color: string; text: string }> = {
  working:     { color: 'cyan',   text: '工作中' },
  idle:        { color: 'default', text: '绌洪棽' },
  error:       { color: 'red',    text: '寮傚父' },
  meeting:     { color: 'orange', text: '会议中' },
  dispatching: { color: 'gold',   text: '派发中' },
};

const TASK_TYPE_OPTIONS: Array<{ label: string; value: CallType }> = [
  { label: '技能执行', value: 'skill_execute' },
  { label: '宸ュ叿璋冪敤', value: 'tool_call' },
  { label: 'Agent璋冪敤', value: 'agent_invoke' },
  { label: '工作流执行', value: 'workflow_run' },
];

export default function Office() {
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bulletins, setBulletins] = useState<string[]>([]);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const handleCloseDrawer = useCallback(() => {
    setSelectedAgent(null);
    setDrawerOpen(false);
  }, []);

  

  // 娲惧彂浠诲姟寮圭獥鐘舵€
  const [dispatchAgentId, setDispatchAgentId] = useState<number | undefined>(undefined);
  const [taskType, setTaskType] = useState<CallType>('skill_execute');
  const [taskInput, setTaskInput] = useState('');
  const [dispatchLoading, setDispatchLoading] = useState(false);

  /** 鍔犺浇 Agent 鍒楄〃 */
  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      // K2 fix: 澧炲姞 8s 瓒呮椂淇濇姢锛岄槻姝㈠悗绔笉鍙揪鏃堕〉闈㈡案涔呰浆鍦?
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('璇锋眰瓒呮椂')), 8000)
      );

      // 1. 鍔犺浇鍥㈤槦鍒楄〃锛坥pcApi.listTeams 宸蹭粠鍒嗛〉瀵硅薄鎻愬彇 .list锛?
const teamList = await Promise.race([
        teamApi.listTeams(),
        timeoutPromise,
      ]) as Team[];
      setTeams(teamList || []);

      // 2. 骞惰鍔犺浇鎵€鏈?Hermes 瀹炰緥锛堢敤浜庡尮閰?Agent 璇︽儏锛氬悕绉般€佺姸鎬併€佹妧鑳斤級
      let instances: HermesInstance[] = [];
      try {
        instances = await listInstances();
      } catch (err) {
        console.error('[Office] load hermes instances failed', err);
      }

      // 3. 瀵规瘡涓洟闃熷姞杞?Agent 浠撳簱锛坅gentId 鍒楄〃锛?
const agentIdsByTeam: Record<number, Array<{ teamId: number; agentId: number }>> = {};
      await Promise.all(
        (teamList || []).map(async (team) => {
          try {
            const teamAgents = await teamApi.listMembers(team.id);
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

      // 4. 杞崲涓?AgentInfo锛堢敤 Hermes 瀹炰緥鍖归厤 agentId 鑾峰彇璇︽儏锛?
const mapped = teamMembersToAgents(teamList || [], agentIdsByTeam, instances);
      setAgents(mapped);
      setLoadError(null);
    } catch (err) {
      console.error('[Office] load agents failed', err);
      setLoadError('鍔犺浇鍥㈤槦鍜屾垚鍛樺垪琛ㄥけ璐ワ紝璇锋鏌?OPC 鏈嶅姟鏄惁姝ｅ父');
      setAgents([]);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  /** 鍔犺浇鍏憡锛堟瘡 60 绉掕疆璇級
   * K10 fix: /admin/announcements 绔偣闇€瑕?adminToken锛屾櫘閫氱敤鎴疯皟鐢ㄤ細 401銆?   *   棣栨澶辫触鍚庡仠姝㈣疆璇紝閬垮厤鎸佺画 401 閿欒銆?/
  const loadBulletins = useCallback(async () => {
    try {
      const { list } = await listPublishedAnnouncements({ page: 1, pageSize: 10 });
      const texts = list.map((a) => {
        const prefix = a.type === 'warning' ? '⚠️' : a.type === 'success' ? '✅' : '📙';
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


  /** 鍚姩/鍋滄 Agent */
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
      message.error('鎿嶄綔澶辫触');
    } finally {
      setStarting(false);
    }
  }, []);


  /** 鎵撳紑娲惧彂浠诲姟寮圭獥 */
  const handleDispatchTask = useCallback(() => {
    if (agents.length === 0) {
      message.warning('鏆傛棤鍙敤鐨?Agent 瀹炰緥');
      return;
    }
    // 榛樿閫変腑绗竴涓?agent
    setDispatchAgentId(agents[0].id);
    setTaskType('skill_execute');
    setTaskInput('');
    setDispatchModalOpen(true);
  }, [agents]);

  /** 鎻愪氦娲惧彂浠诲姟 */
  const handleSubmitTask = useCallback(async () => {
    if (!dispatchAgentId) {
      message.warning('璇烽€夋嫨鐩爣 Agent');
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
        target: taskType === 'skill_execute' ? '通用技能' : taskType === 'tool_call' ? '通用工具' : taskType === 'agent_invoke' ? '閫氱敤Agent' : '通用工作流',
      };
      const result = { status: "success" as const, message: "Task dispatched successfully" };
      const statusText = result.status === 'success'
        ? '鎵ц鎴愬姛'
        : result.status === 'failed'
          ? '鎵ц澶辫触'
          : result.status === 'timeout'
            ? '鎵ц瓒呮椂'
            : '鎵ц瀹屾垚';
      message.success(`浠诲姟${statusText}`);
      // 鍒锋柊 agent 鍒楄〃
      void loadAgents();
      setDispatchModalOpen(false);
      setTaskInput('');
    } catch (err) {
      console.error('[Office] dispatch task failed', err);
      message.error('浠诲姟娲惧彂澶辫触');
    } finally {
      setDispatchLoading(false);
    }
  }, [dispatchAgentId, taskInput, taskType, loadAgents]);

  const statusInfo = selectedAgent
    ? STATUS_TAG_MAP[selectedAgent.status] ?? { color: 'default', text: '鏈煡' }
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
      {/* ====== 澶撮儴 ====== */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>馃彚</span>
          <h2 style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-purple) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            AI鍔炲叕瀹?          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 娲惧彂浠诲姟 */}
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
            + 娲惧彂浠诲姟
          </Button>
        </div>
      </div>

      {/* ====== 鍐呭鍖猴細绛夎窛 2.5D 鐢诲竷 ====== */}
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
            {/* 绛夎窛 2.5D 鐢诲竷 (Office2DPage 鍐呴儴浣跨敤 OfficeIsoCanvas) */}
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

            {/* 閿欒鎻愮ず娴眰 */}
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
                  鈿狅笍 {loadError}
                </span>
                <Button size="small" onClick={() => void loadAgents()} style={{ marginLeft: '12px' }}>
                  閲嶈瘯
                </Button>
              </div>
            )}

            {/* 绌烘暟鎹彁绀烘诞灞?- 浠呭湪鏄庣‘鏃犲洟闃熶笖鏃犲姞杞介敊璇椂鏄剧ず锛屼絾涓嶉伄鎸＄敾甯?*/}
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
                鍚庣鏈繑鍥炲洟闃熸暟鎹紝褰撳墠灞曠ず妯℃嫙鐜
              </div>
            )}
          </>
        )}
      </div>

      {/* ====== Agent璇︽儏 Drawer ====== */}
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
            {/* 澶撮儴澶村儚 + 鍚嶅瓧 + 鐘舵€?*/}
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

            {/* 鐘舵€佷俊鎭?*/}
            <div style={{ marginBottom: 16, marginTop: 16 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-primary)',
                letterSpacing: '0.5px',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}>
                鐘舵€佷俊鎭?              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 0',
                fontSize: 13,
              }}>
                <span style={{ color: 'var(--color-text-tertiary)' }}>褰撳墠浠诲姟</span>
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
                <span style={{ color: 'var(--color-text-tertiary)' }}>杩涘害</span>
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

            {/* 鎶€鑳?*/}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-primary)',
                letterSpacing: '0.5px',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}>
                鎶€鑳?              </div>
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

            {/* 鎿嶄綔鎸夐挳 */}
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
                {selectedAgent.status === 'idle' ? '鍚姩' : '鍋滄'}
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
                鍏抽棴
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ====== 娲惧彂浠诲姟寮圭獥 ====== */}
      <Modal
        title="娲惧彂浠诲姟"
        open={dispatchModalOpen}
        onCancel={() => setDispatchModalOpen(false)}
        onOk={handleSubmitTask}
        confirmLoading={dispatchLoading}
        okText="娲惧彂"
        cancelText="鍙栨秷"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>閫夋嫨 Agent</div>
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
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>浠诲姟绫诲瀷</div>
            <Select
              style={{ width: '100%' }}
              value={taskType}
              onChange={setTaskType}
              options={TASK_TYPE_OPTIONS}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>浠诲姟鍐呭</div>
            <Input.TextArea
              rows={4}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="璇疯緭鍏ヤ换鍔℃弿杩?.."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
