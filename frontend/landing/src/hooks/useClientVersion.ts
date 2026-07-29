import { useState, useEffect } from 'react';

interface CheckUpdateResult {
  hasUpdate: boolean;
  latestVersion: string | null;
  forceUpdate: boolean;
  grayscaleHit: boolean;
  downloadUrl: string | null;
  changelog: string | null;
}

interface ApiResponse<T> {
  code: number;
  success: boolean;
  data: T;
  message?: string;
}

interface UseClientVersionReturn {
  version: string;
  downloadUrl: string;
  changelog: string | null;
  loading: boolean;
  error: string | null;
}

export function useClientVersion(platform: string = 'win'): UseClientVersionReturn {
  const [version, setVersion] = useState<string>('0.5.0');
  const [downloadUrl, setDownloadUrl] = useState<string>('/desktop/ShenTongAI-Setup-0.5.0-x64.exe.zip');
  const [changelog, setChangelog] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchVersion() {
      try {
        const response = await fetch(`/api/version/check?platform=${platform}&currentVersion=0.0.0`);
        const result: ApiResponse<CheckUpdateResult> = await response.json();

        if (!cancelled) {
          if (result.code === 0 || result.success) {
            const data = result.data;
            if (data.latestVersion) {
              setVersion(data.latestVersion);
            }
            if (data.downloadUrl) {
              setDownloadUrl(data.downloadUrl);
            }
            if (data.changelog) {
              setChangelog(data.changelog);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('网络错误，使用默认版本号');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchVersion();

    return () => {
      cancelled = true;
    };
  }, [platform]);

  return { version, downloadUrl, changelog, loading, error };
}
