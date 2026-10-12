import type { mediaAssetsTable } from "@workspace/db";
export function videoPublicFields(asset: typeof mediaAssetsTable.$inferSelect) {
  const metadata = asset.metadata as { playbackVariants?: string[] } | null;
  return { videoFormat: asset.videoFormat, captions: asset.captions, captionVersion: asset.captionVersion,
    captionState: asset.captionState, playbackVariants: metadata?.playbackVariants?.filter((v) => ["standard", "low", "webm", "thumbnail"].includes(v)) ?? [] };
}
export function mediaResponse(asset: typeof mediaAssetsTable.$inferSelect) {
  return { id: asset.id, kind: asset.kind, contentType: asset.contentType, byteSize: asset.byteSize,
    width: asset.width, height: asset.height, durationSeconds: asset.durationSeconds,
    status: asset.status, malwareState: asset.malwareState, abuseState: asset.abuseState,
    altText: asset.altText, transcript: asset.transcript, ...videoPublicFields(asset),
    limitation: ["held", "rejected", "quarantined", "cleanup_pending"].includes(asset.status) ? asset.rejectionReason : null };
}
