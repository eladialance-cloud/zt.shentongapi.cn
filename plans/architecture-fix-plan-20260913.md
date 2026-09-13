# 深瞳桌面端 P0 修复实施方案（2026-09-13）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**给非技术读者的三句话**

1. 这一轮一共 5 件事，都是小改动，改完立刻能自动验证，不需要重装软件、不碰服务器和数据库。
2. 其中 3 件是修 bug：官署的"工作手册"每次开机被改回模板、删官署时可能删错定时任务、同一批定时任务有两套程序在管可能重复执行；第 4 件是删掉已经没人用的废代码；第 5 件是把「素材库」和「素材管理」这对双胞胎入口并成一个（顺带删掉里面重复的那个标签页）。
3. 每一件都先写"自动检查"再改代码，改完跑一遍证明真的生效；一次只提交一件事，随时可以停。

**Goal:** 修复官署（三省六部）与定时任务链路上的 3 个确定性缺陷，并清理 2 处确认无用的死代码；同时把「素材库」与「素材管理」合并为单一入口（删除重复的「融合素材」面板），全部带自动化测试。

**Architecture:** 保持现有架构不变（官署真源仍在桌面端、定时任务定义仍由后端 `/scheduled-tasks` 承载）。本轮只收敛"写入方唯一"与"执行方唯一"两个原则：SOUL.md 只能由一个函数写；定时任务只能由一套调度器执行。

**Tech Stack:** Electron（主进程 TypeScript）+ React + Jest（`desktop/tests/unit/**`，`npx jest`）+ node:test（`npx tsx --test`）。

**Spec:** 本次架构审查报告（对话中的结论，含后端/桌面端/跨端三份只读审查 + 复核记录）。本方案只覆盖其中的 P0 部分。

## Global Constraints

- 全部改动只涉及 `desktop/`；**不得修改** `backend/`、`frontend/`、服务器文件与数据库。
- 不新增任何依赖（`package.json` 的 dependencies/devDependencies 保持不变）。
- 每个任务完成前必须通过：`cd desktop; npm run typecheck`（内部即 `tsc --noEmit` 两遍：node + web 配置）。
- 每个任务完成前必须通过：`cd desktop; npx jest`（基线：92 套件 / 864 用例全绿）。
- 提交信息用中文，格式 `fix(范围): 说明` / `chore(范围): 说明`；**一次提交只做一个任务**。
- 环境是 Windows + PowerShell；不要用 `bash` 语法。
- **禁止扩展范围**：本方案未列出的"顺手优化"一律不做（例如不要顺手改 `Chat/` 目录里被复用的组件）。
- 已核实的事实（勿重复调查，直接引用）：
  - `desktop/electron/main/cron-engine.ts:105,110` 主进程引擎默认 `enabled = true`，能力与渲染层 runner 等价（fire → flow/llm → fired）。
  - `desktop/src/components/MainLayout/index.tsx:63-66` 挂载时**无条件**启动渲染层 runner；`:69-77` 只在收到主进程 `state` 事件后才停它 → 启动瞬间存在双跑窗口。
  - `desktop/src/pages/Chat/index.tsx` 是孤儿页面（无任何 import），但 `desktop/src/pages/Chat/` 下的组件被 `HermesChat` 大量复用，**禁止删除目录**。
  - `/briefs`、`/plugins*`、`/creator*` 路由**不是**死路由（被详情页/插件页内部 `navigate()` 使用），本轮不动。

---

## Task 1: 官署 SOUL（工作手册）改为"唯一写入方 + 始终渲染飞书链接"

**问题（大白话）**：一键组队时写进 `SOUL.md` 的是替换过飞书表格链接的版本；但每次软件启动，引导流程用原始蓝本**整文件覆盖**回去，链接变回占位符 `{{FEISHU_DOC:...}}`，官署就找不到台账了。

**修复原则**：只保留一个写 SOUL 的函数 `writeRenderedSoul`，启动引导与一键组队都调它，且都做占位符渲染。

**Files:**
- Modify: `desktop/electron/main/official-detail.ts`（新增 `writeRenderedSoul`，放在 `renderSoulWithTables` 之后）
- Modify: `desktop/electron/main/edict-bridge.ts:190-194`（改用渲染写入）
- Modify: `desktop/electron/main/team-ipc.ts:104-125`（`writeOfficialSoul` 改为委托 `writeRenderedSoul`）
- Test: `desktop/tests/unit/official-detail.test.ts`（新增用例）

**Interfaces:**
- Produces: `writeRenderedSoul(soulSrcFile: string, soulDstFile: string, tables: OfficialTableEntry[]): { ok: boolean; replaced: number; missing: string[]; error?: string }`
- Consumes: 现有 `renderSoulWithTables(soul: string, tables: OfficialTableEntry[])`（`official-detail.ts:128`）与 `getOfficialTables(dataRoot: string, agentId: string): OfficialTableEntry[]`（`official-detail.ts:83`）
- `edict-bridge.ts` 追加 import：`import { writeRenderedSoul, getOfficialTables } from "./official-detail";`（`official-detail.ts` 不反向依赖 `edict-bridge`，无循环依赖）

- [ ] **Step 1: 写失败测试**

在 `desktop/tests/unit/official-detail.test.ts` 顶部 import 块加入 `writeRenderedSoul`，文件末尾追加：

