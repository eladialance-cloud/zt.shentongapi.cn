/**
 * Breadcrumb — v0.3.1 统一面包屑组件 (Task 25)
 * 根据当前路由 useLocation().pathname 自动生成面包屑层级
 * 集成到 MainLayout 顶部（TopBar 下方）和 admin Layout 顶部
 * 支持点击跳转父级路由（最后一项不可点击）
 *
 * 路由映射表覆盖用户端 + 管理后台主要路由（≥30 条）
 * 支持 :id 参数替换（数字 / UUID 段识别为参数）
 *
 * Scenario: /workflows/123/edit → 首页 > 工作流 > 详情 > 编辑
 */
import { useMemo } from 'react'
import { Breadcrumb as AntdBreadcrumb } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import styles from './styles.module.css'

interface BreadcrumbItem {
  path: string
  label: string
}

/**
 * 路由映射表：path pattern → label
 * - 顶级路由使用完整 label（如 "仪表盘"、"工作流"）
 * - 子路由使用相对父级的短 label（如 "详情"、"编辑"、"已安装"），便于逐级展示
 * - 支持 :id 占位符（数字 / UUID / ObjectId 段自动识别为参数）
 */
const ROUTE_LABEL_MAP: Record<string, string> = {
  // ===== 用户端根路径 =====
  '/': '首页',
  '/dashboard': '仪表盘',
  '/chat': '对话',
  '/credits': '积分中心',
  // ===== 工作流 =====
  '/workflows': '工作流',
  '/workflow': '工作流',
  '/workflows/new': '新建',
  '/workflows/:id': '详情',
  '/workflows/:id/edit': '编辑',
  '/workflow/editor': '编辑器',
  '/workflow/editor/:instanceId': '编辑',
  '/workflow/:id': '详情',
  // ===== 插件 =====
  '/plugins': '插件',
  '/plugins/installed': '已安装',
  '/plugins/logs': '日志',
  '/plugins/:id': '详情',
  // ===== 知识库 =====
  '/knowledge': '知识库',
  '/knowledge/:id/documents': '文档',
  '/knowledge/:id/search': '搜索',
  '/knowledge-editor': '编辑器',
  '/knowledge-editor/:id': '编辑',
  // ===== Agent 创建器 =====
  '/creator': 'Agent 创建器',
  '/creator/create': '创建',
  '/creator/:id/edit': '编辑',
  '/creator/revenue': '收益',
  // ===== Hermes =====
  '/hermes': 'Hermes',
  '/hermes/:id': '详情',
  // ===== 市场 =====
  '/agent-market': 'Agent 市场',
  '/skill-market': '技能市场',
  '/agents': 'AI 员工',
  '/agents/:id': '详情',
  // ===== OPC =====
  '/opc': 'OPC',
  '/opc/:id': '详情',
  '/opc/:id/board': '看板',
  // ===== 其他用户端路由 =====
  '/settings': '设置',
  '/profile': '个人信息',
  '/services': '服务管理',
  '/office': 'AI 办公室',
  '/automation': '自动化',
  '/automation-editor': '编辑器',
  '/automation-editor/:id': '编辑',
  '/automation-history': '历史',
  '/automation-history/:id': '详情',
  '/mcp-config': 'MCP 配置',
  '/team': '团队',
  // ===== 管理后台 =====
  '/admin': '管理后台',
  '/admin/dashboard': '管理仪表盘',
  '/admin/roles': '角色权限',
  '/admin/operation-logs': '操作日志',
  '/admin/change-password': '修改密码',
  // 用户管理
  '/admin/users': '用户管理',
  '/admin/users/levels': '用户等级',
  '/admin/users/credits': '用户积分',
  '/admin/users/orders': '用户订单',
  '/admin/users/devices': '用户设备',
  '/admin/users/login-log': '登录日志',
  '/admin/users/:id': '用户详情',
  // API Key 池
  '/admin/api-key-pool': 'API Key 池',
  '/admin/api-key-pool/stats': '统计',
  // Agent 管理
  '/admin/agents': 'Agent 管理',
  '/admin/agents/review': 'Agent 审核',
  '/admin/agents/pricing': 'Agent 定价',
  '/admin/agents/categories': 'Agent 分类',
  // 工作流管理
  '/admin/workflows': '工作流管理',
  '/admin/workflows/review': '工作流审核',
  '/admin/workflows/stats': '工作流统计',
  // 插件管理
  '/admin/plugins': '插件管理',
  '/admin/plugins/review': '插件审核',
  '/admin/plugins/sync': '插件同步',
  // 大模型
  '/admin/models': '大模型配置',
  // 财务
  '/admin/finance': '财务管理',
  '/admin/finance/transactions': '交易记录',
  '/admin/finance/orders': '充值订单',
  '/admin/finance/invoices': '发票管理',
  '/admin/finance/reconciliation': '对账',
  '/admin/finance/consumption': '消费记录',
  '/admin/finance/credit-flow': '积分流水',
  '/admin/finance/pricing': '定价方案',
  // 审计
  '/admin/audit': '审计中心',
  '/admin/audit/sensitive-words': '敏感词',
  '/admin/audit/ai-config': 'AI 配置',
  '/admin/audit/queue': '审核队列',
  // 统计
  '/admin/stats': '数据统计',
  '/admin/stats/overview': '概览',
  '/admin/stats/trends': '趋势',
  '/admin/stats/rankings': '排行',
  '/admin/stats/retention': '留存',
  // 系统管理
  '/admin/system': '系统管理',
  '/admin/system/services': '服务监控',
  '/admin/system/call-logs': '调用日志',
  '/admin/system/config': '系统配置',
  '/admin/system/announcements': '公告管理',
  '/admin/system/tenant': '租户管理',
  // 资源管理
  '/admin/resources/ai-employees': 'AI 员工',
  '/admin/skill-store': 'SKILL 商店',
  '/admin/resources/knowledge': '知识库',
  '/admin/resources/workflow-templates': '工作流模板',
  // 审核
  '/admin/review/knowledge': '知识库审核',
  // 扩展
  '/admin/agent-ext': '扩展审核',
  // 数据分析
  '/admin/analytics/users': '用户分析',
  '/admin/analytics/calls': '调用分析',
  '/admin/analytics/revenue': '收入分析',
  // 版本
  '/admin/versions': '版本管理'
}

