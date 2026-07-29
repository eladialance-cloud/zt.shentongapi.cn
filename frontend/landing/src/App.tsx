import { useState, useEffect, useMemo } from 'react';
import { useLandingContent, useClientVersion } from './hooks';
import type { LandingContent, NavItem, HeroStats, FeatureCard, OrgCard, ProcessStep, DataflowCard, InfraCard, TechCard, IndustryCard } from './types';
import './App.css';

interface ParsedContent {
  navItems: NavItem[];
  heroStats: HeroStats[];
  heroTag: string;
  heroTitleLine1: string;
  heroTitleLine2: string;
  heroDesc: string;
  foundationCards: FeatureCard[];
  processSteps: string[];
  ceoCard: OrgCard | null;
  coreCards: OrgCard[];
  execCards: OrgCard[];
  flywheelSteps: ProcessStep[];
  flywheelActions: string[];
  dataflowCards: DataflowCard[];
  infraCards: InfraCard[];
  techCards: TechCard[];
  techStack: string[];
  industryCards: IndustryCard[];
}

function parseContent(content: LandingContent[]): ParsedContent {
  const result: ParsedContent = {
    navItems: [],
    heroStats: [],
    heroTag: '',
    heroTitleLine1: '',
    heroTitleLine2: '',
    heroDesc: '',
    foundationCards: [],
    processSteps: [],
    ceoCard: null,
    coreCards: [],
    execCards: [],
    flywheelSteps: [],
    flywheelActions: [],
    dataflowCards: [],
    infraCards: [],
    techCards: [],
    techStack: [],
    industryCards: []
  };
  
  for (const item of content) {
    const data = item.data as Record<string, unknown>;
    
    switch (item.section) {
      case 'nav': {
        if (Array.isArray(data.items)) {
          result.navItems = data.items.map((item: Record<string, unknown>) => ({
            id: String(item.id ?? ''),
            label: String(item.label ?? '')
          }));
        }
        break;
      }
      case 'hero': {
        result.heroTag = String(data.tag ?? '');
        result.heroTitleLine1 = String(data.titleLine1 ?? '');
        result.heroTitleLine2 = String(data.titleLine2 ?? '');
        result.heroDesc = String(data.desc ?? '');
        if (Array.isArray(data.stats)) {
          result.heroStats = data.stats.map((stat: Record<string, unknown>) => ({
            value: String(stat.value ?? ''),
            label: String(stat.label ?? '')
          }));
        }
        break;
      }
      case 'foundation': {
        if (Array.isArray(data.cards)) {
          result.foundationCards = data.cards.map((card: Record<string, unknown>) => ({
            name: String(card.name ?? ''),
            role: String(card.role ?? ''),
            desc: String(card.desc ?? ''),
            features: Array.isArray(card.features) ? card.features.map(String) : []
          }));
        }
        if (Array.isArray(data.steps)) {
          result.processSteps = data.steps.map(String);
        }
        break;
      }
      case 'organization': {
        if (data.ceo) {
          const ceo = data.ceo as Record<string, unknown>;
          result.ceoCard = {
            name: String(ceo.name ?? ''),
            role: String(ceo.role ?? ''),
            tags: Array.isArray(ceo.tags) ? ceo.tags.map(String) : []
          };
        }
        if (Array.isArray(data.coreCards)) {
          result.coreCards = data.coreCards.map((card: Record<string, unknown>) => ({
            name: String(card.name ?? ''),
            role: String(card.role ?? ''),
            tags: Array.isArray(card.tags) ? card.tags.map(String) : []
          }));
        }
        if (Array.isArray(data.execCards)) {
          result.execCards = data.execCards.map((card: Record<string, unknown>) => ({
            name: String(card.name ?? ''),
            role: String(card.role ?? ''),
            tags: Array.isArray(card.tags) ? card.tags.map(String) : []
          }));
        }
        break;
      }
      case 'flywheel': {
        if (Array.isArray(data.steps)) {
          result.flywheelSteps = data.steps.map((step: Record<string, unknown>, index: number) => ({
            num: String(step.num ?? String(index + 1)),
            title: String(step.title ?? ''),
            en: String(step.en ?? ''),
            roles: String(step.roles ?? '')
          }));
        }
        if (Array.isArray(data.actions)) {
          result.flywheelActions = data.actions.map(String);
        }
        break;
      }
      case 'collaboration': {
        if (Array.isArray(data.dataflows)) {
          result.dataflowCards = data.dataflows.map((flow: Record<string, unknown>) => ({
            from: String(flow.from ?? ''),
            to: String(flow.to ?? ''),
            label: String(flow.label ?? '')
          }));
        }
        if (Array.isArray(data.infraCards)) {
          result.infraCards = data.infraCards.map((card: Record<string, unknown>) => ({
            name: String(card.name ?? ''),
            desc: String(card.desc ?? '')
          }));
        }
        break;
      }
      case 'tech': {
        if (Array.isArray(data.cards)) {
          result.techCards = data.cards.map((card: Record<string, unknown>) => ({
            num: String(card.num ?? ''),
            name: String(card.name ?? ''),
            role: String(card.role ?? ''),
            features: Array.isArray(card.features) ? card.features.map(String) : []
          }));
        }
        if (Array.isArray(data.stack)) {
          result.techStack = data.stack.map(String);
        }
        break;
      }
      case 'industries': {
        if (Array.isArray(data.cards)) {
          result.industryCards = data.cards.map((card: Record<string, unknown>) => ({
            emoji: String(card.emoji ?? ''),
            name: String(card.name ?? ''),
            en: String(card.en ?? '')
          }));
        }
        break;
      }
    }
  }
  
  return result;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { content, loading: contentLoading } = useLandingContent();
  const { version: clientVersion, downloadUrl: clientDownloadUrl, changelog: clientChangelog, loading: versionLoading } = useClientVersion('win');
  
  useEffect(() => {
    // 检查登录状态
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);
  
  const parsedContent = useMemo<ParsedContent>(() => {
    if (content.length === 0) return {
      navItems: [], heroStats: [], heroTag: '', heroTitleLine1: '', heroTitleLine2: '',
      heroDesc: '', foundationCards: [], processSteps: [], ceoCard: null, coreCards: [],
      execCards: [], flywheelSteps: [], flywheelActions: [], dataflowCards: [],
      infraCards: [], techCards: [], techStack: [], industryCards: []
    };
    return parseContent(content);
  }, [content]);
  
  const {
    navItems,
    heroStats,
    heroTag,
    heroTitleLine1,
    heroTitleLine2,
    heroDesc,
    foundationCards,
    processSteps,
    ceoCard,
    coreCards,
    execCards,
    flywheelSteps,
    flywheelActions,
    dataflowCards,
    infraCards,
    techCards,
    techStack,
    industryCards
  } = parsedContent;
  
  // 动态版本号（从后端 API 获取，失败时回退到默认值）
  const version = clientVersion;
  const downloadUrl = clientDownloadUrl;
  
  const handleDownload = (url: string) => {
    if (!isAuthenticated) {
      window.location.href = '/register';
      return;
    }
    if (url) {
      window.open(url, '_blank');
    }
  };
  
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  if (contentLoading) {
    return (
      <div className="page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="page">
      {/* 导航栏 */}
      <header className="navbar">
        <div className="navbar-inner">
          <button className="navbar-brand" onClick={() => scrollToSection('hero')}>
            <span className="navbar-logo">深</span>
            <span className="navbar-brand-name">深瞳AI</span>
          </button>
          <nav className="navbar-nav">
            {navItems.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                className="navbar-nav-btn"
                onClick={() => scrollToSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="navbar-actions">
            <button
              className="navbar-btn-outline"
              onClick={() => isAuthenticated ? scrollToSection('download') : window.location.href = '/register'}
            >
              客户端下载
            </button>
            <button className="navbar-btn-primary" onClick={() => window.location.href = '/login'}>
              登录
            </button>
          </div>
        </div>
      </header>
      
      {/* Hero 区域 */}
      <section className="hero" id="hero">
        <div className="hero-inner">
          <span className="hero-tag">{heroTag}</span>
          <h1 className="hero-title">
            <span className="hero-title-line1">{heroTitleLine1}</span>
            <span className="hero-title-line2">{heroTitleLine2}</span>
          </h1>
          <p className="hero-desc">{heroDesc}</p>
          <div className="hero-stats">
            {heroStats.map((stat) => (
              <div key={stat.label} className="hero-stat">
                <div className="hero-stat-value">{stat.value}</div>
                <div className="hero-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
          <button className="hero-cta" onClick={() => scrollToSection('organization')}>
            探索AI团队架构 ↓
          </button>
        </div>
      </section>
      
      {/* Foundation 区域 */}
      <section className="section" id="foundation">
        <div className="container">
          <p className="section-label">AI RUNTIME & ORCHESTRATION</p>
          <h2 className="section-title">OpenClaw + Hermes · AI团队基座</h2>
          <div className="foundation-grid">
            {foundationCards.map((card) => (
              <article key={card.name} className="feature-card">
                <div className="feature-icon">{card.name[0]}</div>
                <div className="feature-name">{card.name}</div>
                <div className="feature-role">{card.role}</div>
                <p className="feature-desc">{card.desc}</p>
                <ul className="feature-list">
                  {card.features.map((feature) => (
                    <li key={feature} className="feature-item">
                      <span className="feature-check">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="process-flow">
            {processSteps.map((step, index) => (
              <div key={step} className="process-step-wrap">
                <span className="process-step">{step}</span>
                {index < processSteps.length - 1 && <span className="process-arrow">→</span>}
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Organization 区域 */}
      <section className="section" id="organization">
        <div className="container">
          <h2 className="section-title">组织架构 · 8大核心员工驱动闭环</h2>
          {ceoCard && (
            <div className="org-ceo-wrap">
              <article className="org-card org-ceo-card">
                <div className="org-icon">{ceoCard.name[0]}</div>
                <div className="org-name">{ceoCard.name}</div>
                <div className="org-role">{ceoCard.role}</div>
                <div className="org-tags">
                  {ceoCard.tags.map((tag) => (
                    <span key={tag} className="org-tag">{tag}</span>
                  ))}
                </div>
              </article>
            </div>
          )}
          <div className="org-core-grid">
            {coreCards.map((card) => (
              <article key={card.name} className="org-card org-core-card">
                <span className="org-badge">核心</span>
                <div className="org-icon">{card.name[0]}</div>
                <div className="org-name">{card.name}</div>
                <div className="org-role">{card.role}</div>
                <div className="org-tags">
                  {card.tags.map((tag) => (
                    <span key={tag} className="org-tag">{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="org-exec-grid">
            {execCards.map((card) => (
              <article key={card.name} className="org-card org-exec-card">
                <div className="org-icon">{card.name[0]}</div>
                <div className="org-name">{card.name}</div>
                <div className="org-role">{card.role}</div>
                <div className="org-tags">
                  {card.tags.map((tag) => (
                    <span key={tag} className="org-tag">{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      
      {/* Flywheel 区域 */}
      <section className="section" id="flywheel">
        <div className="container">
          <h2 className="section-title">业务飞轮 · 五步闭环变现</h2>
          <div className="flywheel-grid">
            {flywheelSteps.map((step) => (
              <article key={step.num} className="step-card">
                <div className="step-number">{step.num}</div>
                <div className="step-title">{step.title}</div>
                <div className="step-en">{step.en}</div>
                <div className="step-roles">{step.roles}</div>
              </article>
            ))}
          </div>
          <div className="detail-panel">
            <div className="detail-panel-head">
              <span className="detail-panel-title">公域获客 · 执行动作</span>
              <span className="detail-panel-tag">TRAFFIC</span>
            </div>
            <ul className="detail-list">
              {flywheelActions.map((action) => (
                <li key={action} className="detail-action">
                  <span className="detail-arrow">▸</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      
      {/* Collaboration 区域 */}
      <section className="section" id="collaboration">
        <div className="container">
          <h2 className="section-title">协作关系网络 · 12条数据流</h2>
          <div className="dataflow-grid">
            {dataflowCards.map((card, index) => (
              <article key={index} className="dataflow-card">
                <div className="dataflow-path">
                  <span className="dataflow-node">{card.from}</span>
                  <span className="dataflow-arrow">→</span>
                  <span className="dataflow-node">{card.to}</span>
                </div>
                <span className="dataflow-label">{card.label}</span>
              </article>
            ))}
          </div>
          <div className="infra-grid">
            {infraCards.map((card) => (
              <article key={card.name} className="infra-card">
                <div className="infra-icon">{card.name[0]}</div>
                <div className="infra-name">{card.name}</div>
                <div className="infra-desc">{card.desc}</div>
              </article>
            ))}
          </div>
        </div>
      </section>
      
      {/* Tech 区域 */}
      <section className="section" id="tech">
        <div className="container">
          <h2 className="section-title">技术底座 · 三大基础设施</h2>
          <div className="tech-grid">
            {techCards.map((card) => (
              <article key={card.num} className="tech-card">
                <div className="tech-number">{card.num}</div>
                <div className="tech-name">{card.name}</div>
                <div className="tech-role">{card.role}</div>
                <ul className="tech-list">
                  {card.features.map((feature) => (
                    <li key={feature} className="tech-item">
                      <span className="tech-check">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="tech-stack-bar">
            {techStack.map((item) => (
              <span key={item} className="tech-stack-item">{item}</span>
            ))}
          </div>
        </div>
      </section>
      
      {/* Industries 区域 */}
      <section className="section" id="industries">
        <div className="container">
          <h2 className="section-title">12个适用场景 · AI自动化全行业覆盖</h2>
          <div className="industries-grid">
            {industryCards.map((card) => (
              <article key={card.name} className="industry-card">
                <div className="industry-icon">{card.emoji}</div>
                <div className="industry-name">{card.name}</div>
                <div className="industry-en">{card.en}</div>
              </article>
            ))}
          </div>
          <div className="industries-hint">不只是这12个行业</div>
        </div>
      </section>
      
      {/* Download 区域 */}
      <section className="section" id="download">
        <div className="container">
          <p className="section-label">DESKTOP CLIENT</p>
          <h2 className="section-title">客户端下载 · 立即获取</h2>
          <p className="download-subtitle">下载深瞳AI桌面客户端,1人启动8大AI员工24h自主工作</p>
          <div className="download-grid">
            <article className="download-card">
              <div className="download-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 5.5L10.5 4.5V11.5H3V5.5M3 18.5L10.5 19.5V12.5H3V18.5M11.5 4.4L21 3V11.5H11.5V4.4M11.5 12.5H21V21L11.5 19.6V12.5Z" />
                </svg>
              </div>
              <div className="download-os-name">Windows</div>
              <div className="download-version">版本 {versionLoading ? '加载中...' : version}</div>
              <button
                className={isAuthenticated ? 'download-btn' : 'download-btn-disabled'}
                onClick={() => handleDownload(downloadUrl)}
              >
                {isAuthenticated ? '立即下载' : '注册后下载'}
              </button>
            </article>
            <article className="download-card">
              <div className="download-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5C17.88 20.74 17 21.95 15.64 21.97C14.28 22 13.83 21.18 12.29 21.18C10.75 21.18 10.25 21.95 8.96 22C7.62 22.05 6.84 20.68 6 19.47C4.27 17 2.96 12.45 4.74 9.21C5.62 7.6 7.2 6.59 8.92 6.56C10.21 6.54 11.42 7.43 12.21 7.43C13 7.43 14.46 6.37 16 6.53C16.65 6.56 18.5 6.79 19.68 8.5C19.58 8.57 17.5 9.78 17.5 12.21C17.5 15 20.21 16 20.24 16C20.24 16.05 19.81 17.5 18.71 19.5M13 5.27C13.68 4.45 14.5 3.5 14.5 2.5C14.5 2.32 14.47 2.14 14.42 2C13.43 2.04 12.26 2.66 11.55 3.47C10.93 4.18 10.21 5.16 10.21 6.11C10.21 6.31 10.24 6.5 10.26 6.56C10.34 6.58 10.5 6.6 10.66 6.6C11.55 6.6 12.65 5.95 13 5.27Z" />
                </svg>
              </div>
              <div className="download-os-name">macOS</div>
              <div className="download-version">版本 {versionLoading ? '加载中...' : version}</div>
              <button
                className={isAuthenticated ? 'download-btn' : 'download-btn-disabled'}
                onClick={() => handleDownload(downloadUrl)}
              >
                {isAuthenticated ? '立即下载' : '注册后下载'}
              </button>
            </article>
          </div>
          <div className="changelog-wrap">
            <h3 className="changelog-title">更新日志</h3>
            <ul className="changelog-list">
              <li className="changelog-item">
                <span className="changelog-version">v{version}</span>
                <span className="changelog-date">2026-07-27</span>
                <p className="changelog-desc">{clientChangelog || `V${version} 版本更新，优化系统性能`}</p>
              </li>
            </ul>
          </div>
          <div className="download-hint">支持 Windows 10+ / macOS 11+ · 需要网络连接</div>
        </div>
      </section>
      
      {/* CTA 区域 */}
      <section className="section" id="cta">
        <div className="container">
          <div className="cta-inner">
            <h2 className="cta-title">开始构建你的AI团队</h2>
            <p className="cta-desc">1人启动，8大AI员工24h自主工作，立即开启AI自动化运营。</p>
            <div className="cta-actions">
              <button className="cta-btn-primary" onClick={() => window.location.href = '/register'}>
                立即注册
              </button>
              <button className="cta-btn-outline" onClick={() => window.location.href = '/login'}>
                登录
              </button>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="footer">
        <div className="footer-inner">
          <div>
            <div className="footer-brand-name">深瞳AI</div>
            <p className="footer-brand-desc">基于OpenClaw + Hermes的AI自动化公司运营平台，8大AI员工驱动业务闭环。</p>
          </div>
          <div className="footer-links">
            <strong className="footer-links-title">快捷链接</strong>
            <button className="footer-link" onClick={() => scrollToSection('foundation')}>产品</button>
            <button className="footer-link" onClick={() => scrollToSection('tech')}>文档</button>
            <button className="footer-link" onClick={() => scrollToSection('industries')}>案例</button>
            <button className="footer-link" onClick={() => scrollToSection('organization')}>关于</button>
          </div>
          <div className="footer-links">
            <strong className="footer-links-title">联系方式</strong>
            <span className="footer-link">邮箱：contact@shentongapi.cn</span>
            <span className="footer-link">电话：400-888-0000</span>
            <span className="footer-link">地址：北京市海淀区中关村</span>
          </div>
        </div>
        <div className="footer-bottom">© 2026 深瞳AI. All rights reserved.</div>
      </footer>
    </div>
  );
}

export default App;
