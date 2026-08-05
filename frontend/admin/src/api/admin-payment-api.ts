// 管理端充值档位 / 支付配置 API
import { adminRequest } from './admin-auth-api'
import type {
  RechargePlan,
  CreateRechargePlanDto,
  UpdateRechargePlanDto,
  PaymentChannel,
  PaymentConfig,
  UpdatePaymentConfigDto
} from '@/types/admin-payment'

const PLANS_BASE = '/admin/recharge-plans'

export async function listRechargePlans(): Promise<RechargePlan[]> {
  return adminRequest<RechargePlan[]>('get', PLANS_BASE)
}

export async function createRechargePlan(dto: CreateRechargePlanDto): Promise<RechargePlan> {
  return adminRequest<RechargePlan>('post', PLANS_BASE, { data: dto })
}

export async function updateRechargePlan(id: number, dto: UpdateRechargePlanDto): Promise<void> {
  await adminRequest('patch', `${PLANS_BASE}/${id}`, { data: dto })
}

export async function deleteRechargePlan(id: number): Promise<void> {
  await adminRequest('delete', `${PLANS_BASE}/${id}`)
}

export async function getPaymentConfigs(): Promise<PaymentConfig[]> {
  return adminRequest<PaymentConfig[]>('get', '/admin/payment-configs')
}

export async function updatePaymentConfig(
  channel: PaymentChannel,
  dto: UpdatePaymentConfigDto
): Promise<PaymentConfig> {
  return adminRequest<PaymentConfig>('put', `/admin/payment-configs/${channel}`, { data: dto })
}
