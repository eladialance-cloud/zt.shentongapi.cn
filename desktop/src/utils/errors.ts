// 业务错误类型定义
// BusinessError：业务逻辑错误（response.data.code !== 0）
// AuthError：认证/授权错误（401、token 过期等）
// NetworkError：网络层错误（超时、断网等）

/** 业务错误（服务端返回 code !== 0） */
export class BusinessError extends Error {
  /** 业务错误码 */
  code: number
  /** 服务端返回的原始数据 */
  data: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'BusinessError'
    this.code = code
    this.data = data
    Object.setPrototypeOf(this, BusinessError.prototype)
  }
}

/** 认证错误（继承 BusinessError，code 固定 401） */
export class AuthError extends BusinessError {
  constructor(message: string, data?: unknown) {
    super(401, message, data)
    this.name = 'AuthError'
    Object.setPrototypeOf(this, AuthError.prototype)
  }
}

/** 网络错误（超时、断网、DNS 解析失败等） */
export class NetworkError extends Error {
  /** 是否为超时 */
  isTimeout: boolean
  /** 原始错误对象 */
  cause?: unknown

  constructor(message: string, options?: { isTimeout?: boolean; cause?: unknown }) {
    super(message)
    this.name = 'NetworkError'
    this.isTimeout = options?.isTimeout ?? false
    this.cause = options?.cause
    Object.setPrototypeOf(this, NetworkError.prototype)
  }
}
