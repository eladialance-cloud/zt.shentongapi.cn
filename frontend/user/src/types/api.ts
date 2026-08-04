// API 响应类型定义
// 对齐后端统一响应格式 (开发文档:后端骨架搭建.md 9. API 设计规范)

/** 用户信息 */
export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
}

/** 登录参数 */
export interface LoginParams {
  account: string;
  password: string;
}

/** 注册参数 */
export interface RegisterParams {
  username: string;
  email: string;
  password: string;
  inviteCode?: string;
}

/** 统一响应结构 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** 分页响应结构 */
export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 分页查询参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** 排序参数 */
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** 登录响应 */
export interface LoginResponse {
  accessToken: string;
  user: User;
}

/** Token 刷新响应 */
export interface RefreshTokenResponse {
  accessToken: string;
}

// ===== Chat =====
export interface ChatSession {
  id: number;
  userId: number;
  agentId: string | null;
  modelId: string;
  title: string;
  groupId: number;
  createdAt: string;
  updatedAt: string;
}
export interface ChatMessage {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{ id: string; name: string; type: string; url: string; size: number }>;
  tokenUsage?: { input: number; output: number; total: number };
  creditsCost?: number;
  createdAt: string;
}
// ===== Agent =====
export interface Agent {
  id: number;
  name: string;
  description: string;
  avatar?: string;
  usageExample?: string;
  category: string;
  tags?: string[];
  modelId: string;
  pricePerCall: number;
  /** 定价策略：model=模型表价格, agent=Agent自身价格, hybrid=模型+Agent加价 */
  pricingStrategy?: 'model' | 'agent' | 'hybrid';
  rating: number;
  ratingCount: number;
  callCount: number;
  isOfficial: boolean;
  sourceCategory?: string;
  sourceName?: string;
  createdAt?: string;
  publishedAt?: string;
}
export interface AgentCategory {
  category: string;
  displayName: string;
  agentCount: number;
}
// ===== Credits =====
export interface CreditsAccount {
  userId: number;
  balance: number;
  totalRecharged: number;
  totalConsumed: number;
  frozen: number;
}
export interface CreditTransaction {
  id: number;
  userId: number;
  type: string;
  amount: number;
  balanceAfter: number;
  source: string;
  remark?: string;
  createdAt: string;
}
// ===== Payment =====
export interface RechargeOrder {
  id: number;
  orderNo: string;
  userId: number;
  packageId?: number;
  credits: number;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentChannel: string;
  paymentRecordId?: number;
  createdAt: string;
  updatedAt: string;
}
export interface MembershipPlan {
  id: number;
  name: string;
  description?: string;
  price: number;
  credits: number;
  durationDays: number;
  level: number;
  period: string;
  benefits?: string[];
  features?: string[];
  isActive: boolean;
}
// ===== Knowledge Base =====
export interface KnowledgeBase {
  id: number;
  userId: number;
  name: string;
  description?: string;
  visibility: 'private' | 'public';
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface KnowledgeDocument {
  id: number;
  knowledgeBaseId: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  chunkCount: number;
  createdAt: string;
}
// ===== User =====
export interface UserProfile {
  id: number;
  username: string;
  email: string;
  phone?: string;
  avatar?: string;
  status: string;
  level: number;
  roles?: string[];
  createdAt: string;
  updatedAt: string;
}
export interface InviteCode {
  id: number;
  code: string;
  inviterId: number;
  inviteeId?: number;
  status: 'active' | 'used' | 'expired' | 'revoked';
  expireAt?: string;
  createdAt: string;
}
export interface InviteStats {
  totalInvited: number;
  activeInvited: number;
  totalCredits: number;
}

// ===== Skill Store =====
export interface SkillPackage {
  id: number;
  name: string;
  displayName: string;
  description: string;
  skillType: 'skill' | 'workflow';
  runtimeType: string;
  category?: string;
  sourceUrl: string;
  entryPoint?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  triggerKeywords?: string[];
  examples?: Record<string, unknown>[];
  uiConfig?: { icon?: string; color?: string; [key: string]: unknown };
  isOfficial: boolean;
  callCount: number;
  avgRating: number;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillPackageDetail extends SkillPackage {
}

export interface SkillExecuteResult {
  sessionId?: number;
  skillName: string;
  skillType: 'skill' | 'workflow';
  message: string;
  input?: Record<string, unknown>;
  output?: string;
}

export interface SkillCategory {
  category: string;
  count: number;
}

export interface SkillStats {
  callCount: number;
  avgRating: number;
  version: string;
  updatedAt: string;
}

export interface SkillPackageQuery {
  page?: number;
  pageSize?: number;
  category?: string;
  skillType?: 'skill' | 'workflow';
  keyword?: string;
}
