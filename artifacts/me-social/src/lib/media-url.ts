import type { MediaAttachment } from '@workspace/api-client-react';
export type MediaVariant = 'standard' | 'low' | 'webm' | 'thumbnail' | 'captions' | 'transcript';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Authenticated media route. Never a signed/public URL. */
export function mediaAssetUrl(id: string, variant?: MediaVariant): string {
  return variant ? `${base}/api/media/${id}/assets/${variant}` : `${base}/api/media/${id}/assets/standard`;
}

export function staffReviewAssetUrl(id: string, kind: 'standard' | 'low' | 'webm' | 'captions' | 'thumbnail' | 'audio' | 'frames', reason: string): string {
  return `${base}/api/staff/video-review/${id}/assets/${kind}?reason=${encodeURIComponent(reason)}`;
}
export function preferredVideoVariant(asset: MediaAttachment, lowQuality = false): 'standard' | 'low' | 'webm' {
  const supportsMp4 = typeof document !== 'undefined' && document.createElement('video')
    .canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
  if (!supportsMp4 && asset.playbackVariants?.includes('webm')) return 'webm';
  return lowQuality && asset.playbackVariants?.includes('low') ? 'low' : 'standard';
}

export async function fetchBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) {
    throw Object.assign(new Error(`Request failed (${res.status})`), { status: res.status });
  }
  return res.blob();
}
