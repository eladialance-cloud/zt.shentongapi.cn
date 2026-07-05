// API 响应类型定义
// 对齐后端统一响应格式 (开发文档-后端骨架搭建.md 9. API 设计规范)

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
  refreshToken: string;
  user: User;
}

/** Token 刷新响应 */
export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}
