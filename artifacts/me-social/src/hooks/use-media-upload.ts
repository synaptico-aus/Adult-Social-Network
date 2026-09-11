import { useState, useRef, useEffect, useCallback } from 'react';
import { useRequestMediaUpload, useCompleteMediaUpload, useCancelMediaUpload, useRetryMediaUpload, useUpdateMediaTranscript, MediaAttachment, MediaUploadInput } from '@workspace/api-client-react';
import { v4 as uuidv4 } from 'uuid';

export type UploadItemStatus = 'idle' | 'requesting' | 'uploading' | 'completing' | 'ready' | 'held' | 'error' | 'cancelled' | 'rejected';

export type ExtendedMediaAttachment = MediaAttachment & {
  malwareState?: string;
  abuseState?: string;
  rejectionReason?: string;
};

export interface UploadItem {
  clientId: string;
  file: File | Blob;
  kind: 'photo' | 'audio';
  altText: string;
  status: UploadItemStatus;
  progress: number;
  asset?: ExtendedMediaAttachment;
  error?: string;
  clientIdempotencyKey: string;
  previewUrl: string;
  uploadURL?: string;
}

export function useMediaUploads() {
  const [items, setItems] = useState<UploadItem[]>([]);
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

  const performXhrUpload = useCallback((clientId: string, uploadURL: string, contentType: string, file: File | Blob, assetId: string) => {
    const xhr = new XMLHttpRequest();
    activeXhrs.current.set(clientId, xhr);

    xhr.open('PUT', uploadURL, true);
    xhr.setRequestHeader('Content-Type', contentType);

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

    xhr.onabort = () => {
      activeXhrs.current.delete(clientId);
      updateItem(clientId, { status: 'cancelled' });
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

    if (item.asset?.id) {
      updateItem(clientId, { status: 'requesting', error: undefined });
      try {
        const res = await retryUpload.mutateAsync({ id: item.asset.id }) as unknown as { uploadURL: string; asset: ExtendedMediaAttachment };
        const { uploadURL, asset } = res;
        if (!uploadURL || !asset) throw new Error('Invalid response from retry request');
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

      const res = await requestUpload.mutateAsync({ data: payload as unknown as MediaUploadInput }) as unknown as { uploadURL: string; asset: ExtendedMediaAttachment };
      const { uploadURL, asset } = res;

      if (!uploadURL || !asset) {
        throw new Error('Invalid response from upload request');
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

    if (item.asset?.id && item.status !== 'ready' && item.status !== 'held') {
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
    
    if (item.status === 'uploading' || item.status === 'requesting' || item.status === 'completing') {
      await cancel(clientId);
    }
    
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      activeUrls.current.delete(item.previewUrl);
    }
    
    setItems(prev => prev.filter(i => i.clientId !== clientId));
  }, [items, cancel]);

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
    updateItem,
    startUpload,
    cancel,
    remove,
    saveTranscript
  };
}