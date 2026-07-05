// 登录页 - 第一闭环核心
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, message } from 'antd';
import { LockOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { login } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import type { LoginParams } from '@/types/api';
import styles from './styles.module.css';

export default function Login() {
  const navigate = useNavigate();
  const authLogin = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: LoginParams) => {
    setLoading(true);
    try {
      const { accessToken, refreshToken, user } = await login(values);
      authLogin(accessToken, refreshToken, user);
      message.success(`欢迎回来，${user.username}`);
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
            智能中台
            <br />
            洞察未来
          </h1>
          <p className={styles.brandSubtitle}>
            一站式 AI Agent 与知识库管理平台，让智能触手可及
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

      {/* 右侧登录表单区 */}
      <div className={styles.formSide}>
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>欢迎回来</h2>
          <p className={styles.formSubtitle}>登录以开始你的智能对话</p>
          <Form<LoginParams>
            className={styles.form}
            onFinish={handleFinish}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="account"
              rules={[{ required: true, message: '请输入用户名或邮箱' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="用户名或邮箱"
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
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
                登录
              </Button>
            </Form.Item>
          </Form>
          <div className={styles.footer}>
            还没有账号？
            <a className={styles.link} onClick={() => navigate('/register')}>
              立即注册
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
