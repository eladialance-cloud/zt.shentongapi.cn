// 常量定义

/** API 基础路径 */
export const API_BASE_URL = '/api';

/** Token 存储键 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
} as const;

/** 路由路径 */
export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  LANDING: '/',
  CHAT: '/chat',
  MARKET: '/market',
  CREATOR: '/creator',
  KNOWLEDGE: '/knowledge',
  USER: '/user',
  USER_MEMBERSHIP: '/user/membership',
  USER_REVENUE: '/user/revenue',
  USER_BILLS: '/user/bills',
  USER_FILES: '/user/files',
  USER_TEAMS: '/user/teams',
  USER_SETTINGS: '/user/settings',
  OPC: '/opc',
} as const;

/** 请求超时 (ms) */
export const REQUEST_TIMEOUT = 30000;

/** 默认分页大小 */
export const DEFAULT_PAGE_SIZE = 20;
