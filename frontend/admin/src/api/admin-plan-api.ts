// 管理端套餐管理 API
import { adminRequest } from './admin-auth-api'
import type { MembershipPlan, CreatePlanDto, UpdatePlanDto } from '@/types/admin-plan'

const BASE = '/admin/plans'

export async function listPlans(): Promise<MembershipPlan[]> {
  return adminRequest<MembershipPlan[]>('get', BASE)
}

export async function createPlan(dto: CreatePlanDto): Promise<MembershipPlan> {
  return adminRequest<MembershipPlan>('post', BASE, { data: dto })
}

export async function updatePlan(id: number, dto: UpdatePlanDto): Promise<void> {
  await adminRequest('patch', `${BASE}/${id}`, { data: dto })
}

export async function deletePlan(id: number): Promise<void> {
  await adminRequest('delete', `${BASE}/${id}`)
}
