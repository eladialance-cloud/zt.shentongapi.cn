
import type { AdminPaginatedResult } from './admin-auth'

export interface AgentDepartment {
  id: number
  name: string
  code: string
  description?: string
  sortOrder: number
  status: 'active' | 'inactive'
  agentCount: number
  createdAt: string
  updatedAt: string
}

export interface AgentTag {
  id: number
  name: string
  color?: string
  description?: string
  agentCount: number
  createdAt: string
  updatedAt: string
}

/** DTO */
export interface CreateDepartmentDto {
  name: string
  code: string
  description?: string
  sortOrder?: number
}

export interface UpdateDepartmentDto extends Partial<CreateDepartmentDto> {}

export interface CreateTagDto {
  name: string
  color?: string
  description?: string
}

export interface UpdateTagDto extends Partial<CreateTagDto> {}

export interface BindTagsDto {
  tagIds: number[]
}
