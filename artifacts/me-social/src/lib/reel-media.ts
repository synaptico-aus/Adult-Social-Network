import type { MediaAttachment } from '@workspace/api-client-react';

export function selectReadyReel(assets?: MediaAttachment[]) {
  return assets?.find((asset) => asset.kind === 'video' && asset.videoFormat === 'reel' && asset.status === 'ready');
}
