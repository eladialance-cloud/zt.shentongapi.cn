// 鐧诲綍椤?- 璧涘崥绉戞妧娣辫壊椋庢牸
//
// 鐧诲綍娴佺▼锛?// 1. 鑾峰彇璁惧鎸囩汗锛坵indow.electronAPI.device.getFingerprint锛?// 2. 鑾峰彇璁惧鍚嶇О锛坣avigator.platform 鍥為€€锛?// 3. 璋冪敤 POST /auth/login
// 4. 鎴愬姛锛氫繚瀛?token + secretKey 鈫?鍒濆鍖栨湰鍦?DB 鈫?璺宠浆 dashboard
// 5. 澶辫触锛歛ntd message 閿欒鎻愮ず锛圖EVICE_LIMIT_EXCEEDED 鐗规畩鎻愮ず锛?
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Checkbox, Form, Input, message } from 'antd'
import { LockOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons'
import { httpClient } from '@/api/http-client'
import { useAuthStore, type User } from '@/store/auth'
import { BusinessError } from '@/utils/errors'
import styles from './styles.module.css'

/** localStorage key锛氳浣忚处鍙凤紙闈炴晱鎰燂紝浠呭瓨璐﹀彿鍚嶏級 */
const REMEMBER_ACCOUNT_KEY = 'shentong-remember-account'
/** SafeStorage key锛氳浣忓瘑鐮侊紙鍔犲瘑瀛樺偍锛?*/
const REMEMBER_PASSWORD_KEY = 'remember-password'

/** 璁惧绫诲瀷閿欒鐮?*/
const DEVICE_LIMIT_EXCEEDED_CODE = 1011

interface LoginFormValues {
  account: string
  password: string
  remember?: boolean
}

/** 鍚庣 login 鍝嶅簲 */
interface LoginResponse {
  accessToken: string
  refreshToken: string
  secretKey: string
  // TODO: 鍚庣 /auth/login 鍝嶅簲闇€杩斿洖 dbSecret锛堥暱鏈熺敤鎴风骇瀵嗛挜锛岀敤浜庢湰鍦?DB 娲剧敓瀵嗛挜锛夛紱
  //       鍚庣鏈笅鍙戝墠璇ュ瓧娈典负 undefined锛孌B 鍒濆鍖栧皢鎶ラ敊骞惰繘鍏ラ檷绾фā寮?  dbSecret?: string
  // LLM 浠ｇ悊闀挎湡 API Key锛圚ermes Agent 鏈湴鍖栭儴缃茬敤锛屽悗绔?auth.service login 杩斿洖锛?  llmProxyKey?: string
  user: User
}

/** 鑾峰彇璁惧绫诲瀷锛堟槧灏?navigator.platform 鈫?win32/darwin/linux锛?*/
function getDeviceType(): string {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('win')) return 'win32'
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('linux')) return 'linux'
  return 'unknown'
}

/** 鑾峰彇璁惧鍚嶇О */
function getDeviceName(): string {
  // 浼樺厛浣跨敤 electronAPI锛堝鏋滄毚闇蹭簡 getDeviceName锛?  const deviceApi = window.electronAPI?.device as
    | { getDeviceName?: () => Promise<string>; getFingerprint: () => Promise<string> }
    | undefined
  if (deviceApi?.getDeviceName) {
    return 'Desktop' // getDeviceName 鏄紓姝ョ殑锛岃繖閲岀敤鍚屾鍥為€€
  }
  return navigator.platform || '鏈煡璁惧'
}

