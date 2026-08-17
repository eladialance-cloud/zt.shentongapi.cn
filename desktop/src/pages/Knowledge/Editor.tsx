// 知识库编辑器 - v0.3.1 stub (Task 31)
// 占位页面：知识库元数据编辑 + 分块策略配置（后续接入 /knowledge/bases/:id PATCH）
// Kimi 风格（v2.0）

import { useState } from 'react'
import { Button, Form, Input, Select, Space, message } from 'antd'
import { ArrowLeft, Library, Save } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import styles from './styles.module.css'

export default function KnowledgeEditor() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [saving] = useState(false)

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <Library size={18} />
          </span>
          <span>知识库编辑器</span>
        </div>
        <Space>
          <Button
            className={styles.ghostBtn}
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate(-1)}
          >
            返回
          </Button>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<Save size={14} />}
            loading={saving}
            onClick={() => message.info('保存接口待接入')}
          >
            保存
          </Button>
        </Space>
      </div>
      <div className={styles.editorCard}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>
            <Library size={15} />
          </span>
          知识库 ID: {id ?? 'new'}
        </div>
        <Form layout="vertical" initialValues={{ name: '', visibility: 'private' }}>
          <Form.Item label="知识库名称" name="name">
            <Input placeholder="请输入知识库名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="知识库用途描述" />
          </Form.Item>
          <Form.Item label="可见性" name="visibility">
            <Select
              options={[
                { value: 'private', label: '私有' },
                { value: 'team', label: '团队' },
                { value: 'public', label: '公开' }
              ]}
            />
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}
