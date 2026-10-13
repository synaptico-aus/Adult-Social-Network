import { useState, useRef, useEffect, useCallback } from 'react';
import { useRequestMediaUpload, useCompleteMediaUpload, useCancelMediaUpload, useRetryMediaUpload, useUpdateMediaTranscript, MediaAttachment, MediaUploadInput } from '@workspace/api-client-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@clerk/react';

const MiB = 1024 * 1024;
export const VIDEO_LIMITS = { reel: { bytes: 64 * MiB, seconds: 120 }, post: { bytes: 200 * MiB, seconds: 600 } } as const;
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export type VideoFormat = 'reel' | 'post';

export interface ManifestEntry { key: string; assetId?: string; fingerprint: string; format: VideoFormat; name: string; size?: number; status?: string; updatedAt: number }
const mKey = (u: string) => `me:upload-manifest:${u}`;
const readManifest = (u: string): ManifestEntry[] => { try { return JSON.parse(localStorage.getItem(mKey(u)) || '[]'); } catch { return []; } };
const writeManifest = (u: string, e: ManifestEntry[]) => { try { e.length ? localStorage.setItem(mKey(u), JSON.stringify(e)) : localStorage.removeItem(mKey(u)); } catch { /* ignore */ } };
const fingerprintOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

function probeVideo(file: File): Promise<{ width: number; height: number; duration: number } | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (r: { width: number; height: number; duration: number } | null) => { URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(r); };
    const t = setTimeout(() => done(null), 4000);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { clearTimeout(t); done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }); };
    v.onerror = () => { clearTimeout(t); done(null); };
    v.src = url;
  });
}

export type UploadItemStatus = 'idle' | 'quarantined' | 'requesting' | 'uploading' | 'completing' | 'ready' | 'held' | 'error' | 'cancelled' | 'rejected';

export type ExtendedMediaAttachment = MediaAttachment & {
  malwareState?: string;
  abuseState?: string;
  rejectionReason?: string;
};

export interface UploadItem {
  clientId: string;
  file: File | Blob;
  kind: 'photo' | 'audio' | 'video';
  videoFormat?: VideoFormat;
  fingerprint?: string;
  recovered?: boolean;
  fromExistingPost?: boolean;
  altText: string;
  status: UploadItemStatus;
  progress: number;
  asset?: ExtendedMediaAttachment;
  error?: string;
  clientIdempotencyKey: string;
  previewUrl: string;
  uploadURL?: string;
}