/**
 * 判断段是否为动态参数（数字 / UUID / MongoDB ObjectId）
 */
function isParamSegment(seg: string): boolean {
  if (!seg) return false
  // 纯数字
  if (/^\d+$/.test(seg)) return true
  // UUID（8-4-4-4-12 格式）
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(seg)) return true
  // 24 位 hex（MongoDB ObjectId）
  if (/^[0-9a-fA-F]{24}$/.test(seg)) return true
  return false
}

/**
 * 将路径中的参数段替换为 :id，用于匹配 ROUTE_LABEL_MAP
 * 例如 /workflows/123/edit → /workflows/:id/edit
 */
function normalizePath(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length === 0) return '/'
  const normalized = segs.map((seg) => (isParamSegment(seg) ? ':id' : seg))
  return '/' + normalized.join('/')
}

/**
 * 根据当前 pathname 生成面包屑层级
 * 拆分 pathname 为段，逐级累积路径匹配 ROUTE_LABEL_MAP
 * 参数段（数字/UUID）使用通用 label "详情"
 * 兜底：使用段名作为 label
 */
function matchRoute(pathname: string): BreadcrumbItem[] {
  const segs = pathname.split('/').filter(Boolean)
  // 根路径
  if (segs.length === 0) {
    return [{ path: '/', label: ROUTE_LABEL_MAP['/'] || '首页' }]
  }

  const items: BreadcrumbItem[] = [{ path: '/', label: ROUTE_LABEL_MAP['/'] || '首页' }]

  let currentPath = ''
  for (let i = 0; i < segs.length; i++) {
    currentPath = currentPath + '/' + segs[i]
    // 精确匹配
    let label = ROUTE_LABEL_MAP[currentPath]
    if (!label) {
      // 尝试将参数段替换为 :id 后匹配
      const normalized = normalizePath(currentPath)
      label = ROUTE_LABEL_MAP[normalized]
    }
    if (!label) {
      // 若当前段是参数，使用通用 label
      if (isParamSegment(segs[i])) {
        label = '详情'
      } else {
        // 兜底：使用段名（去除连字符，首字母大写）
        label = segs[i].replace(/-/g, ' ')
      }
    }
    items.push({ path: currentPath, label })
  }

  return items
}

export default function Breadcrumb() {
  const location = useLocation()
  const navigate = useNavigate()
  const items = useMemo(() => matchRoute(location.pathname), [location.pathname])

  // 根路径不显示面包屑（首页 / 管理后台根）
  if (location.pathname === '/' || location.pathname === '/admin') {
    return null
  }
  // 仅一项时不显示
  if (items.length <= 1) {
    return null
  }

  return (
    <AntdBreadcrumb className={styles.breadcrumb}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <AntdBreadcrumb.Item
            key={item.path}
            onClick={() => {
              if (!isLast) navigate(item.path)
            }}
            className={isLast ? styles.breadcrumbCurrent : styles.breadcrumbLink}
          >
            {item.label}
          </AntdBreadcrumb.Item>
        )
      })}
    </AntdBreadcrumb>
  )
}
