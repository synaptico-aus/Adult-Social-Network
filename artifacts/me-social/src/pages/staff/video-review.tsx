import { useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useListVideoReview, useDecideVideoReview, getListVideoReviewQueryKey, type MediaAttachment } from '@workspace/api-client-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { staffReviewAssetUrl, preferredVideoVariant } from '@/lib/media-url';

function ReviewStream({ asset, reason }: { asset: MediaAttachment; reason: string }) {
  // Native same-origin streaming with session cookies; mounted only after the access reason is submitted.
  return (
    <video src={staffReviewAssetUrl(asset.id, preferredVideoVariant(asset), reason)} controls playsInline preload="none" className="max-h-[60dvh] w-full rounded-xl bg-background" aria-label="Review video" data-testid="review-video">
      {asset.captionState === 'provided' && <track kind="captions" src={staffReviewAssetUrl(asset.id, 'captions', reason)} label="Captions" srcLang="en" default />}
    </video>
  );
}

function ReviewItem({ asset }: { asset: MediaAttachment }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const decide = useDecideVideoReview();
  const [accessReason, setAccessReason] = useState('');
  const [activeReason, setActiveReason] = useState<string | null>(null);
  const [decision, setDecision] = useState<'allow' | 'hold' | 'reject'>('hold');
  const [decisionReason, setDecisionReason] = useState('');
  const [watched, setWatched] = useState(false);
  const [listened, setListened] = useState(false);

  const canDecide = decisionReason.trim() && watched && listened && !decide.isPending;

  const submit = async () => {
    try {
      await decide.mutateAsync({ id: asset.id, data: { decision, reason: decisionReason.trim(), captionVersion: asset.captionVersion ?? 0, watchedEntireVideo: watched, listenedEntireAudio: listened } });
      toast({ title: 'Decision recorded' });
      qc.invalidateQueries({ queryKey: getListVideoReviewQueryKey() });
    } catch (e) {
      const st = (e as { status?: number }).status;
      toast({ title: 'Decision not recorded', description: st === 403 ? 'Fresh MFA or the right capability is required, and you cannot review your own video.' : st === 409 ? 'This video changed. Reload the queue.' : 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <article className="space-y-4 rounded-3xl border border-border bg-card p-5" data-testid={`review-item-${asset.id}`}>
      <div className="text-sm space-y-1">
        <div className="font-display text-lg font-bold">{asset.videoFormat === 'reel' ? 'Reel' : 'Video'} held for review</div>
        <p>Status: {asset.status}. Malware: {asset.malwareState}. Abuse: {asset.abuseState}. Captions v{asset.captionVersion ?? 0} ({asset.captionState ?? 'unavailable'}).</p>
        <p>{asset.durationSeconds ?? '?'} s, {asset.width ?? '?'} x {asset.height ?? '?'}, {asset.byteSize ? (asset.byteSize / 1048576).toFixed(1) + ' MiB' : 'size unknown'}</p>
        {asset.limitation && <p>Limitation: {asset.limitation}</p>}
      </div>
      <p className="rounded-xl border border-border p-3 text-sm">Thumbnail and frame samples are not full video screening, and no captions here were generated automatically. Missing scanning providers keep a video held. There is no malware waiver.</p>

      {activeReason === null ? (
        <div className="space-y-2">
          <label htmlFor={`access-${asset.id}`} className="text-sm font-medium">Reason for accessing this video (audited)</label>
          <Textarea id={`access-${asset.id}`} value={accessReason} onChange={(e) => setAccessReason(e.target.value)} maxLength={1000} />
          <Button className="rounded-xl" disabled={!accessReason.trim()} onClick={() => setActiveReason(accessReason.trim())} data-testid={`button-load-stream-${asset.id}`}>Load review stream</Button>
        </div>
      ) : (
        <>
          <ReviewStream asset={asset} reason={activeReason} />
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={watched} onChange={(e) => setWatched(e.target.checked)} className="mt-1" /> I watched the entire video.</label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={listened} onChange={(e) => setListened(e.target.checked)} className="mt-1" /> I listened to the entire audio.</label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
              {(['allow', 'hold', 'reject'] as const).map((d) => (
                <Button key={d} type="button" role="radio" aria-checked={decision === d} variant={decision === d ? 'default' : 'outline'} className="rounded-xl capitalize" onClick={() => setDecision(d)}>{d}</Button>
              ))}
            </div>
            <label htmlFor={`dr-${asset.id}`} className="text-sm font-medium">Decision reason</label>
            <Textarea id={`dr-${asset.id}`} value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} maxLength={1000} />
            <Button className="rounded-xl" disabled={!canDecide} onClick={submit} data-testid={`button-decide-${asset.id}`}>{decide.isPending ? 'Saving…' : 'Record decision'}</Button>
          </div>
        </>
      )}
    </article>
  );
}

export default function StaffVideoReviewPage() {
  const { data, isLoading, isError, error, refetch } = useListVideoReview();
  const status = (error as { status?: number } | null)?.status;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Video review" />
      <Link href="/staff/moderation" className="text-sm underline">Back to moderation</Link>
      {isLoading && <Skeleton className="h-48 w-full rounded-3xl" />}
      {isError && (status === 401 || status === 403 ? (
        <div role="alert" className="rounded-3xl border border-border bg-card p-6" data-testid="review-denied">
          <h2 className="font-display text-xl font-bold">Access not available</h2>
          <p className="mt-2 text-muted-foreground">Video review needs a staff moderation role and a recent multi-factor check.</p>
        </div>
      ) : (
        <div role="alert" className="rounded-3xl border border-border bg-card p-6"><p>The queue could not be loaded.</p><Button className="mt-3 rounded-xl" onClick={() => refetch()}>Try again</Button></div>
      ))}
      {data && data.items.length === 0 && <div className="rounded-3xl border border-border bg-card p-8 text-center" data-testid="review-empty">No videos are waiting for review.</div>}
      {data?.items.map((a) => <ReviewItem key={a.id} asset={a} />)}
    </div>
  );
}
