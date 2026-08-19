// 建团向导（Task 5）纯函数单测
// 覆盖：模板常量与默认空白 / applyTemplate 预选 / toggleMember+selectedCount / buildCreatePayload 组装
import {
  TEAM_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  applyTemplate,
  toggleMember,
  selectedCount,
  updateMemberRole,
  updateMemberEmoji,
  buildCreatePayload,
  templateTeamName,
  findUncreatedTemplates,
  countWeekOutput,
  type TeamTemplate,
  type WizardMember,
} from "@/pages/Team/wizard";
import type { SelectableAgent } from "@/types/team";
import type { TeamTask } from "@/types/team";

function agent(id: number | string, name: string): SelectableAgent {
  return { id, name };
}

function tpl(id: string): TeamTemplate {
  const t = TEAM_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error("template not found: " + id);
  return t;
}

describe("TEAM_TEMPLATES 模板常量", () => {
  it("包含 内容/运营/电商/空白 四模板，默认选中空白", () => {
    expect(TEAM_TEMPLATES.map((t) => t.id)).toEqual([
      "blank",
      "content",
      "operations",
      "ecommerce",
    ]);
    expect(DEFAULT_TEMPLATE_ID).toBe("blank");
    const blank = tpl("blank");
    expect(blank.name).toBe("空白团队");
    expect(blank.suggestedRoles).toEqual([]);
  });

  it("每个模板含 name/emoji/建议角色", () => {
    for (const t of TEAM_TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.emoji).toBeTruthy();
      expect(Array.isArray(t.suggestedRoles)).toBe(true);
    }
    expect(tpl("content").suggestedRoles.map((r) => r.roleTitle)).toEqual([
      "选题策划",
      "文案写手",
      "文案写手",
      "设计师",
      "质检员",
    ]);
    expect(tpl("operations").suggestedRoles.map((r) => r.roleTitle)).toEqual([
      "发布运营",
      "数据采集",
      "增长分析师",
    ]);
    expect(tpl("ecommerce").suggestedRoles.map((r) => r.roleTitle)).toEqual([
      "选品",
      "上架",
      "客服",
      "售后",
    ]);
  });
});

describe("applyTemplate 模板预选", () => {
  const agents: SelectableAgent[] = [
    agent(1, "文案写手（小红书）"),
    agent(2, "文案写手（公众号）"),
    agent(3, "封面设计师"),
    agent(4, "事实核查员"),
  ];

  it("空白模板 → 空选择", () => {
    expect(applyTemplate(tpl("blank"), agents)).toEqual([]);
  });

  it("内容模板按角色关键词预选（文案写手×2 匹配两个不同 Agent，无匹配角色跳过）", () => {
    const result = applyTemplate(tpl("content"), agents);
    // 选题策划/质检员无关键词匹配；文案写手×2 → agent1/agent2；设计师 → agent3
    expect(result.map((m) => m.agentId)).toEqual([1, 2, 3]);
    expect(result.map((m) => m.roleTitle)).toEqual([
      "文案写手",
      "文案写手",
      "设计师",
    ]);
    expect(result.every((m) => m.themeColor)).toBe(true);
  });

  it("presetAgentIds 精确预选：保持模板顺序、跳过缺失、去重", () => {
    const t: TeamTemplate = {
      id: "custom",
      name: "自定义模板",
      emoji: "🔧",
      description: "",
      suggestedRoles: [],
      presetAgentIds: [3, 1, 3, 99],
    };
    const result = applyTemplate(t, agents);
    expect(result.map((m) => m.agentId)).toEqual([3, 1]);
  });

  it("运营模板无关键词匹配时为空（模板只作预选提示）", () => {
    expect(applyTemplate(tpl("operations"), agents)).toEqual([]);
  });

  it("不修改传入的角色库数组", () => {
    const before = agents.map((a) => a.id);
    applyTemplate(tpl("content"), agents);
    expect(agents.map((a) => a.id)).toEqual(before);
  });
});

