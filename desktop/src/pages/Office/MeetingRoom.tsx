/**
 * MeetingRoom — 会议室语音开会系统（简化版）
 *
 * 实现内容:
 *  - Drawer 滑出: 会议发起区 / 会议进行区 / 会议纪要区
 *  - Push-to-Talk 按钮 + 脚本选项 Modal (预设/自定义)
 *  - 5 个预设会议主题脚本 (新项目立项 / 月度复盘 / 季度规划 / 技术选型 / 风险评估)
 *  - AI 按脚本顺序每 2-3 秒回应一句 (ChatBubble 展示)
 *  - 会议纪要 Markdown 生成 + 复制 + 导出 .md 文件
 *
 * 不集成真实 WebRTC, 仅文字模拟. 详见 spec.md Task 2.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Drawer,
  Input,
  Modal,
  Radio,
  Select,
  Tag,
  Tooltip,
  message as antdMessage,
} from 'antd';
import {
  AudioOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import ChatBubble from '@/components/ChatBubble';
import type { AIEmployee } from './types';
import styles from './MeetingRoom.module.css';

/* ===================== 类型定义 ===================== */

interface AIResponseStep {
  /** 发言 AI 员工 ID */
  employeeId: string;
  /** 发言内容 */
  text: string;
  /** 发言延迟 (相对上一条消息, 2000-3000ms) */
  delayMs: number;
}

interface MeetingScript {
  id: string;
  title: string;
  description: string;
  /** 默认参会 AI ID 列表 */
  participantIds: string[];
  /** 用户预设发言选项 (5-8 个) */
  userSpeechOptions: string[];
  /** AI 回应脚本 (按顺序, 每个参会 AI 至少 2 次) */
  aiResponses: AIResponseStep[];
  /** 会议决议 (用于会议纪要) */
  decisions: string[];
}

interface MeetingMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** AI 消息对应的员工 ID */
  employeeId?: string;
  text: string;
  timestamp: number;
}

type MeetingPhase = 'setup' | 'active' | 'summary';

export interface MeetingRoomProps {
  open: boolean;
  onClose: () => void;
  employees: AIEmployee[];
}

/* ===================== 5 个预设会议脚本 ===================== */

