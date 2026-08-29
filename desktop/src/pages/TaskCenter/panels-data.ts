/**
 * 军机处补齐面板共享常量与类型（照搬 edict 原版 frontend/src/store.ts 的相关片段）
 * 数据来源：深瞳 IPC（edict-api.ts）——与 edict 原版 HTTP API 一一对应。
 */
import type { EdictTask } from "@shared/edict-types";
import { message } from "antd";

/** 官员/官署常量（edict 原版 DEPTS） */
export interface Dept {
  id: string;
  label: string;
  emoji: string;
  role: string;
  rank: string;
}

export const DEPTS: Dept[] = [
  { id: 'taizi',    label: '太子',   emoji: '🤴', role: '太子',     rank: '储君' },
  { id: 'zhongshu', label: '中书省', emoji: '📜', role: '中书令',   rank: '正一品' },
  { id: 'menxia',   label: '门下省', emoji: '🔍', role: '侍中',     rank: '正一品' },
  { id: 'shangshu', label: '尚书省', emoji: '📮', role: '尚书令',   rank: '正一品' },
  { id: 'libu',     label: '礼部',   emoji: '📝', role: '礼部尚书', rank: '正二品' },
  { id: 'hubu',     label: '户部',   emoji: '💰', role: '户部尚书', rank: '正二品' },
  { id: 'bingbu',   label: '兵部',   emoji: '⚔️', role: '兵部尚书', rank: '正二品' },
  { id: 'xingbu',   label: '刑部',   emoji: '⚖️', role: '刑部尚书', rank: '正二品' },
  { id: 'gongbu',   label: '工部',   emoji: '🔧', role: '工部尚书', rank: '正二品' },
  { id: 'libu_hr',  label: '吏部',   emoji: '👔', role: '吏部尚书', rank: '正二品' },
  { id: 'zaochao',  label: '钦天监', emoji: '📰', role: '朝报官',   rank: '正三品' },
];

/** 状态中文标签（edict 原版 STATE_LABEL） */
export const STATE_LABEL: Record<string, string> = {
  Inbox: '收件', Pending: '待处理', Taizi: '太子分拣', Zhongshu: '中书起草',
  Menxia: '门下审议', Assigned: '已派发', Doing: '执行中', Review: '待审查',
  Done: '已完成', Blocked: '阻塞', Cancelled: '已取消', Next: '待执行',
};

/** 是否旨意任务（JJC- 前缀，edict 原版 isEdict） */
export function isEdictTask(t: { id?: string }): boolean {
  return /^JJC-/i.test(t.id || "");
}

/** 旨库模板参数 */
export interface TemplateParam {
  key: string;
  label: string;
  type: "text" | "textarea" | "select";
  default?: string;
  required?: boolean;
  options?: string[];
}

/** 旨库模板 */
export interface Template {
  id: string;
  cat: string;
  icon: string;
  name: string;
  desc: string;
  depts: string[];
  est: string;
  cost: string;
  params: TemplateParam[];
  command: string;
}

