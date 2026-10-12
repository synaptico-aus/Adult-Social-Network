import { useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useGetMediaStatus, getGetMediaStatusQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from './video-player';
import { VideoCaptionEditor } from './video-caption-editor';
import type { UploadItem, UploadItemStatus } from '@/hooks/use-media-upload';

function Poller({ item, updateItem }: { item: UploadItem; updateItem: (id: string, u: Partial<UploadItem>) => void }) {
  const id = item.asset!.id;
  const { data, isError, refetch } = useGetMediaStatus(id, {
    query: {
      queryKey: getGetMediaStatusQueryKey(id),
      refetchInterval: (q) => {
        const s = q.state.data?.status;
        return s === 'ready' || s === 'rejected' || s === 'cancelled' ? false : 4000;
      },
    },
  });
  useEffect(() => {
    if (data) updateItem(item.clientId, { asset: data, status: data.status as UploadItemStatus });
  }, [data, item.clientId, updateItem]);
  if (isError) {
    return <div role="alert" className="text-sm">Could not check processing status. <Button size="sm" variant="outline" onClick={() => refetch()}>Retry check</Button></div>;
  }
  return null;
}

export function VideoUploadPanel({ item, updateItem, startUpload }: {
  item: UploadItem;
  updateItem: (id: string, u: Partial<UploadItem>) => void;
  startUpload: (id: string) => void;
}) {
  const a = item.asset;
  const processing = a && (a.status === 'quarantined' || a.status === 'held');
  const canPreview = a && (a.status === 'ready' || a.status === 'held');
  const busy = ['requesting', 'uploading', 'completing'].includes(item.status);
  return (
    <div className="mt-2 space-y-2 text-sm" data-testid={`video-panel-${item.clientId}`}>
      <div className="font-semibold">{(item.videoFormat ?? a?.videoFormat) === 'reel' ? 'Reel' : 'Video'}: {(((a?.byteSize ?? item.file.size) || 0) / 1048576).toFixed(1)} MiB</div>
      {item.status === 'idle' && <Button type="button" className="rounded-xl" onClick={() => startUpload(item.clientId)}>Upload {item.videoFormat === 'reel' ? 'reel' : 'video'}</Button>}
      {item.recovered && item.status === 'idle' && <p className="text-muted-foreground">Recovered upload: pressing upload restarts the full file. It does not resume from where it stopped.</p>}
      {item.status === 'error' && (
        <div role="alert" className="space-y-2">
          <p className="flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /> {item.error}</p>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => startUpload(item.clientId)}>Restart upload</Button>
          <p className="text-muted-foreground">Restart sends the whole file again, not a chunk resume.</p>
        </div>
      )}
      {a && processing && <Poller item={item} updateItem={updateItem} />}
      {item.error && item.status !== 'error' && <p role="alert">{item.error}</p>}
      {a?.status === 'cleanup_pending' && <p role="status">Server cleanup is pending. Playback is disabled; try Remove again.</p>}
      {a?.status === 'quarantined' && <p className="flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> Processing and safety checks. This page will update on its own.</p>}
      {a?.status === 'held' && (
        <div className="rounded-xl border border-border p-3 space-y-1">
          <p className="font-semibold">Held for review</p>
          <p>Malware check: {a.malwareState}. Abuse check: {a.abuseState}.</p>
          {a.limitation && <p>{a.limitation}</p>}
          <p className="text-muted-foreground">Held videos cannot be attached until checks finish. We do not resend them.</p>
        </div>
      )}
      {a?.status === 'rejected' && <p role="alert">This video was rejected. {a.limitation}</p>}
      {a?.status === 'ready' && <p className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Ready to attach</p>}
      {canPreview && !busy && <VideoPlayer asset={a} />}
      {a && (a.status === 'ready' || a.status === 'held') && !busy && <VideoCaptionEditor asset={a} onSaved={(n) => updateItem(item.clientId, { asset: n, status: n.status === 'ready' ? 'ready' : 'held' })} />}
    </div>
  );
}
