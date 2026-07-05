// 资料编辑（SubTask 15.1）
// 头像（Upload → /users/avatar，jpg/png，≤2MB）+ 用户名(readonly) + 邮箱(校验) + 手机号(11位)
// 保存调用 PATCH /users/:id（id 从 auth store 获取）

import { useEffect, useState } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  Upload,
  Spin,
  message,
  type UploadProps
} from 'antd'
import { UploadOutlined, UserOutlined } from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import { useAuthStore } from '@/store/auth'
import { getProfile, updateProfile, uploadAvatar } from '@/api/settings-api'
import type { UpdateProfileDto } from '@/types/settings'
import styles from './styles.module.css'

interface FormValues {
  email: string
  phone?: string
}

const MAX_AVATAR_SIZE = 2 * 1024 * 1024

export default function Profile() {
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar)

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const profile = await getProfile()
      setAvatar(profile.avatar)
      form.setFieldsValue({
        email: profile.email,
        phone: profile.phone
      })
    } catch (err) {
      console.error('[Profile] load failed:', err)
      message.error('加载资料失败')
      // 兜底使用 auth store 中的数据
      form.setFieldsValue({
        email: user?.email ?? '',
        phone: user?.phone
      })
    } finally {
      setLoading(false)
    }
  }

  const uploadProps: UploadProps = {
    accept: 'image/jpeg,image/png',
    showUploadList: false,
    beforeUpload: (file: RcFile) => {
      const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png'
      if (!isJpgOrPng) {
        message.error('仅支持 JPG / PNG 格式')
        return Upload.LIST_IGNORE
      }
      if (file.size > MAX_AVATAR_SIZE) {
        message.error('头像大小不能超过 2MB')
        return Upload.LIST_IGNORE
      }
      return true
    },
    customRequest: async (options) => {
      const { file, onSuccess, onError } = options
      try {
        const result = await uploadAvatar(file as File)
        setAvatar(result.url)
        // 同步更新 auth store
        if (user) updateUser({ ...user, avatar: result.url })
        message.success('头像上传成功')
        onSuccess?.(result)
      } catch (err) {
        console.error('[Profile] upload avatar failed:', err)
        message.error('头像上传失败')
        onError?.(err as Error)
      }
    }
  }

  const handleSave = async () => {
    const userId = user?.id
    if (!userId) {
      message.error('无法获取用户信息，请重新登录')
      return
    }
    try {
      const values = await form.validateFields()
      setSaving(true)
      const dto: UpdateProfileDto = {
        email: values.email,
        phone: values.phone,
        avatar
      }
      const updated = await updateProfile(userId, dto)
      updateUser({
        ...user,
        email: updated.email,
        phone: updated.phone,
        avatar: updated.avatar ?? avatar
      })
      message.success('资料已保存')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      console.error('[Profile] save failed:', err)
      message.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const initial = user?.username?.charAt(0)?.toUpperCase() || 'U'

  return (
    <Spin spinning={loading}>
      <Card className={styles.card} bordered={false}>
        <div className={styles.cardBody}>
          <h2 className={styles.sectionTitle}>资料编辑</h2>
          <div className={styles.sectionDesc}>
            头像、邮箱与手机号将用于账户安全与通知
          </div>

          {/* 头像 */}
          <div className={styles.avatarWrap}>
            <div className={styles.avatar}>
              {avatar ? (
                <img src={avatar} alt="avatar" className={styles.avatarImg} />
              ) : (
                initial
              )}
            </div>
            <div>
              <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />}>更换头像</Button>
              </Upload>
              <div className={styles.avatarTip}>
                支持 JPG / PNG，最大 2MB
              </div>
            </div>
          </div>

          {/* 表单 */}
          <Form
            form={form}
            layout="vertical"
            className={styles.form}
            initialValues={{
              email: user?.email ?? '',
              phone: user?.phone
            }}
          >
            <Form.Item label="用户名">
              <Input
                prefix={<UserOutlined />}
                value={user?.username ?? ''}
                disabled
              />
            </Form.Item>
            <Form.Item
              label="邮箱"
              name="email"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' }
              ]}
            >
              <Input placeholder="请输入邮箱" />
            </Form.Item>
            <Form.Item
              label="手机号"
              name="phone"
              rules={[
                {
                  pattern: /^1\d{10}$/,
                  message: '请输入正确的 11 位手机号'
                }
              ]}
            >
              <Input placeholder="请输入手机号" maxLength={11} />
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