```ts
describe("writeRenderedSoul", () => {
  test("把蓝本占位符渲染后写入目标文件", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "st-soul-"));
    const src = path.join(root, "zhongshu.md");
    const dst = path.join(root, "profile", "SOUL.md");
    fs.writeFileSync(src, "# 中书省\n| 表 | 链接 |\n| 方案表 | {{FEISHU_DOC:中书省·方案表}} |", "utf-8");
    const r = writeRenderedSoul(src, dst, [
      { envKey: "FEISHU_PLAN_TABLE", name: "中书省·方案表", url: "https://feishu.cn/base/abc" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.replaced).toBe(1);
    expect(fs.readFileSync(dst, "utf-8")).toContain("https://feishu.cn/base/abc");
    expect(fs.readFileSync(dst, "utf-8")).not.toContain("{{FEISHU_DOC:");
  });

  test("没有链接时保留占位符并计入 missing（不伪造链接）", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "st-soul-"));
    const src = path.join(root, "bingbu.md");
    const dst = path.join(root, "profile", "SOUL.md");
    fs.writeFileSync(src, "{{FEISHU_DOC:兵部·业务拓展表}}", "utf-8");
    const r = writeRenderedSoul(src, dst, []);
    expect(r.ok).toBe(true);
    expect(r.replaced).toBe(0);
    expect(r.missing).toContain("兵部·业务拓展表");
    expect(fs.readFileSync(dst, "utf-8")).toContain("{{FEISHU_DOC:兵部·业务拓展表}}");
  });

  test("蓝本缺失时返回错误且不写目标文件", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "st-soul-"));
    const dst = path.join(root, "profile", "SOUL.md");
    const r = writeRenderedSoul(path.join(root, "nope.md"), dst, []);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("蓝本 SOUL 不存在");
    expect(fs.existsSync(dst)).toBe(false);
  });
});
```

若该测试文件的 import 区没有 `fs` / `os` / `path`，一并补上：

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd desktop; npx jest --testPathPattern official-detail`
Expected: FAIL，报 `writeRenderedSoul is not a function`（或 TS 报未导出）。

- [ ] **Step 3: 实现 writeRenderedSoul**

在 `desktop/electron/main/official-detail.ts` 的 `renderSoulWithTables` 之后追加：

```ts
/**
 * 用蓝本 SOUL 渲染占位符后写入 profile（唯一的 SOUL 写入入口）。
 * 启动引导（edict-bridge）与一键组队（team-ipc）都走这里，避免两套写法互相覆盖：
 * 曾经启动引导直接 copyFileSync 蓝本，把已渲染的飞书链接冲回占位符。
 */
export function writeRenderedSoul(
  soulSrcFile: string,
  soulDstFile: string,
  tables: OfficialTableEntry[],
): { ok: boolean; replaced: number; missing: string[]; error?: string } {
  try {
    if (!fs.existsSync(soulSrcFile)) {
      return { ok: false, replaced: 0, missing: [], error: `蓝本 SOUL 不存在：${soulSrcFile}` };
    }
    const soul = fs.readFileSync(soulSrcFile, "utf-8");
    const rendered = renderSoulWithTables(soul, tables);
    fs.mkdirSync(path.dirname(soulDstFile), { recursive: true });
    fs.writeFileSync(soulDstFile, rendered.content, "utf-8");
    return { ok: true, replaced: rendered.replaced, missing: rendered.missing };
  } catch (err) {
    return { ok: false, replaced: 0, missing: [], error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd desktop; npx jest --testPathPattern official-detail`
Expected: PASS（原有用例 + 新增 3 个）。

- [ ] **Step 5: 启动引导改用渲染写入**

`desktop/electron/main/edict-bridge.ts` 顶部追加 import：

```ts
import { writeRenderedSoul, getOfficialTables } from "./official-detail";
```

把 `:190-194` 这段：

```ts
      // 注入官署 SOUL.md：每次启动从蓝本覆盖（官署人设由应用管理，保证与安装包版本一致；
      // 用户自定义走「技能市场」，不在此处保留旧 SOUL）
      const soulSrc = path.join(soulDir, id + ".md");
      const soulDst = path.join(profileDir, "SOUL.md");
      if (fs.existsSync(soulSrc)) fs.copyFileSync(soulSrc, soulDst);
```

替换为：

```ts
      // 注入官署 SOUL.md：每次启动从蓝本重渲染（官署人设由应用管理，保证与安装包版本一致；
      // 用户自定义走「技能市场」，不在此处保留旧 SOUL）。
      // 注意：必须走与一键组队相同的渲染写入，否则会把已替换的飞书表链接冲回占位符。
      const soulSrc = path.join(soulDir, id + ".md");
      const soulDst = path.join(profileDir, "SOUL.md");
      if (fs.existsSync(soulSrc)) {
        writeRenderedSoul(soulSrc, soulDst, getOfficialTables(getEdictDataRoot(), id));
      }
```

- [ ] **Step 6: 一键组队改为同一入口**

`desktop/electron/main/team-ipc.ts` 的 `writeOfficialSoul`（`:105-125`）内部实现替换为委托调用（保留原有 id 校验与错误文案，返回值形状不变）：

```ts
/** 写某官署 SOUL：蓝本 → 占位符替换 → profile/SOUL.md（委托 official-detail 的唯一写入方） */
export function writeOfficialSoul(
  edictProfilesDir: string,
  edictDataRoot: string,
  hermesHome: string,
  official: string,
): { ok: boolean; error?: string; replaced?: number; missing?: string[] } {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(official)) return { ok: false, error: "非法官署 id" };
  const src = path.join(edictProfilesDir, `${official}.md`);
  if (!fs.existsSync(src)) return { ok: false, error: `蓝本 SOUL 不存在：${official}.md` };
  const r = writeRenderedSoul(src, path.join(hermesHome, "profiles", official, "SOUL.md"), getOfficialTables(edictDataRoot, official));
  return r.ok ? { ok: true, replaced: r.replaced, missing: r.missing } : { ok: false, error: r.error };
}
```

`team-ipc.ts` 顶部 import 从 `import { getOfficialTables, renderSoulWithTables } from "./official-detail";` 改为：

```ts
import { getOfficialTables, writeRenderedSoul } from "./official-detail";
```

- [ ] **Step 7: 全量验证**

Run:
```powershell
cd desktop
npm run typecheck
npx jest
```
Expected: typecheck 无输出且退出码 0；jest `92 passed`、`864 passed`（若新增用例让总数增加属正常，套件数不变）。

- [ ] **Step 8: 提交**

```powershell
git add desktop/electron/main/official-detail.ts desktop/electron/main/edict-bridge.ts desktop/electron/main/team-ipc.ts desktop/tests/unit/official-detail.test.ts
git commit -m "fix(edict): SOUL 写入收敛为唯一入口并始终渲染飞书表链接，修复启动覆盖"
```

---

## Task 2: 删官署时精确匹配定时任务（修"同名误删"）

**问题（大白话）**：删官署时，程序是按"任务标题相同"去找定时任务删掉的。如果两个官署或用户手建的定时任务重名，就会删错别人的任务。

**修复原则**：只删同时满足 `agentId = 该官署` + `标题相同` + `执行时刻相同` + `星期相同` 的那一条；顺便把"每条任务都请求一次列表"改成只请求一次。

**Files:**
- Modify: `desktop/electron/main/team-ipc.ts:237-274`（`removeOfficial`）
- Test: Create `desktop/tests/unit/team-remove-official.test.ts`

**Interfaces:**
- Consumes: `exprToRunTime(expr: string): string`（`team-ipc.ts:218`）、`exprToWeekday(expr: string): number | undefined`（`team-ipc.ts:227`）、`DEFAULT_CRONS`（`team-ipc.ts:31`）
- Produces: `removeOfficial(deps: TeamIpcDeps, official: string): Promise<{ ok: boolean; error?: string }>`（签名不变，返回形状不变，调用方无需改动）

- [ ] **Step 1: 写失败测试**

新建 `desktop/tests/unit/team-remove-official.test.ts`：

```ts
// 删官署的定时任务必须精确匹配，避免同名误删（2026-09-13 架构审查 P0）
jest.mock("electron", () => ({ ipcMain: { handle: () => {}, removeHandler: () => {} } }));

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { removeOfficial } from "../../electron/main/team-ipc";

interface FakeCall { method: string; url: string }

function makeDeps(home: string, calls: FakeCall[], items: unknown[], token = "tok") {
  const fetchImpl = (async (url: string, init?: { method?: string }) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url) });
    return { ok: true, json: async () => (method === "GET" ? { data: items } : { code: 0 }) } as unknown as Response;
  }) as unknown as typeof fetch;
  return {
    hermesHome: home,
    edictProfilesDir: home,
    edictDataRoot: home,
    initBitable: async () => ({ ok: true }),
    ensureAgents: async () => ({ ok: true, created: [] }),
    stApiBase: "https://api.test",
    getAuthToken: () => token,
    fetchImpl,
  };
}