export function useMediaUploads(opts: { recover?: boolean } = {}) {
  const recover = Boolean(opts.recover);
  const { userId } = useAuth();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const prevUser = useRef<string | null | undefined>(userId);
  const offlineAborted = useRef<Set<string>>(new Set());
  const prevKeys = useRef<Set<string>>(new Set());
  const requestUpload = useRequestMediaUpload();
  const completeUpload = useCompleteMediaUpload();
  const cancelUpload = useCancelMediaUpload();
  const retryUpload = useRetryMediaUpload();
  const updateTranscript = useUpdateMediaTranscript();

  const activeXhrs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const activeUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      // Cleanup all object URLs on unmount
      activeUrls.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
      // Abort all active uploads
      activeXhrs.current.forEach(xhr => xhr.abort());
    };
  }, []);

  // Account scope: abort + clear on switch/logout; load manifest for current account.
  useEffect(() => {
    const prev = prevUser.current;
    if (prev && prev !== userId) {
      activeXhrs.current.forEach(x => x.abort());
      activeXhrs.current.clear();
      activeUrls.current.forEach(u => URL.revokeObjectURL(u));
      activeUrls.current.clear();
      writeManifest(prev, []);
      prevKeys.current.clear();
      setItems([]);
    }
    prevUser.current = userId;
    const entries = userId ? readManifest(userId) : [];
    setManifest(entries);
    if (recover && userId) {
      // Recover completed/processing assets without needing the original file.
      const recs = entries.filter(e => e.assetId && ['quarantined', 'held', 'ready'].includes(e.status || ''));
      setItems(prev => [...prev, ...recs.filter(e => !prev.some(i => i.clientIdempotencyKey === e.key)).map((e): UploadItem => ({
        clientId: uuidv4(), file: new Blob(), kind: 'video', videoFormat: e.format, fingerprint: e.fingerprint, altText: '',
        status: e.status as UploadItemStatus, progress: 100, clientIdempotencyKey: e.key, recovered: true, previewUrl: '',
        asset: { id: e.assetId!, kind: 'video', status: e.status, byteSize: e.size ?? null, videoFormat: e.format, malwareState: 'pending', abuseState: 'pending', limitation: null } as unknown as ExtendedMediaAttachment,
      }))]);
    }
  }, [userId, recover]);

  useEffect(() => {
    const onOffline = () => {
      activeXhrs.current.forEach((x, id) => { offlineAborted.current.add(id); x.abort(); });
    };
    window.addEventListener('offline', onOffline);
    return () => window.removeEventListener('offline', onOffline);
  }, []);

  // Keep recovery manifest (metadata only: no bytes, tokens or upload URLs). Entries persist
  // through unmount and are released only when the item is removed/cleared, rejected or cancelled.
  useEffect(() => {
    if (!userId) return;
    let list = readManifest(userId);
    let changed = false;
    const videos = items.filter(i => i.kind === 'video' && i.fingerprint);
    const cur = new Set(videos.map(i => i.clientIdempotencyKey));
    prevKeys.current.forEach(k => {
      if (!cur.has(k)) { list = list.filter(e => e.key !== k); changed = true; }
    });
    prevKeys.current = cur;
    videos.forEach(i => {
      const st = i.asset?.status;
      const idx = list.findIndex(e => e.key === i.clientIdempotencyKey);
      if (i.status === 'rejected' || i.status === 'cancelled' || st === 'rejected' || st === 'cancelled') {
        if (idx >= 0) { list.splice(idx, 1); changed = true; }
      } else if (i.asset?.id && (idx < 0 || list[idx].status !== st)) {
        const entry: ManifestEntry = { key: i.clientIdempotencyKey, assetId: i.asset.id, fingerprint: i.fingerprint!, format: i.videoFormat || 'post', name: (i.file as File).name || 'video', size: i.file.size || undefined, status: st, updatedAt: Date.now() };
        list = idx >= 0 ? list.map((e, n) => n === idx ? entry : e) : [...list, entry];
        changed = true;
      }
    });
    if (changed) { writeManifest(userId, list); setManifest(list); }
  }, [items, userId]);

  const dismissRecovered = useCallback((key: string) => {
    if (!userId) return;
    const list = readManifest(userId).filter(e => e.key !== key);
    writeManifest(userId, list);
    setManifest(list);
  }, [userId]);

  const updateItem = useCallback((clientId: string, updates: Partial<UploadItem>) => {
    setItems(prev => prev.map(item => item.clientId === clientId ? { ...item, ...updates } : item));
  }, []);

  const addPhoto = useCallback((file: File) => {
    const clientId = uuidv4();
    const previewUrl = URL.createObjectURL(file);
    activeUrls.current.add(previewUrl);
    const newItem: UploadItem = {
      clientId,
      file,
      kind: 'photo',
      altText: '',
      status: 'idle',
      progress: 0,
      clientIdempotencyKey: uuidv4(),
      previewUrl
    };
    setItems(prev => [...prev, newItem]);
    return clientId;
  }, []);

  const addAudio = useCallback((blob: Blob) => {
    const clientId = uuidv4();
    const previewUrl = URL.createObjectURL(blob);
    activeUrls.current.add(previewUrl);
    const newItem: UploadItem = {
      clientId,
      file: blob,
      kind: 'audio',
      altText: '',
      status: 'idle',
      progress: 0,
      clientIdempotencyKey: uuidv4(),
      previewUrl
    };
    setItems(prev => [...prev, newItem]);
    return clientId;
  }, []);

  const addVideo = useCallback(async (file: File, format: VideoFormat): Promise<{ clientId?: string; error?: string }> => {
    const lim = VIDEO_LIMITS[format];
    if (!VIDEO_TYPES.includes(file.type)) return { error: 'Choose an MP4, WebM or QuickTime video.' };
    if (file.size > lim.bytes) return { error: `${format === 'reel' ? 'Reels' : 'Videos'} can be up to ${lim.bytes / MiB} MiB.` };
    const meta = await probeVideo(file);
    if (meta) {
      if (Number.isFinite(meta.duration) && meta.duration > lim.seconds) return { error: `${format === 'reel' ? 'Reels' : 'Videos'} can be up to ${lim.seconds / 60 >= 1 ? lim.seconds / 60 + ' minutes' : lim.seconds + ' seconds'}.` };
      if (format === 'reel' && meta.width > meta.height) return { error: 'Reels must be portrait (taller than wide).' };
    }
    const fp = fingerprintOf(file);
    const match = userId ? readManifest(userId).find(e => e.fingerprint === fp && e.format === format) : undefined;
    const clientId = uuidv4();
    const previewUrl = URL.createObjectURL(file);
    activeUrls.current.add(previewUrl);
    setItems(prev => [...prev, {
      clientId, file, kind: 'video', videoFormat: format, fingerprint: fp, altText: '', status: 'idle', progress: 0,
      clientIdempotencyKey: match?.key ?? uuidv4(), recovered: Boolean(match), previewUrl,
    }]);
    return { clientId };
  }, [userId]);

  const performXhrUpload = useCallback((clientId: string, uploadURL: string, contentType: string, file: File | Blob, assetId: string) => {
    const xhr = new XMLHttpRequest();
    activeXhrs.current.set(clientId, xhr);

    xhr.open('PUT', uploadURL, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.timeout = 15 * 60 * 1000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 100);
        updateItem(clientId, { progress });
      }
    };

    xhr.onload = async () => {
      activeXhrs.current.delete(clientId);
      if (xhr.status >= 200 && xhr.status < 300) {
        updateItem(clientId, { status: 'completing' });
        try {
          const completedAsset = await completeUpload.mutateAsync({ id: assetId }) as unknown as ExtendedMediaAttachment;
          updateItem(clientId, { 
            status: completedAsset.status as UploadItemStatus, 
            asset: completedAsset
          });
        } catch (e: unknown) {
          const err = e as Error;
          updateItem(clientId, { status: 'error', error: err.message || 'Complete failed' });
        }
      } else {
        updateItem(clientId, { status: 'error', error: `Upload failed with status ${xhr.status}` });
      }
    };

    xhr.onerror = () => {
      activeXhrs.current.delete(clientId);
      updateItem(clientId, { status: 'error', error: 'Network error during upload' });
    };

    xhr.ontimeout = () => {
      activeXhrs.current.delete(clientId);
      updateItem(clientId, { status: 'error', error: 'Upload timed out' });
    };

    xhr.onabort = () => {
      activeXhrs.current.delete(clientId);
      if (offlineAborted.current.delete(clientId)) {
        updateItem(clientId, { status: 'error', error: 'You went offline during upload' });
      } else {
        updateItem(clientId, { status: 'cancelled' });
      }
    };

    xhr.send(file);
  }, [completeUpload, updateItem]);

  const startUpload = useCallback(async (clientId: string) => {
    const item = items.find(i => i.clientId === clientId);
    if (!item) return;

    if (item.kind === 'photo' && !item.altText.trim()) {
      updateItem(clientId, { error: 'Photo requires a description before upload' });
      return;
    }
    
    if (item.kind === 'audio' && !item.altText.trim()) {
      updateItem(clientId, { error: 'Audio requires a transcript before upload' });
      return;
    }

    if (item.asset?.id && ['quarantined', 'held', 'ready'].includes(item.asset.status)) {
      // Never resend or call retry for these; status is polled instead.
      updateItem(clientId, { status: item.asset.status as UploadItemStatus, error: undefined });
      return;
    }

    if (!navigator.onLine) {
      updateItem(clientId, { status: 'error', error: 'You are offline. Reconnect, then restart the upload.' });
      return;
    }

    if (item.asset?.id) {
      updateItem(clientId, { status: 'requesting', error: undefined });
      try {
        const res = await retryUpload.mutateAsync({ id: item.asset.id }) as unknown as { uploadURL: string; asset: ExtendedMediaAttachment };
        const { uploadURL, asset } = res;
        if (!asset) throw new Error('Invalid response from retry request');
        if (asset.status !== 'uploading') {
          updateItem(clientId, { status: asset.status as UploadItemStatus, asset, error: undefined });
          return;
        }
        if (!uploadURL) throw new Error('Invalid response from retry request');
        updateItem(clientId, { status: 'uploading', asset, uploadURL });
        const contentType = item.file.type || (item.kind === 'audio' ? 'audio/mp4' : 'application/octet-stream');
        performXhrUpload(clientId, uploadURL, contentType, item.file, asset.id);
      } catch (e: unknown) {
        const err = e as Error;
        updateItem(clientId, { status: 'error', error: err.message || 'Retry failed' });
      }
      return;
    }

    updateItem(clientId, { status: 'requesting', error: undefined });

    try {
      const contentType = item.file.type || (item.kind === 'audio' ? 'audio/mp4' : 'application/octet-stream');
      const payload = {
        kind: item.kind,
        contentType,
        size: item.file.size,
        clientIdempotencyKey: item.clientIdempotencyKey,
      } as unknown as Record<string, unknown>; // Cast to allow adding altText which is omitted in codegen
      
      if (item.kind === 'photo') {
        payload.altText = item.altText;
      }
      if (item.kind === 'video') {
        payload.videoFormat = item.videoFormat;
        if (item.altText.trim()) payload.altText = item.altText.trim();
      }

      const res = await requestUpload.mutateAsync({ data: payload as unknown as MediaUploadInput }) as unknown as { uploadURL: string; asset: ExtendedMediaAttachment };
      const { uploadURL, asset } = res;

      if (!uploadURL || !asset) {
        throw new Error('Invalid response from upload request');
      }

      if (asset.status !== 'uploading' || !uploadURL) {
        updateItem(clientId, { status: asset.status as UploadItemStatus, asset });
        return;
      }
      updateItem(clientId, { status: 'uploading', asset, uploadURL });

      // If it's audio, and we already collected transcript, fire it off, but wait until 'complete' is safer, 
      // actually the backend expects transcript via PATCH, so we do it asynchronously or wait for 'complete'.
      // We'll just patch it immediately since the asset exists now.
      if (item.kind === 'audio' && item.altText.trim()) {
        updateTranscript.mutate({ id: asset.id, data: { transcript: item.altText } }, {
          onError: () => {}
        });
      }

      performXhrUpload(clientId, uploadURL, contentType, item.file, asset.id);
    } catch (e: unknown) {
      const err = e as Error;
      updateItem(clientId, { status: 'error', error: err.message || 'Request failed' });
    }
  }, [items, requestUpload, retryUpload, updateTranscript, performXhrUpload, updateItem]);

  const cancel = useCallback(async (clientId: string) => {
    const item = items.find(i => i.clientId === clientId);
    if (!item) return;

    if (activeXhrs.current.has(clientId)) {
      activeXhrs.current.get(clientId)?.abort();
    }

    if (item.asset?.id && item.status !== 'ready' && item.status !== 'held' && item.status !== 'quarantined') {
      try {
        await cancelUpload.mutateAsync({ id: item.asset.id });
      } catch (e: unknown) {
        console.error("Cancel failed:", e);
      }
    }

    updateItem(clientId, { status: 'cancelled' });
  }, [items, cancelUpload, updateItem]);

  const remove = useCallback(async (clientId: string) => {
    const item = items.find(i => i.clientId === clientId);
    if (!item) return;
    
    if (item.kind === 'video' && item.asset?.id && !item.fromExistingPost) {
      activeXhrs.current.get(clientId)?.abort();
      try {
        await cancelUpload.mutateAsync({ id: item.asset.id });
      } catch {
        updateItem(clientId, { error: 'Server cleanup did not finish. Keep this upload and try Remove again.' });
        return;
      }
    } else if (item.status === 'uploading' || item.status === 'requesting' || item.status === 'completing') {
      await cancel(clientId);
    }
    
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      activeUrls.current.delete(item.previewUrl);
    }
    
    setItems(prev => prev.filter(i => i.clientId !== clientId));
  }, [items, cancel, cancelUpload, updateItem]);

  const saveTranscript = useCallback(async (clientId: string, transcript: string) => {
    const item = items.find(i => i.clientId === clientId);
    if (!item) return;

    // Locally update
    updateItem(clientId, { altText: transcript, error: undefined });

    // If asset exists, patch it
    if (item.asset?.id) {
      try {
        const updated = await updateTranscript.mutateAsync({ 
          id: item.asset.id, 
          data: { transcript } 
        }) as unknown as ExtendedMediaAttachment;
        updateItem(clientId, { status: updated.status as UploadItemStatus, asset: updated });
      } catch (e: unknown) {
        const err = e as Error;
        updateItem(clientId, { error: err.message || 'Failed to update transcript' });
      }
    }
  }, [items, updateTranscript, updateItem]);

  return {
    items,
    setItems,
    addPhoto,
    addAudio,
    addVideo,
    recoverable: manifest,
    dismissRecovered,
    updateItem,
    startUpload,
    cancel,
    remove,
    saveTranscript
  };
}