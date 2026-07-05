// 防抖 Hook
import { useEffect, useState } from 'react';

/**
 * 对值进行防抖处理
 * @param value 原始值
 * @param delay 延迟毫秒数，默认 300ms
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