describe("removeOfficial", () => {
  test("只删 agentId+标题+时间+星期 全匹配的那条", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "st-rm-"));
    const calls: FakeCall[] = [];
    const items = [
      { id: 11, title: "中书省·每日方案规划", agentId: "zhongshu", runTime: "07:00", weekday: null },
      { id: 12, title: "中书省·每日方案规划", agentId: "hubu", runTime: "07:00", weekday: null },
      { id: 13, title: "中书省·每日方案规划", agentId: "zhongshu", runTime: "08:00", weekday: null },
    ];
    const r = await removeOfficial(makeDeps(home, calls, items) as never, "zhongshu");
    expect(r.ok).toBe(true);
    const deletes = calls.filter((c) => c.method === "DELETE").map((c) => c.url);
    expect(deletes).toEqual(["https://api.test/scheduled-tasks/11"]);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  test("删掉官署的 profile 目录", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "st-rm-"));
    const dir = path.join(home, "profiles", "gongbu");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SOUL.md"), "x", "utf-8");
    const r = await removeOfficial(makeDeps(home, [], []) as never, "gongbu");
    expect(r.ok).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  test("未登录时不发请求，但目录仍被删除", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "st-rm-"));
    fs.mkdirSync(path.join(home, "profiles", "libu"), { recursive: true });
    const calls: FakeCall[] = [];
    const r = await removeOfficial(makeDeps(home, calls, [], "") as never, "libu");
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(0);
    expect(fs.existsSync(path.join(home, "profiles", "libu"))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd desktop; npx jest --testPathPattern team-remove-official`
Expected: FAIL —— 第一条用例的 `deletes` 会是 3 个 id（当前实现按标题匹配，会把 12/13 一起删掉）。

- [ ] **Step 3: 重写 removeOfficial**

用下面整段替换 `desktop/electron/main/team-ipc.ts` 中现有的 `removeOfficial`（原 `:237-274`）：

```ts
/** 删除官署：删 profile 目录 + 该官署的定时任务（按 agentId+标题+时间+星期 精确匹配，避免同名误删） */
export async function removeOfficial(
  deps: TeamIpcDeps,
  official: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(official)) return { ok: false, error: "非法官署 id" };
  // 删 profile 目录
  try {
    const dir = path.join(deps.hermesHome, "profiles", official);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  // 删该官署的默认定时任务：列表只取一次，逐条按四要素精确匹配
  const list = DEFAULT_CRONS[official] ?? [];
  if (list.length === 0) return { ok: true };
  const token = deps.getAuthToken();
  const f = deps.fetchImpl || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!token || !f) return { ok: true };
  try {
    const res = await f(`${deps.stApiBase}/scheduled-tasks?agentId=${encodeURIComponent(official)}`, {
      method: "GET",
      headers: authHeaders(token),
    });
    const json = (await res.json()) as {
      data?: Array<{
        id?: number | string;
        title?: string;
        agentId?: string | null;
        runTime?: string | null;
        weekday?: number | null;
      }>;
    };
    const items = Array.isArray(json.data) ? json.data : [];
    for (const c of list) {
      const wantRunTime = exprToRunTime(c.expr);
      const wantWeekday = exprToWeekday(c.expr) ?? null;
      const hit = items.filter(
        (it) =>
          it.id !== undefined &&
          it.title === c.name &&
          (it.agentId ?? "") === official &&
          (it.runTime ?? "") === wantRunTime &&
          (it.weekday ?? null) === wantWeekday,
      );
      for (const it of hit) {
        await f(`${deps.stApiBase}/scheduled-tasks/${it.id}`, { method: "DELETE", headers: authHeaders(token) });
      }
    }
  } catch {
    // 清理定时任务失败不应阻塞删官署
  }
  return { ok: true };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd desktop; npx jest --testPathPattern team-remove-official`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 全量验证**

Run:
```powershell
cd desktop
npm run typecheck
npx jest
```
Expected: typecheck 退出码 0；jest 全绿（套件数 93）。

- [ ] **Step 6: 提交**

```powershell
git add desktop/electron/main/team-ipc.ts desktop/tests/unit/team-remove-official.test.ts
git commit -m "fix(edict): 删官署改用 agentId+标题+时间精确匹配，修复同名误删定时任务"
```

---

## Task 3: 定时任务只由一套调度器执行（修"可能重复执行"）

**问题（大白话）**：同一批定时任务有两套程序在管——渲染层（界面里的）和主进程（后台常驻的）。它们靠"收到对方开关事件就停自己"来避免重复。但界面一打开就无条件启动了渲染层那套，而主进程那套默认是开着的，**启动瞬间两边都会跑**。万一事件没收到，就重复触发 → 重复发内容、重复扣费。

**修复原则**：先问主进程引擎的状态，再决定谁来跑。主进程开着 → 渲染层不启动。

**Files:**
- Create: `desktop/src/scheduler/scheduler-mode.ts`
- Modify: `desktop/src/components/MainLayout/index.tsx:62-77`
- Test: Create `desktop/tests/unit/scheduler-mode.test.ts`

**Interfaces:**
- Produces: `decideSchedulerMode(engineState: { enabled?: boolean } | null | undefined, hasEngineApi: boolean): "main" | "renderer"`
- Consumes: `startScheduledRunner(getToken)` / `stopScheduledRunner()`（`@/scheduler/scheduled-runner`，已有）；`window.electronAPI.cronEngine.getState()` / `.onEvent()`（`desktop/electron/preload/index.ts:368-379`，已有，**无需改 preload 与主进程**）

- [ ] **Step 1: 写失败测试**

新建 `desktop/tests/unit/scheduler-mode.test.ts`：

```ts
// 定时任务执行方判定：主进程引擎开着时渲染层必须让位（2026-09-13 架构审查 P0）
import { decideSchedulerMode } from "../../src/scheduler/scheduler-mode";

describe("decideSchedulerMode", () => {
  test("主进程引擎开启 → main", () => {
    expect(decideSchedulerMode({ enabled: true }, true)).toBe("main");
  });
  test("主进程引擎关闭 → renderer", () => {
    expect(decideSchedulerMode({ enabled: false }, true)).toBe("renderer");
  });
  test("没有 cronEngine 接口（非 Electron 环境）→ renderer", () => {
    expect(decideSchedulerMode(null, false)).toBe("renderer");
  });
  test("接口在但取不到状态 → renderer（渲染层兜底，保证任务不被漏跑）", () => {
    expect(decideSchedulerMode(null, true)).toBe("renderer");
    expect(decideSchedulerMode(undefined, true)).toBe("renderer");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd desktop; npx jest --testPathPattern scheduler-mode`
Expected: FAIL，`Cannot find module '../../src/scheduler/scheduler-mode'`。

- [ ] **Step 3: 实现判定函数**

新建 `desktop/src/scheduler/scheduler-mode.ts`：

```ts
// 定时任务执行方判定（纯函数，便于单测）
//
// 背景：定时任务曾由两套调度器执行 —— 主进程常驻引擎（cron-engine，窗口关闭仍跑）
// 与渲染层轮询（scheduled-runner，关窗口即停）。两者靠事件互停避免双触发，但启动瞬间
// 存在双跑窗口。这里把「谁来跑」变成一次显式判定：主进程开着就不启动渲染层。
export type SchedulerMode = "main" | "renderer";

export function decideSchedulerMode(
  engineState: { enabled?: boolean } | null | undefined,
  hasEngineApi: boolean,
): SchedulerMode {
  if (!hasEngineApi) return "renderer";
  return engineState?.enabled === true ? "main" : "renderer";
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd desktop; npx jest --testPathPattern scheduler-mode`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 接到 MainLayout 上**

`desktop/src/components/MainLayout/index.tsx` 中，把 `:62-77` 这两个 effect：

```tsx
  // 定时任务调度器：软件开着才执行（登录后启动，30s 轮询到期任务 → Hermes 编排）
  useEffect(() => {
    startScheduledRunner(() => useAuthStore.getState().accessToken);
    return () => stopScheduledRunner();
  }, []);

  // 主进程「后台常驻」引擎状态变化：开启时停用渲染层轮询，避免双触发
  useEffect(() => {
    const api = window.electronAPI?.cronEngine;
    if (!api?.onEvent) return;
    return api.onEvent((payload) => {
      if (payload?.type !== "state") return;
      if (payload.enabled) stopScheduledRunner();
      else startScheduledRunner(() => useAuthStore.getState().accessToken);
    });
  }, []);
```

替换为：

```tsx
  // 定时任务执行方：先问主进程常驻引擎的状态，再决定谁跑（避免启动瞬间双跑）
  const [schedulerMode, setSchedulerMode] = useState<SchedulerMode>("renderer");

  useEffect(() => {
    let cancelled = false;
    const api = window.electronAPI?.cronEngine;
    const hasApi = !!api?.getState;
    const apply = (state: { enabled?: boolean } | null | undefined) => {
      if (cancelled) return;
      setSchedulerMode(decideSchedulerMode(state, hasApi));
    };
    if (hasApi) api.getState().then(apply).catch(() => apply(null));
    else apply(null);
    const unsubscribe = api?.onEvent?.((payload) => {
      if (payload?.type === "state") apply(payload);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // 只有判定为「渲染层执行」时才启动轮询；主进程引擎负责时渲染层保持停止
  useEffect(() => {
    if (schedulerMode !== "renderer") {
      stopScheduledRunner();
      return;
    }
    startScheduledRunner(() => useAuthStore.getState().accessToken);
    return () => stopScheduledRunner();
  }, [schedulerMode]);
```

并在该文件顶部补 import（若 `useState` 已有则只加第二行）：

```tsx
import { decideSchedulerMode, type SchedulerMode } from "@/scheduler/scheduler-mode";
```

- [ ] **Step 6: 全量验证**

Run:
```powershell
cd desktop
npm run typecheck
npx jest
```
Expected: typecheck 退出码 0；jest 全绿（套件数 94）。

- [ ] **Step 7: 手工验证（必须做，测试覆盖不到启动时序）**

Run: `cd desktop; npm run dev`
检查：① 软件正常启动，任务中心 → 定时任务页签能正常列出任务；② 打开"设置 → 服务/后台常驻"开关切换一次，观察控制台**只应出现一个**调度器在轮询（主进程引擎开启时不再出现渲染层的 `[scheduled-runner]` 日志）；③ 关掉主进程引擎开关后，渲染层轮询日志恢复。

- [ ] **Step 8: 提交**

```powershell
git add desktop/src/scheduler/scheduler-mode.ts desktop/src/components/MainLayout/index.tsx desktop/tests/unit/scheduler-mode.test.ts
git commit -m "fix(scheduler): 定时任务执行方显式判定，主进程引擎开启时渲染层不再轮询"
```

---
## Task 4: 删除确认无用的死代码

**问题（大白话）**：有两处代码谁也用不到，留着只会让人看错、让搜索变慢。

**核实过的事实**：
- `desktop/src/pages/CardShowcase/`：整个目录没有路由、没有任何文件 import 它（只有它自己内部互相引用）。
- `desktop/src/pages/Chat/index.tsx`：36KB 的旧聊天页面，没有任何地方 import 它（`/chat` 路由指向的是 `desktop/src/router/index.tsx:79` 的 `ChatRedirect`，它直接跳到"深瞳机器人"）。
- ⚠️ **绝对不能删整个 `Chat/` 目录**：`Chat/components/MessageInput`、`SessionList`、`ConversationSettings`、`MediaGenerationModal`、`ScheduleModal`、`schedule-intent`、`DemandMode`、`demand-schema` 都被 `HermesChat` 与单测使用。

**Files:**
- Delete: `desktop/src/pages/CardShowcase/`（整个目录，含 4 个文件）
- Delete: `desktop/src/pages/Chat/index.tsx`（仅此一个文件）
- Modify: 无（不动路由，不动 `Chat/` 其余文件）

- [ ] **Step 1: 复核无引用（必须做，输出不符就停下并汇报）**

```powershell
cd desktop
rg -n "CardShowcase" src tests
rg -n 'from "@/pages/Chat"' src tests
```
Expected:
- 第一条：只应出现 `src\pages\CardShowcase\` 目录内部的行（`index.ts`、`CardShowcase.tsx`、`CardShowcase.module.css`）；出现其它路径 = 有引用，**停止任务**。
- 第二条：无输出。

- [ ] **Step 2: 删除**

```powershell
cd desktop
Remove-Item -LiteralPath "src\pages\CardShowcase" -Recurse -Force
Remove-Item -LiteralPath "src\pages\Chat\index.tsx" -Force
```

- [ ] **Step 3: 验证编译与测试**

```powershell
cd desktop
npm run typecheck
npx jest
```
Expected: typecheck 退出码 0；jest 全绿（套件数 94、用例数与 Task 3 后一致）。

- [ ] **Step 4: 手工验证（共用组件页必须点开一次）**

Run: `cd desktop; npm run dev`
检查：打开"深瞳机器人"页面 → 能正常发消息、历史会话列表、附件按钮、定时任务弹窗（`ScheduleModal`）都在；打开"任务中心"正常。

- [ ] **Step 5: 提交**

```powershell
git add -A desktop/src/pages/CardShowcase desktop/src/pages/Chat/index.tsx
git commit -m "chore(desktop): 删除无引用的 CardShowcase 页面与 Chat 孤儿页面"
```

---

## Task 5: 「素材库」与「素材管理」合并为单一入口（素材共用）

**问题（大白话）**：左侧导航里有两个像双胞胎的入口——「素材库」和「素材管理」。打开「素材管理」会发现，第 2 个标签「融合素材」其实就是「素材库」的简化复制品：一样列出图片/视频、一样能登记素材，只是少了归档、筛选和语义检索。同一份素材有两个门进，用户不知道走哪个，代码还维护两份。

**修复原则**：只留「素材库」一个门，素材天然共用：

- 「素材管理」里真正有价值的 4 个标签（合成视频 / 形象视频 / 音频素材 / 知识库）搬进素材库，成为素材库页面的标签页；
- 重复的「融合素材」标签**直接删除**（素材库本体就是它）；
- 老地址 `/materials` 自动跳到 `/assets`，侧边栏只留「素材库」一项；
- 不做后端改造：搬过来的 4 个标签用的还是原来那些接口，一个接口都没动。

**为什么以「素材库」为宿主，而不是反过来**：素材库是真正的主数据页（有归档、类型筛选、语义索引、任务产出登记，用 `@/api/media-asset-api`）；「素材管理」只是只读聚合（用 `@/api/media-assets-api`）。而且导航里「素材库」排在前面、名字更通用。

**核实过的事实（勿重复调查）**：

- `desktop/src/router/index.tsx:57` 是 `@/pages/Materials` 的唯一引用点；页面本身在 `:109`。
- `/materials` 这个地址在 `src/` 里只有侧边栏 `desktop/src/components/Sidebar/index.tsx:48` 一处引用（`/oral-workshop/materials` 是另一个页面，不动）。
- `desktop/tests/unit/materials.test.ts` 是断言旧 5 标签的唯一测试，必须同步改写。
- `desktop/src/pages/Materials/index.tsx` 的分区行号：合成视频 `47-117`、融合素材 `118-207`、形象视频 `208-312`、音频素材 `313-394`、知识库 `395-479`、页面外壳 `480-505`。
- `desktop/tsconfig*.json` 没有开 `noUnusedLocals`，未用 import 不会让 typecheck 失败；`npm run lint` 实际就是 `typecheck`（无 eslint），故删除 `Library` 图标 import 属清理而非必需。

**Files:**

- Move: `desktop/src/pages/Assets/index.tsx` → `desktop/src/pages/Assets/AssetLibrary.tsx`（原网格本体，默认导出改名 `AssetLibraryTab`）
- Rewrite: `desktop/src/pages/Assets/index.tsx`（新外壳：页头 + 5 个标签）
- Create: `desktop/src/pages/Assets/tabs.ts`（`ASSET_LIBRARY_TABS`）
- Create: `desktop/src/pages/Assets/panels/shared.ts`（`fmtTime`）
- Create: `desktop/src/pages/Assets/panels/ComposeTab.tsx`（内容取自原 `Materials/index.tsx:47-117`）
- Create: `desktop/src/pages/Assets/panels/DigitalTab.tsx`（内容取自原 `Materials/index.tsx:208-312`）
- Create: `desktop/src/pages/Assets/panels/AudioTab.tsx`（内容取自原 `Materials/index.tsx:313-394`）
- Create: `desktop/src/pages/Assets/panels/KnowledgeTab.tsx`（内容取自原 `Materials/index.tsx:395-479`）
- Delete: `desktop/src/pages/Materials/`（`index.tsx` + `tabs.ts`，含重复的 `FusionTab`）
- Modify: `desktop/src/router/index.tsx:57,109`
- Modify: `desktop/src/components/Sidebar/index.tsx:29,47-48` 与其文件头注释 `:3`
- Test: Delete `desktop/tests/unit/materials.test.ts`；Create `desktop/tests/unit/asset-page-tabs.test.ts`

**Interfaces:**

- Produces: `ASSET_LIBRARY_TABS: readonly { key: "library" | "compose" | "digital" | "audio" | "knowledge"; label: string }[]`
- Produces（4 个面板组件，具名导出、无 props）: `ComposeTab()`、`DigitalTab()`、`AudioTab()`、`KnowledgeTab()`
- Consumes（契约一律不改）: `@/api/oral-workshop-api`、`@/api/knowledge-api`、`@/utils/media`、`@/types/oral-workshop`、`@/types/knowledge`、`./asset-group`、`./styles.module.css`

- [ ] **Step 1: 新建面板目录并搬 4 个面板（只搬不改，一行逻辑都不动）**

```powershell
cd desktop
New-Item -ItemType Directory -Force -Path "src\pages\Assets\panels" | Out-Null
```

先建 `desktop/src/pages/Assets/panels/shared.ts`：

```ts
/** 素材库页面板共用工具（2026-09-13 由原「素材管理」页并入，逻辑保持原样） */
export function fmtTime(v?: string | Date | null): string {
  if (!v) return '-'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('zh-CN', { hour12: false })
}
```

然后按下面 4 组「新文件头 + 原文件行区间」建文件。**行区间内一个字都不改**，唯一改动是函数名前的 `function` 改成 `export function`，并 `import { fmtTime } from './shared'` 替掉原先同文件内的定义。

组 1 —— 新文件 `panels/ComposeTab.tsx`，正文取 `src/pages/Materials/index.tsx` 第 `47-117` 行（`ComposeTab`）：

```tsx
// Tab：合成视频（口播工坊成片）—— 2026-09-13 由原「素材管理」页并入素材库
import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Tag, Table, Modal, Space, Spin, message } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { listOralWorkshopJobs } from '@/api/oral-workshop-api'
import type { OralWorkshopJob } from '@/types/oral-workshop'
import { resolveMediaUrl } from '@/utils/media'
import { fmtTime } from './shared'
```

组 2 —— 新文件 `panels/DigitalTab.tsx`，正文取 `src/pages/Materials/index.tsx` 第 `208-312` 行（`DigitalTab`）：

```tsx
// Tab：形象视频（我的数字人形象）—— 2026-09-13 由原「素材管理」页并入素材库
import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Drawer, Empty, Popconfirm, Space, Spin, Table, Tag, Upload, message } from 'antd'
import { ReloadOutlined, UserOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { deleteMyDigitalHuman, listMyDigitalHumans, uploadDigitalHumanVideo } from '@/api/oral-workshop-api'
import type { DigitalHumanAsset } from '@/types/oral-workshop'
import { resolveMediaUrl } from '@/utils/media'
import { fmtTime } from './shared'
```

组 3 —— 新文件 `panels/AudioTab.tsx`，正文取 `src/pages/Materials/index.tsx` 第 `313-394` 行（`AudioTab`）：

```tsx
// Tab：音频素材（我的声音 / 声音克隆）—— 2026-09-13 由原「素材管理」页并入素材库
import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Form, Input, Modal, Popconfirm, Spin, Table, Tag, message } from 'antd'
import { AudioOutlined, ReloadOutlined } from '@ant-design/icons'
import { createMyVoice, deleteMyVoice, listMyVoices } from '@/api/oral-workshop-api'
import type { VoiceAsset } from '@/types/oral-workshop'
import { resolveMediaUrl } from '@/utils/media'
import { fmtTime } from './shared'
```

组 4 —— 新文件 `panels/KnowledgeTab.tsx`，正文取 `src/pages/Materials/index.tsx` 第 `395-479` 行（`KnowledgeTab`）：

```tsx
// Tab：知识库（知识库与文档只读聚合）—— 2026-09-13 由原「素材管理」页并入素材库
import { useCallback, useEffect, useState } from 'react'
import { Button, Drawer, Empty, List, Space, Spin, Tag, message } from 'antd'
import { BookOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { listDocuments, listKnowledgeBases } from '@/api/knowledge-api'
import type { KnowledgeBase, KnowledgeDocument } from '@/types/knowledge'
import { fmtTime } from './shared'
```

**注意**：`FusionTab`（原 `118-207` 行）**不搬**，它就是要删掉的重复实现；它用到的 `@/api/media-assets-api`(`MediaAssetItem`) 与 `TYPE_LABEL` 常量也一并随它作废。

- [ ] **Step 2: 先写测试（此时还没建 `tabs.ts`，应当失败）**

新建 `desktop/tests/unit/asset-page-tabs.test.ts`：

```ts
// 素材库页标签（2026-09-13 原「素材管理」并入素材库）— 结构守卫测试
// 锚点：src/pages/Assets/index.tsx
import { ASSET_LIBRARY_TABS } from '@/pages/Assets/tabs';

describe('素材库页 Tab', () => {
  const labels: readonly string[] = ASSET_LIBRARY_TABS.map((t) => t.label);
  const keys: readonly string[] = ASSET_LIBRARY_TABS.map((t) => t.key);

  it('恰好 5 个 Tab，顺序为 素材库/合成视频/形象视频/音频素材/知识库', () => {
    expect([...labels]).toEqual(['素材库', '合成视频', '形象视频', '音频素材', '知识库']);
  });

  it('Tab key 唯一且非空', () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.length > 0)).toBe(true);
  });

  it('不再包含已删除的「融合素材」（与素材库本体重复）', () => {
    expect(keys).not.toContain('fusion');
    expect(labels).not.toContain('融合素材');
  });
});
```

Run: `cd desktop; npx jest --testPathPattern asset-page-tabs`
Expected: FAIL，`Cannot find module '@/pages/Assets/tabs'`。

- [ ] **Step 3: 建 `tabs.ts` 并跑测试通过**

新建 `desktop/src/pages/Assets/tabs.ts`：

```ts
/**
 * 素材库 · 顶部 Tab 定义（纯数据，无 API 依赖，便于测试与复用）
 *
 * 2026-09-13 合并：原「素材管理」页的 4 个面板并入素材库；
 * 其中的「融合素材」面板与素材库本体重复，已删除（素材库本体即该能力）。
 */
export const ASSET_LIBRARY_TABS = [
  { key: 'library', label: '素材库' },
  { key: 'compose', label: '合成视频' },
  { key: 'digital', label: '形象视频' },
  { key: 'audio', label: '音频素材' },
  { key: 'knowledge', label: '知识库' },
] as const

export type AssetLibraryTabKey = (typeof ASSET_LIBRARY_TABS)[number]['key']
```

Run: `cd desktop; npx jest --testPathPattern asset-page-tabs`
Expected: PASS（3 个用例）。

- [ ] **Step 4: 拆外壳——原网格本体挪成 `AssetLibrary.tsx`，`index.tsx` 变外壳**

```powershell
cd desktop
Move-Item -LiteralPath "src\pages\Assets\index.tsx" -Destination "src\pages\Assets\AssetLibrary.tsx"
```

在 `desktop/src/pages/Assets/AssetLibrary.tsx` 里做**且仅做**这 3 处改动：

1. 文件头注释改成：
```tsx
// 素材库本体（网格视图 + 类型/归档筛选 + 详情弹窗 + 手动登记 + 归档）
// 2026-09-13 起作为素材库页的首个标签页；原「素材管理」页已并入本页
```
2. `export default function AssetsPage() {` → `export default function AssetLibraryTab() {`
3. 把 `:269-283` 这段（外层容器 + 页头）：

```tsx
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><FolderOutlined /></span>
          <span>素材库</span>
        </div>
        <div className={styles.headerActions}>
          <Button className={styles.backBtn} icon={<ReloadOutlined />} onClick={() => void load(page, tab, showArchived)}>刷新</Button>
          <Button type="primary" className={styles.primaryBtn} icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
            登记素材
          </Button>
        </div>
      </div>
```

替换为：

```tsx
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void load(page, tab, showArchived)}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>登记素材</Button>
      </div>
```

**其余一律不动**：内部 `ASSET_TABS`（全部/图片/文案/视频/文档）保留为二级筛选；`Card`、网格、分页、两个 Modal、`./asset-group`、`./styles.module.css` 都原样保留。

然后用下面整段覆盖写 `desktop/src/pages/Assets/index.tsx`：

```tsx
// 素材库（2026-09-13 起合并原「素材管理」页，素材共用一个入口）
// 原「素材管理」的「融合素材」面板与素材库本体重复，已删除；其余 4 个面板并入本页 Tab。
import type { ReactNode } from "react";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { FolderOutlined } from "@ant-design/icons";
import AssetLibraryTab from "./AssetLibrary";
import { AudioTab } from "./panels/AudioTab";
import { ComposeTab } from "./panels/ComposeTab";
import { DigitalTab } from "./panels/DigitalTab";
import { KnowledgeTab } from "./panels/KnowledgeTab";
import { ASSET_LIBRARY_TABS, type AssetLibraryTabKey } from "./tabs";
import styles from "./styles.module.css";

export default function AssetsPage() {
  const panels: Record<AssetLibraryTabKey, ReactNode> = {
    library: <AssetLibraryTab />,
    compose: <ComposeTab />,
    digital: <DigitalTab />,
    audio: <AudioTab />,
    knowledge: <KnowledgeTab />,
  };
  const items: TabsProps["items"] = ASSET_LIBRARY_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    children: panels[t.key],
  }));
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><FolderOutlined /></span>
          <span>素材库</span>
        </div>
      </div>
      <Tabs defaultActiveKey="library" items={items} />
    </div>
  );
}
```

- [ ] **Step 5: 收敛路由与导航**

`desktop/src/router/index.tsx`：

1. 删掉 `:57` 的 `import MaterialsPage from "@/pages/Materials";`
2. `:109` 改成：
```tsx
      { path: "/materials", element: <Navigate to="/assets" replace /> },
```
（`Navigate` 在 `:4` 已 import，无需新增。）

`desktop/src/components/Sidebar/index.tsx`：

1. 删掉 `:48` 整行 `{ key: 'materials', label: '素材管理', icon: Library, path: '/materials' },`
2. 删掉 `:29` 的 `Library,`（该图标仅此处使用）
3. 文件头 `:3` 注释改为：
```tsx
 * 主导航 9 项（工作台/深瞳机器人/任务中心/素材库/发布中心/数据分析/知识库/ST-Claw/口播工坊/AI办公室），固定展开不折叠
```
（注：`素材管理` 已并入 `素材库`，故为 9 项。）

- [ ] **Step 6: 删除旧页面与旧测试**

```powershell
cd desktop
Remove-Item -LiteralPath "src\pages\Materials" -Recurse -Force
Remove-Item -LiteralPath "tests\unit\materials.test.ts" -Force
```

- [ ] **Step 7: 全量验证**

```powershell
cd desktop
npm run typecheck
npx jest
```
Expected: typecheck 退出码 0；jest 全绿（套件数 94：Task 3 后 94，本任务删 1 加 1）。

- [ ] **Step 8: 手工验证（必须做）**

Run: `cd desktop; npm run dev`
检查：
1. 侧边栏只剩一个「素材库」，没有「素材管理」；
2. 素材库页面顶部 5 个标签能逐个点开，原网格（全部/图片/文案/视频/文档、含已归档、登记素材、详情弹窗、归档/语义索引）全部照常；
3. 「合成视频」「形象视频」「音频素材」「知识库」4 个标签内容与合并前一致；
4. 浏览器/哈希地址手输 `#/materials` 应自动落到素材库页面；
5. 「口播工坊 → 素材库」(`/oral-workshop/materials`) 页面不受影响。

- [ ] **Step 9: 提交**

```powershell
git add -A desktop/src/pages/Assets desktop/src/pages/Materials desktop/src/router/index.tsx desktop/src/components/Sidebar/index.tsx desktop/tests/unit/asset-page-tabs.test.ts desktop/tests/unit/materials.test.ts
git commit -m "refactor(assets): 合并「素材库」与「素材管理」为单一入口，删除重复的融合素材面板"
```

---
## 验收清单（改完后你应该看到什么）

| # | 你要验证的现象 | 怎么验证 | 通过标准 |
|---|---|---|---|
| 1 | 官署的"工作手册"不再被改回模板 | 一键组队成功 → 关闭软件再打开 → 打开 `%APPDATA%` 下本应用的 `hermes-home\profiles\zhongshu\SOUL.md` | 里面是真实飞书链接，搜不到 `{{FEISHU_DOC:` |
| 2 | 删官署不再误删定时任务 | 换套餐（旗舰版 → 轻量版），看任务中心定时任务页签 | 只有被裁掉官署的任务消失；其它任务（含手建的）保留 |
| 3 | 定时任务不会重复执行 | 启动软件后看控制台日志；观察某条到点任务的执行记录 | 只有一套调度日志；同一次到点只产生一条执行记录 |
| 4 | 界面无变化、废代码消失 | 正常点一遍深瞳机器人/任务中心 | 功能完全正常；`desktop/src/pages` 下少了 1 个目录 + 1 个文件 |
| 5 | 素材库与素材管理合并成一个入口 | 侧边栏点「素材库」；再手输地址 #/materials | 侧边栏只有一个「素材库」；页面顶部 5 个标签（素材库/合成视频/形象视频/音频素材/知识库）；#/materials 自动跳到素材库 |

**回滚**：每个任务是一个独立提交，出问题执行 `git revert <该提交的 sha>` 即可，互不影响。

---

## 本轮不做什么（第二阶段，需先单独定方案）

| 事项 | 大白话 | 为什么不在本轮 |
|---|---|---|
| 官署任务与执行历史上云 | 换电脑后官署的任务和执行历史都不丢 | 要改数据库表 + 后端接口，属跨端改造 |
| 后端三张任务表合并 + 状态映射统一 | 现在"任务"记了三本账，前后端各一套状态对照 | 改动面最大，影响所有任务相关页面，必须单独排期 |
| 建表双源收敛 | 同样的表结构在两个地方各建一遍，容易不一致 | 涉及数据库迁移历史，风险高 |
| admin-workflow 两份重复 service 合并 | 后端约 120 行几乎逐字重复的代码 | 纯后端重构，与本轮桌面端修复无关 |
| 三省六部状态流转表三副本收敛 | 同一套状态规则抄了三份，改一份漏一份就误报 | 涉及 python 看板脚本，需真机验证 |
| 两个 media API 文件合并 | 同一个后端接口有两个前端封装 | 两边同名函数返回结构不同，要先统一契约（页面级合并已在 Task 5 完成，素材库页已不再依赖 media-assets-api） |
| `/creator*` 市场入口收敛 | 有页面但导航里进不去 | 属产品决策（加导航 or 停用），不是 bug |
| 「一键组队」与「启动自动建 11 个官署」语义重复 | 开机就自动建了 11 个官署，"创建官署"名不副实 | 属产品决策（是否保留自动建、是否改名） |

---

## 自检记录（writing-plans 要求的三项检查）

1. **Spec 覆盖**：审查报告的 P0 全部落到 Task 1（SOUL 覆盖）、Task 2（同名误删）、Task 3（双调度器）、Task 4（死代码）；用户 2026-09-13 追加的「素材库/素材管理合并」落到 Task 5；其余项已逐条登记在"本轮不做什么"，无遗漏。
2. **占位符扫描**：无 TBD / TODO / "补充细节"；每个改动都给出了可直接粘贴的完整代码与预期输出。
3. **类型一致性**：`writeRenderedSoul(srcFile, dstFile, tables)`、`decideSchedulerMode(state, hasApi)`、`removeOfficial(deps, official)` 三处在所有引用点签名一致；Task 1 的 `getOfficialTables(dataRoot, agentId)` 与 `official-detail.ts:83` 现有签名一致。

**对上一版审查报告的更正（本轮复核新发现，避免按错误结论动手）**：
1. `/briefs`、`/plugins*`、`/creator*` **不是**死路由：`Briefs/Detail.tsx:241`、`Briefs/New.tsx:94,167`、`Plugin/index.tsx:182,188,194`、`AgentCreator/*` 内部都有 `navigate()` 在用。上一版"没入口"的说法有误，本轮不动。
2. 「素材库」与「素材管理」**不是**重复功能：前者是素材 CRUD，后者是跨模块只读聚合（口播成片/数字人/声音/知识库）。按用户 2026-09-13 追加要求，本轮改为把两者合并为单一入口（Task 5）：页面级确实重复的是「融合素材」标签（它就是素材库本体的简化版，已删除），跨模块的 4 个只读面板保留并搬进素材库当标签页；两个 API 封装文件（@/api/media-asset-api 与 @/api/media-assets-api）的合并仍留在第二阶段。
3. `desktop/src/pages/Chat/` **不能**整目录删除：其 `components/` 与若干模块被 `HermesChat` 和单测复用，只能删孤儿页面 `index.tsx`。