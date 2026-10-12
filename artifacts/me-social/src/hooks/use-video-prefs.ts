import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';

export interface VideoPrefs {
  lowData: boolean;
  autoplay: boolean;
  lowQuality: boolean;
}
export const DEFAULT_VIDEO_PREFS: VideoPrefs = { lowData: true, autoplay: false, lowQuality: true };
const EVT = 'me-video-prefs-changed';
const key = (id: string) => `me:video-prefs:${id}`;

function load(userId: string | null | undefined): VideoPrefs {
  if (!userId) return DEFAULT_VIDEO_PREFS;
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? { ...DEFAULT_VIDEO_PREFS, ...JSON.parse(raw) } : DEFAULT_VIDEO_PREFS;
  } catch {
    return DEFAULT_VIDEO_PREFS;
  }
}

/** Account-scoped playback preferences; reset whenever the signed-in account changes. */
export function useVideoPrefs() {
  const { userId } = useAuth();
  const [prefs, setPrefs] = useState<VideoPrefs>(DEFAULT_VIDEO_PREFS);

  useEffect(() => {
    setPrefs(DEFAULT_VIDEO_PREFS);
    setPrefs(load(userId));
    const onChange = () => setPrefs(load(userId));
    window.addEventListener(EVT, onChange);
    return () => window.removeEventListener(EVT, onChange);
  }, [userId]);

  const update = useCallback((patch: Partial<VideoPrefs>) => {
    if (!userId) return;
    try {
      localStorage.setItem(key(userId), JSON.stringify({ ...load(userId), ...patch }));
    } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(EVT));
  }, [userId]);

  return { prefs, update, userId };
}