describe("toggleMember / selectedCount 勾选状态", () => {
  const a1 = agent(1, "阿设");
  const a2 = agent(2, "小林");

  it("空选择加入（默认职能 团队成员）", () => {
    const next = toggleMember([], { agent: a1 });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      agentId: 1,
      agentName: "阿设",
      roleTitle: "团队成员",
    });
  });

  it("已选中再次切换则移除", () => {
    const one = toggleMember([], { agent: a1 });
    const two = toggleMember(one, { agent: a2 });
    const back = toggleMember(two, { agent: a1 });
    expect(back.map((m) => m.agentId)).toEqual([2]);
  });

  it("支持模板角色预填（roleTitle/roleEmoji）", () => {
    const next = toggleMember([], { agent: a1, roleTitle: "设计师", roleEmoji: "🎨" });
    expect(next[0].roleTitle).toBe("设计师");
    expect(next[0].roleEmoji).toBe("🎨");
  });

  it("不可变：不修改原数组", () => {
    const one = toggleMember([], { agent: a1 });
    const copy = one.map((m) => ({ ...m }));
    toggleMember(one, { agent: a2 });
    expect(one).toEqual(copy);
  });

  it("selectedCount 统计", () => {
    expect(selectedCount([])).toBe(0);
    const one = toggleMember([], { agent: a1 });
    const two = toggleMember(one, { agent: a2 });
    expect(selectedCount(two)).toBe(2);
  });

  it("updateMemberRole / updateMemberEmoji 修改自定义职能", () => {
    const one = toggleMember([], { agent: a1, roleTitle: "设计师" });
    const edited = updateMemberRole(one, 1, "视觉总监");
    const emoji = updateMemberEmoji(edited, 1, "🎯");
    expect(one[0].roleTitle).toBe("设计师");
    expect(emoji[0]).toMatchObject({ roleTitle: "视觉总监", roleEmoji: "🎯" });
  });
});

describe("buildCreatePayload 组装", () => {
  it("含成员：members 带 agentId/roleTitle/agentName，memberAgentIds 空数组", () => {
    const selected: WizardMember[] = [
      toggleMember([], { agent: agent(1, "阿设"), roleTitle: "设计师", roleEmoji: "🎨" })[0],
    ];
    const dto = buildCreatePayload({ name: "内容团队", description: "   " }, selected);
    expect(dto.name).toBe("内容团队");
    expect(dto.description).toBeUndefined();
    expect(dto.members).toEqual([
      expect.objectContaining({
        agentId: 1,
        agentName: "阿设",
        roleTitle: "设计师",
        roleEmoji: "🎨",
        themeColor: expect.any(String),
      }),
    ]);
    expect(dto.memberAgentIds).toBeUndefined();
  });

  it("无成员：members undefined，memberAgentIds 空数组", () => {
    const dto = buildCreatePayload({ name: " 空白团队 " }, []);
    expect(dto.members).toBeUndefined();
    expect(dto.memberAgentIds).toEqual([]);
  });

  it("职能缺失时默认 团队成员", () => {
    const selected: WizardMember[] = [toggleMember([], { agent: agent(7, "小X") })[0]];
    const dto = buildCreatePayload({ name: "x" }, selected);
    expect(dto.members?.[0].roleTitle).toBe("团队成员");
  });
});

describe("findUncreatedTemplates / templateTeamName 未创建模板卡", () => {
  it("已创建同名团队不重复出现未创建卡", () => {
    const un = findUncreatedTemplates([{ name: "内容团队" }, { name: "随便一个团队" }]);
    expect(un.map((t) => t.id)).toEqual(["operations", "ecommerce"]);
  });

  it("templateTeamName 去掉模板后缀", () => {
    expect(templateTeamName(tpl("content"))).toBe("内容团队");
    expect(templateTeamName(tpl("blank"))).toBe("空白团队");
  });
});

describe("countWeekOutput 本周产出（最近 7 天已完成任务数）", () => {
  it("只统计最近 7 天 completed，completedAt 缺失回退 createdAt", () => {
    const now = new Date("2026-08-19T12:00:00");
    const tasks: TeamTask[] = [
      { id: 1, teamId: 1, title: "t1", status: "completed", priority: "medium", creatorId: 1, createdAt: "2026-08-01T00:00:00", completedAt: "2026-08-18T00:00:00" },
      { id: 2, teamId: 1, title: "t2", status: "completed", priority: "medium", creatorId: 1, createdAt: "2026-08-01T00:00:00", completedAt: "2026-08-12T00:00:00" },
      { id: 3, teamId: 1, title: "t3", status: "in_progress", priority: "medium", creatorId: 1, createdAt: "2026-08-01T00:00:00", completedAt: "2026-08-18T00:00:00" },
      { id: 4, teamId: 1, title: "t4", status: "completed", priority: "medium", creatorId: 1, createdAt: "2026-08-19T00:00:00" },
      { id: 5, teamId: 1, title: "t5", status: "completed", priority: "medium", creatorId: 1, createdAt: "2026-08-13T00:00:00", completedAt: "2026-08-13T00:00:00" },
    ];
    // 边界：08-13 00:00 恰在窗口起点（08-19 减 6 天）内 → 计入
    expect(countWeekOutput(tasks, now)).toBe(3);
  });

  it("空数组返回 0", () => {
    expect(countWeekOutput([], new Date("2026-08-19T12:00:00"))).toBe(0);
  });
});
