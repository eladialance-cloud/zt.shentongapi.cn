/**
 * 官署详情 · 飞书表 Tab
 *
 * 对标 RRClaw 的「多维表格占位符 → 真实表链接」机制：
 *  - 展示该官署的飞书表清单（env 键 / 表名 / 链接 / 权限），可编辑回填链接
 *  - 展示 SOUL.md 中 {{FEISHU_DOC:xx}} 占位符替换预览（已替换 N 处 / 待回填 M 处）
 *  - 数据源：IPC edict:official-tables / save-official-tables / official-soul
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Empty, Input, message, Space, Spin, Table, Tag, Tooltip } from "antd";
import {
  edictOfficialSoul,
  edictOfficialTables,
  edictSaveOfficialTables,
  isEdictAvailable,
} from "@/api/edict-api";
import type { EdictOfficialTable } from "@shared/edict-types";

const ACCESS_LABEL: Record<string, string> = { rw: "读写", read: "只读", write: "写入" };

export default function OfficialTablesTab({ agentId }: { agentId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tables, setTables] = useState<EdictOfficialTable[]>([]);
  const [rendered, setRendered] = useState<{ replaced: number; missing: string[] }>({
    replaced: 0,
    missing: [],
  });

  const load = useCallback(async () => {
    if (!isEdictAvailable() || !agentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tblRes, soulRes] = await Promise.all([
        edictOfficialTables(agentId),
        edictOfficialSoul(agentId).catch(() => null),
      ]);
      if (tblRes.ok) setTables(tblRes.tables ?? []);
      else message.error(tblRes.error || "读取飞书表清单失败");
      if (soulRes?.ok) {
        setRendered({ replaced: soulRes.replaced ?? 0, missing: soulRes.missing ?? [] });
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChangeUrl = (envKey: string, url: string) => {
    setTables((prev) => prev.map((t) => (t.envKey === envKey ? { ...t, url } : t)));
  };

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await edictSaveOfficialTables(agentId, tables);
      if (res.ok) {
        message.success("飞书表链接已保存");
        await load();
      } else {
        message.error(res.error || "保存失败");
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [agentId, tables, load]);

  if (!isEdictAvailable()) {
    return <Empty description="飞书表配置需要桌面端主进程（electronAPI.edict 未注入）" />;
  }

  const configured = tables.filter((t) => t.url).length;

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Alert
          type={configured === tables.length && tables.length > 0 ? "success" : "info"}
          showIcon
          message={`飞书多维表格（${configured}/${tables.length} 已回填链接）`}
          description="该官署的 SOUL.md 用 {{FEISHU_DOC:表名}} 占位；回填链接后，编排运行时会把占位符替换为真实表链接（对标 RRClaw 的占位符替换机制）。"
        />

        {rendered.replaced > 0 || rendered.missing.length > 0 ? (
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            占位符预览：已可替换 <b>{rendered.replaced}</b> 处
            {rendered.missing.length > 0 && (
              <>
                {" "}· 待回填 <b>{rendered.missing.length}</b> 处
                <Tooltip title={rendered.missing.join("、")}>
                  <Tag color="orange" style={{ marginLeft: 6 }}>查看待回填</Tag>
                </Tooltip>
              </>
            )}
          </div>
        ) : null}

        <Table<EdictOfficialTable>
          size="small"
          rowKey="envKey"
          pagination={false}
          dataSource={tables}
          columns={[
            {
              title: "表名",
              dataIndex: "name",
              width: 200,
              render: (name: string, r) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{r.envKey}</div>
                </div>
              ),
            },
            {
              title: "权限",
              dataIndex: "access",
              width: 64,
              render: (a?: string) => <Tag>{ACCESS_LABEL[a ?? "rw"] ?? "读写"}</Tag>,
            },
            {
              title: "飞书链接",
              dataIndex: "url",
              render: (url: string | null | undefined, r) => (
                <Input
                  size="small"
                  placeholder="https://xxx.feishu.cn/base/..."
                  value={url ?? ""}
                  onChange={(e) => onChangeUrl(r.envKey, e.target.value)}
                  allowClear
                />
              ),
            },
          ]}
        />

        <Space>
          <Button type="primary" loading={saving} onClick={() => void onSave()} disabled={tables.length === 0}>
            保存链接
          </Button>
          <Button onClick={() => void load()}>重新读取</Button>
        </Space>
      </div>
    </Spin>
  );
}
