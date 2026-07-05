// 注册页 - 第一闭环核心
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, message } from 'antd';
import { LockOutlined, MailOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { register } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import type { RegisterParams } from '@/types/api';
import styles from './styles.module.css';

// 表单值类型：在注册参数基础上增加确认密码字段
interface RegisterFormValues extends RegisterParams {
  confirmPassword: string;
}

export default function Register() {
  const navigate = useNavigate();
  const authLogin = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: RegisterFormValues) => {
    setLoading(true);
    try {
      const { username, email, password, inviteCode } = values;
      const { accessToken, refreshToken, user } = await register({
        username,
        email,
        password,
        inviteCode,
      });
      authLogin(accessToken, refreshToken, user);
      message.success(`注册成功，欢迎加入，${user.username}`);
      navigate('/', { replace: true });
    } catch {
      // 错误已由 request 拦截器统一提示
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* 左侧品牌视觉区 */}
      <div className={styles.brandSide}>
        <div className={styles.decoration1} />
        <div className={styles.decoration2} />
        <div className="particles" />
        <div className={styles.brandContent}>
          <div className={styles.brandLogo}>
            <div className={styles.brandIcon}>
              <RobotOutlined />
            </div>
            <span className={styles.brandTitle}>深瞳 AI</span>
          </div>
          <h1 className={styles.brandHeading}>
            加入深瞳
            <br />
            开启智能之旅
          </h1>
          <p className={styles.brandSubtitle}>
            注册账号，即刻体验 AI Agent 与知识库的强大能力
          </p>
        </div>
      </div>

      {/* 移动端品牌头 */}
      <div className={styles.mobileHeader}>
        <div className={styles.brandIcon}>
          <RobotOutlined />
        </div>
        <span className={styles.brandTitle}>深瞳 AI</span>
      </div>

      {/* 右侧注册表单区 */}
      <div className={styles.formSide}>
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>创建账号</h2>
          <p className={styles.formSubtitle}>填写信息以注册你的账号</p>
          <Form<RegisterFormValues>
            className={styles.form}
            onFinish={handleFinish}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少 3 个字符' },
                { max: 20, message: '用户名最多 20 个字符' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="用户名"
              />
            </Form.Item>
            <Form.Item
              name="email"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="邮箱"
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 8, message: '密码至少 8 个字符' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码（至少 8 位）"
              />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: '请再次输入密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="确认密码"
              />
            </Form.Item>
            <Form.Item>
              <Button
                className={styles.submitButton}
                type="primary"
                htmlType="submit"
                block
                loading={loading}
              >
                注册
              </Button>
            </Form.Item>
          </Form>
          <div className={styles.footer}>
            已有账号？
            <a className={styles.link} onClick={() => navigate('/login')}>
              立即登录
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
