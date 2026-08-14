import { List, Modal, Tag, Typography } from 'antd'
import type { ModelTemplateItem } from '@/types/admin-model'

/** 模板库：从千问清单创建模型（默认下架，创建后进入编辑） */
export default function TemplatePickerModal(props: {
  open: boolean
  templates: ModelTemplateItem[]
  loading?: boolean
  onCancel: () => void
  onPick: (tpl: ModelTemplateItem) => void
}) {
  const { open, templates, loading, onCancel, onPick } = props
  return (
    <Modal title="从模板创建模型（千问清单）" open={open} footer={null} width={720} onCancel={onCancel}>
      <List
        loading={loading}
        dataSource={templates}
        renderItem={(t) => (
          <List.Item
            style={{ cursor: 'pointer' }}
            onClick={() => onPick(t)}
            extra={<a>创建</a>}
          >
            <List.Item.Meta
              title={
                <span>
                  {t.name} <Tag>{t.callMode}</Tag>
                </span>
              }
              description={
                <Typography.Text type="secondary">
                  {t.description} · {t.recommendedScenarioTags.join(' / ')}
                </Typography.Text>
              }
            />
          </List.Item>
        )}
      />
    </Modal>
  )
}