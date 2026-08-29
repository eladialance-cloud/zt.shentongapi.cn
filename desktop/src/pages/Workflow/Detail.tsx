// 工作流详情页
// 展示：模板信息（名称/描述/预览图/输入输出 Schema）+ 执行历史 + 执行按钮
// 调用 GET /workflows/templates/:id、GET /workflows/executions?workflowId=、POST /workflows/:id/execute

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Input, Spin, Table, Tag, Typography, message } from "antd";
import type { TableColumnsType } from "antd";
import {
  ArrowLeft,
  CirclePlay,
  Clock,
  Coins,
  Download,
  Image,
  Zap,
} from "lucide-react";
import * as workflowApi from "@/api/workflow-api";
import * as marketApi from "@/api/market-api";
import type {
  WorkflowTemplate,
  WorkflowExecution,
  WorkflowExecutionStatus,
} from "@/types/workflow";
import styles from "./styles.module.css";

const { TextArea } = Input;
const { Text } = Typography;

/** 状态标签 className */
function statusTagClass(status: WorkflowExecutionStatus): string {
  switch (status) {
    case "success":
      return styles.statusTagSuccess;
    case "failed":
      return styles.statusTagFailed;
    case "running":
      return styles.statusTagRunning;
    case "canceled":
    default:
      return styles.statusTagCanceled;
  }
}

/** 状态中文显示 */
function statusLabel(status: WorkflowExecutionStatus): string {
  switch (status) {
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "running":
      return "运行中";
    case "queued":
      return "排队中";
    case "canceled":
      return "已取消";
    default:
      return status;
  }
}

/** 从工作流模板解析候选 webhook 路径（优先 JSON 里的 Webhook 节点，其次引擎 ID/模板 ID） */
function webhookPathsOf(tpl: WorkflowTemplate): string[] {
  const paths: string[] = [];
  try {
    if (typeof tpl.workflowJson === "string" && tpl.workflowJson.trim()) {
      const wf = JSON.parse(tpl.workflowJson);
      const nodes = Array.isArray(wf?.nodes) ? wf.nodes : [];
      for (const n of nodes) {
        const type = String(n?.type || "");
        if (type.toLowerCase().includes("webhook")) {
          const p = n?.parameters?.path;
          if (typeof p === "string" && p.trim()) paths.push(p.trim());
        }
      }
    }
  } catch {
    // 模板 JSON 解析失败时忽略，走引擎 ID/模板 ID 兜底
  }
  if (tpl.n8nWorkflowId) paths.push(tpl.n8nWorkflowId);
  if (tpl.id != null) paths.push(String(tpl.id));
  return [...new Set(paths)];
}

