import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCorrectVideoCaptions,
  getGetMediaStatusQueryKey,
  type MediaAttachment,
  type VideoCaptionCue,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { invalidatePhase6 } from '@/lib/invalidation';

const pad = (n: number, l = 2) => String(n).padStart(l, '0');
function fmt(s: number) {
  const ms = Math.round(s * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
function ts(s: string) {
  const m = s.trim().match(/^(\d+):(\d+):(\d+)[,.](\d{1,3})$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000 : NaN;
}
export function formatSrt(cues: VideoCaptionCue[]) {
  return cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}`).join('\n\n');
}
export function parseSrt(text: string): VideoCaptionCue[] {
  const cues: VideoCaptionCue[] = [];
  text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean).forEach((block, i) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const idx = lines.findIndex((l) => l.includes('-->'));
    if (idx < 0) throw new Error(`Cue ${i + 1}: missing a time line like 00:00:01,000 --> 00:00:03,000`);
    const [a, b] = lines[idx].split('-->');
    const start = ts(a), end = ts(b);
    const body = lines.slice(idx + 1).join(' ');
    if (Number.isNaN(start) || Number.isNaN(end)) throw new Error(`Cue ${i + 1}: unreadable time`);
    if (end <= start) throw new Error(`Cue ${i + 1}: end must be after start`);
    if (!body || body.length > 500) throw new Error(`Cue ${i + 1}: text must be 1 to 500 characters`);
    cues.push({ start, end, text: body });
  });
  if (cues.length > 1000) throw new Error('At most 1000 cues');
  return cues;
}

export function VideoCaptionEditor({ asset, onSaved }: { asset: MediaAttachment; onSaved?: (a: MediaAttachment) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const correct = useCorrectVideoCaptions();
  const [text, setText] = useState(formatSrt(asset.captions ?? []));
  const [noSpeech, setNoSpeech] = useState(asset.captionState === 'no_speech');
  const [error, setError] = useState('');
  const dirty = useRef(false);
  // Sync with a fresh revision only (id/version change), never over an unsaved edit.
  useEffect(() => {
    if (dirty.current) return;
    setText(formatSrt(asset.captions ?? []));
    setNoSpeech(asset.captionState === 'no_speech');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.captionVersion]);

  const save = async () => {
    setError('');
    let cues: VideoCaptionCue[] = [];
    try {
      cues = noSpeech ? [] : parseSrt(text);
      if (!noSpeech && cues.length === 0) throw new Error('Add at least one cue, or mark the video as having no speech.');
    } catch (e) { setError((e as Error).message); return; }
    try {
      const res = await correct.mutateAsync({
        id: asset.id,
        data: { captionVersion: asset.captionVersion ?? 0, captionState: noSpeech ? 'no_speech' : 'provided', cues },
      });
      dirty.current = false;
      toast({ title: 'Captions saved', description: 'A caption change may hold the previous ready video while it is rechecked.' });
      invalidatePhase6(qc);
      qc.invalidateQueries({ queryKey: getGetMediaStatusQueryKey(asset.id) });
      onSaved?.(res as unknown as MediaAttachment);
    } catch (e) {
      const status = (e as { status?: number }).status;
      setError(status === 409 ? 'Captions changed elsewhere. Reload and try again.' : 'Could not save captions.');
    }
  };

  return (
    <details className="rounded-xl border border-border p-3 text-sm" data-testid={`caption-editor-${asset.id}`}>
      <summary className="cursor-pointer font-semibold">Edit captions</summary>
      <div className="mt-3 space-y-3">
        {asset.transcript && <p className="text-muted-foreground whitespace-pre-wrap">Transcript available: {asset.transcript}</p>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={noSpeech} onChange={(e) => { dirty.current = true; setNoSpeech(e.target.checked); }} /> This video has no speech</label>
        <label className="block font-medium" htmlFor={`srt-${asset.id}`}>Timed cues (SRT format)</label>
        <Textarea id={`srt-${asset.id}`} value={text} disabled={noSpeech} onChange={(e) => { dirty.current = true; setText(e.target.value); }} rows={8} className="font-mono text-sm"
          placeholder={'1\n00:00:00,000 --> 00:00:02,500\nHello everyone'} />
        <p className="text-muted-foreground">Captions here are written by you; none are generated automatically.</p>
        {error && <p role="alert" className="font-semibold">{error}</p>}
        <Button type="button" onClick={save} disabled={correct.isPending} className="rounded-xl" data-testid={`button-save-captions-${asset.id}`}>
          {correct.isPending ? 'Saving…' : 'Save captions'}
        </Button>
      </div>
    </details>
  );
}
