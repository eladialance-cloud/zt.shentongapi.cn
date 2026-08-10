// 团队列表页 — 替换 OPC 团队列表
// 设计文档: team_module_design_20260730.md
// 核心变化: 创建团队时可为每个 Agent 指定自定义职能

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, Card, Empty, Form, Input, Modal, Popconfirm, Select, Spin, message,
} from "antd";
import {
  ArrowLeftOutlined, DeleteOutlined, EyeOutlined, PlusOutlined,
  TeamOutlined, UserOutlined, ApartmentOutlined,
} from "@ant-design/icons";
import * as teamApi from "@/api/team-api";
import type { Team, CreateTeamDto, SelectableAgent } from "@/types/team";
import type { KnowledgeBase } from "@/types/knowledge";
import { listKnowledgeBases } from "@/api/knowledge-api";
import { useSystemStore } from "@/store/system";
import { NetworkError } from "@/utils/errors";
import styles from "./styles.module.css";

function formatTime(value: unknown): string {
  if (!value) return "-";
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

interface CreateFormValues {
  name: string;
  description?: string;
  knowledgeBaseId?: number;
  memberAgentIds?: Array<number | string>;
  members?: Array<{
    agentName?: string;
    roleTitle?: string;
    agentId?: number | string;
  }>;
}

export default function TeamList() {
  const navigate = useNavigate();
  const backendAvailable = useSystemStore((s) => s.backendAvailable);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateFormValues>();
  const [creating, setCreating] = useState(false);
  const [agents, setAgents] = useState<SelectableAgent[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await teamApi.listTeams();
      setTeams(list || []);
    } catch (err) {
      console.error("[TeamList] load failed:", err);
      if (!(err instanceof NetworkError) || backendAvailable) {
        message.error("加载团队列表失败");
      }
    } finally {
      setLoading(false);
    }
  }, [backendAvailable]);

  const loadAgents = useCallback(async () => {
    try {
      const list = await teamApi.listLocalSelectableAgents();
      setAgents(list || []);
    } catch (err) {
      console.error("[TeamList] load agents failed:", err);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const list = await listKnowledgeBases();
      setKnowledgeBases(list || []);
    } catch (err) {
      console.error("[TeamList] load knowledge bases failed:", err);
    }
  }, []);

  const handleOpenCreate = () => {
    void loadAgents();
    void loadKnowledgeBases();
    createForm.resetFields();
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      const members = (values.members || [])
        .filter((m) => m && m.agentId != null)
        .map((m) => ({
          agentId: m.agentId as number | string,
          agentName: m.agentName || undefined,
          roleTitle: m.roleTitle || "团队成员",
        }));
      const dto: CreateTeamDto = {
        name: values.name,
        description: values.description,
        knowledgeBaseId: values.knowledgeBaseId,
        members: members.length > 0 ? members : undefined,
        memberAgentIds: members.length === 0 ? values.memberAgentIds || [] : undefined,
      };
      const team = await teamApi.createTeam(dto);
      message.success(`团队 "${team.name}" 创建成功`);
      setCreateOpen(false);
      createForm.resetFields();
      setTeams((prev) => [...prev, team]);
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      console.error("[TeamList] create failed:", err);
      message.error("创建团队失败: " + (err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (team: Team) => {
    try {
      await teamApi.deleteTeam(team.id);
      message.success(`团队 "${team.name}" 已删除`);
      setTeams((prev) => prev.filter((t) => t.id !== team.id));
    } catch (err) {
      console.error("[TeamList] delete failed:", err);
      message.error("删除失败: " + (err as Error).message);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <TeamOutlined />
          <span>团队管理</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/dashboard")}
          >
            返回
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
          >
            创建团队
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {teams.length === 0 && !loading ? (
          <Empty description="暂无团队，点击右上角创建" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.teamGrid}>
            {teams.map((team) => (
              <Card
                key={team.id}
                className={styles.teamCard}
                bordered={false}
                onClick={() => navigate(`/team/${team.id}`)}
              >
                <div className={styles.teamCardTitle}>
                  <TeamOutlined style={{ marginRight: 6, color: "#a5b4fc" }} />
                  {team.name}
                </div>
                <div className={styles.teamCardDesc}>
                  {team.description || "暂无描述"}
                </div>
                <div className={styles.teamCardMeta}>
                  <span>
                    <UserOutlined style={{ marginRight: 4 }} />
                    {team.memberCount} 成员
                  </span>
                  {team.knowledgeBaseId != null && (
                    <span title="关联知识库">
                      📚 {knowledgeBases.find((kb) => kb.id === team.knowledgeBaseId)?.name || `知识库 #${team.knowledgeBaseId}`}
                    </span>
                  )}
                  <span>创建于 {formatTime(team.createdAt)}</span>
                </div>
                <div
                  className={styles.teamCardActions}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="small"
                    type="primary"
                    className={styles.primaryBtn}
                    icon={<EyeOutlined />}
                    onClick={() => navigate(`/team/${team.id}`)}
                  >
                    查看详情
                  </Button>
                  <Popconfirm
                    title="确定删除该团队吗？"
                    description="将同步移除所有成员与任务关联"
                    onConfirm={() => handleDelete(team)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>

      <Modal
        title="创建团队"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            label="团队名称"
            name="name"
            rules={[
              { required: true, message: "请输入团队名称" },
              { max: 64, message: "名称最大 64 个字符" },
            ]}
          >
            <Input placeholder="如: 营销内容生产团队" />
          </Form.Item>
          <Form.Item
            label="团队描述"
            name="description"
            rules={[{ max: 256, message: "描述最大 256 个字符" }]}
          >
            <Input.TextArea rows={3} placeholder="可选，团队职责描述" maxLength={256} showCount />
          </Form.Item>
          <Form.Item
            label="团队知识库"
            name="knowledgeBaseId"
            extra="可选，团队共享的知识库"
          >
            <Select
              placeholder="选择知识库（可选）"
              options={knowledgeBases.map((kb) => ({ label: kb.name, value: kb.id }))}
              allowClear
              style={{ width: "100%" }}
              notFoundContent={knowledgeBases.length === 0 ? "暂无知识库" : undefined}
            />
          </Form.Item>

          <div style={{ fontWeight: 600, margin: "8px 0 4px" }}>AI 员工</div>
          <Form.List name="members">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 8,
                      alignItems: "flex-start",
                      background: "#f8fafc",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <Form.Item
                      {...restField}
                      name={[name, "agentName"]}
                      rules={[{ required: true, message: "填写员工名称" }]}
                      style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
                    >
                      <Input placeholder="员工名称，如：王明" maxLength={32} />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "roleTitle"]}
                      style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
                    >
                      <Input placeholder="职位，如：内容总监" maxLength={32} />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "agentId"]}
                      rules={[{ required: true, message: "选择 Agent" }]}
                      style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
                    >
                      <Select
                        placeholder="选择 Agent"
                        options={agents.map((a) => ({ label: a.name, value: a.id }))}
                        notFoundContent={agents.length === 0 ? "暂无可用 Agent" : undefined}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                      style={{ marginTop: 2 }}
                    />
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                  添加 AI 员工
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
