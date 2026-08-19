// 建团向导（Task 5）— 3 步：选模板 → 确认成员 → 完成
// Step1 选模板（默认空白，模板只作预选提示）；Step2 勾选成员（角色库 + 自定义职能）；
// Step3 POST /teams（dto 含 members）→ 成功页（进入团队页 / 完成刷新列表）
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button, Checkbox, Empty, Input, Modal, Select, Steps, message,
} from "antd";
import { ArrowLeft, ArrowRight, Plus, Search, UserRound } from "lucide-react";
import * as teamApi from "@/api/team-api";
import { listKnowledgeBases } from "@/api/knowledge-api";
import type { Team, SelectableAgent } from "@/types/team";
import type { KnowledgeBase } from "@/types/knowledge";
import styles from "./styles.module.css";
import {
  DEFAULT_TEMPLATE_ID,
  MEMBER_COLORS,
  TEAM_TEMPLATES,
  applyTemplate,
  buildCreatePayload,
  keyOf,
  selectedCount,
  templateTeamName,
  toggleMember,
  updateMemberEmoji,
  updateMemberRole,
  type MemberCandidate,
  type TeamTemplate,
  type WizardMember,
} from "./wizard";

interface CreateWizardProps {
  open: boolean;
  /** 打开时预选模板（未创建模板卡「创建」按钮传入） */
  initialTemplateId?: string;
  onCancel: () => void;
  /** 创建成功后回调（父级刷新列表） */
  onCreated: (team: Team) => void;
}

