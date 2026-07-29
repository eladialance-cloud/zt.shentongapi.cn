// 权限矩阵 - v0.3.1 共享组件 Task 3
// 二维表格：角色 × 资源，每个单元格一个 Checkbox
import { useState } from 'react'
import { Checkbox } from 'antd'
import styles from './styles.module.css'

export interface PermissionMatrixProps {
  roles: string[]
  resources: string[]
  value?: Record<string, Record<string, boolean>>
  onChange?: (value: Record<string, Record<string, boolean>>) => void
  readOnly?: boolean
}

export default function PermissionMatrix({
  roles,
  resources,
  value,
  onChange,
  readOnly = false
}: PermissionMatrixProps) {
  const [internalValue, setInternalValue] = useState<
    Record<string, Record<string, boolean>>
  >({})
  const current = value ?? internalValue

  const isChecked = (role: string, resource: string): boolean => {
    return current[role]?.[resource] ?? false
  }

  const toggle = (role: string, resource: string) => {
    if (readOnly) return
    const next: Record<string, Record<string, boolean>> = { ...current }
    const roleMap: Record<string, boolean> = { ...(next[role] ?? {}) }
    roleMap[resource] = !roleMap[resource]
    next[role] = roleMap
    if (value === undefined) {
      setInternalValue(next)
    }
    onChange?.(next)
  }

  return (
    <div className={styles.matrix}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.cornerHeader}>资源 \ 角色</th>
            {roles.map((role) => (
              <th key={role} className={styles.roleHeader}>
                <span className={styles.roleTag}>{role}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((resource, idx) => (
            <tr
              key={resource}
              className={idx % 2 === 0 ? styles.evenRow : styles.oddRow}
            >
              <td className={styles.resourceCell}>{resource}</td>
              {roles.map((role) => (
                <td key={role} className={styles.cell}>
                  <Checkbox
                    checked={isChecked(role, resource)}
                    disabled={readOnly}
                    onChange={() => toggle(role, resource)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
