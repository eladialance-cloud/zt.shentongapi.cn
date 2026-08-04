import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useState, useEffect, useCallback } from 'react'
import ParticleMatrix from '../../components/landing/ParticleMatrix'
import {
  ArrowRightOutlined,
  CheckOutlined,
  ThunderboltOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import styles from './styles.module.css'

// Data imports from data.tsx
import {
  navItems,
  heroStats,
  foundationCards,
  processSteps,
  ceoCard,
  coreCards,
  execCards,
  flywheelSteps,
  flywheelDetails,
  dataflowCards,
  infraCards,
  techCards,
  techStack,
  industryCards,
} from './data'

interface LatestReleaseInfo {
  version: string
  downloadUrl: string
  releaseDate: string
}

/** 极简解析 latest.yml */
function parseLatestYml(text: string): { version: string; path: string; releaseDate: string } | null {
  const get = (key: string): string | null => {
    const re = new RegExp(`^${key}:\\s*'?([^'\\n]+?)'?\\s*$`, 'm')
    const m = text.match(re)
    return m ? m[1].trim() : null
  }
  const version = get('version')
  const path = get('path')
  const releaseDate = get('releaseDate')
  if (!version || !path) return null
  return { version, path, releaseDate: releaseDate || '' }
}

function formatYamlDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Landing() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [activeStep, setActiveStep] = useState(0)
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set())
  const [showTopBtn, setShowTopBtn] = useState(false)
  const [activeNav, setActiveNav] = useState('')
  const [latestInfo, setLatestInfo] = useState<LatestReleaseInfo | null>(null)

  const appVersion = latestInfo?.version || import.meta.env.VITE_APP_VERSION || '0.1.0'
  const downloadWinUrl = latestInfo?.downloadUrl || import.meta.env.VITE_DOWNLOAD_WIN_URL || ''
  const downloadMacUrl = import.meta.env.VITE_DOWNLOAD_MAC_URL || ''

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set(prev).add(entry.target.id))
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('section[id]').forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 800)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveNav(entry.target.id)
        })
      },
      { threshold: 0.3 }
    )
    document.querySelectorAll('section[id]').forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/desktop/latest.yml', { credentials: 'omit', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then((text) => {
        const parsed = parseLatestYml(text)
        if (!parsed) {
          console.warn('[Landing] latest.yml 解析失败，回退到环境变量兜底')
          return
        }
        setLatestInfo({
          version: parsed.version,
          downloadUrl: `${window.location.origin}/desktop/${parsed.path}.zip`,
          releaseDate: parsed.releaseDate,
        })
      })
      .catch((err) => {
        console.warn('[Landing] latest.yml 拉取失败，回退到环境变量兜底', err)
      })
    return () => controller.abort()
  }, [])

  const handleDownload = useCallback((url: string) => {
    if (!isAuthenticated) {
      navigate('/register')
      return
    }
    if (url) {
      window.open(url, '_blank')
    }
  }, [isAuthenticated, navigate])

  const handleScrollTo = useCallback((id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.particleBg}>
        <ParticleMatrix />
      </div>

      {/* 1. Navbar */}
      <header className={styles.navbar}>
        <div className={styles.navbarInner}>
          <button className={styles.navbarBrand} aria-label="深瞳AI首页" onClick={() => handleScrollTo('hero')}>
            <span className={styles.navbarLogo}>
              <ThunderboltOutlined />
            </span>
            <span className={styles.navbarBrandName}>深瞳AI</span>
          </button>
          <nav className={styles.navbarNav}>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`${styles.navbarNavBtn} ${activeNav === item.id ? styles.navbarNavBtnActive : ''}`}
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
              客户端下载            </button>
            <button className={styles.navbarBtnPrimary} onClick={() => navigate('/login')}>
              登录
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <nav className={styles.mobileNav}>
        {navItems.map((item) => (
          <button key={item.id} className={styles.mobileNavBtn} onClick={() => handleScrollTo(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {/* 2. Hero */}
      <section className={`${styles.hero} ${visibleSections.has('hero') ? styles.visible : ''}`} id="hero">
        <div className={styles.heroInner}>
          <span className={styles.heroTag}>
            OpenClaw + Hermes 基座 · 8大AI员工 · 真实项目闭环运营
          </span>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleLine1}>打造AI自动化公司</span>
            <span className={styles.heroTitleLine2}>8大AI员工 24h 自主工作</span>
          </h1>
          <p className={styles.heroDesc}>
            基于OpenClaw运行时与Hermes编排中枢，构建8大AI员工协同体系，覆盖获客、转化、交付、复购全链路，1人即可运营一家AI自动化公司。          </p>
          <div className={styles.heroStats}>
            {heroStats.map((stat) => (
              <div key={stat.label} className={styles.heroStat}>
                <div className={styles.heroStatValue}>{stat.value}</div>
                <div className={styles.heroStatLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
          <div className={styles.heroCtas}>
            <button className={styles.heroCtaPrimary} onClick={() => handleScrollTo('download')}>
              立即下载
            </button>
            <button className={styles.heroCtaSecondary} onClick={() => navigate('/register')}>
              免费注册
            </button>
          </div>
          <div className={styles.scrollHint}>↓向下滚动探索</div>
        </div>
      </section>

      {/* 3. Foundation */}
      <section className={`${styles.section} ${visibleSections.has('foundation') ? styles.visible : ''}`} id="foundation">
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

      {/* 4. Organization */}
      <section className={`${styles.section} ${visibleSections.has('team') ? styles.visible : ''}`} id="team">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>组织架构 · 8大核心员工驱动闭环</h2>
          <div className={styles.orgCeoWrap}>
            <article className={`${styles.orgCard} ${styles.orgCeoCard}`}>
              <div className={styles.orgIcon}>{ceoCard.icon}</div>
              <div className={styles.orgName}>{ceoCard.name}</div>
              <div className={styles.orgRole}>{ceoCard.role}</div>
              <div className={styles.orgTags}>
                {ceoCard.tags.map((tag) => (
                  <span key={tag} className={styles.orgTag}>{tag}</span>
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
                    <span key={tag} className={styles.orgTag}>{tag}</span>
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
                    <span key={tag} className={styles.orgTag}>{tag}</span>
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

      {/* 5. Flywheel */}
      <section className={`${styles.section} ${visibleSections.has('flywheel') ? styles.visible : ''}`} id="flywheel">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>业务飞轮 · 五步闭环变现</h2>
          <div className={styles.flywheelGrid}>
            {flywheelSteps.map((step, idx) => (
              <article
                key={step.num}
                className={`${styles.stepCard} ${activeStep === idx ? styles.stepCardActive : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`步骤${step.num}：${step.title}，点击查看详情`}
                onClick={() => setActiveStep(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setActiveStep(idx)
                  }
                }}
              >
                <div className={styles.stepNumber}>{step.num}</div>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepEn}>{step.en}</div>
                <div className={styles.stepRoles}>{step.roles}</div>
                <div className={styles.stepHint}>
                  {activeStep === idx ? '● 当前展示' : '点击查看 →'}
                </div>
              </article>
            ))}
          </div>
          <div className={styles.detailPanel} key={activeStep}>
            <div className={styles.detailPanelHead}>
              <span className={styles.detailPanelTitle}>{flywheelSteps[activeStep].title} · 执行动作</span>
              <span className={styles.detailPanelTag}>{flywheelSteps[activeStep].en}</span>
            </div>
            <ul className={styles.detailList}>
              {flywheelDetails[activeStep].map((action) => (
                <li key={action} className={styles.detailAction}>
                  <span className={styles.detailArrow}>▸</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 6. Collaboration */}
      <section className={`${styles.section} ${visibleSections.has('collaboration') ? styles.visible : ''}`} id="collaboration">
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

      {/* 7. Tech */}
      <section className={`${styles.section} ${visibleSections.has('tech') ? styles.visible : ''}`} id="tech">
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
              <span key={item} className={styles.techStackItem}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Industries */}
      <section className={`${styles.section} ${visibleSections.has('industries') ? styles.visible : ''}`} id="industries">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>适用场景 · 全行业覆盖</h2>
          <div className={styles.industryTags}>
            {industryCards.map((card) => (
              <span key={card.name} className={styles.industryTag}>
                <span className={styles.industryTagEmoji}>{card.emoji}</span>
                <span className={styles.industryTagName}>{card.name}</span>
              </span>
            ))}
          </div>
          <div className={styles.industriesHint}>不只是这12个行业 · 任何重复性业务流程都能AI自动化</div>
        </div>
      </section>

      {/* 8.5. Download */}
      <section className={`${styles.section} ${visibleSections.has('download') ? styles.visible : ''}`} id="download">
        <div className={styles.container}>
          <p className={styles.sectionLabel}>DESKTOP CLIENT</p>
          <h2 className={styles.sectionTitle}>客户端下载 · 立即获取</h2>
          <p className={styles.downloadSubtitle}>
            下载深瞳AI桌面客户端,1人启动8大AI员工24h自主工作
          </p>
          <div className={styles.downloadGrid}>
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
                aria-label={`下载 Windows 客户端，版本 ${appVersion}`}
                onClick={() => handleDownload(downloadWinUrl)}
              >
                {isAuthenticated ? '立即下载' : '注册后下载'}
              </button>
            </article>

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
                aria-label={`下载 macOS 客户端，版本 ${appVersion}`}
                onClick={() => handleDownload(downloadMacUrl)}
              >
                {isAuthenticated ? '立即下载' : '注册后下载'}
              </button>
            </article>
          </div>

          <div className={styles.changelogWrap}>
            <h3 className={styles.changelogTitle}>更新日志</h3>
            <ul className={styles.changelogList}>
              <li className={styles.changelogItem}>
                <span className={styles.changelogVersion}>v{appVersion}</span>
                <span className={styles.changelogDate}>{latestInfo?.releaseDate ? formatYamlDate(latestInfo.releaseDate) : '2026-07-16'}</span>
                <p className={styles.changelogDesc}>新增 zip 压缩包下载、优化自动更新、修复桌面端文件锁定问题</p>
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
            支持 Windows 10+ / macOS 11+ · 需要网络连接          </div>
        </div>
      </section>

      {/* 9. CTA */}
      <section className={`${styles.section} ${visibleSections.has('cta') ? styles.visible : ''}`} id="cta">
        <div className={styles.container}>
          <div className={styles.ctaInner}>
            <h2 className={styles.ctaTitle}>开始构建你的AI团队</h2>
            <p className={styles.ctaDesc}>
              1人启动，8大AI员工24h自主工作，立即开启AI自动化运营。            </p>
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
              基于OpenClaw + Hermes的AI自动化公司运营平台，8大AI员工驱动业务闭环。            </p>
          </div>
          <div className={styles.footerLinks}>
            <strong className={styles.footerLinksTitle}>快捷链接</strong>
            <button className={styles.footerLink} onClick={() => handleScrollTo('foundation')}>技术基础</button>
            <button className={styles.footerLink} onClick={() => handleScrollTo('flywheel')}>业务飞轮</button>
            <button className={styles.footerLink} onClick={() => handleScrollTo('industries')}>适用场景</button>
            <button className={styles.footerLink} onClick={() => handleScrollTo('download')}>客户端下载</button>
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

      <button
        className={`${styles.backToTop} ${showTopBtn ? styles.backToTopVisible : ''}`}
        aria-label="回到顶部"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <VerticalAlignTopOutlined />
      </button>
    </div>
  )
}