export default function CreateWizard({
  open,
  initialTemplateId,
  onCancel,
  onCreated,
}: CreateWizardProps) {
  const navigate = useNavigate();
  const openRef = useRef(false);

  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [agents, setAgents] = useState<SelectableAgent[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<WizardMember[]>([]);
  const [creating, setCreating] = useState(false);
  const [createdTeam, setCreatedTeam] = useState<Team | null>(null);
  const [assignedCount, setAssignedCount] = useState(0);

  // 角色库 Modal
  const [roleLibOpen, setRoleLibOpen] = useState(false);
  const [roleLibKeys, setRoleLibKeys] = useState<Set<string>>(new Set());
  const [roleLibSearch, setRoleLibSearch] = useState("");

  // 打开时重置向导并加载角色库/知识库；initialTemplateId 非空则应用模板预选
  useEffect(() => {
    if (!open) {
      openRef.current = false;
      return;
    }
    openRef.current = true;
    setStep(0);
    setTemplateId(DEFAULT_TEMPLATE_ID);
    setSelected([]);
    setTeamName("");
    setTeamDesc("");
    setKnowledgeBaseId(undefined);
    setCreatedTeam(null);
    setAssignedCount(0);
    setRoleLibOpen(false);
    setRoleLibKeys(new Set());
    setRoleLibSearch("");
    const target = TEAM_TEMPLATES.find((t) => t.id === initialTemplateId);
    (async () => {
      const [agentList, kbList] = await Promise.all([
        teamApi.listLocalSelectableAgents().catch(() => [] as SelectableAgent[]),
        listKnowledgeBases().catch(() => [] as KnowledgeBase[]),
      ]);
      if (!openRef.current) return;
      setAgents(agentList || []);
      setKnowledgeBases(kbList || []);
      if (target && target.id !== DEFAULT_TEMPLATE_ID) {
        setTemplateId(target.id);
        setSelected(applyTemplate(target, agentList || []));
        setTeamName(templateTeamName(target));
      }
    })();
  }, [open, initialTemplateId]);

  const template = useMemo(
    () => TEAM_TEMPLATES.find((t) => t.id === templateId) ?? TEAM_TEMPLATES[0],
    [templateId],
  );

  const handleSelectTemplate = (t: TeamTemplate) => {
    setTemplateId(t.id);
    // 模板只作预选提示：应用预选并重置成员勾选（空白 = 空）
    setSelected(applyTemplate(t, agents));
    setTeamName(t.id === DEFAULT_TEMPLATE_ID ? "" : templateTeamName(t));
  };

  /** Step2 候选行：已选成员（带模板角色）+ 角色库其余 Agent */
  const candidates = useMemo<MemberCandidate[]>(() => {
    const selectedKeys = new Set(selected.map((m) => keyOf(m.agentId)));
    const fromSelected: MemberCandidate[] = selected.map((m) => ({
      agent: { id: m.agentId, name: m.agentName },
      roleTitle: m.roleTitle,
      roleEmoji: m.roleEmoji,
    }));
    const rest: MemberCandidate[] = agents
      .filter((a) => !selectedKeys.has(keyOf(a.id)))
      .map((a) => ({ agent: a }));
    return [...fromSelected, ...rest];
  }, [selected, agents]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const dto = buildCreatePayload(
        { name: teamName, description: teamDesc, knowledgeBaseId },
        selected,
      );
      const team = await teamApi.createTeam(dto);
      setAssignedCount(selectedCount(selected));
      setCreatedTeam(team);
      setStep(2);
      onCreated(team);
    } catch (err) {
      console.error("[CreateWizard] create failed:", err);
      message.error("创建团队失败: " + (err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) return;
    onCancel();
  };

  const goTeam = () => {
    if (createdTeam) {
      navigate(`/team/${createdTeam.id}`);
    }
    handleClose();
  };

  const openRoleLib = () => {
    setRoleLibKeys(new Set(selected.map((m) => keyOf(m.agentId))));
    setRoleLibSearch("");
    setRoleLibOpen(true);
  };

  const confirmRoleLib = () => {
    setSelected((prev) => {
      const keys = new Set(prev.map((m) => keyOf(m.agentId)));
      const next = [...prev];
      for (const a of agents) {
        const k = keyOf(a.id);
        if (roleLibKeys.has(k) && !keys.has(k)) {
          keys.add(k);
          next.push({
            agentId: a.id,
            agentName: a.name,
            roleTitle: "团队成员",
            themeColor: MEMBER_COLORS[next.length % MEMBER_COLORS.length],
          });
        }
      }
      return next;
    });
    setRoleLibOpen(false);
  };

  const roleLibList = useMemo(() => {
    const q = roleLibSearch.trim().toLowerCase();
    return q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents;
  }, [agents, roleLibSearch]);

  const nameValid = teamName.trim().length > 0;

  return (
    <>
      <Modal
        title="新建 AI 团队"
        open={open}
        onCancel={handleClose}
        footer={null}
        width={600}
        destroyOnClose
        maskClosable={!creating}
        closable={!creating}
      >
        <Steps
          size="small"
          current={step}
          items={[{ title: "选模板" }, { title: "确认成员" }, { title: "完成" }]}
          className={styles.wizardSteps}
        />

        {step === 0 && (
          <div>
            <div className={styles.templateGrid}>
              {TEAM_TEMPLATES.map((t) => (
                <div
                  key={t.id}
                  className={
                    t.id === templateId
                      ? styles.templateCard + " " + styles.templateCardSelected
                      : styles.templateCard
                  }
                  onClick={() => handleSelectTemplate(t)}
                  role="button"
                  tabIndex={0}
                >
                  {t.recommended && <span className={styles.templateTag}>默认</span>}
                  <div className={styles.templateName}>
                    <span className={styles.templateEmoji}>{t.emoji}</span>
                    {t.name}
                  </div>
                  <div className={styles.templateDesc}>{t.description}</div>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 600, margin: "4px 0 8px", fontSize: 13 }}>团队信息</div>
            <Input
              placeholder="团队名称（如：内容团队）"
              maxLength={64}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <Input.TextArea
              placeholder="团队描述（可选）"
              rows={2}
              maxLength={256}
              showCount
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <Select
              placeholder="关联知识库（可选）"
              allowClear
              style={{ width: "100%" }}
              value={knowledgeBaseId}
              onChange={(v) => setKnowledgeBaseId(v)}
              options={knowledgeBases.map((kb) => ({ label: kb.name, value: kb.id }))}
              notFoundContent={knowledgeBases.length === 0 ? "暂无知识库" : undefined}
            />
            {!nameValid && <div className={styles.wizardHint}>请先填写团队名称再进入下一步</div>}
          </div>
        )}

        {step === 1 && (
          <div>
            <div className={styles.pickSummary}>
              <span>
                已选 <b style={{ color: "var(--color-brand)" }}>{selectedCount(selected)}</b> 名员工
                {templateId !== DEFAULT_TEMPLATE_ID && (
                  <span style={{ marginLeft: 6, color: "var(--color-text-tertiary)" }}>
                    （{template?.name} 预选，可调整）
                  </span>
                )}
              </span>
              <Button
                size="small"
                className={styles.addMemberBtn}
                icon={<Plus size={14} />}
                onClick={openRoleLib}
              >
                从角色库添加
              </Button>
            </div>
            {candidates.length === 0 ? (
              <Empty description="角色库暂无可用 Agent，可直接创建团队后到详情页添加成员" />
            ) : (
              <div className={styles.pickList}>
                {candidates.map((c) => {
                  const k = keyOf(c.agent.id);
                  const checked = selected.some((m) => keyOf(m.agentId) === k);
                  const member = selected.find((m) => keyOf(m.agentId) === k);
                  return (
                    <div
                      key={k}
                      className={
                        checked
                          ? styles.pickRow + " " + styles.pickRowChecked
                          : styles.pickRow
                      }
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => setSelected((prev) => toggleMember(prev, c))}
                        className={styles.pickRowLabel}
                      >
                        <span style={{ fontSize: 13 }}>
                          {c.roleEmoji ? c.roleEmoji + " " : ""}
                          {c.agent.name}
                          {c.roleTitle &&
                            c.roleTitle !== "团队成员" &&
                            !checked && (
                              <span className={styles.pickRoleHint}>{c.roleTitle}</span>
                            )}
                        </span>
                      </Checkbox>
                      {checked && member && (
                        <div className={styles.pickEdit}>
                          <Input
                            size="small"
                            value={member.roleTitle}
                            placeholder="职位/职能"
                            maxLength={32}
                            style={{ width: 140 }}
                            onChange={(e) =>
                              setSelected((prev) =>
                                updateMemberRole(prev, member.agentId, e.target.value),
                              )
                            }
                          />
                          <Input
                            size="small"
                            value={member.roleEmoji || ""}
                            placeholder="emoji"
                            maxLength={4}
                            className={styles.pickEmojiInput}
                            onChange={(e) =>
                              setSelected((prev) =>
                                updateMemberEmoji(prev, member.agentId, e.target.value),
                              )
                            }
                          />
                          <span
                            className={styles.pickColorDot}
                            style={{ background: member.themeColor || "var(--color-text-tertiary)" }}
                            title="主题色（自动分配）"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 2 && createdTeam && (
          <div className={styles.successWrap}>
            <div className={styles.successEmoji}>🎉</div>
            <div className={styles.successTitle}>团队创建成功！</div>
            <div className={styles.successDesc}>
              {createdTeam.name} · 已分配 {assignedCount} 名 AI 员工
            </div>
            <div className={styles.successActions}>
              <Button
                type="primary"
                className={styles.primaryBtn}
                icon={<UserRound size={14} />}
                onClick={goTeam}
              >
                进入团队页
              </Button>
              <Button className={styles.ghostBtn} onClick={handleClose}>
                完成
              </Button>
            </div>
          </div>
        )}

        {step === 0 && (
          <div className={styles.wizardFooter}>
            <Button className={styles.ghostBtn} onClick={handleClose}>
              取消
            </Button>
            <Button
              type="primary"
              className={styles.primaryBtn}
              disabled={!nameValid}
              icon={<ArrowRight size={14} />}
              onClick={() => setStep(1)}
            >
              下一步
            </Button>
          </div>
        )}
        {step === 1 && (
          <div className={styles.wizardFooter}>
            <Button
              className={styles.ghostBtn}
              icon={<ArrowLeft size={14} />}
              onClick={() => setStep(0)}
            >
              上一步
            </Button>
            <Button
              type="primary"
              className={styles.primaryBtn}
              loading={creating}
              onClick={handleCreate}
            >
              创建团队（{selectedCount(selected)}）
            </Button>
          </div>
        )}
      </Modal>

      {/* 角色库多选 Modal */}
      <Modal
        title="从角色库添加员工"
        open={roleLibOpen}
        onCancel={() => setRoleLibOpen(false)}
        onOk={confirmRoleLib}
        okText={"添加（" + roleLibKeys.size + "）"}
        cancelText="取消"
        destroyOnClose
      >
        <Input
          prefix={<Search size={14} />}
          placeholder="搜索角色：文案写手 / 设计师 / 质检员…"
          allowClear
          value={roleLibSearch}
          onChange={(e) => setRoleLibSearch(e.target.value)}
          className={styles.roleLibSearch}
        />
        {roleLibList.length === 0 ? (
          <Empty description="角色库暂无匹配 Agent" />
        ) : (
          <div className={styles.roleLibList}>
            {roleLibList.map((a) => {
              const k = keyOf(a.id);
              return (
                <label key={k} className={styles.roleLibRow}>
                  <Checkbox
                    checked={roleLibKeys.has(k)}
                    onChange={(e) => {
                      const next = new Set(roleLibKeys);
                      if (e.target.checked) next.add(k);
                      else next.delete(k);
                      setRoleLibKeys(next);
                    }}
                  />
                  <span className={styles.roleLibAvatar}>
                    {a.avatar ? (
                      <img loading="lazy" src={a.avatar} alt={a.name} />
                    ) : (
                      a.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className={styles.roleLibName}>{a.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </Modal>
    </>
  );
}
