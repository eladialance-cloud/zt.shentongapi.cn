// 团队列表页 — Kimi 风格（v2.1）
// Task 5: 卡片对齐原型（图标 + 人数忙闲聚合 + 本周产出任务数 + 进入团队管理）
//         + 未创建模板卡（创建 → 3 步建团向导）+ 删除确认

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Empty, Popconfirm, Spin, message } from "antd";
import { ArrowLeft, BookOpen, Eye, Plus, Trash2, Users } from "lucide-react";
import * as teamApi from "@/api/team-api";
import type { Team, TeamMember, TeamTask } from "@/types/team";
import type { KnowledgeBase } from "@/types/knowledge";
import { listKnowledgeBases } from "@/api/knowledge-api";
import { useSystemStore } from "@/store/system";
import { NetworkError } from "@/utils/errors";
import { countWeekOutput, findUncreatedTemplates, templateTeamName } from "./wizard";
import CreateWizard from "./CreateWizard";
import styles from "./styles.module.css";

function formatTime(value: unknown): string {
  if (!value) return "-";
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 卡片图标：先取 avatar（非 URL 的 emoji），再按名称关键词，最后首字符色块 */
function teamIconFor(team: Team): { emoji?: string; char?: string } {
  const avatar = team.avatar;
  if (avatar && avatar.trim() && !/^(https?:|data:|blob:)/i.test(avatar.trim())) {
    return { emoji: avatar.trim() };
  }
  const name = team.name || "";
  if (/内容|文案/.test(name)) return { emoji: "📝" };
  if (/运营|发布/.test(name)) return { emoji: "📣" };
  if (/电商|选品|上架/.test(name)) return { emoji: "🛒" };
  if (/商务|销售/.test(name)) return { emoji: "💼" };
  return { char: (name.charAt(0) || "团").toUpperCase() };
}

const ICON_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
];

