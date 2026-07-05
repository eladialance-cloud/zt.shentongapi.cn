// 本地存储封装
// 提供类型安全的 localStorage 访问

export const storage = {
  get<T>(key: string): T | null {
    const value = localStorage.getItem(key);
    if (value === null) {
      return null;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  },

  set<T>(key: string, value: T): void {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  },

  remove(key: string): void {
    localStorage.removeItem(key);
  },

  clear(): void {
    localStorage.clear();
  },
};

export default storage;
