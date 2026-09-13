// 定时任务创建弹窗 — 对话中识别到定时意图后弹出，确认后写入后端 scheduled_tasks
// 桌面端调度器（软件开着时）到点自动创建团队任务并经 Hermes 编排执行

import { useEffect, useMemo, useState } from "react";
import { Form, Input, Modal, Radio, Select, Space, message } from "antd";
import { ClockCircleOutlined, ScheduleOutlined } from "@ant-design/icons";
import type { ScheduleIntent } from "./schedule-intent";
import * as teamApi from "@/api/team-api";
import {
  createScheduledTask,
  type ScheduledRepeatType,
  type ScheduledExecuteKind,
} from "@/api/scheduled-task-api";
import type { Team } from "@/types/team";
import { OFFICIAL_META } from "@/pages/TaskCenter/edict-data";

interface Props {
  open: boolean;
  prefilled: ScheduleIntent;
  onClose: () => void;
  onCreated?: (title: string) => void;
}

export default function ScheduleModal({ open, prefilled, onClose, onCreated }: Props) {
  const [form] = Form.useForm();
  const [teams, setTeams] = useState<Team[]>([]);
  const [flows, setFlows] = useState<Array<{ id: string; title?: string; risk?: string }>>([]);
  const [saving, setSaving] = useState(false);
  const repeatType = Form.useWatch("repeatType", form) as ScheduledRepeatType | undefined;
  const executeKind = Form.useWatch("executeKind", form) as ScheduledExecuteKind | undefined;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      title: prefilled.title || "",
      description: prefilled.title || "",
      repeatType: prefilled.repeatType,
      runTime: prefilled.runTime ?? "09:00",
      weekday: prefilled.weekday ?? 1,
      dueAt: prefilled.dueAt ?? "",
      executeKind: "llm",
      flowParams: "{}",
      agentId: undefined,
    });
  }, [open, prefilled, form]);

  // 业务流清单（执行方式=业务流时可下拉选择；引擎未就绪/未内置 Python 时返回空）
  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.resolve(window.electronAPI?.flow?.list?.())
      .then((list) => { if (alive && Array.isArray(list)) setFlows(list); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    let alive = true;
    teamApi.listTeams().then((list) => { if (alive) setTeams(list); }).catch(() => undefined);
    return () => { alive = false; };
  }, [open]);

  const handleOk = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await createScheduledTask({
        title: v.title.trim(),
        description: v.description.trim(),
        teamId: v.teamId ?? undefined,
        repeatType: v.repeatType,
        runTime: v.repeatType !== "once" ? v.runTime : undefined,
        weekday: v.repeatType === "weekly" ? v.weekday : undefined,
        dueAt: v.repeatType === "once" && v.dueAt ? new Date(v.dueAt).toISOString() : undefined,
        executeKind: v.executeKind ?? "llm",
        flowId: v.executeKind === "flow" ? v.flowId : undefined,
        flowParams: v.executeKind === "flow" ? v.flowParams?.trim() || "{}" : undefined,
        agentId: v.agentId ?? undefined,
      });
      message.success("定时任务已创建，软件打开时会自动执行");
      onCreated?.(v.title.trim());
      onClose();
    } catch (err) {
      message.error("创建定时任务失败：" + ((err as Error).message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const extraFields = useMemo(() => {
    if (repeatType === "once") {
      return (
        <Form.Item label="执行时间" name="dueAt" rules={[{ required: true, message: "请选择执行时间" }]}>
          <Input type="datetime-local" placeholder="例如 2026-08-23T09:00" />
        </Form.Item>
      );
    }
    return (
      <>
        <Form.Item label="每日时间" name="runTime" rules={[{ required: true, message: "请输入触发时间" }]}>
          <Input placeholder="HH:mm，如 09:00" />
        </Form.Item>
        {repeatType === "weekly" && (
          <Form.Item label="星期" name="weekday" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 1, label: "周一" }, { value: 2, label: "周二" }, { value: 3, label: "周三" },
                { value: 4, label: "周四" }, { value: 5, label: "周五" }, { value: 6, label: "周六" },
                { value: 7, label: "周日" },
              ]}
            />
          </Form.Item>
        )}
      </>
    );
  }, [repeatType]);

  return (
    <Modal
      title={
        <Space>
          <ScheduleOutlined style={{ color: "var(--color-brand)" }} />
          创建定时任务
        </Space>
      }
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      confirmLoading={saving}
      okText="创建定时任务"
      cancelText="取消"
      width={520}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item label="任务标题" name="title" rules={[{ required: true, message: "请输入任务标题" }]}>
          <Input placeholder="例如：每日古诗词早报" />
        </Form.Item>
        <Form.Item label="任务内容（交给深瞳机器人执行）" name="description" rules={[{ required: true, message: "请输入任务内容" }]}>
          <Input.TextArea rows={3} placeholder="描述要做什么，例如：生成一份古诗词鉴赏早报并整理成文档" />
        </Form.Item>
        <Form.Item label="执行团队" name="teamId" tooltip="不选则自动使用你的第一个团队">
          <Select
            allowClear
            placeholder="自动选择第一个团队"
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Form.Item>
        <Form.Item
          label="归属官署"
          name="agentId"
          tooltip="指派给某个官署执行；留空则不限定（任务中心按团队调度）。官署详情页会显示其名下定时任务"
        >
          <Select
            allowClear
            placeholder="不限定官署"
            options={OFFICIAL_META.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name} · ${m.role}` }))}
          />
        </Form.Item>
        <Form.Item label="重复方式" name="repeatType" rules={[{ required: true }]}>
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: "once", label: "一次性" },
              { value: "daily", label: "每天" },
              { value: "weekly", label: "每周" },
            ]}
          />
        </Form.Item>
        {extraFields}
        <Form.Item
          label="执行方式"
          name="executeKind"
          rules={[{ required: true }]}
          tooltip="业务流 = 直接跑写好的脚本（确定、快）；深瞳机器人 = 交给 AI 逐步编排（灵活）"
        >
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: "llm", label: "深瞳机器人编排" },
              { value: "flow", label: "业务流直跑" },
            ]}
          />
        </Form.Item>
        {executeKind === "flow" && (
          <>
            <Form.Item label="业务流" name="flowId" rules={[{ required: true, message: "请选择业务流" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={flows.length ? "选择业务流" : "未检测到业务流引擎（可在服务页安装）"}
                options={flows.map((f) => ({
                  value: f.id,
                  label: f.title ? `${f.title}（${f.id}）` : f.id,
                }))}
              />
            </Form.Item>
            <Form.Item label="业务流参数（JSON）" name="flowParams" tooltip="传给业务流的参数，留空为 {}">
              <Input.TextArea rows={2} placeholder='例如 {"date": "2026-09-11"}' />
            </Form.Item>
          </>
        )}
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
          <ClockCircleOutlined /> 说明：定时任务只在「软件打开时」执行；到点后按所选方式运行，结果可在任务中心查看。
        </div>
      </Form>
    </Modal>
  );
}
