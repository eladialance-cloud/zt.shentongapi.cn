import type { ReactNode } from 'react'
import { Button, Empty, Popconfirm, Spin, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import styles from './styles.module.css'

/** 通用"启用/禁用"列渲染 */
export function renderEnabled(v: boolean) {
  return v ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>
}

/** 通用"描述"列渲染 */
export function renderDescription(v: string) {
  return <span style={{ color: '#94a3b8' }}>{v || '-'}</span>
}

/** 通用"名称/标题"列渲染 */
export function renderName(v: string) {
  return <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{v}</span>
}

/** 通用"显示名"列渲染 */
export function renderDisplayName(v: string) {
  return <span style={{ color: '#c7d2fe' }}>{v || '-'}</span>
}

/** 通用数字列渲染 */
export function renderNumber(v: number) {
  return <span style={{ color: '#7dd3fc' }}>{v.toLocaleString()}</span>
}

/** 生成"编辑+删除"操作列 */
export function editDeleteActions<T>(
  onEdit: (record: T) => void,
  onDelete: (record: T) => void,
  deleteTitle = '确认删除?',
  canDelete?: (record: T) => boolean,
): TableColumnsType<T>[number] {
  return {
    title: '操作',
    key: 'action',
    width: 160,
    fixed: 'right',
    render: (_: unknown, record: T) => (
      <>
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(record)}>
          编辑
        </Button>
        {canDelete ? canDelete(record) : true ? (
          <Popconfirm
            title={deleteTitle}
            onConfirm={() => onDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        ) : null}
      </>
    ),
  }
}

/** 通用 Tab 内容：搜索栏 + Spin + Empty + Table */
export function TabContent<T>({
  loading,
  data,
  columns,
  scrollX = 1000,
  toolbar,
  emptyText = '暂无数据',
  pagination,
}: {
  loading: boolean
  data: T[]
  columns: TableColumnsType<T>
  scrollX?: number
  toolbar?: ReactNode
  emptyText?: string
  pagination?: ReactNode
}) {
  return (
    <>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
      <Spin spinning={loading}>
        {data.length === 0 && !loading ? (
          <Empty description={emptyText} style={{ marginTop: 80 }} />
        ) : (
          <div className={styles.tableWrap}>
            <Table<T>
              rowKey="id"
              columns={columns}
              dataSource={data}
              pagination={false}
              size="middle"
              scroll={{ x: scrollX }}
            />
          </div>
        )}
        {pagination}
      </Spin>
    </>
  )
}
