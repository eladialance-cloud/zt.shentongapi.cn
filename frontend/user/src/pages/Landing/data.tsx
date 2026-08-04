// 落地页静态数据 - 与 820346f8 内联数据一致（合并事故后独立为 data.ts）
import type { ReactNode } from 'react';
import {
  ApartmentOutlined,
  BarChartOutlined,
  BulbOutlined,
  CodeOutlined,
  CrownOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  MessageOutlined,
  NotificationOutlined,
  RocketOutlined,
  ShareAltOutlined,
  SmileOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
/* ===== Navbar ===== */
interface NavItem {
  id: string;
  label: string;
}

export const navItems: NavItem[] = [
  { id: 'organization', label: '8大AI员工' },
  { id: 'foundation', label: '基座' },
  { id: 'organization', label: '组织架构' },
  { id: 'flywheel', label: '业务飞轮' },
  { id: 'flywheel', label: 'SOP' },
  { id: 'collaboration', label: '协作' },
  { id: 'tech', label: '技术' },
  { id: 'industries', label: '案例' },
];

/* ===== Hero ===== */
interface StatItem {
  value: string;
  label: string;
}

export const heroStats: StatItem[] = [
  { value: '8', label: '核心员工' },
  { value: '24/7', label: '全自动运行' },
  { value: '1', label: '人即可启动' },
  { value: '∞', label: '无限扩展' },
];

/* ===== Foundation ===== */
interface FoundationCard {
  name: string;
  role: string;
  desc: string;
  features: string[];
  icon: ReactNode;
}

export const foundationCards: FoundationCard[] = [
  {
    name: 'OpenClaw',
    role: 'AI RUNTIME',
    desc: '统一AI运行时基座，多模型调度与工具协议标准化的底层引擎。',
    features: ['多模型统一调度', '工具协议标准化', '长程记忆持久化', '7×24小时稳定运行'],
    icon: <ThunderboltOutlined />,
  },
  {
    name: 'Hermes',
    role: 'ORCHESTRATION',
    desc: '多Agent编排中枢，负责任务分发、状态管理与异常恢复。',
    features: ['多Agent任务编排', '角色权限分配', '状态机驱动流程', '异常自动恢复'],
    icon: <ApartmentOutlined />,
  },
];

export const processSteps = ['OpenClaw', 'Hermes', '8大AI员工', 'n8n', '飞书'];

/* ===== Organization ===== */
interface OrgCard {
  name: string;
  role: string;
  tags: string[];
  icon: ReactNode;
}

export const ceoCard: OrgCard = {
  name: 'CEO',
  role: '决策层',
  tags: ['战略决策', '目标拆解', '资源统筹'],
  icon: <CrownOutlined />,
};

export const coreCards: OrgCard[] = [
  { name: '秘书助理', role: '任务调度中枢', tags: ['任务分发', '日程管理'], icon: <UserOutlined /> },
  { name: '流量操盘手', role: '公域流量获取', tags: ['内容策划', '投放优化'], icon: <RocketOutlined /> },
  { name: '渠道经理', role: '渠道资源管理', tags: ['渠道拓展', '合作对接'], icon: <ShareAltOutlined /> },
  { name: '销售经理', role: '销售目标达成', tags: ['线索转化', '业绩跟进'], icon: <TrophyOutlined /> },
  { name: '客户成功', role: '交付与续费', tags: ['交付保障', '复购运营'], icon: <SmileOutlined /> },
];

export const execCards: OrgCard[] = [
  { name: '销售客服', role: '私域销售转化', tags: ['客户跟进', '订单成交'], icon: <MessageOutlined /> },
  { name: '私域运营', role: '私域池运营', tags: ['社群运营', '内容触达'], icon: <TeamOutlined /> },
  { name: '新媒体运营', role: '内容生产分发', tags: ['文案撰写', '视频剪辑'], icon: <NotificationOutlined /> },
  { name: '产品经理', role: '产品规划落地', tags: ['需求管理', '版本迭代'], icon: <BulbOutlined /> },
  { name: '开发工程师', role: '系统开发维护', tags: ['功能开发', 'Bug修复'], icon: <CodeOutlined /> },
  { name: '数据分析师', role: '数据洞察分析', tags: ['报表产出', '指标监控'], icon: <BarChartOutlined /> },
];

/* ===== Business Flywheel ===== */
interface FlywheelStep {
  num: string;
  title: string;
  en: string;
  roles: string;
}

export const flywheelSteps: FlywheelStep[] = [
  { num: '1', title: '公域获客', en: 'TRAFFIC', roles: '流量操盘手、新媒体运营、渠道经理' },
  { num: '2', title: '私域沉淀', en: 'PRIVATE', roles: '私域运营经理、销售客服' },
  { num: '3', title: '销售转化', en: 'SALES', roles: '销售经理、销售客服' },
  { num: '4', title: '交付成功', en: 'CUSTOMER', roles: '客户成功经理' },
  { num: '5', title: '复购裂变', en: 'RETENTION', roles: '私域运营经理' },
];

export const flywheelActions = [
  '多平台内容分发，捕获精准流量',
  '爆款脚本自动生成，日更百条素材',
  '渠道数据实时监控，动态优化投放',
  '私域入口埋点，引导用户加微转化',
];

/* ===== Collaboration ===== */
interface DataflowCard {
  from: string;
  to: string;
  label: string;
}

export const dataflowCards: DataflowCard[] = [
  { from: 'CEO', to: '秘书助理', label: '任务分发' },
  { from: '秘书助理', to: '所有Agent', label: '任务分发' },
  { from: '流量操盘手', to: '新媒体运营', label: '数据同步' },
  { from: '渠道经理', to: '销售经理', label: '数据同步' },
  { from: '销售经理', to: '销售客服', label: '双向协同' },
  { from: '客户成功', to: '私域运营', label: '数据同步' },
];

interface InfraCard {
  name: string;
  desc: string;
  icon: ReactNode;
}

export const infraCards: InfraCard[] = [
  { name: '飞书多维表格', desc: '结构化数据中枢', icon: <DatabaseOutlined /> },
  { name: 'IM即时通讯', desc: '实时消息通道', icon: <MessageOutlined /> },
  { name: 'n8n自动化引擎', desc: '工作流编排', icon: <DeploymentUnitOutlined /> },
];

/* ===== Tech Infrastructure ===== */
interface TechCard {
  num: string;
  name: string;
  role: string;
  features: string[];
}

export const techCards: TechCard[] = [
  {
    num: '1',
    name: 'OpenClaw + Hermes 基座',
    role: 'RUNTIME & ORCHESTRATION LAYER',
    features: ['统一AI运行时', '智能任务编排', '多模型热切换', '全链路可观测'],
  },
  {
    num: '2',
    name: 'n8n自动化引擎',
    role: 'AUTOMATION ENGINE LAYER',
    features: ['400+集成节点', '可视化工作流', '定时触发器', '错误重试机制'],
  },
  {
    num: '3',
    name: '飞书多维表格',
    role: 'DATA HUB LAYER',
    features: ['结构化数据存储', '实时多人协同', 'API开放接入', '自动化计算字段'],
  },
];

export const techStack = ['OpenClaw', 'Hermes', 'n8n', '飞书表格', 'MCP协议', 'SOUL.md'];

/* ===== Industries ===== */
interface IndustryCard {
  emoji: string;
  name: string;
  en: string;
}

export const industryCards: IndustryCard[] = [
  { emoji: '🎓', name: '知识付费/在线教育', en: 'Knowledge & Education' },
  { emoji: '🛒', name: '电商/私域带货', en: 'E-commerce' },
  { emoji: '❤️', name: '健康/养生/医美', en: 'Health & Beauty' },
  { emoji: '🎨', name: '设计/创意工作室', en: 'Design & Studio' },
  { emoji: '💻', name: '软件开发/SaaS', en: 'Software & SaaS' },
  { emoji: '🧠', name: '心理咨询/情感服务', en: 'Psychology Service' },
  { emoji: '🏠', name: '房产/保险/金融', en: 'Real Estate & Finance' },
  { emoji: '📱', name: '自媒体/个人IP', en: 'Self Media' },
  { emoji: '📊', name: '营销咨询/代运营', en: 'Marketing Consulting' },
  { emoji: '📷', name: '摄影/婚庆/活动策划', en: 'Photography & Events' },
  { emoji: '🍽️', name: '餐饮/本地生活', en: 'F&B Local Life' },
  { emoji: '✈️', name: '旅游/留学/移民', en: 'Travel & Education' },
];
/* ===== Flywheel 执行动作（按步骤） ===== */
export const flywheelDetails: string[][] = [
  [
    '多平台内容分发，捕获精准流量',
    '爆款脚本自动生成，日更百条素材',
    '渠道数据实时监控，动态优化投放',
    '私域入口埋点，引导用户加微转化',
  ],
  [
    '企微/社群承接流量，建立私域池',
    '用户分层打标，个性化触达',
    '内容持续运营，提升活跃与信任',
    '自动回复常见问题，降低客服成本',
  ],
  [
    '线索自动跟进，及时响应意向',
    '话术辅助生成，提升转化效率',
    '订单流程自动化，减少人工操作',
    '销售数据看板，实时掌握业绩',
  ],
  [
    '交付进度自动提醒，保障按时交付',
    '使用数据监测，主动发现风险',
    '续费到期自动提醒，推动续费决策',
    '满意度回访沉淀，输出口碑案例',
  ],
  [
    '老客专属活动策划，激发复购',
    '裂变任务自动化，老带新增长',
    '会员体系运营，提升生命周期价值',
    '流失预警与召回，挽回沉默用户',
  ],
];
