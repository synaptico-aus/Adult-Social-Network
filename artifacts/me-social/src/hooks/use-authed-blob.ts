import { useCallback, useEffect, useState } from 'react';
import { fetchBlob } from '@/lib/media-url';

/** Fetches a blob through an authenticated route; revokes on url change/unmount. */
export function useAuthedBlob(url: string | null) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    let created: string | null = null;
    setLoading(true);
    setError(null);
    fetchBlob(url, ctrl.signal)
      .then((b) => {
        created = URL.createObjectURL(b);
        setObjectUrl(created);
      })
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setError(e.message || 'Could not load');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => {
      ctrl.abort();
      if (created) URL.revokeObjectURL(created);
      setObjectUrl(null);
    };
  }, [url, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { url: url ? objectUrl : null, loading, error, retry };
}
