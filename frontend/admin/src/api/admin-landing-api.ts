import { adminRequest } from './admin-auth-api'

export interface LandingBlock {
  id: string
  name: string
  type: 'hero' | 'stats' | 'cards' | 'steps' | 'list' | 'markdown'
  sortOrder: number
  isEnabled: boolean
  data: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface CreateBlockDto {
  id: string
  name: string
  type: LandingBlock['type']
  data: Record<string, any>
}

export interface UpdateBlockDto extends Partial<CreateBlockDto> {
  isEnabled?: boolean
  sortOrder?: number
}

// GET /admin/landing/blocks
export async function listBlocks(): Promise<LandingBlock[]> {
  return adminRequest<LandingBlock[]>('get', '/admin/landing/blocks')
}

// POST /admin/landing/blocks
export async function createBlock(dto: CreateBlockDto): Promise<LandingBlock> {
  return adminRequest<LandingBlock>('post', '/admin/landing/blocks', { data: dto })
}

// PUT /admin/landing/blocks/:id
export async function updateBlock(id: string, dto: UpdateBlockDto): Promise<LandingBlock> {
  return adminRequest<LandingBlock>('put', `/admin/landing/blocks/${id}`, { data: dto })
}

// DELETE /admin/landing/blocks/:id
export async function deleteBlock(id: string): Promise<void> {
  return adminRequest<void>('delete', `/admin/landing/blocks/${id}`)
}

// PATCH /admin/landing/blocks/order
export async function updateBlockOrder(orders: { id: string; sortOrder: number }[]): Promise<void> {
  return adminRequest<void>('patch', '/admin/landing/blocks/order', { data: { orders } })
}
