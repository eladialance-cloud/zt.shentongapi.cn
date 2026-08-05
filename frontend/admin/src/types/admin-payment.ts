// 管理端充值档位 / 支付配置类型

export interface RechargePlan {
  id: number
  name: string
  credits: number
  bonusCredits: number
  price: number
  currency: string
  isRecommended: boolean
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreateRechargePlanDto {
  name: string
  credits: number
  bonusCredits?: number
  price: number
  currency?: string
  isRecommended?: boolean
  isActive?: boolean
  sortOrder?: number
}

export type UpdateRechargePlanDto = Partial<CreateRechargePlanDto>

export type PaymentChannel = 'wechat' | 'alipay' | 'stripe'

export interface PaymentChannelConfig {
  appId?: string
  mchId?: string
  apiV3Key?: string
  notifyUrl?: string
  merchantPrivateKey?: string
  alipayPublicKey?: string
  secretKey?: string
  publishableKey?: string
  webhookSecret?: string
}

export interface PaymentConfig {
  id: number
  channel: PaymentChannel
  displayName?: string
  enabled: boolean
  isMock: boolean
  config: PaymentChannelConfig
  createdAt: string
  updatedAt: string
}

export interface UpdatePaymentConfigDto {
  displayName?: string
  enabled?: boolean
  config?: PaymentChannelConfig
  isMock?: boolean
}
