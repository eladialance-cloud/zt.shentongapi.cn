/**
 * Breadcrumb — v0.3.1 统一面包屑组件 (Task 25)
 * 根据当前路由 useLocation().pathname 自动生成面包屑层级
 * 集成到 MainLayout 顶部（TopBar 下方）
 * 支持点击跳转父级路由（最后一项不可点击）
 *
 * 路由映射表覆盖用户端主要路由
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
  // ===== 市场 =====
  '/agent-market': 'Agent 市场',
  '/skill-market': '技能市场',
  '/agents': 'AI 员工',
  '/agents/:id': '详情',
  // ===== 其他用户端路由 =====
  '/settings': '设置',
  '/profile': '个人信息',
  '/services': '服务管理',
  '/automation': '自动化',
  '/automation-editor': '编辑器',
  '/automation-editor/:id': '编辑',
  '/automation-history': '历史',
  '/automation-history/:id': '详情',
  '/mcp-config': 'MCP 配置',
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

  // 根路径不显示面包屑（首页）
  if (location.pathname === '/') {
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
