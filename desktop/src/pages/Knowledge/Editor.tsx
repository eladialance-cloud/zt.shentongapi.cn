// 知识库编辑器 - v0.3.1 stub (Task 31)
// 占位页面：知识库元数据编辑 + 分块策略配置（后续接入 /knowledge/bases/:id PATCH）

import { useState } from 'react'
import { Button, Card, Form, Input, Select, Space, message } from 'antd'
import { ArrowLeftOutlined, BookOutlined } from '@ant-design/icons'
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
          <BookOutlined />
          知识库编辑器
        </div>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          <Button type="primary" loading={saving} onClick={() => message.info('保存接口待接入')}>
            保存
          </Button>
        </Space>
      </div>
      <Card title={`知识库 ID: ${id ?? 'new'}`} bordered={false}>
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
      </Card>
    </div>
  )
}