const MEETING_SCRIPTS: MeetingScript[] = [
  {
    id: 'new-project',
    title: '新项目立项',
    description: '讨论新 AI 代理项目的可行性与资源分配',
    participantIds: ['business', 'content', 'delivery'],
    userSpeechOptions: [
      '我们需要在 Q4 推出一个新的 AI 代理项目，请各位评估可行性',
      '目标是月底前完成立项决策，时间紧迫',
      '我希望先听听客户需求和市场机会的分析',
      '请内容侧评估一下需要多少创作资源',
      '交付侧有没有现成的技术栈可以复用',
      '如果资源不足，我们可以分阶段推进吗',
      '请大家在 5 分钟内给出初步意见',
    ],
    aiResponses: [
      { employeeId: 'business', text: '我整理了上周客户调研的数据，有 73% 的客户表示愿意为 AI 代理服务付费，市场空间充足', delayMs: 2000 },
      { employeeId: 'content', text: '从内容生产角度看，AI 代理每周可产出约 50 篇深度内容，需要 2 名内容策划 + 1 名设计师', delayMs: 2500 },
      { employeeId: 'delivery', text: '技术栈方面，我们现有的 LLM 编排框架可以直接复用，预计 6 周内交付 MVP 版本', delayMs: 2200 },
      { employeeId: 'business', text: '客户付费意愿集中在 99-299 元/月区间，建议定价 199 元/月起，年付享 8 折', delayMs: 2800 },
      { employeeId: 'content', text: '我可以提前准备一套品牌故事与价值主张素材，配合立项后立即启动内容生产', delayMs: 2400 },
      { employeeId: 'delivery', text: '需要 3 名后端 + 2 名前端 + 1 名算法工程师，目前的团队能力可以覆盖', delayMs: 2600 },
      { employeeId: 'business', text: '合同模板与法务审查我可以同步推进，预计本周内完成法务合规检查', delayMs: 2300 },
      { employeeId: 'delivery', text: '建议分两阶段：第一阶段 4 周完成核心功能，第二阶段 2 周做集成测试和上线', delayMs: 2900 },
      { employeeId: 'content', text: '好的，立项后我立即拉起内容 kickoff 会议，确保生产节奏与技术交付对齐', delayMs: 2500 },
    ],
    decisions: [
      '项目立项通过，定位为 Q4 战略级产品',
      '采用分阶段交付：4 周 MVP + 2 周集成上线',
      '定价方案：199 元/月起，年付 8 折',
      '团队配置：3 后端 + 2 前端 + 1 算法 + 2 内容 + 1 设计',
    ],
  },
  {
    id: 'monthly-review',
    title: '月度复盘',
    description: '复盘上月业务表现与改进点',
    participantIds: ['business', 'finance', 'service'],
    userSpeechOptions: [
      '上月整体业绩表现如何？请各位复盘',
      '哪些指标未达预期？根因是什么',
      '客户满意度方面有什么反馈',
      '财务侧的成本控制情况怎样',
      '针对问题，本月改进方向是什么',
      '需要哪些跨部门协作支持',
      '请给出明确的改进 KPI',
    ],
    aiResponses: [
      { employeeId: 'business', text: '上月整体营收 580 万，环比增长 12%，达成月度目标的 96%', delayMs: 2000 },
      { employeeId: 'finance', text: '成本端控制良好，毛利率提升 3 个百分点至 42%，主要得益于供应商议价优化', delayMs: 2500 },
      { employeeId: 'service', text: '客服侧 NPS 评分从 52 升至 58，但工单响应时长环比上升了 8%，需要关注', delayMs: 2300 },
      { employeeId: 'business', text: '未达预期的指标主要是新客户转化率，从 18% 降至 15%，根因是落地页改版后跳出率提升', delayMs: 2700 },
      { employeeId: 'finance', text: '营销 ROI 从 3.2 降至 2.8，建议优化投放渠道结构，减少低效渠道预算', delayMs: 2600 },
      { employeeId: 'service', text: '投诉集中在产品质量和响应速度两方面，建议产品侧加强 QA 流程', delayMs: 2400 },
      { employeeId: 'business', text: '本月改进方向：1) 落地页 A/B 测试 2) 新客户专属优惠 3) 转化漏斗优化', delayMs: 2800 },
      { employeeId: 'finance', text: '财务侧将推出预算动态分配机制，将 20% 营销预算向高 ROI 渠道倾斜', delayMs: 2500 },
      { employeeId: 'service', text: '客服侧将引入 AI 工单分类系统，预计响应时长可降低 30%', delayMs: 2300 },
      { employeeId: 'business', text: '协作方面，需要内容侧配合落地页文案优化，交付侧配合工单系统改造，本周三拉通会议', delayMs: 2900 },
    ],
    decisions: [
      '本月聚焦：落地页优化 + 工单系统升级',
      '营销预算动态分配：20% 向高 ROI 渠道倾斜',
      '客服引入 AI 工单分类，目标响应时长降低 30%',
      '下周三召开跨部门拉通会议推进落地',
    ],
  },
  {
    id: 'quarterly-planning',
    title: '季度规划',
    description: '制定下季度业务目标与资源规划',
    participantIds: ['business', 'delivery', 'finance'],
    userSpeechOptions: [
      '下季度我们要冲击 800 万营收目标，请各位给方案',
      '资源分配上需要优先哪些方向',
      '交付侧能承诺多少功能上线',
      '财务侧预算上限是多少',
      '如何平衡增长与成本',
      '需要新增多少人力',
      '请给出关键里程碑',
    ],
    aiResponses: [
      { employeeId: 'business', text: '800 万目标拆解：存量客户复购 350 万 + 新客户 350 万 + 增值服务 100 万', delayMs: 2000 },
      { employeeId: 'finance', text: '预算上限 200 万营销费用 + 80 万人力成本，需要严格控制 ROI', delayMs: 2500 },
      { employeeId: 'delivery', text: '交付侧承诺本季度上线 12 个核心功能，包括 AI 代理 V2 和工作流市场', delayMs: 2400 },
      { employeeId: 'business', text: '优先方向：1) 企业版拓客 2) 行业解决方案 3) 渠道合作生态', delayMs: 2700 },
      { employeeId: 'finance', text: '建议将 60% 预算投入企业版获客，30% 投入行业方案，10% 试错新渠道', delayMs: 2600 },
      { employeeId: 'delivery', text: '如果新增 2 名前端 + 1 名算法，可以把交付节奏从 2 周一版提升到 1 周一版', delayMs: 2500 },
      { employeeId: 'business', text: '新增 3 人 HC 我同意，但需要 1 个月内到岗，否则影响 Q3 节奏', delayMs: 2300 },
      { employeeId: 'finance', text: '3 名新增人力按平均 25K/月计算，季度人力成本增加 22.5 万，预算可承受', delayMs: 2800 },
      { employeeId: 'delivery', text: '关键里程碑：M1-需求评审完成、M2-MVP 上线、M3-企业版 GA、M4-季度复盘', delayMs: 2600 },
      { employeeId: 'business', text: '好的，整体方案我整理后本周五前发出 V1，下周一启动会', delayMs: 2400 },
    ],
    decisions: [
      'Q3 营收目标 800 万，拆解为复购 350 + 新客 350 + 增值 100',
      '预算分配：60% 企业版 + 30% 行业方案 + 10% 新渠道',
      '新增 3 人 HC（2 前端 + 1 算法），1 个月内到岗',
      '交付节奏从 2 周一版提升至 1 周一版',
    ],
  },
  {
    id: 'tech-selection',
    title: '技术选型',
    description: '评估新技术栈的引入与风险',
    participantIds: ['content', 'delivery'],
    userSpeechOptions: [
      '我们计划引入新一代向量数据库，请评估方案',
      '目前候选有 Milvus / Qdrant / Weaviate，怎么选',
      '迁移成本和风险如何',
      '对内容生产流程有什么影响',
      '需要多少研发投入',
      '性能 benchmarks 如何对比',
      '请给出最终推荐方案',
    ],
    aiResponses: [
      { employeeId: 'delivery', text: '我从性能、易用性、社区三个维度对比了三个方案，整体推荐 Milvus', delayMs: 2000 },
      { employeeId: 'content', text: '从内容检索场景看，我们需要支持千万级文档的实时 KNN 查询，三个方案都能满足', delayMs: 2500 },
      { employeeId: 'delivery', text: 'Milvus 性能 benchmark：单机 QPS 12K，延迟 < 50ms；Qdrant 8K QPS；Weaviate 6K QPS', delayMs: 2400 },
      { employeeId: 'content', text: '迁移成本主要在索引重建，预计 3 天完成全量数据迁移，期间业务可读不可写', delayMs: 2700 },
      { employeeId: 'delivery', text: '风险点：1) Milvus 集群运维复杂度较高 2) 备份恢复机制需自研', delayMs: 2600 },
      { employeeId: 'content', text: '对内容生产流程影响较小，现有 API 接口层抽象到位，只需替换底层 SDK', delayMs: 2500 },
      { employeeId: 'delivery', text: '研发投入预估：2 名后端 + 1 名运维，4 周完成迁移和压测', delayMs: 2300 },
      { employeeId: 'content', text: '建议先在内容召回链路灰度上线，验证稳定后再全量切换', delayMs: 2600 },
      { employeeId: 'delivery', text: '最终推荐 Milvus 2.4 LTS 版本，配合自研备份组件，预计 Q3 末完成迁移', delayMs: 2500 },
    ],
    decisions: [
      '向量数据库选定 Milvus 2.4 LTS 版本',
      '灰度策略：内容召回链路先上线，验证后全量切换',
      '研发投入：2 后端 + 1 运维，4 周完成迁移与压测',
      '自研备份恢复组件，Q3 末完成整体迁移',
    ],
  },
  {
    id: 'risk-assessment',
    title: '风险评估',
    description: '识别项目风险并制定应对策略',
    participantIds: ['business', 'finance', 'service'],
    userSpeechOptions: [
      '本季度项目交付存在哪些主要风险',
      '财务侧有没有现金流压力',
      '客服侧用户投诉趋势如何',
      '针对高风险项，应对策略是什么',
      '需要预备多少应急资源',
      '风险监控机制怎么建',
      '请输出风险等级矩阵',
    ],
    aiResponses: [
      { employeeId: 'business', text: '我识别出 5 类主要风险：1) 客户流失 2) 合规变更 3) 技术中断 4) 人才流失 5) 供应链波动', delayMs: 2000 },
      { employeeId: 'finance', text: '现金流方面，账面现金 1200 万，按当前 burn rate 可支撑 14 个月，但 Q3 有 200 万应收账款延期风险', delayMs: 2500 },
      { employeeId: 'service', text: '投诉趋势：本月投诉量环比上升 18%，主要集中在数据准确性和响应速度，NPS 下降 3 分', delayMs: 2300 },
      { employeeId: 'business', text: '高风险项 TOP3：1) 大客户续约风险 2) 监管政策变化 3) 核心团队离职', delayMs: 2700 },
      { employeeId: 'finance', text: '建议预备 150 万应急资金，覆盖 1 个月运营成本 + 关键岗位 backfill', delayMs: 2600 },
      { employeeId: 'service', text: '应对策略：1) 7x24 应急响应 2) 大客户专属 SLA 3) 投诉 24h 闭环', delayMs: 2400 },
      { employeeId: 'business', text: '风险监控机制：周度风险看板 + 月度风险复盘 + 季度压力测试', delayMs: 2500 },
      { employeeId: 'finance', text: '现金流监控：每月滚动预测 13 周现金流，触发阈值即启动应急方案', delayMs: 2300 },
      { employeeId: 'service', text: '用户侧建立 NPS 预警机制，单周 NPS 下降 > 2 分即拉响警报', delayMs: 2600 },
      { employeeId: 'business', text: '风险等级矩阵我整理后下周一发送给各位，请大家在本周内补充本部门风险项', delayMs: 2700 },
    ],
    decisions: [
      '预备 150 万应急资金覆盖 1 个月运营',
      '建立三级风险监控：周看板 / 月复盘 / 季压测',
      '现金流每月滚动预测 13 周，触发阈值启动应急',
      'NPS 单周下降 > 2 分即拉响警报',
    ],
  },
];

