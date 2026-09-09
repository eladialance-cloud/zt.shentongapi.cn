// 服务型模块管理面板（Phase 5）：列表 / 启停 / 刷新 / 卸载三档 / 安装模块（A5-B），调用 modules:* IPC
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Modal, Radio, Space, Switch, Tag, message } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { listModules, setModuleEnabled, uninstallModule, installModuleFromSource, onModulesChanged } from "@/api/service-manager-api";
import type { ModuleDataDisposition, ModuleInfo } from "@shared/types";

export default function ModulePanel() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<ModuleInfo | null>(null);
  const [disposition, setDisposition] = useState<ModuleDataDisposition>("keep");
  const [uninstallBusy, setUninstallBusy] = useState(false);

  const [installOpen, setInstallOpen] = useState(false);
  const [installSource, setInstallSource] = useState("");
  const [installSha256, setInstallSha256] = useState("");
  const [installBusy, setInstallBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setModules(await listModules());
    } catch {
      setModules([]);
    }
  }, []);

  useEffect(() => {
    void load();
    return onModulesChanged(() => {
      void load();
    });
  }, [load]);

  const toggle = async (m: ModuleInfo, enabled: boolean) => {
    setBusy(m.id);
    try {
      const result = await setModuleEnabled(m.id, enabled);
      if (!result.ok) {
        message.error(result.error || "操作失败");
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const openUninstall = (m: ModuleInfo) => {
    setDisposition("keep");
    setUninstallTarget(m);
  };

  const confirmUninstall = async () => {
    if (!uninstallTarget) return;
    setUninstallBusy(true);
    try {
      const result = await uninstallModule(uninstallTarget.id, disposition);
      if (!result.ok) {
        message.error(result.error || "卸载失败");
        await load();
      } else {
        message.success(
          disposition === "keep"
            ? "已停用，数据保留"
            : disposition === "export"
              ? `已导出到 ${result.exportedPath || "所选目录"}`
              : "已彻底卸载（本地数据已删除）",
        );
        setUninstallTarget(null);
        await load();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUninstallBusy(false);
    }
  };

  const openInstall = () => {
    setInstallSource("");
    setInstallSha256("");
    setInstallOpen(true);
  };

  const submitInstall = async () => {
    if (!installSource.trim()) {
      message.warning("请填写模块来源");
      return;
    }
    setInstallBusy(true);
    try {
      const result = await installModuleFromSource(installSource.trim(), installSha256.trim() ? { expectedSha256: installSha256.trim() } : undefined);
      if (!result.ok) {
        message.error(result.error || "安装失败");
      } else {
        message.success(`已安装「${result.name || result.id}」(${result.kind}) 到 ${result.dir}`);
        setInstallOpen(false);
        await load();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallBusy(false);
    }
  };

  return (
    <Card size="small" title="服务模块" style={{ marginBottom: 16 }}>
      {modules.length === 0 && (
        <div style={{ color: "#999", padding: "8px 0" }}>暂无服务模块（可通过下方「安装模块」安装 skill/agent，安装结果见 技能市场 → 我的）</div>
      )}
      {modules.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <div>
            <span style={{ fontWeight: 600 }}>{m.displayName}</span>
            <Tag color={m.enabled ? "green" : "default"} style={{ marginLeft: 8 }}>
              {m.enabled ? "已启用" : "已停用"}
            </Tag>
            <span style={{ color: "#999", fontSize: 12, marginLeft: 8 }}>
              {m.serviceIds.join(", ")}
            </span>
          </div>
          <Space>
            <Switch
              checked={m.enabled}
              loading={busy === m.id}
              onChange={(checked) => {
                void toggle(m, checked);
              }}
            />
            <Button size="small" danger onClick={() => openUninstall(m)}>
              卸载
            </Button>
          </Space>
        </div>
      ))}
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <Button size="small" icon={<PlusOutlined />} onClick={openInstall}>
          安装模块
        </Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新模块
        </Button>
      </div>

      <Modal
        title={`卸载模块：${uninstallTarget?.displayName}`}
        open={!!uninstallTarget}
        confirmLoading={uninstallBusy}
        onOk={() => void confirmUninstall()}
        onCancel={() => setUninstallTarget(null)}
        okText="确认卸载"
        cancelText="取消"
      >
        <Radio.Group
          value={disposition}
          onChange={(e) => setDisposition(e.target.value as ModuleDataDisposition)}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <Radio value="keep">保留（停用，云端与本地数据都留存）</Radio>
          <Radio value="export">导出（本地数据打包到所选目录，云端导出）</Radio>
          <Radio value="delete">彻底删除（卸载本地数据；云端数据按后端接口删除）</Radio>
        </Radio.Group>
      </Modal>

      <Modal
        title="安装模块"
        open={installOpen}
        confirmLoading={installBusy}
        onOk={() => void submitInstall()}
        onCancel={() => setInstallOpen(false)}
        okText="安装"
        cancelText="取消"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>模块来源</div>
            <Input
              placeholder="github:owner/repo@tag?path=/skills/xxx 或 url:https://.../pkg.tar.gz 或 file:C:\...\mod"
              value={installSource}
              onChange={(e) => setInstallSource(e.target.value)}
            />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>期望 sha256（可选，用于校验完整性）</div>
            <Input
              placeholder="如 64 位十六进制 sha256"
              value={installSha256}
              onChange={(e) => setInstallSha256(e.target.value)}
            />
          </div>
          <div style={{ color: "#999", fontSize: 12 }}>
            技能/智能体会安装到 Hermes：hermes-home/skills/&lt;id&gt; 或 hermes-home/agents/&lt;id&gt;，安装结果见「技能市场 → 我的」。
          </div>
        </div>
      </Modal>
    </Card>
  );
}