import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useListReels } from '@workspace/api-client-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PostCard } from '@/components/posts/post-card';
import { VideoPlayer } from '@/components/media/video-player';
import { selectReadyReel } from '@/lib/reel-media';

export default function ReelsPage() {
  const [cursor, setCursor] = useState<string | undefined>();
  const [index, setIndex] = useState(0);
  const { data, isLoading, isError, refetch, isFetching } = useListReels(cursor ? { cursor } : undefined);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const items = data?.items ?? [];
  const post = items[index];
  const video = selectReadyReel(post?.mediaAssets);

  useEffect(() => { setIndex(0); }, [cursor]);

  const go = (d: number) => setIndex((i) => Math.min(Math.max(i + d, 0), Math.max(items.length - 1, 0)));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Reels" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground">Short portrait videos. One plays at a time, only when you choose.</p>
        <Button asChild className="rounded-xl shrink-0" data-testid="link-add-reel"><Link href="/"><Plus className="me-1.5 h-4 w-4" />Add a reel</Link></Button>
      </div>

      {isLoading && <Skeleton className="h-[60dvh] w-full rounded-3xl" />}
      {isError && (
        <div role="alert" className="rounded-3xl border border-border bg-card p-6 text-center">
          <p className="font-semibold">Reels could not be loaded.</p>
          <Button className="mt-3 rounded-xl" onClick={() => refetch()}>Try again</Button>
        </div>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <div className="rounded-3xl border border-border bg-card p-8 text-center" data-testid="reels-empty">
          <h2 className="font-display text-xl font-bold">No reels yet</h2>
          <p className="mt-2 text-muted-foreground">When someone shares a reel with you, it will appear here.</p>
        </div>
      )}

      {post && (
        <section aria-label={`Reel ${index + 1} of ${items.length}`}
          style={{ touchAction: 'pan-y' }}
          onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={(e) => {
            const s = touch.current; touch.current = null;
            if (!s) return;
            const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
            if (Math.abs(dx) > 60 && Math.abs(dy) < 40) go(dx < 0 ? 1 : -1);
          }}
          className="space-y-4">
          {video ? <VideoPlayer key={video.id} asset={video} /> : <p className="text-muted-foreground">This reel has no playable video.</p>}
          <PostCard key={post.id} post={post} suppressMedia />
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" className="rounded-xl" disabled={index === 0} onClick={() => go(-1)} data-testid="button-reel-previous"><ChevronLeft className="rtl:-scale-x-100 me-1 h-4 w-4" />Previous</Button>
            <span className="text-sm text-muted-foreground" aria-live="polite">{index + 1} of {items.length}</span>
            <Button variant="outline" className="rounded-xl" disabled={index >= items.length - 1} onClick={() => go(1)} data-testid="button-reel-next">Next<ChevronRight className="rtl:-scale-x-100 ms-1 h-4 w-4" /></Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">Swipe sideways on a touch screen to change reels.</p>
          {index >= items.length - 1 && (
            <div className="text-center">
              {data?.nextCursor ? (
                <Button className="rounded-xl" disabled={isFetching} onClick={() => setCursor(data.nextCursor!)} data-testid="button-load-more-reels">{isFetching ? 'Loading…' : 'Load more reels'}</Button>
              ) : <p className="text-muted-foreground">You have reached the end.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