/* ===================== 工具函数 ===================== */

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(start: number, end: number): string {
  const totalSec = Math.max(0, Math.floor((end - start) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min} 分 ${sec} 秒`;
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

/* ===================== 主组件 ===================== */

export default function MeetingRoom({ open, onClose, employees }: MeetingRoomProps) {
  // ---- 阶段状态 ----
  const [phase, setPhase] = useState<MeetingPhase>('setup');

  // ---- 发起区状态 ----
  const [selectedScriptId, setSelectedScriptId] = useState<string>(MEETING_SCRIPTS[0].id);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>(MEETING_SCRIPTS[0].participantIds);

  // ---- 进行区状态 ----
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechModalOpen, setSpeechModalOpen] = useState(false);
  const [speechMode, setSpeechMode] = useState<'preset' | 'custom'>('preset');
  const [selectedSpeech, setSelectedSpeech] = useState<string>('');
  const [customSpeech, setCustomSpeech] = useState('');
  const [aiResponding, setAiResponding] = useState(false);
  const [meetingStartTime, setMeetingStartTime] = useState(0);
  const [meetingEndTime, setMeetingEndTime] = useState(0);

  // ---- 纪要区状态 ----
  const [summary, setSummary] = useState('');

  // ---- Refs ----
  const messageListRef = useRef<HTMLDivElement>(null);
  const aiTimersRef = useRef<number[]>([]);
  const pushToTalkTimerRef = useRef<number | undefined>(undefined);
  const messageCounterRef = useRef(0);

  // 当切换脚本时, 同步默认参会人
  const handleScriptChange = useCallback((scriptId: string) => {
    const script = MEETING_SCRIPTS.find((s) => s.id === scriptId);
    if (!script) return;
    setSelectedScriptId(scriptId);
    setSelectedParticipantIds(script.participantIds);
  }, []);

  // 当前脚本
  const currentScript = useMemo(
    () => MEETING_SCRIPTS.find((s) => s.id === selectedScriptId) ?? MEETING_SCRIPTS[0],
    [selectedScriptId],
  );

  // 参会员工 (按 selectedParticipantIds 过滤)
  const participants = useMemo(
    () => selectedParticipantIds
      .map((id) => employees.find((e) => e.id === id))
      .filter((x): x is AIEmployee => Boolean(x)),
    [selectedParticipantIds, employees],
  );

  // ---- 消息自动滚动到底部 ----
  useEffect(() => {
    const el = messageListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // ---- 清理定时器 (组件卸载或 Drawer 关闭) ----
  useEffect(() => {
    return () => {
      aiTimersRef.current.forEach((id) => window.clearTimeout(id));
      aiTimersRef.current = [];
      if (pushToTalkTimerRef.current !== undefined) {
        window.clearTimeout(pushToTalkTimerRef.current);
        pushToTalkTimerRef.current = undefined;
      }
    };
  }, []);

  // 生成唯一消息 ID
  const genMessageId = useCallback(() => {
    messageCounterRef.current += 1;
    return `msg-${messageCounterRef.current}`;
  }, []);

  // ---- 发起会议 ----
  const handleStartMeeting = useCallback(() => {
    if (participants.length === 0) {
      antdMessage.warning('请至少选择 1 名参会 AI 员工');
      return;
    }
    setMessages([]);
    setSummary('');
    setMeetingStartTime(Date.now());
    setMeetingEndTime(0);
    setPhase('active');
    const now = Date.now();
    const sysMsg: MeetingMessage = {
      id: `sys-${now}`,
      role: 'system',
      text: `会议「${currentScript.title}」已开始 · 参会人 ${participants.length} 名`,
      timestamp: now,
    };
    setMessages([sysMsg]);
  }, [participants, currentScript]);

  // ---- Push-to-Talk: 按下后 2 秒弹出脚本选项 ----
  const handlePushToTalk = useCallback(() => {
    if (aiResponding) {
      antdMessage.info('AI 正在回应中，请稍候');
      return;
    }
    setIsSpeaking(true);
    // 2 秒后弹出 Modal
    if (pushToTalkTimerRef.current !== undefined) {
      window.clearTimeout(pushToTalkTimerRef.current);
    }
    pushToTalkTimerRef.current = window.setTimeout(() => {
      setSpeechMode('preset');
      setSelectedSpeech(currentScript.userSpeechOptions[0] ?? '');
      setCustomSpeech('');
      setSpeechModalOpen(true);
      pushToTalkTimerRef.current = undefined;
    }, 2000);
  }, [aiResponding, currentScript]);

  // ---- 取消 Push-to-Talk (Modal 关闭) ----
  const handleSpeechModalCancel = useCallback(() => {
    setSpeechModalOpen(false);
    setIsSpeaking(false);
  }, []);

  // ---- 确认发言 ----
  const handleConfirmSpeech = useCallback(() => {
    let text = '';
    if (speechMode === 'preset') {
      if (!selectedSpeech.trim()) {
        antdMessage.warning('请选择发言内容');
        return;
      }
      text = selectedSpeech.trim();
    } else {
      if (!customSpeech.trim()) {
        antdMessage.warning('请输入发言内容');
        return;
      }
      text = customSpeech.trim();
    }

    // 添加用户消息
    const userMsg: MeetingMessage = {
      id: genMessageId(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 重置状态
    setSpeechModalOpen(false);
    setIsSpeaking(false);
    setSelectedSpeech('');
    setCustomSpeech('');

    // 触发 AI 回应 (按脚本顺序, 每条延迟 delayMs)
    triggerAIResponses();
  }, [speechMode, selectedSpeech, customSpeech, genMessageId]);

  // ---- 触发 AI 回应序列 ----
  const triggerAIResponses = useCallback(() => {
    // 清理之前的定时器 (避免叠加)
    aiTimersRef.current.forEach((id) => window.clearTimeout(id));
    aiTimersRef.current = [];

    // 仅触发当前参会 AI 的回应 (按脚本顺序过滤)
    const validResponses = currentScript.aiResponses.filter(
      (step) => selectedParticipantIds.includes(step.employeeId),
    );

    if (validResponses.length === 0) return;

    setAiResponding(true);
    let cumulativeDelay = 0;

    validResponses.forEach((step, idx) => {
      cumulativeDelay += step.delayMs;
      const timerId = window.setTimeout(() => {
        const emp = employees.find((e) => e.id === step.employeeId);
        const aiMsg: MeetingMessage = {
          id: genMessageId(),
          role: 'assistant',
          employeeId: step.employeeId,
          text: step.text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        // 最后一条消息后, 结束 AI 回应状态
        if (idx === validResponses.length - 1) {
          setAiResponding(false);
        }
      }, cumulativeDelay);
      aiTimersRef.current.push(timerId);
    });
  }, [currentScript, selectedParticipantIds, employees, genMessageId]);

  // ---- 生成 Markdown 会议纪要 ----
  const generateSummary = useCallback((endTime: number): string => {
    const lines: string[] = [];
    lines.push('# 会议纪要');
    lines.push('');
    lines.push('## 会议主题');
    lines.push(`${currentScript.title}`);
    lines.push('');
    lines.push(`> ${currentScript.description}`);
    lines.push('');
    lines.push('## 会议时间');
    lines.push(`- 开始：${formatDateTime(meetingStartTime)}`);
    lines.push(`- 结束：${formatDateTime(endTime)}`);
    lines.push(`- 时长：${formatDuration(meetingStartTime, endTime)}`);
    lines.push('');
    lines.push('## 参会人员');
    lines.push('- 主持人（用户）');
    participants.forEach((p) => {
      lines.push(`- ${p.emoji} ${p.name}`);
    });
    lines.push('');
    lines.push('## 发言记录');
    messages.forEach((m) => {
      const time = formatTime(m.timestamp);
      if (m.role === 'user') {
        lines.push(`[${time}] **主持人**: ${m.text}`);
      } else if (m.role === 'assistant') {
        const emp = employees.find((e) => e.id === m.employeeId);
        const name = emp ? `${emp.emoji} ${emp.name}` : 'AI';
        lines.push(`[${time}] **${name}**: ${m.text}`);
      } else {
        lines.push(`[${time}] _系统_: ${m.text}`);
      }
    });
    lines.push('');
    lines.push('## 决议');
    currentScript.decisions.forEach((d, i) => {
      lines.push(`${i + 1}. ${d}`);
    });
    lines.push('');
    lines.push('---');
    lines.push(`_本纪要由会议室系统自动生成 · ${formatDateTime(endTime)}_`);
    return lines.join('\n');
  }, [currentScript, meetingStartTime, participants, messages, employees]);

  // ---- 结束会议, 生成纪要 ----
  const handleEndMeeting = useCallback(() => {
    // 取消所有 pending AI 定时器
    aiTimersRef.current.forEach((id) => window.clearTimeout(id));
    aiTimersRef.current = [];
    setAiResponding(false);

    const endTime = Date.now();
    setMeetingEndTime(endTime);
    const md = generateSummary(endTime);
    setSummary(md);
    setPhase('summary');
    antdMessage.success('会议纪要已生成');
  }, [generateSummary]);

  // ---- 复制纪要 ----
  const handleCopySummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary);
      antdMessage.success('会议纪要已复制到剪贴板');
    } catch (err) {
      console.error('[MeetingRoom] clipboard write failed', err);
      antdMessage.error('复制失败, 请手动选择文本复制');
    }
  }, [summary]);

  // ---- 导出 .md 文件 ----
  const handleExportMarkdown = useCallback(() => {
    try {
      const blob = new Blob([summary], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = Date.now();
      const fileName = `会议纪要_${safeFilename(currentScript.title)}_${ts}.md`;
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      antdMessage.success(`已导出 ${fileName}`);
    } catch (err) {
      console.error('[MeetingRoom] export markdown failed', err);
      antdMessage.error('导出失败, 请重试');
    }
  }, [summary, currentScript]);

  // ---- 重新开始 ----
  const handleRestart = useCallback(() => {
    aiTimersRef.current.forEach((id) => window.clearTimeout(id));
    aiTimersRef.current = [];
    setMessages([]);
    setSummary('');
    setIsSpeaking(false);
    setSpeechModalOpen(false);
    setAiResponding(false);
    setPhase('setup');
  }, []);

  // ---- Drawer 关闭 (允许直接关闭, 保留状态) ----
  const handleDrawerClose = useCallback(() => {
    // 取消正在进行的 Push-to-Talk 定时器 (避免关闭后弹出 Modal)
    if (pushToTalkTimerRef.current !== undefined) {
      window.clearTimeout(pushToTalkTimerRef.current);
      pushToTalkTimerRef.current = undefined;
    }
    setIsSpeaking(false);
    setSpeechModalOpen(false);
    onClose();
  }, [onClose]);

  // ---- 渲染参会员工头像列表 ----
  const renderParticipants = useCallback(() => {
    return (
      <div className={styles.participantList}>
        {participants.map((p) => (
          <Tooltip key={p.id} title={`${p.name} · 在会议中`}>
            <div
              className={styles.participantChip}
              style={{ borderColor: p.themeColor }}
            >
              <span className={styles.participantEmoji}>{p.emoji}</span>
              <span className={styles.participantName} style={{ color: p.themeColor }}>
                {p.name}
              </span>
              <span
                className={styles.statusDot}
                style={{ background: p.themeColor, boxShadow: `0 0 6px ${p.themeColor}` }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
    );
  }, [participants]);

  /* ===================== 渲染 ===================== */

  return (
    <Drawer
      open={open}
      onClose={handleDrawerClose}
      title={
        <div className={styles.drawerTitle}>
          <span className={styles.drawerTitleIcon}>🏛️</span>
          <span>会议室</span>
          {phase === 'active' && (
            <Tag color="processing" className={styles.phaseTag}>进行中</Tag>
          )}
          {phase === 'summary' && (
            <Tag color="success" className={styles.phaseTag}>已结束</Tag>
          )}
        </div>
      }
      width={600}
      placement="right"
      destroyOnClose={false}
      styles={{
        body: { padding: 0, background: 'var(--color-bg-layout)' },
      }}
    >
      <div className={styles.container}>
        {/* ========== 会议发起区 ========== */}
        {phase === 'setup' && (
          <div className={styles.setupView}>
            <div className={styles.sectionTitle}>
              <TeamOutlined /> 发起会议
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>会议主题</label>
              <Select
                value={selectedScriptId}
                onChange={handleScriptChange}
                style={{ width: '100%' }}
                options={MEETING_SCRIPTS.map((s) => ({
                  label: s.title,
                  value: s.id,
                }))}
              />
              <div className={styles.scriptDescription}>
                {currentScript.description}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>参会 AI 员工</label>
              <Checkbox.Group
                value={selectedParticipantIds}
                onChange={(checkedValues) =>
                  setSelectedParticipantIds(checkedValues as string[])
                }
                className={styles.checkboxGroup}
              >
                <div className={styles.employeeGrid}>
                  {employees.map((emp) => (
                    <Checkbox
                      key={emp.id}
                      value={emp.id}
                      className={styles.employeeCheckbox}
                      style={{ '--emp-color': emp.themeColor } as React.CSSProperties}
                    >
                      <span className={styles.employeeEmoji}>{emp.emoji}</span>
                      <span className={styles.employeeName}>{emp.name}</span>
                    </Checkbox>
                  ))}
                </div>
              </Checkbox.Group>
            </div>

            <div className={styles.scriptPreview}>
              <div className={styles.scriptPreviewTitle}>
                📋 脚本预览
              </div>
              <div className={styles.scriptPreviewRow}>
                <span className={styles.scriptPreviewLabel}>预设发言选项：</span>
                <span>{currentScript.userSpeechOptions.length} 条</span>
              </div>
              <div className={styles.scriptPreviewRow}>
                <span className={styles.scriptPreviewLabel}>AI 回应脚本：</span>
                <span>
                  {currentScript.aiResponses.filter(
                    (r) => selectedParticipantIds.includes(r.employeeId),
                  ).length}{' '}
                  条
                </span>
              </div>
              <div className={styles.scriptPreviewRow}>
                <span className={styles.scriptPreviewLabel}>预设决议：</span>
                <span>{currentScript.decisions.length} 项</span>
              </div>
            </div>

            <Button
              type="primary"
              size="large"
              block
              icon={<AudioOutlined />}
              onClick={handleStartMeeting}
              className={styles.startButton}
              disabled={participants.length === 0}
            >
              发起会议
            </Button>
          </div>
        )}

        {/* ========== 会议进行区 ========== */}
        {phase === 'active' && (
          <div className={styles.activeView}>
            {/* 顶部：主题 + 参会人 */}
            <div className={styles.activeHeader}>
              <div className={styles.activeTitle}>
                <span className={styles.activeTitleIcon}>🎯</span>
                <span>{currentScript.title}</span>
              </div>
              {renderParticipants()}
            </div>

            {/* 中部：消息列表 */}
            <div className={styles.messageListWrap}>
              <div ref={messageListRef} className={styles.messageList}>
                {messages.length === 0 ? (
                  <div className={styles.emptyHint}>
                    会议已开始，请按住下方按钮发言
                  </div>
                ) : (
                  messages.map((m) => {
                    if (m.role === 'system') {
                      return (
                        <div key={m.id} className={styles.systemMessage}>
                          {m.text}
                        </div>
                      );
                    }
                    if (m.role === 'user') {
                      return (
                        <div key={m.id} className={styles.userMessageWrap}>
                          <ChatBubble
                            type="text"
                            role="user"
                            content={m.text}
                            timestamp={formatTime(m.timestamp)}
                          />
                        </div>
                      );
                    }
                    // AI 消息
                    const emp = employees.find((e) => e.id === m.employeeId);
                    const themeColor = emp?.themeColor ?? '#1677FF';
                    return (
                      <div
                        key={m.id}
                        className={styles.aiMessageWrap}
                        style={{ borderLeftColor: themeColor }}
                      >
                        <ChatBubble
                          type="text"
                          role="assistant"
                          content={m.text}
                          timestamp={formatTime(m.timestamp)}
                          avatar={emp?.emoji ?? '🤖'}
                        />
                      </div>
                    );
                  })
                )}
                {aiResponding && (
                  <div className={styles.aiTypingHint}>
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingText}>AI 正在回应...</span>
                  </div>
                )}
              </div>
            </div>

            {/* 底部：Push-to-Talk + 结束会议 */}
            <div className={styles.activeFooter}>
              <div className={styles.pushToTalkWrap}>
                <button
                  type="button"
                  className={`${styles.pushToTalkButton} ${isSpeaking ? styles.pushToTalkActive : ''}`}
                  onClick={handlePushToTalk}
                  disabled={aiResponding}
                  aria-label="按住说话"
                >
                  {isSpeaking ? (
                    <>
                      <span className={styles.speakingWave}>
                        <span /><span /><span /><span /><span />
                      </span>
                      <span className={styles.pushToTalkText}>正在发言...</span>
                    </>
                  ) : (
                    <>
                      <AudioOutlined className={styles.pushToTalkIcon} />
                      <span className={styles.pushToTalkText}>按住说话</span>
                    </>
                  )}
                </button>
              </div>
              <Button
                danger
                onClick={handleEndMeeting}
                className={styles.endButton}
              >
                结束会议
              </Button>
            </div>
          </div>
        )}

        {/* ========== 会议纪要区 ========== */}
        {phase === 'summary' && (
          <div className={styles.summaryView}>
            <div className={styles.summaryHeader}>
              <CheckCircleOutlined className={styles.summaryHeaderIcon} />
              <span>会议已结束，纪要已生成</span>
            </div>

            <div className={styles.summaryActions}>
              <Button icon={<CopyOutlined />} onClick={handleCopySummary}>
                复制纪要
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportMarkdown}
                type="primary"
              >
                导出 .md 文件
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleRestart}>
                重新开始
              </Button>
            </div>

            <div className={styles.summaryPreview}>
              <div className={styles.summaryPreviewTitle}>📄 Markdown 预览</div>
              <pre className={styles.summaryPre}>{summary}</pre>
            </div>
          </div>
        )}

        {/* ========== 脚本选项 Modal ========== */}
        <Modal
          title="请选择发言内容"
          open={speechModalOpen}
          onCancel={handleSpeechModalCancel}
          onOk={handleConfirmSpeech}
          okText="确认发言"
          cancelText="取消"
          width={520}
          destroyOnClose
        >
          <div className={styles.speechModalBody}>
            {speechMode === 'preset' ? (
              <>
                <Radio.Group
                  value={selectedSpeech}
                  onChange={(e) => setSelectedSpeech(e.target.value)}
                  className={styles.speechRadioGroup}
                >
                  <div className={styles.speechRadioList}>
                    {currentScript.userSpeechOptions.map((opt, idx) => (
                      <Radio
                        key={idx}
                        value={opt}
                        className={styles.speechRadioItem}
                      >
                        <span className={styles.speechOptionText}>{opt}</span>
                      </Radio>
                    ))}
                  </div>
                </Radio.Group>
                <Button
                  type="link"
                  onClick={() => setSpeechMode('custom')}
                  className={styles.switchModeButton}
                >
                  切换为自定义输入 →
                </Button>
              </>
            ) : (
              <>
                <Input.TextArea
                  value={customSpeech}
                  onChange={(e) => setCustomSpeech(e.target.value)}
                  rows={5}
                  placeholder="请输入你的发言内容..."
                  maxLength={500}
                  showCount
                  className={styles.customSpeechInput}
                />
                <Button
                  type="link"
                  onClick={() => setSpeechMode('preset')}
                  className={styles.switchModeButton}
                >
                  ← 切换为预设选项
                </Button>
              </>
            )}
          </div>
        </Modal>
      </div>
    </Drawer>
  );
}
