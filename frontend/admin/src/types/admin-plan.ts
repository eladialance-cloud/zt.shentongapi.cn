// 管理端套餐管理类型

export interface MembershipPlan {
  id: number
  name: string
  description?: string
  price: number
  credits: number
  durationDays: number
  level: number
  period: string
  benefits?: string[]
  features?: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreatePlanDto {
  name: string
  description?: string
  price: number
  credits: number
  durationDays: number
  level?: number
  period?: string
  benefits?: string[]
  isActive?: boolean
}

export interface UpdatePlanDto extends Partial<CreatePlanDto> {}