export default function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form] = Form.useForm<LoginFormValues>()

  // 鎸傝浇鏃朵粠 localStorage 璇诲彇璐﹀彿銆佷粠 SafeStorage 璇诲彇瀵嗙爜骞跺～鍏呭埌琛ㄥ崟
  useEffect(() => {
    const loadRememberedCredentials = async () => {
      try {
        // 璐﹀彿浠?localStorage 璇诲彇锛堥潪鏁忔劅锛?        const account = localStorage.getItem(REMEMBER_ACCOUNT_KEY)
        if (!account) return
        // 瀵嗙爜浠?SafeStorage 璇诲彇锛堝姞瀵嗗瓨鍌級
        const password = await window.electronAPI?.credential?.get(REMEMBER_PASSWORD_KEY)
        if (account && password) {
          form.setFieldsValue({ account, password, remember: true })
        }
      } catch {
        // 璇诲彇寮傚父锛屽拷鐣?      }
    }
    loadRememberedCredentials()
  }, [form])

  /** 鎵ц鐧诲綍 API 璋冪敤 */
  const doLogin = async (account: string, password: string): Promise<LoginResponse> => {
    // 1. 鑾峰彇璁惧鎸囩汗
    let deviceFingerprint: string | undefined
    try {
      deviceFingerprint = await window.electronAPI.device.getFingerprint()
    } catch {
      // 鑾峰彇鎸囩汗澶辫触锛岀户缁櫥褰曪紙鍚庣璁惧鏍￠獙鍙€夛級
    }

    // 2. 鑾峰彇璁惧淇℃伅
    const deviceName = getDeviceName()
    const deviceType = getDeviceType()

    // 3. 璋冪敤鐧诲綍 API
    return httpClient.post<LoginResponse>('/auth/login', {
      account,
      password,
      deviceFingerprint,
      deviceName,
      deviceType,
    })
  }

  /** 鐧诲綍鎴愬姛鍚庣殑澶勭悊锛氫繚瀛?token 鈫?鍒濆鍖?DB 鈫?璺宠浆 */
  const handleLoginSuccess = async (data: LoginResponse) => {
    // 淇濆瓨璁よ瘉淇℃伅鍒?store锛坅ccessToken/refreshToken/secretKey/user/dbSecret/llmProxyKey锛?    setAuth(
      data.accessToken,
      data.refreshToken,
      data.secretKey,
      data.user,
      data.dbSecret ?? '',
      data.llmProxyKey ?? ''
    )

    // 鍒濆鍖栨湰鍦版暟鎹簱锛堜娇鐢?userId + dbSecret 娲剧敓瀵嗛挜锛岃法 token 鍒锋柊绋冲畾锛?    try {
      await window.electronAPI.db.initialize(
        String(data.user.id),
        data.dbSecret ?? ''
      )
    } catch {
      // DB 鍒濆鍖栧け璐ヤ笉闃诲鐧诲綍锛堣繘鍏ラ檷绾фā寮忥級
      message.warning('鏈湴鏁版嵁搴撳垵濮嬪寲澶辫触锛屽凡杩涘叆闄嶇骇妯″紡')
    }

    message.success(`娆㈣繋鍥炴潵锛?{data.user.username}`)
    navigate('/dashboard', { replace: true })
  }

  /** 琛ㄥ崟鎻愪氦 */
  const handleFinish = async (values: LoginFormValues) => {
    setLoading(true)
    try {
      const data = await doLogin(values.account, values.password)
      // 鐧诲綍鎴愬姛鍚庡鐞嗚浣忚处鍙峰瘑鐮?      if (values.remember) {
        // 璐﹀彿瀛?localStorage锛堥潪鏁忔劅锛夛紝瀵嗙爜瀛?SafeStorage锛堝姞瀵嗭級
        localStorage.setItem(REMEMBER_ACCOUNT_KEY, values.account)
        await window.electronAPI?.credential?.set(REMEMBER_PASSWORD_KEY, values.password)
      } else {
        localStorage.removeItem(REMEMBER_ACCOUNT_KEY)
        await window.electronAPI?.credential?.delete(REMEMBER_PASSWORD_KEY)
      }
      await handleLoginSuccess(data)
    } catch (err) {
      // 璁惧瓒呴檺鐗规畩鎻愮ず
      if (err instanceof BusinessError && err.code === DEVICE_LIMIT_EXCEEDED_CODE) {
        message.error('宸茬粦瀹氳澶囨暟瓒呰繃闄愬埗锛岃鍏堣В缁戞棫璁惧')
      } else if (err instanceof BusinessError) {
        message.error(err.message || '鐧诲綍澶辫触')
      } else {
        message.error('鐧诲綍澶辫触锛岃妫€鏌ョ綉缁滃悗閲嶈瘯')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <RobotOutlined className={styles.logoIcon} />
          <h2 className={styles.title}>娣辩灣 AI</h2>
          <p className={styles.subtitle}>鐧诲綍浠ュ紑濮嬩綘鐨勬櫤鑳藉璇?/p>
        </div>

        <Form<LoginFormValues>
          form={form}
          onFinish={handleFinish}
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="account"
            rules={[{ required: true, message: '璇疯緭鍏ョ敤鎴峰悕鎴栭偖绠? }]}
          >
            <Input
              prefix={<UserOutlined className={styles.inputPrefix} />}
              placeholder="鐢ㄦ埛鍚嶆垨閭"
              className={styles.input}
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '璇疯緭鍏ュ瘑鐮? }]}
          >
            <Input.Password
              prefix={<LockOutlined className={styles.inputPrefix} />}
              placeholder="瀵嗙爜"
              className={styles.input}
            />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>璁颁綇璐﹀彿瀵嗙爜</Checkbox>
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              className={styles.submitBtn}
            >
              鐧诲綍
            </Button>
          </Form.Item>
        </Form>

        <div className={styles.footerLinks}>
          <span
            className={styles.link}
            onClick={() => navigate('/forgot-password')}
          >
            蹇樿瀵嗙爜锛?          </span>
          <span
            className={styles.link}
            onClick={() => navigate('/register')}
          >
            娌℃湁璐﹀彿锛熺珛鍗虫敞鍐?          </span>
        </div>
      </div>
    </div>
  )
}
