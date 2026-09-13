import { loadToolRegistry, validateRegistry } from "../../scripts/unified-toolbox/registry";
import { dispatchTool } from "../../scripts/unified-toolbox/toolbox";
import { executeFeishu, executeMysql } from "../../scripts/unified-toolbox/capabilities";

describe("unified-toolbox", () => {
  it("registry 解析与校验", () => {
    const yaml = "tools:\n  - name: feishu.create_table\n    capability: feishu\n    params: [table_name]\n  - name: mysql.query\n    capability: mysql\n    params: [sql]\n";
    const r = loadToolRegistry(yaml);
    expect(r.tools.length).toBe(2);
    expect(validateRegistry(r).ok).toBe(true);
  });

  it("registry 缺 name/params 报错", () => {
    const r = loadToolRegistry("tools:\n  - capability: feishu\n");
    expect(validateRegistry(r).ok).toBe(false);
  });

  it("dispatch 分发到 capability", async () => {
    const fakeMysql = async (input: Record<string, unknown>) => ({ ok: true, data: { rows: [], echo: input.sql } });
    const out = await dispatchTool("mysql.query", { sql: "SELECT 1" }, {
      capabilities: { mysql: fakeMysql },
    });
    expect(out.ok).toBe(true);
    expect((out.data as { echo: string }).echo).toBe("SELECT 1");
  });

  it("未注册工具返回 error", async () => {
    const out = await dispatchTool("unknown.tool", {}, {
      capabilities: { mysql: executeMysql, feishu: executeFeishu },
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBeTruthy();
  });
});
