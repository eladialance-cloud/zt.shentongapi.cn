// 管理端角色权限管理页 - SubTask 17.3
//
// 功能：
// - 角色列表(表格):角色名/角色编码/权限数/创建时间/操作(编辑权限)
// - 权限编辑模态框:antd Tree 展示所有权限编码(按分组),勾选已分配权限
// - API: GET /admin/roles、PUT /admin/roles/:id/permissions

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Empty,
  Modal,
  Spin,
  Table,
  Tree,
  message,
  Tag,
  Tooltip
} from 'antd'
import type { TableColumnsType } from 'antd'
import { EditOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons'
import {
  ALL_PERMISSIONS,
  listAdminRoles,
  updateRolePermissions
} from '@/api/admin-auth-api'
import type { AdminRole, Permission, PermissionCode } from '@/types/admin-auth'
import styles from './styles.module.css'

/** 树节点数据结构 */
interface TreeNode {
  key: string
  title: string
  children?: TreeNode[]
}

/** 把扁平权限列表构建为按分组组织的树 */
function buildPermissionTree(permissions: Permission[]): TreeNode[] {
  const groupMap = new Map<string, Permission[]>()
  permissions.forEach((p) => {
    const list = groupMap.get(p.group) || []
    list.push(p)
    groupMap.set(p.group, list)
  })
  const tree: TreeNode[] = []
  groupMap.forEach((list, group) => {
    tree.push({
      key: `group:${group}`,
      title: group,
      children: list.map((p) => ({
        key: p.code,
        title: `${p.name}（${p.code}）`
      }))
    })
  })
  return tree
}

/** 从树中提取所有叶子节点 key(权限编码) */
function getAllLeafKeys(permissions: Permission[]): string[] {
  return permissions.map((p) => p.code)
}

export default function AdminRoles() {
  const [loading, setLoading] = useState(true)
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AdminRole | null>(null)
  const [checkedKeys, setCheckedKeys] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const treeData = useMemo(() => buildPermissionTree(ALL_PERMISSIONS), [])
  const allLeafKeys = useMemo(() => getAllLeafKeys(ALL_PERMISSIONS), [])

  const loadRoles = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listAdminRoles()
      setRoles(list || [])
    } catch (err) {
      console.error('[AdminRoles] load failed:', err)
      message.error('加载角色列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRoles()
  }, [loadRoles])

  const handleEdit = (role: AdminRole) => {
    setEditing(role)
    setCheckedKeys(role.permissionCodes || [])
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!editing) return
    // 只取叶子节点(权限编码),过滤掉分组节点
    const leafCodes = checkedKeys.filter((k) => !k.startsWith('group:'))
    setSaving(true)
    try {
      await updateRolePermissions(
        editing.id,
        leafCodes as PermissionCode[]
      )
      message.success('权限更新成功')
      setModalOpen(false)
      // 本地更新
      setRoles((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...r, permissionCodes: leafCodes as PermissionCode[] }
            : r
        )
      )
    } catch (err) {
      console.error('[AdminRoles] update failed:', err)
      message.error('权限更新失败')
    } finally {
      setSaving(false)
    }
  }

  const columns: TableColumnsType<AdminRole> = [
    {
      title: '角色名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{name}</span>
    },
    {
      title: '角色编码',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Tag color="blue">{code}</Tag>
    },
    {
      title: '权限数',
      dataIndex: 'permissionCodes',
      key: 'permissionCount',
      width: 100,
      render: (codes: PermissionCode[]) => (
        <Tag className={styles.tagWarn}>
          {codes?.length || 0} / {ALL_PERMISSIONS.length}
        </Tag>
      )
    },
    {
      title: '关联用户',
      dataIndex: 'userCount',
      key: 'userCount',
      width: 100,
      render: (count?: number) => (
        <span style={{ color: '#94a3b8' }}>
          <TeamOutlined style={{ marginRight: 4 }} />
          {count ?? 0}
        </span>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t: string) => (
        <span style={{ color: '#8b949e' }}>{t}</span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, record: AdminRole) => (
        <Tooltip title="编辑权限">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            className={styles.ghostBtn}
            size="small"
          >
            编辑权限
          </Button>
        </Tooltip>
      )
    }
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <TeamOutlined className={styles.titleIcon} />
          <div>
            <h1 className={styles.title}>角色权限管理</h1>
            <div className={styles.subtitle}>
              管理角色及其权限分配 · 共 {ALL_PERMISSIONS.length} 个权限编码
            </div>
          </div>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadRoles}
          className={styles.ghostBtn}
        >
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {roles.length === 0 && !loading ? (
          <Empty description="暂无角色数据" style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<AdminRole>
              rowKey="id"
              columns={columns}
              dataSource={roles}
              pagination={false}
              size="middle"
            />
          </div>
        )}
      </Spin>

      <Modal
        title={`编辑权限 - ${editing?.name || ''}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <div className={styles.permissionTree}>
          <Tree
            checkable
            defaultExpandAll
            treeData={treeData}
            checkedKeys={checkedKeys}
            onCheck={(checked) => {
              const keys = Array.isArray(checked) ? checked : checked.checked
              setCheckedKeys(keys as string[])
            }}
          />
        </div>
        <div className={styles.treeFooter}>
          <span className={styles.treeCount}>
            已选权限:{' '}
            {checkedKeys.filter((k) => !k.startsWith('group:')).length} /{' '}
            {allLeafKeys.length}
          </span>
          <Button
            type="link"
            size="small"
            onClick={() => setCheckedKeys(allLeafKeys)}
          >
            全选
          </Button>
          <Button type="link" size="small" onClick={() => setCheckedKeys([])}>
            清空
          </Button>
        </div>
      </Modal>
    </div>
  )
}
