// HttpClient - 基于 axios 的 HTTP 客户端封装
//
// 核心能力：
// 1. 请求拦截器：自动注入 X-Timestamp / X-Nonce / X-Signature（HMAC-SHA256）+ Authorization
// 2. 响应拦截器：
//    - 401 触发 refreshToken 流程（并发队列，参考 frontend/user/src/utils/request.ts）
//    - 401 且 refresh 失败时跳转登录页
//    - 业务错误码（response.data.code !== 0）抛出 BusinessError
//    - 网络错误抛出 NetworkError
// 3. 配置：baseURL 从 VITE_API_BASE_URL 读取，timeout=30s，withCredentials=true

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig
} from 'axios'
import { useAuthStore } from '@/store/auth'
import { signRequest } from '@/utils/hmac'
import { BusinessError, NetworkError } from '@/utils/errors'

/** 标准响应体 */
interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** 不需要签名的白名单路径（登录/注册/刷新等公开接口） */
const UNSIGNED_PATHS = ['/auth/login', '/auth/register', '/auth/refresh']

/** 从请求配置中提取 path（含 query string） */
function getRequestPath(config: InternalAxiosRequestConfig): string {
  let path = config.url || '/'
  if (config.params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(config.params)) {
      if (value != null && value !== '') {
        searchParams.append(key, String(value))
      }
    }
    const qs = searchParams.toString()
    if (qs) {
      path += path.includes('?') ? `&${qs}` : `?${qs}`
    }
  }
  return path
}

class HttpClient {
  private instance: AxiosInstance

  /** 是否正在刷新 token */
  private isRefreshing = false
  /** 刷新期间挂起的请求队列 */
  private failedQueue: Array<{
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
    config: InternalAxiosRequestConfig
  }> = []

  constructor() {
    this.instance = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
      timeout: 30000,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    this.setupRequestInterceptor()
    this.setupResponseInterceptor()
  }

  /** 获取底层 axios 实例（供高级用法使用） */
  getInstance(): AxiosInstance {
    return this.instance
  }

  // ===== 类型安全的包装方法 =====
  // 响应拦截器已解包 response.data.data，因此直接断言为 T

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.get(url, config) as unknown as Promise<T>
  }

  async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.post(url, data, config) as unknown as Promise<T>
  }

  async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.put(url, data, config) as unknown as Promise<T>
  }

  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.delete(url, config) as unknown as Promise<T>
  }

  async patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.instance.patch(url, data, config) as unknown as Promise<T>
  }

  // ===== 拦截器 =====

  /** 请求拦截器：注入 Authorization + HMAC 签名 headers */
  private setupRequestInterceptor(): void {
    this.instance.interceptors.request.use(
      async (config) => {
        // 1. 注入 Authorization
        const { accessToken, secretKey } = useAuthStore.getState()
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`
        }

        // 2. 注入 HMAC 签名（白名单路径跳过）
        const path = getRequestPath(config)
        const isUnsigned = UNSIGNED_PATHS.some((p) => path.startsWith(p))
        if (secretKey && !isUnsigned) {
          try {
            const { timestamp, nonce, signature } = await signRequest(
              config.method || 'get',
              path,
              config.data,
              secretKey
            )
            config.headers['X-Timestamp'] = timestamp
            config.headers['X-Nonce'] = nonce
            config.headers['X-Signature'] = signature
          } catch (err) {
            console.error('[http-client] sign request failed:', err)
          }
        }

        return config
      },
      (error: AxiosError) => Promise.reject(error)
    )
  }

  /** 响应拦截器：业务码检查 + 401 刷新 + 网络错误 */
  private setupResponseInterceptor(): void {
    this.instance.interceptors.response.use(
      (response) => {
        const body = response.data as ApiResponse
        // 业务码 0 = 成功，返回解包后的 data
        if (body && typeof body.code === 'number') {
          if (body.code === 0) {
            return body.data
          }
          // 业务错误
          throw new BusinessError(body.code, body.message || '请求失败', body.data)
        }
        // 非标准响应体（如文件下载），直接返回
        return response.data
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as
          | (InternalAxiosRequestConfig & { _retry?: boolean })
          | undefined

        // ===== 401：尝试 refreshToken 续期 =====
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
          // 已在刷新中：挂入队列等待
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject, config: originalRequest })
            })
          }

          originalRequest._retry = true
          this.isRefreshing = true

          try {
            const newToken = await this.tryRefreshToken()
            if (newToken) {
              // 刷新成功：重试队列 + 原请求
              this.flushQueue(null, newToken)
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              return this.instance(originalRequest)
            }
            // 刷新失败：清空队列并登出
            this.flushQueue(error, null)
            void useAuthStore.getState().logout()
            this.redirectToLogin()
            return Promise.reject(
              new BusinessError(401, '登录已过期，请重新登录')
            )
          } finally {
            this.isRefreshing = false
          }
        }

        // ===== 网络错误 / 超时 =====
        if (!error.response) {
          const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout')
          return Promise.reject(
            new NetworkError(
              isTimeout ? '请求超时' : '网络连接失败',
              { isTimeout, cause: error }
            )
          )
        }

        // ===== HTTP 错误（非 401） =====
        const body = error.response.data as ApiResponse | undefined
        const message = body?.message || error.message || `请求失败 (${error.response.status})`

        // 业务错误码
        if (body && typeof body.code === 'number' && body.code !== 0) {
          return Promise.reject(new BusinessError(body.code, message, body.data))
        }

        return Promise.reject(
          new BusinessError(error.response.status, message, body?.data)
        )
      }
    )
  }

  /** 刷新 token 队列 */
  private flushQueue(error: unknown, token: string | null): void {
    this.failedQueue.forEach((item) => {
      if (error) {
        item.reject(error)
      } else if (token) {
        item.config.headers.Authorization = `Bearer ${token}`
        item.resolve(this.instance(item.config))
      }
    })
    this.failedQueue = []
  }

  /** 尝试用 refreshToken 续期 */
  private async tryRefreshToken(): Promise<string | null> {
    const { refreshToken, refreshAccessToken } = useAuthStore.getState()
    if (!refreshToken) return null

    // 调用 store 的 refreshAccessToken（内部使用原始 axios 绕过拦截器）
    const success = await refreshAccessToken()
    if (success) {
      return useAuthStore.getState().accessToken
    }
    return null
  }

  /** 跳转登录页 */
  private redirectToLogin(): void {
    if (typeof window !== 'undefined') {
      window.location.hash = '#/login'
    }
  }
}

/** HTTP 客户端单例 */
export const httpClient = new HttpClient()
export default httpClient
