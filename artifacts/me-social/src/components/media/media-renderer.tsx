import React from 'react';
import { MediaAttachment } from '@workspace/api-client-react';
import { VideoPlayer } from './video-player';
import { ControlledAudio, ControlledImage } from './controlled-media';
import { AlertCircle, Headphones } from 'lucide-react';

export function MediaAttachmentRenderer({ asset, isDetail }: { asset: MediaAttachment, isDetail?: boolean }) {
  if (asset.status !== 'ready') {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 text-sm text-muted-foreground border border-border/50">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Media attachment is {asset.status.replace('_', ' ')}</span>
      </div>
    );
  }

  const url = `/api/media/${asset.id}`;

  if (asset.kind === 'photo') {
    return (
      <div className="mt-3 mb-4 rounded-xl overflow-hidden border border-border bg-secondary/20">
        <ControlledImage src={url} alt={asset.altText || "Photo attachment"} className="w-full h-auto object-cover max-h-[500px]" testId={`img-media-${asset.id}`} />
        {isDetail && asset.altText && (
          <div className="p-3 text-sm text-muted-foreground bg-card border-t border-border">
            <span className="font-semibold text-foreground me-2">Description:</span>
            {asset.altText}
          </div>
        )}
      </div>
    );
  }

  if (asset.kind === 'video') {
    return <div className="mt-3 mb-4"><VideoPlayer asset={asset} /></div>;
  }

  if (asset.kind === 'audio') {
    return (
      <div className="mt-3 mb-4 rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 bg-secondary/30 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Headphones className="w-5 h-5 text-primary" />
          </div>
          <div className="w-full"><ControlledAudio src={url} label="Audio attachment" className="w-full h-10" /></div>
        </div>
        {asset.transcript && (
          <div className="p-4 border-t border-border bg-card">
            <div className="text-sm font-semibold text-foreground mb-1">Transcript</div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {asset.transcript}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
