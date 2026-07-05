// Axios HTTP 客户端封装
// 对齐开发文档-前端开发指南.md 3.3 HTTP 客户端：Axios
import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { message } from 'antd';
import { useAuthStore } from '@/store/auth';
import { API_BASE_URL, REQUEST_TIMEOUT, STORAGE_KEYS } from './constants';
import type { ApiResponse } from '@/types/api';

const request = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ===== Refresh Token 续期机制 =====
// 401 时先尝试用 refreshToken 续期，成功则重试原请求；失败再 logout
// 通过独立 axios 实例调用 /auth/refresh，避免触发自身拦截器形成循环

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  config: InternalAxiosRequestConfig;
}> = [];

function flushQueue(error: unknown, token: string | null) {
  failedQueue.forEach((item) => {
    if (error) {
      item.reject(error);
    } else {
      // 重新挂载新 token 后重试
      item.config.headers.Authorization = `Bearer ${token}`;
      item.resolve(request(item.config));
    }
  });
  failedQueue = [];
}

async function tryRefreshToken(): Promise<string | null> {
  const { refreshToken, refreshAccessToken } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    // 用原始 axios 调用，绕过拦截器，避免 401 循环
    const resp = await axios.post<{
      code: number;
      message: string;
      data: { accessToken: string; refreshToken: string };
    }>(`${API_BASE_URL}/auth/refresh`, { refreshToken });
    if (resp.data?.code !== 0) return null;
    const { accessToken: newAccess, refreshToken: newRefresh } = resp.data.data;
    // 仅更新 accessToken，不打断 socket 连接
    refreshAccessToken(newAccess);
    // 同步 refreshToken（auth store 未提供独立方法，直接 setState）
    useAuthStore.setState({ refreshToken: newRefresh });
    return newAccess;
  } catch {
    return null;
  }
}

// 请求拦截器：注入 Token
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// 响应拦截器：统一处理业务码与错误
request.interceptors.response.use(
  (response): AxiosResponse | Promise<AxiosResponse> => {
    const { code, data, message: msg } = response.data as ApiResponse;

    if (code === 0) {
      return data as unknown as AxiosResponse;
    }

    message.error(msg || '请求失败');
    return Promise.reject(new Error(msg || '请求失败'));
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    // 401：尝试 refresh 续期后重试，失败再 logout
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // 已在刷新中：把请求挂入队列，等刷新结果
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: originalRequest });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const newToken = await tryRefreshToken();
        if (newToken) {
          // 刷新成功：重试队列 + 原请求
          flushQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return request(originalRequest);
        }
        // 刷新失败：清空队列并登出
        flushQueue(error, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // 非 401 / 已重试过 / 无 config：直接提示
    const msg =
      (error.response?.data as ApiResponse)?.message ||
      error.message ||
      '网络错误';
    if (error.response?.status === 401) {
      // refresh 失败路径已跳转，这里避免重复 message
      return Promise.reject(error);
    }
    message.error(msg);
    return Promise.reject(error);
  }
);

export default request;
export { STORAGE_KEYS };
// 暴露类型供外部扩展（如 _retry 标记）
export type { AxiosRequestConfig };
