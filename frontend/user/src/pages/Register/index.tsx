// 娉ㄥ唽椤?- 绗竴闂幆鏍稿績
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, message } from 'antd';
import { GiftOutlined, LockOutlined, MailOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { register } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import type { RegisterParams } from '@/types/api';
import request from '@/utils/request';
import styles from './styles.module.css';

// 琛ㄥ崟鍊肩被鍨嬶細鍦ㄦ敞鍐屽弬鏁板熀纭€涓婂鍔犵‘璁ゅ瘑鐮佸瓧娈?interface RegisterFormValues extends RegisterParams {
  confirmPassword: string;
}

export default function Register() {
  const navigate = useNavigate();
  const authLogin = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);
  const [inviteRequired, setInviteRequired] = useState(false);

  // 椤甸潰鍔犺浇鏃惰幏鍙栨敞鍐岄厤缃?  useEffect(() => {
    request.get('/auth/registration-config').then((data: any) => {
      setInviteRequired(!!data?.inviteCodeRequired);
    }).catch(() => {
      // 鑾峰彇澶辫触榛樿涓嶈姹傞個璇风爜
      setInviteRequired(false);
    });
  }, []);

  const handleFinish = async (values: RegisterFormValues) => {
    setLoading(true);
    try {
      const { username, email, password, inviteCode } = values;
      const { accessToken, user } = await register({
        username,
        email,
        password,
        inviteCode,
      });
      authLogin(accessToken, user);
      message.success(`娉ㄥ唽鎴愬姛锛屾杩庡姞鍏ワ紝${user.username}`);
      navigate('/', { replace: true });
    } catch {
      // 閿欒宸茬敱 request 鎷︽埅鍣ㄧ粺涓€鎻愮ず
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* 宸︿晶鍝佺墝瑙嗚鍖?*/}
      <div className={styles.brandSide}>
        <div className={styles.decoration1} />
        <div className={styles.decoration2} />
        <div className="particles" />
        <div className={styles.brandContent}>
          <div className={styles.brandLogo}>
            <div className={styles.brandIcon}>
              <RobotOutlined />
            </div>
            <span className={styles.brandTitle}>娣辩灣 AI</span>
          </div>
          <h1 className={styles.brandHeading}>
            鍔犲叆娣辩灣
            <br />
            寮€鍚櫤鑳戒箣鏃?          </h1>
          <p className={styles.brandSubtitle}>
            娉ㄥ唽璐﹀彿锛屽嵆鍒讳綋楠?AI Agent 涓庣煡璇嗗簱鐨勫己澶ц兘鍔?          </p>
        </div>
      </div>

      {/* 绉诲姩绔搧鐗屽ご */}
      <div className={styles.mobileHeader}>
        <div className={styles.brandIcon}>
          <RobotOutlined />
        </div>
        <span className={styles.brandTitle}>娣辩灣 AI</span>
      </div>

      {/* 鍙充晶娉ㄥ唽琛ㄥ崟鍖?*/}
      <div className={styles.formSide}>
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>鍒涘缓璐﹀彿</h2>
          <p className={styles.formSubtitle}>濉啓淇℃伅浠ユ敞鍐屼綘鐨勮处鍙?/p>
          <Form<RegisterFormValues>
            className={styles.form}
            onFinish={handleFinish}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '璇疯緭鍏ョ敤鎴峰悕' },
                { min: 3, message: '鐢ㄦ埛鍚嶈嚦灏?3 涓瓧绗? },
                { max: 20, message: '鐢ㄦ埛鍚嶆渶澶?20 涓瓧绗? },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="鐢ㄦ埛鍚?
              />
            </Form.Item>
            <Form.Item
              name="email"
              rules={[
                { required: true, message: '璇疯緭鍏ラ偖绠? },
                { type: 'email', message: '璇疯緭鍏ユ湁鏁堢殑閭鍦板潃' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="閭"
              />
            </Form.Item>
            <Form.Item
              name="inviteCode"
              rules={inviteRequired ? [{ required: true, message: '璇疯緭鍏ラ個璇风爜' }] : []}
            >
              <Input
                prefix={<GiftOutlined />}
                placeholder={inviteRequired ? '閭€璇风爜' : '閭€璇风爜锛堥€夊～锛?}
              />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[
                { required: true, message: '璇疯緭鍏ュ瘑鐮? },
                { min: 8, message: '瀵嗙爜鑷冲皯 8 涓瓧绗? },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="瀵嗙爜锛堣嚦灏?8 浣嶏級"
              />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: '璇峰啀娆¤緭鍏ュ瘑鐮? },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('涓ゆ杈撳叆鐨勫瘑鐮佷笉涓€鑷?));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="纭瀵嗙爜"
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
                娉ㄥ唽
              </Button>
            </Form.Item>
          </Form>
          <div className={styles.footer}>
            宸叉湁璐﹀彿锛?            <a className={styles.link} onClick={() => navigate('/login')}>
              绔嬪嵆鐧诲綍
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