export default function TeamList() {
  const navigate = useNavigate();
  const backendAvailable = useSystemStore((s) => s.backendAvailable);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [membersByTeam, setMembersByTeam] = useState<Map<number, TeamMember[]>>(new Map());
  const [outputByTeam, setOutputByTeam] = useState<Map<number, number>>(new Map());
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

  // 建团向导
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTemplate, setWizardTemplate] = useState<string | undefined>(undefined);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await teamApi.listTeams();
      setTeams(list || []);

      // 每团队并行拉成员 + 任务（忙闲聚合 + 本周产出），任一失败只降级该团队
      const members = new Map<number, TeamMember[]>();
      const outputs = new Map<number, number>();
      await Promise.all(
        (list || []).map(async (team) => {
          try {
            const [memberRes, taskRes] = await Promise.all([
              teamApi.listMembers(team.id),
              teamApi.listTasks(team.id, { pageSize: 100 }),
            ]);
            members.set(team.id, memberRes || []);
            outputs.set(team.id, countWeekOutput((taskRes as { list?: TeamTask[] })?.list ?? []));
          } catch (err) {
            console.warn(`[TeamList] 团队 ${team.id} 忙闲/产出加载失败:`, err);
          }
        }),
      );
      setMembersByTeam(members);
      setOutputByTeam(outputs);
    } catch (err) {
      console.error("[TeamList] load failed:", err);
      if (!(err instanceof NetworkError) || backendAvailable) {
        message.error("加载团队列表失败");
      }
    } finally {
      setLoading(false);
    }
  }, [backendAvailable]);

  useEffect(() => { void loadData(); }, [loadData]);

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const list = await listKnowledgeBases();
      setKnowledgeBases(list || []);
    } catch (err) {
      console.error("[TeamList] load knowledge bases failed:", err);
    }
  }, []);

  useEffect(() => { void loadKnowledgeBases(); }, [loadKnowledgeBases]);

  /** 未创建的模板团队（如电商团队），点击「创建」打开向导并预选模板 */
  const uncreated = useMemo(() => findUncreatedTemplates(teams), [teams]);

  const openWizard = (templateId?: string) => {
    setWizardTemplate(templateId);
    setWizardOpen(true);
  };

  const handleCreated = useCallback(
    (team: Team) => {
      message.success(`团队 "${team.name}" 创建成功`);
      void loadData();
    },
    [loadData],
  );

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
          <span className={styles.pageTitleIcon}>
            <Users size={18} />
          </span>
          <span>团队管理</span>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.ghostBtn}
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate("/dashboard")}
          >
            返回
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<Plus size={14} />}
            onClick={() => openWizard()}
          >
            创建团队
          </Button>
        </div>
      </div>

      <Spin spinning={loading}>
        {teams.length === 0 && uncreated.length === 0 && !loading ? (
          <Empty description="暂无团队，点击右上角创建" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.teamGrid}>
            {teams.map((team) => {
              const icon = teamIconFor(team);
              const members = membersByTeam.get(team.id);
              const busy = (members || []).filter((m) => m.isActive).length;
              const idle = (members || []).length - busy;
              const output = outputByTeam.get(team.id) ?? 0;
              return (
                <Card
                  key={team.id}
                  className={styles.teamCard}
                  bordered={false}
                  styles={{ body: { padding: 20 } }}
                  onClick={() => navigate(`/team/${team.id}`)}
                >
                  <div className={styles.teamCardHead}>
                    <div
                      className={styles.teamIconBlock}
                      style={
                        icon.emoji
                          ? undefined
                          : { background: ICON_COLORS[team.id % ICON_COLORS.length], color: "#fff" }
                      }
                    >
                      {icon.emoji ?? icon.char}
                    </div>
                    <div className={styles.teamCardHeadInfo}>
                      <div className={styles.teamCardTitle}>{team.name}</div>
                      <div className={styles.teamCardStatus}>
                        {members
                          ? `${members.length} 名员工 · ${busy}忙${idle}闲`
                          : `共 ${team.memberCount} 人`}
                        <span className={styles.weekOutput}>本周产出 {output} 项</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.teamCardDesc}>
                    {team.description || "暂无描述"}
                  </div>
                  <div className={styles.teamCardMeta}>
                    {team.knowledgeBaseId != null && (
                      <span className={styles.metaItem} title="关联知识库">
                        <BookOpen size={12} />
                        {knowledgeBases.find((kb) => kb.id === team.knowledgeBaseId)?.name ||
                          `知识库 #${team.knowledgeBaseId}`}
                      </span>
                    )}
                    <span className={styles.metaItem}>创建于 {formatTime(team.createdAt)}</span>
                  </div>
                  <div
                    className={styles.teamCardActions}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="small"
                      type="primary"
                      className={styles.primaryBtn}
                      icon={<Eye size={14} />}
                      onClick={() => navigate(`/team/${team.id}`)}
                    >
                      进入团队管理
                    </Button>
                    <Popconfirm
                      title="确定删除该团队吗？"
                      description="将同步移除所有成员与任务关联"
                      onConfirm={() => handleDelete(team)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button size="small" danger icon={<Trash2 size={14} />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </div>
                </Card>
              );
            })}

            {/* 未创建模板卡：虚线占位，点击「创建」打开建团向导（预选该模板） */}
            {uncreated.map((tpl) => (
              <Card
                key={tpl.id}
                className={styles.uncreatedCard}
                bordered={false}
                styles={{ body: { padding: 20 } }}
              >
                <div className={styles.teamCardHead}>
                  <div className={styles.teamIconBlock}>{tpl.emoji}</div>
                  <div className={styles.teamCardHeadInfo}>
                    <div className={styles.teamCardTitle}>{templateTeamName(tpl)}</div>
                    <div className={styles.teamCardStatus}>
                      <span>未创建</span>
                      <span className={styles.weekOutput}>本周产出 -</span>
                    </div>
                  </div>
                </div>
                <div className={styles.teamCardDesc}>{tpl.description}</div>
                <div
                  className={styles.teamCardActions}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="small"
                    type="primary"
                    className={styles.primaryBtn}
                    icon={<Plus size={14} />}
                    onClick={() => openWizard(tpl.id)}
                  >
                    创建
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>

      <CreateWizard
        open={wizardOpen}
        initialTemplateId={wizardTemplate}
        onCancel={() => setWizardOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
