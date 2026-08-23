// 团队详情页 — Kimi 风格（v2.0）
// 核心变化: 成员绑定 Agent + 自定义职能（roleTitle/roleEmoji/themeColor）
// 支持添加/编辑/移除成员

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button, Empty, Spin, Table, Tag, Modal, Form, Input,
  Select, Popconfirm, message, ColorPicker,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  ArrowDown, ArrowLeft, ArrowUp, Briefcase, LayoutGrid, ListTodo, Pencil,
  Plus, Trash2, UserRound, Users, Workflow,
} from "lucide-react";
import * as teamApi from "@/api/team-api";
import type {
  Team, TeamMember, TeamTask, TeamWorkflowNode,
  TeamTaskStatus, TeamTaskPriority, SelectableAgent,
} from "@/types/team";
import styles from "./styles.module.css";

function formatTime(value: unknown): string {
  if (!value) return "-";
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

function taskStatusLabel(s: TeamTaskStatus): string {
  switch (s) {
    case "pending": return "待办";
    case "in_progress": return "进行中";
    case "completed": return "已完成";
    case "failed": return "失败";
    default: return s;
  }
}

function taskPriorityLabel(p: TeamTaskPriority): string {
  switch (p) {
    case "low": return "低";
    case "medium": return "中";
    case "high": return "高";
    case "urgent": return "紧急";
    default: return p;
  }
}

function taskPriorityClass(p: TeamTaskPriority): string {
  switch (p) {
    case "low": return styles.priorityLow;
    case "medium": return styles.priorityMedium;
    case "high": return styles.priorityHigh;
    case "urgent": return styles.priorityUrgent;
    default: return "";
  }
}

const PRESET_ROLES = [
  { title: "CEO", emoji: "👔" },
  { title: "渠道总监", emoji: "📡" },
  { title: "销售经理", emoji: "💼" },
  { title: "营销专员", emoji: "📢" },
  { title: "内容编辑", emoji: "✍️" },
  { title: "客服专员", emoji: "🎧" },
  { title: "财务主管", emoji: "💰" },
  { title: "技术顾问", emoji: "🔧" },
];

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6",
];

