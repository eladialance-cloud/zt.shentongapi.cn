/**
 * T5.3 轻任务分流验证（工具卡守卫层）
 * 轻任务分流主判定在 OpenClaw 太子人设提示词（LLM 决策，需真机）；
 * 本测试验证两层兜底守卫可运行：
 *   1) edict-create.mjs 拒绝空/空白标题（不建任务）
 *   2) 太子人设 taizi-openclaw.md 明确「闲聊/问答不建任务」规则
 *   3) 缺 Hermes Python / EDICT_HOME 时报错而非误建任务
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const SCRIPT = path.resolve(__dirname, "../../resources/openclaw/skills/edict-create/scripts/edict-create.mjs");
const TAIZI_SOUL = path.resolve(__dirname, "../../resources/edict/profiles/taizi-openclaw.md");

describe("edict-create 轻任务分流守卫（T5.3）", () => {
  test("无 --title 参数直接拒绝（exit 2）", () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: "utf-8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("缺少 --title");
  });

  test("空白标题拒绝（exit 2），不触碰看板", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--title=   "], { encoding: "utf-8" });
    expect(r.status).toBe(2);
  });

  test("缺 Hermes Python / EDICT_HOME 时报错（exit 3），不误建任务", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--title=这是足够长度的测试旨意标题"], {
      encoding: "utf-8",
      env: { ...process.env, HERMES_PYTHON: "", EDICT_HOME: "" },
    });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("缺少 Hermes Python");
  });

  test("太子人设含轻任务分流规则（闲聊/问答不建任务）", () => {
    const soul = fs.readFileSync(TAIZI_SOUL, "utf-8");
    expect(soul).toContain("直接回复（不建任务）");
    expect(soul).toContain("闲聊/问答");
    expect(soul).toContain("宁可少建任务");
    expect(soul).toContain("不创建任务");
  });
});
