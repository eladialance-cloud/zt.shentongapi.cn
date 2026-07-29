import { useState, useEffect } from 'react';
import type { LandingContent, ApiResponse } from '../types';

interface UseLandingContentReturn {
  content: LandingContent[];
  loading: boolean;
  error: string | null;
}

export function useLandingContent(): UseLandingContentReturn {
  const [content, setContent] = useState<LandingContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchContent() {
      try {
        const response = await fetch('/api/landing/content');
        const result: ApiResponse<LandingContent[]> = await response.json();
        
        if (!cancelled) {
          if (result.code === 0 || result.success) {
            setContent(result.data || []);
          } else {
            setError(result.message || '获取内容失败');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('网络错误，请稍后重试');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchContent();

    return () => {
      cancelled = true;
    };
  }, []);

  return { content, loading, error };
}