/** 旨库模板清单（照搬 edict 原版 TEMPLATES） */
export const TEMPLATES: Template[] = [
  {
    id: 'tpl-weekly-report', cat: '日常办公', icon: '📝', name: '周报生成',
    desc: '基于本周看板数据和各部产出，自动生成结构化周报',
    depts: ['户部', '礼部'], est: '~10分钟', cost: '¥0.5',
    params: [
      { key: 'date_range', label: '报告周期', type: 'text', default: '本周', required: true },
      { key: 'focus', label: '重点关注（逗号分隔）', type: 'text', default: '项目进展,下周计划' },
      { key: 'format', label: '输出格式', type: 'select', options: ['Markdown', '飞书文档'], default: 'Markdown' },
    ],
    command: '生成{date_range}的周报，重点覆盖{focus}，输出为{format}格式',
  },
  {
    id: 'tpl-code-review', cat: '工程开发', icon: '🔍', name: '代码审查',
    desc: '对指定代码仓库/文件进行质量审查，输出问题清单和改进建议',
    depts: ['兵部', '刑部'], est: '~20分钟', cost: '¥2',
    params: [
      { key: 'repo', label: '仓库/文件路径', type: 'text', required: true },
      { key: 'scope', label: '审查范围', type: 'select', options: ['全量', '增量(最近commit)', '指定文件'], default: '增量(最近commit)' },
      { key: 'focus', label: '重点关注（可选）', type: 'text', default: '安全漏洞,错误处理,性能' },
    ],
    command: '对 {repo} 进行代码审查，范围：{scope}，重点关注：{focus}',
  },
  {
    id: 'tpl-api-design', cat: '工程开发', icon: '⚡', name: 'API 设计与实现',
    desc: '从需求描述到 RESTful API 设计、实现、测试一条龙',
    depts: ['中书省', '兵部'], est: '~45分钟', cost: '¥3',
    params: [
      { key: 'requirement', label: '需求描述', type: 'textarea', required: true },
      { key: 'tech', label: '技术栈', type: 'select', options: ['Python/FastAPI', 'Node/Express', 'Go/Gin'], default: 'Python/FastAPI' },
      { key: 'auth', label: '鉴权方式', type: 'select', options: ['JWT', 'API Key', '无'], default: 'JWT' },
    ],
    command: '设计并实现一个 {tech} 的 RESTful API：{requirement}。鉴权方式：{auth}',
  },
  {
    id: 'tpl-competitor', cat: '数据分析', icon: '📊', name: '竞品分析',
    desc: '爬取竞品网站数据，分析对比，生成结构化报告',
    depts: ['兵部', '户部', '礼部'], est: '~60分钟', cost: '¥5',
    params: [
      { key: 'targets', label: '竞品名称/URL（每行一个）', type: 'textarea', required: true },
      { key: 'dimensions', label: '分析维度', type: 'text', default: '产品功能,定价策略,用户评价' },
      { key: 'format', label: '输出格式', type: 'select', options: ['Markdown报告', '表格对比'], default: 'Markdown报告' },
    ],
    command: '对以下竞品进行分析：\n{targets}\n\n分析维度：{dimensions}，输出格式：{format}',
  },
  {
    id: 'tpl-data-report', cat: '数据分析', icon: '📈', name: '数据报告',
    desc: '对给定数据集进行清洗、分析、可视化，输出分析报告',
    depts: ['户部', '礼部'], est: '~30分钟', cost: '¥2',
    params: [
      { key: 'data_source', label: '数据源描述/路径', type: 'text', required: true },
      { key: 'questions', label: '分析问题（每行一个）', type: 'textarea' },
      { key: 'viz', label: '是否需要可视化图表', type: 'select', options: ['是', '否'], default: '是' },
    ],
    command: '对数据 {data_source} 进行分析。{questions}\n需要可视化：{viz}',
  },
  {
    id: 'tpl-blog', cat: '内容创作', icon: '✍️', name: '博客文章',
    desc: '给定主题和要求，生成高质量博客文章',
    depts: ['礼部'], est: '~15分钟', cost: '¥1',
    params: [
      { key: 'topic', label: '文章主题', type: 'text', required: true },
      { key: 'audience', label: '目标读者', type: 'text', default: '技术人员' },
      { key: 'length', label: '期望字数', type: 'select', options: ['~1000字', '~2000字', '~3000字'], default: '~2000字' },
      { key: 'style', label: '风格', type: 'select', options: ['技术教程', '观点评论', '案例分析'], default: '技术教程' },
    ],
    command: '写一篇关于「{topic}」的博客文章，面向{audience}，{length}，风格：{style}',
  },
  {
    id: 'tpl-deploy', cat: '工程开发', icon: '🚀', name: '部署方案',
    desc: '生成完整的部署检查单、Docker配置、CI/CD流程',
    depts: ['兵部', '工部'], est: '~25分钟', cost: '¥2',
    params: [
      { key: 'project', label: '项目名称/描述', type: 'text', required: true },
      { key: 'env', label: '部署环境', type: 'select', options: ['Docker', 'K8s', 'VPS', 'Serverless'], default: 'Docker' },
      { key: 'ci', label: 'CI/CD 工具', type: 'select', options: ['GitHub Actions', 'GitLab CI', '无'], default: 'GitHub Actions' },
    ],
    command: '为项目「{project}」生成{env}部署方案，CI/CD使用{ci}',
  },
  {
    id: 'tpl-email', cat: '内容创作', icon: '📧', name: '邮件/通知文案',
    desc: '根据场景和目的，生成专业邮件或通知文案',
    depts: ['礼部'], est: '~5分钟', cost: '¥0.3',
    params: [
      { key: 'scenario', label: '使用场景', type: 'select', options: ['商务邮件', '产品发布', '客户通知', '内部公告'], default: '商务邮件' },
      { key: 'purpose', label: '目的/内容', type: 'textarea', required: true },
      { key: 'tone', label: '语调', type: 'select', options: ['正式', '友好', '简洁'], default: '正式' },
    ],
    command: '撰写一封{scenario}，{tone}语调。内容：{purpose}',
  },
  {
    id: 'tpl-standup', cat: '日常办公', icon: '🗓️', name: '每日站会摘要',
    desc: '汇总各部今日进展和明日计划，生成站会摘要',
    depts: ['尚书省'], est: '~5分钟', cost: '¥0.3',
    params: [
      { key: 'range', label: '汇总范围', type: 'select', options: ['今天', '最近24小时', '昨天+今天'], default: '今天' },
    ],
    command: '汇总{range}各部工作进展和待办，生成站会摘要',
  },
];



/** 旨库分类（edict 原版 TPL_CATS） */
export const TPL_CATS: { name: string; icon: string }[] = [
  { name: '全部', icon: '📋' },
  { name: '日常办公', icon: '💼' },
  { name: '数据分析', icon: '📊' },
  { name: '工程开发', icon: '⚙️' },
  { name: '内容创作', icon: '✍️' },
];

/** 官署 id → Hermes profile id（与 OFFICIALS 对齐；taizi 由 OpenClaw 承载） */
export const PROFILE_IDS: Record<string, string> = {
  taizi: "taizi", zhongshu: "zhongshu", menxia: "menxia", shangshu: "shangshu",
  libu: "libu", hubu: "hubu", libu_hr: "libu_hr", bingbu: "bingbu",
  xingbu: "xingbu", gongbu: "gongbu", zaochao: "zaochao", qintianjian: "qintianjian",
};

/** 相对时间（分钟/小时/天） */
export function timeAgo(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return min + " 分钟前";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + " 小时前";
  return Math.floor(hr / 24) + " 天前";
}

/** 看板时间格式化 */
export function fmtBoardTime(v?: string): string {
  if (!v) return "";
  return v.replace("T", " ").slice(0, 16);
}

export type { EdictTask };

/** 轻量提示（antd message；edict 原版 toast 适配） */
export function toast(text: string, kind?: "ok" | "err"): void {
  if (kind === "err") message.error(text);
  else message.success(text);
}
