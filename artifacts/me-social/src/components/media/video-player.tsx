import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX, AlertCircle, Film } from 'lucide-react';
import type { MediaAttachment } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useVideoPrefs } from '@/hooks/use-video-prefs';
import { fetchBlob, mediaAssetUrl, preferredVideoVariant } from '@/lib/media-url';

const esc = (t: string) => t.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toVtt(cues: NonNullable<MediaAttachment['captions']>): string {
  const t = (s: number) => {
    const ms = Math.round(s * 1000);
    const p = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
  };
  return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${esc(c.text)}\n`).join('\n');
}

export interface VideoPlayerProps {
  asset: MediaAttachment;
  className?: string;
}

export function VideoPlayer({ asset, className }: VideoPlayerProps) {
  const { prefs, update, userId } = useVideoPrefs();
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pendingPlay = useRef(false);
  const autoTried = useRef(false);
  const autoStarted = useRef(false);

  const [src, setSrc] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);

  const hasLow = asset.playbackVariants?.includes('low');
  const hasThumb = asset.playbackVariants?.includes('thumbnail');
  const variant = preferredVideoVariant(asset, prefs.lowQuality);

  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const saveData = typeof navigator !== 'undefined' && Boolean((navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData);
  const autoplayAllowed = prefs.autoplay && !reduced && !saveData;

  const hardStop = useCallback(() => {
    pendingPlay.current = false;
    const v = videoRef.current;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  }, []);
  const pauseNow = useCallback(() => {
    pendingPlay.current = false; // cancels any play that has not started yet
    videoRef.current?.pause();
  }, []);

  // Resource / account / unmount: stop native loading and clear the source.
  useEffect(() => {
    autoTried.current = false;
    return () => { hardStop(); setSrc(null); setPaused(true); setFailed(false); };
  }, [asset.id, userId, hardStop]);

  // Quality change: stop; nothing loads until the user presses play.
  useEffect(() => { hardStop(); setSrc(null); setPaused(true); }, [variant, hardStop]);

  // Thumbnail only when low-data is off.
  useEffect(() => {
    if (prefs.lowData || !hasThumb) return;
    const c = new AbortController();
    let made: string | null = null;
    fetchBlob(mediaAssetUrl(asset.id, 'thumbnail'), c.signal)
      .then((b) => { made = URL.createObjectURL(b); setPoster(made); })
      .catch(() => {});
    return () => { c.abort(); if (made) URL.revokeObjectURL(made); setPoster(undefined); };
  }, [asset.id, prefs.lowData, hasThumb, userId]);

  const captionUrl = useMemo(() => {
    if (!asset.captions?.length) return null;
    return URL.createObjectURL(new Blob([toVtt(asset.captions)], { type: 'text/vtt' }));
  }, [asset.captions]);
  useEffect(() => () => { if (captionUrl) URL.revokeObjectURL(captionUrl); }, [captionUrl]);

  const start = useCallback((auto: boolean) => {
    setFailed(false);
    autoStarted.current = auto;
    pendingPlay.current = true;
    const url = mediaAssetUrl(asset.id, variant);
    const v = videoRef.current;
    if (v && src === url) { v.play().catch(() => {}); return; }
    setSrc(url); // the browser streams this same-origin URL with session cookies
  }, [asset.id, variant, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (src && v && pendingPlay.current) {
      if (autoStarted.current) v.muted = true;
      v.play().catch(() => {});
      pendingPlay.current = false;
    }
  }, [src]);

  // Pause when off-screen / hidden. Never auto-resume.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') pauseNow(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', pauseNow);
    let io: IntersectionObserver | undefined;
    if (boxRef.current && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) { pauseNow(); return; }
        if (autoplayAllowed && !autoTried.current && document.visibilityState === 'visible') {
          autoTried.current = true;
          start(true);
        }
      }, { threshold: 0.5 });
      io.observe(boxRef.current);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', pauseNow);
      io?.disconnect();
    };
  }, [autoplayAllowed, start, pauseNow]);

  const toggle = () => {
    const v = videoRef.current;
    if (!src || !v) { start(false); return; }
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };

  const captionNote =
    asset.captionState === 'no_speech' ? 'This video has no speech.'
    : asset.captionState === 'provided' ? null
    : 'Captions are not available for this video.';
  const w = asset.width ?? 0, h = asset.height ?? 0;
  const portrait = asset.videoFormat === 'reel' || (w > 0 && w <= h);

  return (
    <div className={`rounded-2xl border border-border bg-card overflow-hidden ${className ?? ''}`} data-testid={`video-player-${asset.id}`}>
      <div ref={boxRef} className={`relative bg-background mx-auto ${portrait ? 'max-w-sm aspect-[9/16] max-h-[70dvh]' : 'aspect-video'}`}>
        {src ? (
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            controls
            playsInline
            preload="none"
            className="h-full w-full object-contain"
            onError={() => setFailed(true)}
            aria-label={asset.altText || 'Video attachment'}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          >
            {captionUrl && <track kind="captions" src={captionUrl} srcLang="en" label="Captions" default />}
          </video>
        ) : (
          <button
            type="button"
            onClick={() => start(false)}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
            style={poster ? { backgroundImage: `url(${poster})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
            data-testid={`button-load-video-${asset.id}`}
          >
            <span className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground">
              <Play className="h-5 w-5" />
              Play video
            </span>
            {!poster && <Film className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
            {prefs.lowData && (
              <span className="rounded-lg bg-background/80 px-2 py-1 text-sm text-muted-foreground">Low-data mode: nothing downloads until you press play.</span>
            )}
          </button>
        )}
      </div>

      {failed && (
        <div role="alert" className="flex items-center justify-between gap-2 border-t border-border p-3 text-sm">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Could not load this video.</span>
          <Button size="sm" variant="outline" onClick={() => start(false)}>Try again</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
        <Button type="button" size="sm" variant="outline" onClick={toggle} className="rounded-xl" data-testid={`button-toggle-play-${asset.id}`}>
          {paused ? <Play className="mr-1.5 h-4 w-4" /> : <Pause className="mr-1.5 h-4 w-4" />}{paused ? 'Play' : 'Pause'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!src} className="rounded-xl"
          onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }}
          data-testid={`button-toggle-mute-${asset.id}`}>
          {muted ? <VolumeX className="mr-1.5 h-4 w-4" /> : <Volume2 className="mr-1.5 h-4 w-4" />}{muted ? 'Unmute' : 'Mute'}
        </Button>
        {captionNote && <span className="text-sm text-muted-foreground">{captionNote}</span>}
      </div>

      <details className="border-t border-border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Playback settings</summary>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.lowData} onChange={(e) => update({ lowData: e.target.checked })} /> Low-data mode (no previews until you choose)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.lowQuality} disabled={!hasLow} onChange={(e) => update({ lowQuality: e.target.checked })} /> Use lower quality{!hasLow && ' (not available for this video)'}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.autoplay} onChange={(e) => update({ autoplay: e.target.checked })} /> Autoplay muted when visible</label>
          {prefs.autoplay && (reduced || saveData) && <p className="text-muted-foreground">Autoplay is off because your device asks for reduced motion or data saving.</p>}
        </div>
      </details>

      {(asset.captions?.length || asset.transcript) ? (
        <details className="border-t border-border p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Transcript</summary>
          <div className="mt-2 whitespace-pre-wrap text-muted-foreground">
            {asset.captions?.length ? asset.captions.map((c) => c.text).join('\n') : asset.transcript}
          </div>
        </details>
      ) : null}
    </div>
  );
}
