// 通知设置（SubTask 15.5）
// 邮件通知（对话完成 / 积分变动 / 系统公告）
// 客户端推送（对话回复 / Agent 审核结果 / 充值到账）
// 保存调用 PATCH /users/notification-settings body: { emailNotifications, pushNotifications }

import { useCallback, useEffect, useState } from 'react'
import {
  Card,
  Form,
  Switch,
  Button,
  Spin,
  Divider,
  message
} from 'antd'
import {
  MailOutlined,
  BellOutlined,
  MessageOutlined,
  DollarOutlined,
  NotificationOutlined,
  RobotOutlined,
  WalletOutlined
} from '@ant-design/icons'
import {
  getNotificationSettings,
  updateNotificationSettings
} from '@/api/settings-api'
import type { NotificationSettings } from '@/types/settings'
import styles from './styles.module.css'

const DEFAULT_SETTINGS: NotificationSettings = {
  emailNotifications: {
    chatCompleted: false,
    creditsChanged: false,
    systemAnnouncement: false
  },
  pushNotifications: {
    chatReply: false,
    agentReviewResult: false,
    rechargeArrived: false
  }
}

export default function Notifications() {
  const [form] = Form.useForm<NotificationSettings>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const settings = await getNotificationSettings()
      form.setFieldsValue(settings)
    } catch (err) {
      console.error('[Notifications] load failed:', err)
      message.error('加载通知设置失败')
      form.setFieldsValue(DEFAULT_SETTINGS)
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await updateNotificationSettings(values)
      message.success('通知设置已保存')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[Notifications] save failed:', err)
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Spin spinning={loading}>
      <Card className={styles.card} bordered={false}>
        <div className={styles.cardBody}>
          <h2 className={styles.sectionTitle}>通知设置</h2>
          <div className={styles.sectionDesc}>
            配置邮件与客户端推送的通知场景
          </div>

          <Form
            form={form}
            layout="vertical"
            className={styles.form}
            initialValues={DEFAULT_SETTINGS}
          >
            <Divider orientation="left" plain>
              <MailOutlined style={{ marginRight: 6 }} />
              邮件通知
            </Divider>
            <Form.Item
              name={['emailNotifications', 'chatCompleted']}
              label={
                <span>
                  <MessageOutlined style={{ marginRight: 6 }} />
                  对话完成
                </span>
              }
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name={['emailNotifications', 'creditsChanged']}
              label={
                <span>
                  <DollarOutlined style={{ marginRight: 6 }} />
                  积分变动
                </span>
              }
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name={['emailNotifications', 'systemAnnouncement']}
              label={
                <span>
                  <NotificationOutlined style={{ marginRight: 6 }} />
                  系统公告
                </span>
              }
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Divider orientation="left" plain>
              <BellOutlined style={{ marginRight: 6 }} />
              客户端推送
            </Divider>
            <Form.Item
              name={['pushNotifications', 'chatReply']}
              label={
                <span>
                  <MessageOutlined style={{ marginRight: 6 }} />
                  对话回复
                </span>
              }
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name={['pushNotifications', 'agentReviewResult']}
              label={
                <span>
                  <RobotOutlined style={{ marginRight: 6 }} />
                  Agent 审核结果
                </span>
              }
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name={['pushNotifications', 'rechargeArrived']}
              label={
                <span>
                  <WalletOutlined style={{ marginRight: 6 }} />
                  充值到账
                </span>
              }
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                className={styles.primaryBtn}
                loading={saving}
                onClick={handleSave}
              >
                保存
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>
    </Spin>
  )
}
