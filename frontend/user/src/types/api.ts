// API 鍝嶅簲绫诲瀷瀹氫箟
// 瀵归綈鍚庣缁熶竴鍝嶅簲鏍煎紡 (寮€鍙戞枃妗?鍚庣楠ㄦ灦鎼缓.md 9. API 璁捐瑙勮寖)

/** 鐢ㄦ埛淇℃伅 */
export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
}

/** 鐧诲綍鍙傛暟 */
export interface LoginParams {
  account: string;
  password: string;
}

/** 娉ㄥ唽鍙傛暟 */
export interface RegisterParams {
  username: string;
  email: string;
  password: string;
  inviteCode?: string;
}

/** 缁熶竴鍝嶅簲缁撴瀯 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** 鍒嗛〉鍝嶅簲缁撴瀯 */
export interface PaginatedData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 鍒嗛〉鏌ヨ鍙傛暟 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** 鎺掑簭鍙傛暟 */
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** 鐧诲綍鍝嶅簲 */
export interface LoginResponse {
  accessToken: string;
  user: User;
}

/** Token 鍒锋柊鍝嶅簲 */
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
  /** 瀹氫环绛栫暐锛歮odel=妯″瀷琛ㄤ环鏍? agent=Agent鑷韩浠锋牸, hybrid=妯″瀷+Agent鍔犱环 */
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