/** 格式化 JSON 用于显示 */
function formatJson(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 格式化耗时 */
function formatDuration(ms?: number): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** 格式化时间 */
function formatTime(value: unknown): string {
  if (!value) return "-";
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function WorkflowDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const workflowId = id ? Number(id) : NaN;

  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installDir, setInstallDir] = useState("");
  const [inputText, setInputText] = useState("{}");
  const [lastResult, setLastResult] = useState<WorkflowExecution | null>(null);

  /** 加载模板详情 + 执行历史 */
  const loadData = useCallback(async () => {
    if (!Number.isFinite(workflowId)) return;
    setLoading(true);
    try {
      const [tpl, execResult] = await Promise.all([
        workflowApi.getTemplate(workflowId),
        workflowApi.listExecutions({ workflowId, pageSize: 50 }),
      ]);
      setTemplate(tpl);
      setExecutions(execResult.list || []);
    } catch (err) {
      console.error("[WorkflowDetail] load failed:", err);
      message.error("加载工作流详情失败");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /** 执行工作流（桌面端：本地 N8N 真跑 + 结果回传；Web 端：仅创建排队记录） */
  const handleExecute = async () => {
    if (!Number.isFinite(workflowId)) return;
    let input: unknown;
    try {
      input = JSON.parse(inputText || "{}");
    } catch (err) {
      message.error("输入不是合法的 JSON: " + (err as Error).message);
      return;
    }

    setExecuting(true);
    try {
      // 1) 云端创建执行记录（queued），供执行历史/结果回传定位
      const created = await workflowApi.executeWorkflow(workflowId, input);
      const execId = created.executionId;

      const runLocal = window.electronAPI?.n8n?.runWorkflow;
      if (!runLocal) {
        // Web 端兜底：无法触达本地 N8N，仅保留排队记录
        setLastResult({
          id: execId,
          workflowId,
          status: "queued",
          input,
          creditsCost: 0,
          createdAt: new Date(),
        } as WorkflowExecution);
        message.info("已创建执行记录；请在桌面端打开本页执行（本地 N8N 才能真跑）");
        void loadData();
        return;
      }

      // 2) 标记 running
      await workflowApi
        .reportWorkflowExecution(execId, { status: "running" })
        .catch(() => undefined);

      // 3) 本地 N8N 真执行：按候选 webhook 路径逐个尝试
      const started = Date.now();
      const res = await runLocal({
        paths: webhookPathsOf(template!),
        payload: input,
        timeoutMs: 120000,
      });
      const durationMs = Date.now() - started;

      if (res.ok) {
        // 4) 成功：回传结果
        await workflowApi
          .reportWorkflowExecution(execId, {
            status: "success",
            output: res.data,
            durationMs,
            n8nExecutionId: res.path,
          })
          .catch(() => undefined);
        setLastResult({
          id: execId,
          workflowId,
          status: "success",
          output: res.data,
          durationMs,
          creditsCost: 0,
          createdAt: new Date(),
        } as WorkflowExecution);
        message.success("工作流执行完成");
      } else {
        // 5) 失败：回传错误
        await workflowApi
          .reportWorkflowExecution(execId, {
            status: "failed",
            error: res.error,
            durationMs,
          })
          .catch(() => undefined);
        setLastResult({
          id: execId,
          workflowId,
          status: "failed",
          errorMessage: res.error,
          durationMs,
          creditsCost: 0,
          createdAt: new Date(),
        } as WorkflowExecution);
        message.error("工作流执行失败: " + res.error);
      }
      // 刷新执行历史
      void loadData();
    } catch (err) {
      console.error("[WorkflowDetail] execute failed:", err);
      message.error("工作流执行失败: " + (err as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  /** 安装工作流到本地（下载 + 导入本地 N8N） */
  const handleInstallLocal = async () => {
    if (!template) return;
    setInstalling(true);
    try {
      const res = await marketApi.install("workflow", template.id);
      if (!res.ok) {
        throw new Error(res.error || "本地安装失败");
      }
      setInstalled(true);
      setInstallDir(res.dir || "");
      message.success("工作流已下载安装到本地 N8N");
    } catch (err) {
      console.error("[WorkflowDetail] install failed:", err);
      message.error("安装失败: " + (err as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  /** 返回列表 */
  const handleBack = () => {
    navigate("/workflow");
  };

  /** 执行历史表格列定义 */
  const columns: TableColumnsType<WorkflowExecution> = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 70,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: WorkflowExecutionStatus) => (
        <Tag className={statusTagClass(status)}>{statusLabel(status)}</Tag>
      ),
    },
    {
      title: "耗时",
      dataIndex: "durationMs",
      key: "durationMs",
      width: 100,
      render: (v: number) => formatDuration(v),
    },
    {
      title: "积分消耗",
      dataIndex: "creditsCost",
      key: "creditsCost",
      width: 100,
      render: (v: number) => (
        <span className={styles.creditsCost}>{v ?? 0}</span>
      ),
    },
    {
      title: "输出",
      dataIndex: "output",
      key: "output",
      ellipsis: true,
      render: (v: unknown) => (
        <Text style={{ color: "var(--color-text-tertiary)", fontSize: 12 }} ellipsis>
          {formatJson(v)}
        </Text>
      ),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (v: string) => formatTime(v),
    },
  ];

  if (loading && !template) {
    return (
      <div className={styles.pageContainer}>
        <Spin
          fullscreen
          tip="加载中..."
          style={{ background: "var(--color-bg-overlay)" }}
        />
      </div>
    );
  }

  if (!template) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.emptyState}>
          <Zap size={48} className={styles.emptyStateIcon} />
          <div className={styles.emptyStateText}>工作流不存在或加载失败</div>
          <Button
            className={styles.backBtn}
            icon={<ArrowLeft size={14} />}
            onClick={handleBack}
          >
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {/* 顶部导航 */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <Zap size={18} />
          </span>
          <span>{template.name}</span>
        </div>
        <Button
          className={styles.backBtn}
          icon={<ArrowLeft size={14} />}
          onClick={handleBack}
        >
          返回列表
        </Button>
      </div>

      <div className={styles.detailContainer}>
        {/* 模板基本信息 */}
        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            <div>
              <h2 className={styles.detailTitle}>{template.name}</h2>
              <Tag className={styles.categoryTag}>{template.category}</Tag>
            </div>
          </div>
          <div className={styles.detailDescription}>{template.description}</div>

          {/* 预览图 */}
          <div className={styles.detailPreview}>
            {template.previewImage ? (
              <img loading="lazy" src={template.previewImage} alt={template.name} />
            ) : (
              <Image size={64} className={styles.detailPreviewPlaceholder} />
            )}
          </div>

          {/* 输入输出 Schema */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginTop: 16,
            }}
          >
            <div>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionTitleIcon}>
                  <ArrowLeft size={14} style={{ transform: "rotate(180deg)" }} />
                </span>
                输入 Schema
              </div>
              <div className={styles.schemaBlock}>
                {formatJson(template.inputSchema)}
              </div>
            </div>
            <div>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionTitleIcon}>
                  <ArrowLeft size={14} />
                </span>
                输出 Schema
              </div>
              <div className={styles.schemaBlock}>
                {formatJson(template.outputSchema)}
              </div>
            </div>
          </div>
        </div>

        {/* 执行区 */}
        <div className={styles.detailCard}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon}>
              <CirclePlay size={14} />
            </span>
            执行工作流
            {template.pricePerExecution != null &&
              template.pricePerExecution > 0 && (
                <span
                  className={styles.creditsCost}
                  style={{ marginLeft: 12, fontSize: 12 }}
                >
                  每次执行消耗 {template.pricePerExecution} 积分
                </span>
              )}
          </div>
          <div className={styles.inputArea}>
            <TextArea
              className={styles.inputTextarea}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="输入 JSON 格式的工作流输入参数..."
              autoSize={{ minRows: 4, maxRows: 10 }}
            />
            <Button
              type="primary"
              className={styles.executeBtn}
              icon={<CirclePlay size={14} />}
              onClick={handleExecute}
              loading={executing}
            >
              执行工作流
            </Button>
            <Button
              icon={<Download size={14} />}
              onClick={handleInstallLocal}
              loading={installing}
              disabled={installed}
              style={{ marginLeft: 8 }}
            >
              {installed ? "已安装到本地" : "安装到本地"}
            </Button>
            {installed && installDir && (
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 8 }}>
                安装位置：{installDir}
              </div>
            )}
          </div>

          {/* 最近一次执行结果 */}
          {lastResult && (
            <div style={{ marginTop: 16 }}>
              <div className={styles.sectionTitle}>
                <span className={styles.sectionTitleIcon}>
                  <Zap size={14} />
                </span>
                最近执行结果
              </div>
              <div className={styles.resultBlock}>
                {formatJson(lastResult.output)}
              </div>
              <div className={styles.resultMeta}>
                <span className={styles.resultMetaItem}>
                  <Tag className={statusTagClass(lastResult.status)}>
                    {statusLabel(lastResult.status)}
                  </Tag>
                </span>
                <span className={styles.resultMetaItem}>
                  <Clock size={12} />
                  耗时: {formatDuration(lastResult.durationMs)}
                </span>
                <span className={styles.resultMetaItem}>
                  <Coins size={12} />
                  积分消耗:{" "}
                  <span className={styles.creditsCost}>
                    {lastResult.creditsCost ?? 0}
                  </span>
                </span>
                <span className={styles.resultMetaItem}>
                  时间: {formatTime(lastResult.createdAt)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 执行历史 */}
        <div className={styles.historyTableWrapper}>
          <div className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon}>
              <Clock size={14} />
            </span>
            执行历史
          </div>
          <Table<WorkflowExecution>
            columns={columns}
            dataSource={executions}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: "max-content" }}
            loading={loading}
            locale={{ emptyText: "暂无执行记录" }}
          />
        </div>
      </div>
    </div>
  );
}
