// 认证相关 API
import request from '@/utils/request';
import type { LoginParams, RegisterParams, User } from '@/types/api';
import type { LoginResponse, RefreshTokenResponse } from '@/types/api';

/** 用户登录 */
export function login(params: LoginParams) {
  return request.post<unknown, LoginResponse>('/auth/login', params);
}

/** 用户注册 */
export function register(params: RegisterParams) {
  return request.post<unknown, LoginResponse>('/auth/register', params);
}

/** 刷新 Token */
export function refreshToken(refreshToken: string) {
  return request.post<unknown, RefreshTokenResponse>('/auth/refresh', {
    refreshToken,
  });
}

/** 退出登录 */
export function logout() {
  return request.post('/auth/logout');
}

/** 获取当前用户信息 */
export function getCurrentUser() {
  return request.get<unknown, User>('/auth/me');
}
