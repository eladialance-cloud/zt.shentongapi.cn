// 甯搁噺瀹氫箟

/** API 鍩虹璺緞 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/** Token 瀛樺偍閿?*/
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
} as const;

/** 璺敱璺緞 */
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

/** 璇锋眰瓒呮椂 (ms) */
export const REQUEST_TIMEOUT = 30000;

/** 榛樿鍒嗛〉澶у皬 */
export const DEFAULT_PAGE_SIZE = 20;
