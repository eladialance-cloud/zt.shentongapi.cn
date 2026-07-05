import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import type { ReactNode } from 'react';
import ParticleMatrix from '../../components/landing/ParticleMatrix';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  BarChartOutlined,
  BulbOutlined,
  CheckOutlined,
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
import styles from './styles.module.css';

/* ===== Navbar ===== */
interface NavItem {
  id: string;
  label: string;
}

const navItems: NavItem[] = [
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

const heroStats: StatItem[] = [
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

const foundationCards: FoundationCard[] = [
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

const processSteps = ['OpenClaw', 'Hermes', '8大AI员工', 'n8n', '飞书'];

/* ===== Organization ===== */
interface OrgCard {
  name: string;
  role: string;
  tags: string[];
  icon: ReactNode;
}

const ceoCard: OrgCard = {
  name: 'CEO',
  role: '决策层',
  tags: ['战略决策', '目标拆解', '资源统筹'],
  icon: <CrownOutlined />,
};

const coreCards: OrgCard[] = [
  { name: '秘书助理', role: '任务调度中枢', tags: ['任务分发', '日程管理'], icon: <UserOutlined /> },
  { name: '流量操盘手', role: '公域流量获取', tags: ['内容策划', '投放优化'], icon: <RocketOutlined /> },
  { name: '渠道经理', role: '渠道资源管理', tags: ['渠道拓展', '合作对接'], icon: <ShareAltOutlined /> },
  { name: '销售经理', role: '销售目标达成', tags: ['线索转化', '业绩跟进'], icon: <TrophyOutlined /> },
  { name: '客户成功', role: '交付与续费', tags: ['交付保障', '复购运营'], icon: <SmileOutlined /> },
];

const execCards: OrgCard[] = [
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

const flywheelSteps: FlywheelStep[] = [
  { num: '1', title: '公域获客', en: 'TRAFFIC', roles: '流量操盘手、新媒体运营、渠道经理' },
  { num: '2', title: '私域沉淀', en: 'PRIVATE', roles: '私域运营经理、销售客服' },
  { num: '3', title: '销售转化', en: 'SALES', roles: '销售经理、销售客服' },
  { num: '4', title: '交付成功', en: 'CUSTOMER', roles: '客户成功经理' },
  { num: '5', title: '复购裂变', en: 'RETENTION', roles: '私域运营经理' },
];

const flywheelActions = [
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

const dataflowCards: DataflowCard[] = [
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

const infraCards: InfraCard[] = [
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

const techCards: TechCard[] = [
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

const techStack = ['OpenClaw', 'Hermes', 'n8n', '飞书表格', 'MCP协议', 'SOUL.md'];

/* ===== Industries ===== */
interface IndustryCard {
  emoji: string;
  name: string;
  en: string;
}

const industryCards: IndustryCard[] = [
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

export default function Landing() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // 下载链接配置
  const downloadWinUrl = import.meta.env.VITE_DOWNLOAD_WIN_URL || '';
  const downloadMacUrl = import.meta.env.VITE_DOWNLOAD_MAC_URL || '';
  const appVersion = import.meta.env.VITE_APP_VERSION || '0.1.0';

  // 下载处理
  const handleDownload = (url: string) => {
    if (!isAuthenticated) {
      navigate('/register');
      return;
    }
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleScrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className={styles.page}>
      {/* 动态粒子背景 */}
      <div className={styles.particleBg}>
        <ParticleMatrix />
      </div>
      {/* 1. Navbar */}
      <header className={styles.navbar}>
        <div className={styles.navbarInner}>
          <button className={styles.navbarBrand} onClick={() => handleScrollTo('hero')}>
            <span className={styles.navbarLogo}>
              <ThunderboltOutlined />
            </span>
            <span className={styles.navbarBrandName}>深瞳AI</span>
          </button>
          <nav className={styles.navbarNav}>
            {navItems.map((item, idx) => (
              <button
                key={`${item.id}-${idx}`}
                className={styles.navbarNavBtn}
                onClick={() => handleScrollTo(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className={styles.navbarActions}>
            <button
              className={styles.navbarBtnOutline}
              onClick={() => isAuthenticated ? handleScrollTo('download') : navigate('/register')}
            >
              客户端下载
            </button>
            <button className={styles.navbarBtnPrimary} onClick={() => navigate('/login')}>
              登录
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero */}
      <section className={styles.hero} id="hero">
        <div className={styles.heroInner}>
          <span className={styles.heroTag}>
            OpenClaw + Hermes 基座 · 8大AI员工 · 真实项目闭环运营
          </span>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleLine1}>打造AI自动化公司</span>
            <span className={styles.heroTitleLine2}>8大AI员工 24h 自主工作</span>
          </h1>
          <p className={styles.heroDesc}>
            基于OpenClaw运行时与Hermes编排中枢，构建8大AI员工协同体系，覆盖获客、转化、交付、复购全链路，1人即可运营一家AI自动化公司。
          </p>
          <div className={styles.heroStats}>
            {heroStats.map((stat) => (
              <div key={stat.label} className={styles.heroStat}>
                <div className={styles.heroStatValue}>{stat.value}</div>
                <div className={styles.heroStatLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
          <button className={styles.heroCta} onClick={() => handleScrollTo('organization')}>
            探索AI团队架构 ↓
          </button>
        </div>
      </section>

      {/* 3. Foundation Section */}
      <section className={styles.section} id="foundation">
        <div className={styles.container}>
          <p className={styles.sectionLabel}>AI RUNTIME & ORCHESTRATION</p>
          <h2 className={styles.sectionTitle}>OpenClaw + Hermes · AI团队基座</h2>
          <div className={styles.foundationGrid}>
            {foundationCards.map((card) => (
              <article key={card.name} className={styles.featureCard}>
                <div className={styles.featureIcon}>{card.icon}</div>
                <div className={styles.featureName}>{card.name}</div>
                <div className={styles.featureRole}>{card.role}</div>
                <p className={styles.featureDesc}>{card.desc}</p>
                <ul className={styles.featureList}>
                  {card.features.map((feature) => (
                    <li key={feature} className={styles.featureItem}>
                      <CheckOutlined className={styles.featureCheck} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className={styles.processFlow}>
            {processSteps.map((step, idx) => (
              <div key={step} className={styles.processStepWrap}>
                <span className={styles.processStep}>{step}</span>
                {idx < processSteps.length - 1 && (
                  <ArrowRightOutlined className={styles.processArrow} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Organization Section */}
      <section className={styles.section} id="organization">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>组织架构 · 8大核心员工驱动闭环</h2>
          <div className={styles.orgCeoWrap}>
            <article className={`${styles.orgCard} ${styles.orgCeoCard}`}>
              <div className={styles.orgIcon}>{ceoCard.icon}</div>
              <div className={styles.orgName}>{ceoCard.name}</div>
              <div className={styles.orgRole}>{ceoCard.role}</div>
              <div className={styles.orgTags}>
                {ceoCard.tags.map((tag) => (
                  <span key={tag} className={styles.orgTag}>
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          </div>
          <div className={styles.orgCoreGrid}>
            {coreCards.map((card) => (
              <article key={card.name} className={`${styles.orgCard} ${styles.orgCoreCard}`}>
                <span className={styles.orgBadge}>核心</span>
                <div className={styles.orgIcon}>{card.icon}</div>
                <div className={styles.orgName}>{card.name}</div>
                <div className={styles.orgRole}>{card.role}</div>
                <div className={styles.orgTags}>
                  {card.tags.map((tag) => (
                    <span key={tag} className={styles.orgTag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className={styles.orgExecGrid}>
            {execCards.map((card) => (
              <article key={card.name} className={`${styles.orgCard} ${styles.orgExecCard}`}>
                <div className={styles.orgIcon}>{card.icon}</div>
                <div className={styles.orgName}>{card.name}</div>
                <div className={styles.orgRole}>{card.role}</div>
                <div className={styles.orgTags}>
                  {card.tags.map((tag) => (
                    <span key={tag} className={styles.orgTag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className={styles.orgLegend}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotCeo}`} />
              <span>决策层</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotCore}`} />
              <span>核心层</span>
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotExec}`} />
              <span>执行层</span>
            </span>
          </div>
        </div>
      </section>

      {/* 5. Business Flywheel Section */}
      <section className={styles.section} id="flywheel">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>业务飞轮 · 五步闭环变现</h2>
          <div className={styles.flywheelGrid}>
            {flywheelSteps.map((step) => (
              <article key={step.num} className={styles.stepCard}>
                <div className={styles.stepNumber}>{step.num}</div>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepEn}>{step.en}</div>
                <div className={styles.stepRoles}>{step.roles}</div>
              </article>
            ))}
          </div>
          <div className={styles.detailPanel}>
            <div className={styles.detailPanelHead}>
              <span className={styles.detailPanelTitle}>公域获客 · 执行动作</span>
              <span className={styles.detailPanelTag}>TRAFFIC</span>
            </div>
            <ul className={styles.detailList}>
              {flywheelActions.map((action) => (
                <li key={action} className={styles.detailAction}>
                  <span className={styles.detailArrow}>▸</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 6. Collaboration Section */}
      <section className={styles.section} id="collaboration">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>协作关系网络 · 12条数据流</h2>
          <div className={styles.dataflowGrid}>
            {dataflowCards.map((flow, idx) => (
              <article key={idx} className={styles.dataflowCard}>
                <div className={styles.dataflowPath}>
                  <span className={styles.dataflowNode}>{flow.from}</span>
                  <ArrowRightOutlined className={styles.dataflowArrow} />
                  <span className={styles.dataflowNode}>{flow.to}</span>
                </div>
                <span className={styles.dataflowLabel}>{flow.label}</span>
              </article>
            ))}
          </div>
          <div className={styles.infraGrid}>
            {infraCards.map((card) => (
              <article key={card.name} className={styles.infraCard}>
                <div className={styles.infraIcon}>{card.icon}</div>
                <div className={styles.infraName}>{card.name}</div>
                <div className={styles.infraDesc}>{card.desc}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Tech Infrastructure Section */}
      <section className={styles.section} id="tech">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>技术底座 · 三大基础设施</h2>
          <div className={styles.techGrid}>
            {techCards.map((card) => (
              <article key={card.num} className={styles.techCard}>
                <div className={styles.techNumber}>{card.num}</div>
                <div className={styles.techName}>{card.name}</div>
                <div className={styles.techRole}>{card.role}</div>
                <ul className={styles.techList}>
                  {card.features.map((feature) => (
                    <li key={feature} className={styles.techItem}>
                      <CheckOutlined className={styles.techCheck} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className={styles.techStackBar}>
            {techStack.map((item) => (
              <span key={item} className={styles.techStackItem}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Industries Section */}
      <section className={styles.section} id="industries">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>12个适用场景 · AI自动化全行业覆盖</h2>
          <div className={styles.industriesGrid}>
            {industryCards.map((card) => (
              <article key={card.name} className={styles.industryCard}>
                <div className={styles.industryIcon}>{card.emoji}</div>
                <div className={styles.industryName}>{card.name}</div>
                <div className={styles.industryEn}>{card.en}</div>
              </article>
            ))}
          </div>
          <div className={styles.industriesHint}>不只是这12个行业</div>
        </div>
      </section>

      {/* 8.5. Download Section */}
      <section className={styles.section} id="download">
        <div className={styles.container}>
          <p className={styles.sectionLabel}>DESKTOP CLIENT</p>
          <h2 className={styles.sectionTitle}>客户端下载 · 立即获取</h2>
          <p className={styles.downloadSubtitle}>
            下载深瞳AI桌面客户端,1人启动8大AI员工24h自主工作
          </p>
          <div className={styles.downloadGrid}>
            {/* Windows 下载卡片 */}
            <article className={styles.downloadCard}>
              <div className={styles.downloadIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 5.5L10.5 4.5V11.5H3V5.5M3 18.5L10.5 19.5V12.5H3V18.5M11.5 4.4L21 3V11.5H11.5V4.4M11.5 12.5H21V21L11.5 19.6V12.5Z" />
                </svg>
              </div>
              <div className={styles.downloadOsName}>Windows</div>
              <div className={styles.downloadVersion}>版本 {appVersion}</div>
              <button
                className={isAuthenticated ? styles.downloadBtn : styles.downloadBtnDisabled}
                onClick={() => handleDownload(downloadWinUrl)}
              >
                {isAuthenticated ? '立即下载' : '注册后下载'}
              </button>
            </article>

            {/* Mac 下载卡片 */}
            <article className={styles.downloadCard}>
              <div className={styles.downloadIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5C17.88 20.74 17 21.95 15.64 21.97C14.28 22 13.83 21.18 12.29 21.18C10.75 21.18 10.25 21.95 8.96 22C7.62 22.05 6.84 20.68 6 19.47C4.27 17 2.96 12.45 4.74 9.21C5.62 7.6 7.2 6.59 8.92 6.56C10.21 6.54 11.42 7.43 12.21 7.43C13 7.43 14.46 6.37 16 6.53C16.65 6.56 18.5 6.79 19.68 8.5C19.58 8.57 17.5 9.78 17.5 12.21C17.5 15 20.21 16 20.24 16C20.24 16.05 19.81 17.5 18.71 19.5M13 5.27C13.68 4.45 14.5 3.5 14.5 2.5C14.5 2.32 14.47 2.14 14.42 2C13.43 2.04 12.26 2.66 11.55 3.47C10.93 4.18 10.21 5.16 10.21 6.11C10.21 6.31 10.24 6.5 10.26 6.56C10.34 6.58 10.5 6.6 10.66 6.6C11.55 6.6 12.65 5.95 13 5.27Z" />
                </svg>
              </div>
              <div className={styles.downloadOsName}>macOS</div>
              <div className={styles.downloadVersion}>版本 {appVersion}</div>
              <button
                className={isAuthenticated ? styles.downloadBtn : styles.downloadBtnDisabled}
                onClick={() => handleDownload(downloadMacUrl)}
              >
                {isAuthenticated ? '立即下载' : '注册后下载'}
              </button>
            </article>
          </div>

          {/* 更新日志 */}
          <div className={styles.changelogWrap}>
            <h3 className={styles.changelogTitle}>更新日志</h3>
            <ul className={styles.changelogList}>
              <li className={styles.changelogItem}>
                <span className={styles.changelogVersion}>v{appVersion}</span>
                <span className={styles.changelogDate}>2026-07-05</span>
                <p className={styles.changelogDesc}>首发版本,包含8大AI员工、OpenClaw运行时、N8N工作流、MCP协议网关</p>
              </li>
              <li className={styles.changelogItem}>
                <span className={styles.changelogVersion}>v0.0.9</span>
                <span className={styles.changelogDate}>2026-06-20</span>
                <p className={styles.changelogDesc}>内测版本,优化设备绑定与离线队列</p>
              </li>
              <li className={styles.changelogItem}>
                <span className={styles.changelogVersion}>v0.0.8</span>
                <span className={styles.changelogDate}>2026-05-15</span>
                <p className={styles.changelogDesc}>Alpha 版本,新增知识库 RAG 检索</p>
              </li>
            </ul>
          </div>

          <div className={styles.downloadHint}>
            支持 Windows 10+ / macOS 11+ · 需要网络连接
          </div>
        </div>
      </section>

      {/* 9. CTA Section */}
      <section className={styles.section} id="cta">
        <div className={styles.container}>
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>开始构建你的AI团队</h2>
            <p className={styles.ctaDesc}>
              1人启动，8大AI员工24h自主工作，立即开启AI自动化运营。
            </p>
            <div className={styles.ctaActions}>
              <button className={styles.ctaBtnPrimary} onClick={() => navigate('/register')}>
                立即注册
              </button>
              <button className={styles.ctaBtnOutline} onClick={() => navigate('/login')}>
                登录
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 10. Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <div className={styles.footerBrandName}>深瞳AI</div>
            <p className={styles.footerBrandDesc}>
              基于OpenClaw + Hermes的AI自动化公司运营平台，8大AI员工驱动业务闭环。
            </p>
          </div>
          <div className={styles.footerLinks}>
            <strong className={styles.footerLinksTitle}>快捷链接</strong>
            <button className={styles.footerLink} onClick={() => handleScrollTo('foundation')}>
              产品
            </button>
            <button className={styles.footerLink} onClick={() => handleScrollTo('tech')}>
              文档
            </button>
            <button className={styles.footerLink} onClick={() => handleScrollTo('industries')}>
              案例
            </button>
            <button className={styles.footerLink} onClick={() => handleScrollTo('organization')}>
              关于
            </button>
          </div>
          <div className={styles.footerLinks}>
            <strong className={styles.footerLinksTitle}>联系方式</strong>
            <span className={styles.footerLink}>邮箱：contact@shentongapi.cn</span>
            <span className={styles.footerLink}>电话：400-888-0000</span>
            <span className={styles.footerLink}>地址：北京市海淀区中关村</span>
          </div>
        </div>
        <div className={styles.footerBottom}>© 2026 深瞳AI. All rights reserved.</div>
      </footer>
    </div>
  );
}
