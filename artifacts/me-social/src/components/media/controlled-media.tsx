import { useState, type ReactNode } from "react";
import { Headphones, ImageIcon, Play } from "lucide-react";
import { useExperience } from "@/lib/experience";

/** Gate: while low-data or text-first is on, nothing is requested until the member explicitly loads it. */
function useGate(resetKey: string) {
  const { mediaGated, userId } = useExperience();
  // The release is bound to account + source + gate state, so it can never leak to another account, URL or re-enabled gate.
  const token = `${userId ?? "anon"}|${resetKey}|${mediaGated ? 1 : 0}`;
  const [releasedFor, setReleasedFor] = useState<string | null>(null);
  const released = releasedFor === token;
  return { blocked: mediaGated && !released, release: () => setReleasedFor(token), mediaGated, released };
}

interface PlaceholderProps { label: string; icon: ReactNode; onClick: () => void; className?: string; testId: string; note?: string }
function Placeholder({ label, icon, onClick, className, testId, note }: PlaceholderProps) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-center text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className ?? ""}`}>
      <span className="text-primary" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {note && <span className="text-xs font-normal text-muted-foreground">{note}</span>}
    </button>
  );
}

export function ControlledImage({ src, alt, className, wrapperClassName, testId = "controlled-image" }: { src: string; alt: string; className?: string; wrapperClassName?: string; testId?: string }) {
  const { blocked, release } = useGate(src);
  if (blocked) {
    return <div className={wrapperClassName}><Placeholder testId={`${testId}-load`} onClick={release} icon={<ImageIcon className="h-6 w-6" />} label="Load photo" note={alt ? `Description: ${alt}` : "Photos are off to save data"} /></div>;
  }
  return <img src={src} alt={alt} className={className} loading="lazy" data-testid={testId} />;
}

/** Avatar / thumbnail: shows the fallback (initials) and requests the image only after a deliberate click or when media is allowed. */
export function ControlledAvatarImage({ src, alt, className, fallback }: { src: string; alt: string; className?: string; fallback: ReactNode }) {
  const { blocked, release } = useGate(src);
  if (blocked) {
    return <button type="button" onClick={release} aria-label={`Load ${alt}`} title="Load photo" data-testid="button-load-avatar" className="contents">{fallback}</button>;
  }
  return <img src={src} alt={alt} className={className} data-testid="img-avatar" />;
}

export function ControlledAudio({ src, label = "Audio attachment", className, children }: { src: string; label?: string; className?: string; children?: ReactNode }) {
  const { blocked, release } = useGate(src);
  if (blocked) return <Placeholder testId="button-load-audio" onClick={release} icon={<Headphones className="h-6 w-6" />} label="Load audio" note="Audio is off to save data" />;
  return <audio controls preload="none" src={src} className={className} aria-label={label} data-testid="audio-controlled">{children}</audio>;
}

/** Native video wrapper for lesson/memory media. Explicit Play media loads and starts it; autoplay never happens. */
export function ControlledVideo({ src, className, width, height, children }: { src: string; className?: string; width?: number; height?: number; children?: ReactNode }) {
  const { blocked, release, released } = useGate(src);
  const started = released;
  if (blocked) {
    return <Placeholder testId="button-play-media" onClick={release} icon={<Play className="h-6 w-6" />} label="Play media" note="Video is not loaded until you press play" />;
  }
  return <video controls playsInline preload="none" autoPlay={started} src={src} className={className} width={width} height={height} data-testid="video-controlled">{children}</video>;
}