export default function TeamDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const teamId = id ? Number(id) : NaN;

  const [team, setTeam] = useState<Team | null>(null);
  const [workflow, setWorkflow] = useState<TeamWorkflowNode[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(false);

  // 添加/编辑成员弹窗
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [memberForm] = Form.useForm();
  const [savingMember, setSavingMember] = useState(false);
  const [selectableAgents, setSelectableAgents] = useState<SelectableAgent[]>([]);

  // 协作流程编辑弹窗
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [workflowDraft, setWorkflowDraft] = useState<TeamWorkflowNode[]>([]);
  const [savingWorkflow, setSavingWorkflow] = useState(false);

  const loadData = useCallback(async () => {
    if (!Number.isFinite(teamId)) return;
    setLoading(true);
    try {
      const [detail, memberList, taskResult] = await Promise.all([
        teamApi.getTeamDetail(teamId),
        teamApi.listMembers(teamId),
        teamApi.listTasks(teamId, { pageSize: 100 }),
      ]);
      setTeam(detail.team);
      setWorkflow(detail.workflow || []);
      setMembers(memberList || []);
      setTasks(taskResult.list || []);
    } catch (err) {
      console.error("[TeamDetail] load failed:", err);
      message.error("加载团队详情失败");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { void loadData(); }, [loadData]);

  // 打开添加/编辑成员弹窗
  const openMemberModal = async (member?: TeamMember) => {
    try {
      const agents = await teamApi.listLocalSelectableAgents();
      setSelectableAgents(agents || []);
    } catch { /* ignore */ }
    setEditingMember(member || null);
    if (member) {
      memberForm.setFieldsValue({
        agentId: member.agentId,
        roleTitle: member.roleTitle ? [member.roleTitle] : undefined,
        roleDescription: member.roleDescription || "",
        roleEmoji: member.roleEmoji || "",
        themeColor: member.themeColor || PRESET_COLORS[0],
        sortOrder: member.sortOrder,
      });
    } else {
      memberForm.resetFields();
      memberForm.setFieldsValue({ sortOrder: members.length, themeColor: PRESET_COLORS[members.length % PRESET_COLORS.length] });
    }
    setMemberModalOpen(true);
  };

  // 保存成员
  const saveMember = async () => {
    try {
      const values = await memberForm.validateFields();
      // 自定义职能为标签式输入（值可能是数组），统一还原为字符串
      const roleTitle = Array.isArray(values.roleTitle)
        ? (values.roleTitle[0] ?? "")
        : (values.roleTitle ?? "");
      setSavingMember(true);
      if (editingMember) {
        await teamApi.updateMember(teamId, editingMember.id, {
          roleTitle,
          roleDescription: values.roleDescription,
          roleEmoji: values.roleEmoji,
          themeColor: values.themeColor,
          sortOrder: values.sortOrder,
        });
        message.success("成员信息已更新");
      } else {
        await teamApi.addMember(teamId, {
          agentId: values.agentId,
          roleTitle,
          roleDescription: values.roleDescription,
          roleEmoji: values.roleEmoji,
          themeColor: values.themeColor,
          sortOrder: values.sortOrder,
        });
        message.success("成员已添加");
      }
      setMemberModalOpen(false);
      void loadData();
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      console.error("[TeamDetail] save member failed:", err);
      message.error("保存成员失败: " + (err as Error).message);
    } finally {
      setSavingMember(false);
    }
  };

  // ===== 协作流程编辑 =====
  const openWorkflowModal = () => {
    setWorkflowDraft(workflow.map((w, i) => ({ ...w, order: i })));
    setWorkflowModalOpen(true);
  };

  const addWorkflowNode = () => {
    setWorkflowDraft((prev) => [...prev, { id: 0, name: "", description: "", order: prev.length }]);
  };

  const updateWorkflowNode = (index: number, patch: Partial<TeamWorkflowNode>) => {
    setWorkflowDraft((prev) => prev.map((n, i) => (i === index ? { ...n, ...patch } : n)));
  };

  const moveWorkflowNode = (index: number, dir: -1 | 1) => {
    setWorkflowDraft((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((n, i) => ({ ...n, order: i }));
    });
  };

  const removeWorkflowNode = (index: number) => {
    setWorkflowDraft((prev) => prev.filter((_, i) => i !== index).map((n, i) => ({ ...n, order: i })));
  };

  const saveWorkflow = async () => {
    if (workflowDraft.length > 20) {
      message.warning("协作流程节点最多 20 个");
      return;
    }
    if (workflowDraft.some((n) => !n.name?.trim())) {
      message.warning("请填写所有节点名称");
      return;
    }
    setSavingWorkflow(true);
    try {
      const saved = await teamApi.saveWorkflow(teamId, workflowDraft.map((n, i) => ({ ...n, order: i })));
      setWorkflow(saved);
      setWorkflowModalOpen(false);
      message.success("协作流程已保存");
    } catch (err) {
      console.error("[TeamDetail] save workflow failed:", err);
      message.error("保存协作流程失败: " + (err as Error).message);
    } finally {
      setSavingWorkflow(false);
    }
  };

  // 移除成员
  const removeMember = async (member: TeamMember) => {
    try {
      await teamApi.removeMember(teamId, member.id);
      message.success(`成员 "${member.agentName}" 已移除`);
      void loadData();
    } catch (err) {
      console.error("[TeamDetail] remove member failed:", err);
      message.error("移除成员失败: " + (err as Error).message);
    }
  };

  const taskColumns: TableColumnsType<TeamTask> = [
    { title: "任务名称", dataIndex: "title", key: "title",
      render: (v: string, record) => (
        <span style={{ color: "var(--color-text-primary)", fontSize: 13 }}>
          {record.description ? <span title={record.description}>{v}</span> : v}
        </span>
      ),
    },
    { title: "状态", dataIndex: "status", key: "status", width: 80,
      render: (s: TeamTaskStatus) => <Tag>{taskStatusLabel(s)}</Tag>,
    },
    { title: "负责人", dataIndex: "assigneeName", key: "assignee", width: 100,
      render: (v?: string) => v || "未分配",
    },
    { title: "优先级", dataIndex: "priority", key: "priority", width: 70,
      render: (p: TeamTaskPriority) => (
        <Tag className={taskPriorityClass(p)}>{taskPriorityLabel(p)}</Tag>
      ),
    },
    { title: "截止日期", dataIndex: "dueDate", key: "dueDate", width: 110,
      render: (v?: string) => v ? formatTime(v) : "-",
    },
  ];

  if (!team && !loading) {
    return (
      <div className={styles.pageContainer}>
        <Empty description="团队不存在" style={{ marginTop: 80 }}>
          <Button type="primary" onClick={() => navigate("/team")}>返回团队列表</Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <Users size={18} />
          </span>
          <span>{team?.name || "团队详情"}</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.ghostBtn} icon={<ArrowLeft size={14} />} onClick={() => navigate("/team")}>
            返回列表
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<LayoutGrid size={14} />}
            onClick={() => navigate(`/team/${teamId}/board`)}
          >
            看板视图
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        <div className={styles.detailContainer}>
          {/* 团队信息 */}
          {team && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionTitleText}><Briefcase size={14} />团队信息</span>
              </div>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>名称</span>
                  <span className={styles.infoValue}>{team.name}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>成员数</span>
                  <span className={styles.infoValue}>{team.memberCount}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>创建时间</span>
                  <span className={styles.infoValue}>{formatTime(team.createdAt)}</span>
                </div>
              </div>
              {team.description && (
                <div style={{ marginTop: 12, color: "var(--color-text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
                  {team.description}
                </div>
              )}
            </div>
          )}

          {/* 成员列表（Agent + 自定义职能） */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleText}>
                <UserRound size={14} />成员列表（{members.length}）
              </span>
              <Button
                size="small"
                className={styles.addMemberBtn}
                icon={<Plus size={14} />}
                onClick={() => openMemberModal()}
              >
                添加成员
              </Button>
            </div>
            {members.length === 0 ? (
              <Empty description="暂无成员，点击「添加成员」选择 Agent 并指定职能" />
            ) : (
              <div className={styles.memberGrid}>
                {members.map((m) => (
                  <div key={m.id} className={styles.memberCard}>
                    <div className={styles.memberAvatar}>
                      {m.agentAvatar ? (
                        <img loading="lazy" src={m.agentAvatar} alt={m.agentName} className={styles.memberAvatarImg} />
                      ) : (
                        m.agentName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className={styles.memberInfo}>
                      <div className={styles.memberName}>
                        <span>{m.agentName}</span>
                        {m.roleEmoji && <span className={styles.roleEmoji}>{m.roleEmoji}</span>}
                      </div>
                      <div className={styles.memberMeta}>
                        <span className={styles.roleTitle}>{m.roleTitle}</span>
                        <span style={{ color: m.themeColor || "var(--color-text-tertiary)", fontSize: 11 }}>
                          ● {m.isActive ? "激活" : "停用"}
                        </span>
                      </div>
                    </div>
                    <div className={styles.memberActions}>
                      <Button size="small" type="text" icon={<Pencil size={14} />}
                        onClick={() => openMemberModal(m)}
                        style={{ color: "var(--color-text-secondary)" }}
                      />
                      <Popconfirm title="确定移除此成员？" onConfirm={() => removeMember(m)}
                        okText="移除" cancelText="取消">
                        <Button size="small" type="text" danger icon={<Trash2 size={14} />} />
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 任务列表 */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleText}><ListTodo size={14} />任务分配列表</span>
            </div>
            {tasks.length === 0 ? (
              <Empty description="暂无任务" />
            ) : (
              <Table<TeamTask> columns={taskColumns} dataSource={tasks} rowKey="id"
                size="small" pagination={false} scroll={{ x: "max-content" }} />
            )}
          </div>

          {/* 协作流程 */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>
              <span className={styles.sectionTitleText}><Workflow size={14} />协作流程</span>
              <Button size="small" icon={<Pencil size={12} />} onClick={openWorkflowModal}>编辑流程</Button>
            </div>
            {workflow.length === 0 ? (
              <div style={{ color: "var(--color-text-tertiary)", fontSize: 12, lineHeight: 1.6 }}>
                暂未配置协作流程。默认协作流程：任务创建 → 负责人接收 → 执行中 → 提交审核 → 审核通过 → 完成。
              </div>
            ) : (
              <div className={styles.workflowFlow}>
                {workflow.sort((a, b) => a.order - b.order).map((node, idx) => (
                  <div key={node.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className={styles.workflowNode}>
                      <div style={{ fontWeight: 600 }}>{node.name}</div>
                      {node.description && (
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{node.description}</div>
                      )}
                    </div>
                    {idx < workflow.length - 1 && <span className={styles.workflowArrow}>→</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Spin>

      {/* 协作流程编辑弹窗 */}
      <Modal
        title="编辑协作流程"
        open={workflowModalOpen}
        onCancel={() => setWorkflowModalOpen(false)}
        onOk={saveWorkflow}
        confirmLoading={savingWorkflow}
        okText="保存"
        cancelText="取消"
        width={640}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
          {workflowDraft.length === 0 && (
            <div style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
              暂无节点。Hermes 将按默认流程执行：任务创建 → 负责人接收 → 执行中 → 提交审核 → 审核通过 → 完成。
            </div>
          )}
          {workflowDraft.map((node, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 20, lineHeight: "32px", color: "var(--color-text-tertiary)", fontSize: 13, flexShrink: 0 }}>{idx + 1}</div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <Input
                  placeholder="节点名，如 选题确认"
                  value={node.name}
                  maxLength={128}
                  onChange={(e) => updateWorkflowNode(idx, { name: e.target.value })}
                />
                <Input
                  placeholder="节点说明（可选）：这一步要做什么、谁负责"
                  value={node.description ?? ""}
                  maxLength={512}
                  onChange={(e) => updateWorkflowNode(idx, { description: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <Button size="small" icon={<ArrowUp size={12} />} disabled={idx === 0} onClick={() => moveWorkflowNode(idx, -1)} />
                <Button size="small" icon={<ArrowDown size={12} />} disabled={idx === workflowDraft.length - 1} onClick={() => moveWorkflowNode(idx, 1)} />
                <Button size="small" danger icon={<Trash2 size={12} />} onClick={() => removeWorkflowNode(idx)} />
              </div>
            </div>
          ))}
        </div>
        <Button type="dashed" block icon={<Plus size={14} />} onClick={addWorkflowNode}>
          添加节点
        </Button>
      </Modal>

      {/* 添加/编辑成员弹窗 */}
      <Modal
        title={editingMember ? `编辑成员 — ${editingMember.agentName}` : "添加成员"}
        open={memberModalOpen}
        onOk={saveMember}
        onCancel={() => { setMemberModalOpen(false); memberForm.resetFields(); }}
        confirmLoading={savingMember}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={memberForm} layout="vertical">
          {!editingMember && (
            <Form.Item label="选择 Agent" name="agentId"
              rules={[{ required: true, message: "请选择 Agent" }]}>
              <Select
                placeholder="选择要加入团队的 Agent"
                options={selectableAgents.map((a) => ({ label: a.name, value: a.id }))}
                showSearch optionFilterProp="label"
                notFoundContent="暂无可用 Agent"
              />
            </Form.Item>
          )}
          <Form.Item label="自定义职能" name="roleTitle"
            rules={[
              { required: true, message: "请输入职能名称" },
              {
                validator: (_: unknown, v: unknown) => {
                  const val = Array.isArray(v) ? v[0] : v;
                  const text = typeof val === "string" ? val : "";
                  if (text.length > 64) return Promise.reject(new Error("职能名称最多 64 个字符"));
                  return Promise.resolve();
                },
              },
            ]}>
            <Select
              mode="tags"
              maxCount={1}
              placeholder="输入职能名，如 CEO / 渠道总监 / 销售经理"
              options={PRESET_ROLES.map((r) => ({
                label: `${r.emoji} ${r.title}`,
                value: r.title,
              }))}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="职能图标 (emoji)" name="roleEmoji">
            <Select placeholder="可选，选择或输入 emoji" allowClear showSearch>
              {PRESET_ROLES.map((r) => (
                <Select.Option key={r.emoji} value={r.emoji}>{r.emoji} {r.title}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="职能描述" name="roleDescription"
            rules={[{ max: 256, message: "描述最大 256 个字符" }]}>
            <Input.TextArea rows={2} placeholder="可选，描述该职能的职责范围" maxLength={256} showCount />
          </Form.Item>
          <Form.Item label="主题色" name="themeColor">
            <ColorPicker format="hex" presets={PRESET_COLORS.map((c) => ({ label: c, colors: [c] }))} />
          </Form.Item>
          <Form.Item label="排序" name="sortOrder">
            <Input type="number" min={0} max={99} placeholder="工位顺序，数字越小越靠前" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
