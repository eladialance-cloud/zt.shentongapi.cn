// 探针：锁定 Hermes CLI 真实 stdout 格式 + 成员人设执行能力判定（路线 A/B）
// 运行：npx tsx scripts/hermes-orchestrate-probe.ts [--probe format|persona|help]
// 环境变量（参考 service-manager 注入值）：
//   HERMES_NODE   - hermes 运行时的 node.exe 绝对路径
//   HERMES_ENTRY  - hermes-agent 包 bin/hermes.js 绝对路径
//   HERMES_HOME   - hermes 数据目录（配置/凭证复用）
import { spawn } from "node:child_process";

const nodeBin = process.env.HERMES_NODE || "node";
const entry = process.env.HERMES_ENTRY || "";
const mode = process.argv.includes("--probe") ? process.argv[process.argv.indexOf("--probe") + 1] || "format" : "format";

if (!entry) {
  console.error("缺少 HERMES_ENTRY，先设置环境变量（参考 service-manager 注入的 HERMES_NODE/HERMES_ENTRY）；");
  process.exit(2);
}

function run(args: string[], timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve) => {
    console.log("$ hermes " + args.join(" "));
    const child = spawn(nodeBin, [entry, ...args], {
      env: process.env as Record<string, string>,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => { try { child.kill(); } catch { /* ignore */ } }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      console.log("exitCode:", code);
      console.log("=== STDOUT ===");
      console.log(stdout.trim().slice(0, 3000));
      console.log("=== STDERR(尾部) ===");
      console.log(stderr.trim().slice(-800));
      resolve();
    });
  });
}

async function main() {
  if (mode === "help") {
    // 路线 A 判定：hermes chat 是否支持 --agent / --persona 等按人设执行参数
    await run(["chat", "--help"]);
    return;
  }
  if (mode === "persona") {
    // 路线 B 判定：人设注入任务描述后，stdout 是否仍稳定为单行 JSON
    const task = '你是资深文案编辑（内容AI）。请输出 1 句欢迎语，最终回复必须是单行JSON，格式: {"summary":"欢迎语","steps":[],"outputs":[],"status":"completed"}。';
    await run(["chat", "-q", task, "-Q", "--source", "tool"]);
    return;
  }
  // 默认 format：要求只输出 JSON 时的 stdout 格式
  const task =
    "把下面这句话拆成 2 步，并输出单行JSON，格式见要求： " +
    '{"summary":"结论","steps":[{"name":"步骤","status":"done"}],"outputs":[],"status":"completed"}' +
    "。本次任务：整理 3 个抖音频爆款选题方向。";
  await run(["chat", "-q", task, "-Q", "--source", "tool"]);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});