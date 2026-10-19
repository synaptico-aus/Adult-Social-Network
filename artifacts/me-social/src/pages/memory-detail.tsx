import { formatDate } from "@/lib/locale-format";
import { ControlledAudio, ControlledImage } from "@/components/media/controlled-media";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, EyeOff, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AudiencePicker, audienceLabels, audienceReady, type Aud } from "@/components/shared/audience-picker";
import {
  exportMemoryCollection, getGetMemoryCollectionQueryKey, getListMemoryCollectionsQueryKey, getListMemorySourcesQueryKey,
  getGetMemoryRemindersQueryKey, useAddMemoryItem, useDeleteMemoryCollection, useHideMemoryItem, useListMemorySources,
  useRemoveMemoryItem, useReorderMemoryItems, useGetMemoryCollection, useUpdateMemoryCollection, useUpdateMemoryItem,
  type MemoryItem,
} from "@workspace/api-client-react";

const card = "rounded-3xl border border-border bg-card p-5 md:p-6 space-y-4";
const kindLabel: Record<string, string> = { post: "Story", photo: "Photo", audio: "Recording", music: "Music link" };
const btn = "min-h-[48px] text-base";

function Item({ item, onHide }: { item: MemoryItem; onHide: (h: boolean) => void }) {
  if (item.hidden) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-5 space-y-3" data-testid={`placeholder-hidden-${item.id}`}>
        <p className="text-lg">This memory is hidden for you.</p>
        <Button variant="outline" className={btn} onClick={() => onHide(false)}>Restore this memory</Button>
      </div>
    );
  }
  if (item.unavailable) {
    return <div className="rounded-2xl border border-dashed border-border p-5" data-testid={`placeholder-unavailable-${item.id}`}><p className="text-lg">This memory is not available. It may have been removed or its sharing may have changed.</p></div>;
  }
  const postLink = item.sourcePostId || (item.kind === "post" ? item.sourceId : null);
  return (
    <article className="space-y-3" data-testid={`memory-${item.id}`}>
      <p className="text-sm font-semibold uppercase tracking-wide">{item.kind ? kindLabel[item.kind] : "Memory"}{item.sourceDate ? ` - Source date: ${formatDate(item.sourceDate)}` : ""}</p>
      {item.title && <h3 className="font-display text-2xl font-semibold">{item.title}</h3>}
      {item.kind === "photo" && item.mediaUrl && <ControlledImage src={item.mediaUrl} alt={item.altText || "Photo in this memory"} className="max-h-[480px] w-full rounded-2xl object-contain bg-muted" />}
      {item.kind === "audio" && item.mediaUrl && <ControlledAudio src={item.mediaUrl} label="Recording" className="w-full" />}
      {item.body && <p className="text-lg whitespace-pre-wrap">{item.body}</p>}
      {item.transcript && (
        <details className="rounded-xl bg-muted p-3"><summary className="cursor-pointer font-semibold min-h-[40px] flex items-center">Read transcript</summary><p className="mt-2 whitespace-pre-wrap">{item.transcript}</p></details>
      )}
      {item.caption && <div><p className="text-sm font-semibold">Collection caption</p><p className="text-lg italic">{item.caption}</p></div>}
      {item.authorName && <p className="text-base">Shared by {item.authorName}</p>}
      <div className="flex flex-wrap gap-4 text-base">
        {item.kind === "music" && item.url && <a className="underline font-semibold" href={item.url} target="_blank" rel="noopener noreferrer">Open music link (opens another site)</a>}
        {item.kind === "music" && item.sourceId && <Link className="underline font-semibold" href={`/resources/${item.sourceId}`}>View resource page</Link>}
        {postLink && item.kind !== "music" && <Link className="underline font-semibold" href={`/posts/${postLink}`}>View original post</Link>}
      </div>
      <Button variant="ghost" className={btn + " gap-2"} onClick={() => onHide(true)}><EyeOff className="w-4 h-4" aria-hidden="true" />Hide this memory for me</Button>
    </article>
  );
}

export default function MemoryDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = getGetMemoryCollectionQueryKey(id);
  const q = useGetMemoryCollection(id, { query: { queryKey: key, refetchInterval: 5000, refetchOnWindowFocus: true, staleTime: 0, gcTime: 0, retry: false } });
  const sources = useListMemorySources({ query: { queryKey: getListMemorySourcesQueryKey(), enabled: q.isSuccess && q.data?.collection.isOwner === true, refetchInterval: 5000, refetchOnWindowFocus: true, staleTime: 0 } });
  const update = useUpdateMemoryCollection();
  const del = useDeleteMemoryCollection();
  const add = useAddMemoryItem();
  const upItem = useUpdateMemoryItem();
  const rem = useRemoveMemoryItem();
  const reorder = useReorderMemoryItems();
  const hide = useHideMemoryItem();

  const failed = q.isError;
  const status = (q.error as { status?: number } | null)?.status;
  // Keep the mounted query on errors. Removing it recreates the observer and can
  // turn a permanent 404 into an unbounded refetch loop. Render no cached data.
  const data = failed ? undefined : q.data;
  const col = data?.collection;
  const items = useMemo(() => [...(data?.items ?? [])].sort((a, b) => a.position - b.position), [data]);
  const owner = !!col?.isOwner;

  const [idx, setIdx] = useState(0);
  const [editName, setEditName] = useState<string | null>(null);
  const [aud, setAud] = useState<Aud | null>(null);
  const [circleId, setCircleId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [consent, setConsent] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pick, setPick] = useState("");
  const [pickCaption, setPickCaption] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => { if (idx > 0 && idx >= items.length) setIdx(Math.max(0, items.length - 1)); }, [items.length, idx]);
  useEffect(() => {
    const pause = () => { if (document.hidden) wrap.current?.querySelectorAll("audio").forEach((a) => a.pause()); };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);

  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: getListMemoryCollectionsQueryKey() })]); };
  useEffect(() => {
    if (failed) { setDrafts((d) => (Object.keys(d).length ? {} : d)); return; }
    if (!data) return;
    setDrafts((d) => {
      const ok = new Set(data.items.filter((x) => !x.unavailable && !x.hidden).map((x) => x.id));
      const keep = Object.keys(d).filter((k) => ok.has(k));
      return keep.length === Object.keys(d).length ? d : Object.fromEntries(keep.map((k) => [k, d[k]]));
    });
  }, [data, failed]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await refresh(); qc.invalidateQueries({ queryKey: getGetMemoryRemindersQueryKey() }); toast({ title: ok }); return true; }
    catch { toast({ title: "That did not work", description: "Please try again.", variant: "destructive" }); return false; }
  };

  const curAud = aud ?? col?.audience ?? "only_me";
  const scopeChanged = col ? curAud !== col.audience || (curAud === "my_circle" && circleId && circleId !== col.circleId) || (curAud === "this_group" && groupId && groupId !== col.groupId) : false;
  const sharing = curAud !== "only_me";

  const saveSharing = async () => {
    if (!col) return;
    const ok = await run(() => update.mutateAsync({ id, data: { audience: curAud, circleId: curAud === "my_circle" ? circleId || col.circleId : null, groupId: curAud === "this_group" ? groupId || col.groupId : null, shareConsent: sharing ? consent : false } }), "Sharing updated");
    if (ok) { setAud(null); setConsent(false); qc.invalidateQueries({ queryKey: getListMemoryCollectionsQueryKey() }); }
  };

  const move = (i: number, d: number) => {
    const ids = items.map((x) => x.id);
    const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => reorder.mutateAsync({ id, data: { itemIds: ids } }), "Order saved");
  };

  const doExport = async () => {
    try {
      const out = await exportMemoryCollection(id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "memory-collection.json"; a.click(); URL.revokeObjectURL(url);
    } catch { toast({ title: "Could not export", variant: "destructive" }); }
  };

  const used = new Set(items.map((x) => `${x.kind}:${x.sourceId}`));
  const avail = (sources.isError ? [] : sources.data ?? []).filter((s) => s.kind && s.sourceId && !used.has(`${s.kind}:${s.sourceId}`) && !s.unavailable);
  const chosen = avail.find((s) => `${s.kind}:${s.sourceId}` === pick);

  if (q.isLoading) return <div className="space-y-4" aria-busy="true"><div className="h-12 w-2/3 rounded-xl bg-muted animate-pulse" /><div className="h-64 rounded-3xl bg-muted animate-pulse" /></div>;
  if (!col) {
    return (
      <div role="alert" className={card}>
        <h1 className="font-display text-2xl font-bold">{status === 401 || status === 403 || status === 404 ? "This collection is not available" : "We could not load this collection"}</h1>
        <p>It may have been deleted or is no longer shared with you.</p>
        <div className="flex gap-3 flex-wrap"><Button className={btn} variant="outline" onClick={() => q.refetch()}>Try again</Button><Link href="/memories" className="inline-flex items-center min-h-[48px] underline font-semibold">Back to memories</Link></div>
      </div>
    );
  }
  const cur = items[idx];

  return (
    <div className="space-y-8" ref={wrap}>
      <div>
        <Link href="/memories" className="inline-flex items-center gap-1 min-h-[48px] font-semibold"><ChevronLeft className="rtl:-scale-x-100 w-5 h-5" aria-hidden="true" />All collections</Link>
        <h1 className="font-display text-3xl md:text-4xl font-bold" data-testid="text-collection-name">{col.name}</h1>
        <p className="text-lg">{owner ? "Your collection" : "Shared with you"} - {audienceLabels[col.audience]}</p>
        {col.sharingHeld && <p role="status" className="mt-2 rounded-xl border border-border bg-muted p-3">A safety check has paused sharing. Only you can see this collection. Edit its name or captions, or remove a memory, to check it again.</p>}
        <p className="mt-2 text-base">A collection never widens who can see an item. Sources can become unavailable. Collections are not a treatment and include no tests or made-up events.</p>
      </div>

      <section className={card} aria-label="Memory viewer">
        <h2 className="font-display text-2xl font-semibold">Viewer</h2>
        {items.length === 0 ? <p className="text-lg">Nothing here yet.{owner ? " Add a source below." : ""}</p> : cur && (
          <>
            <p aria-live="polite">Memory {idx + 1} of {items.length}</p>
            <Item key={cur.id + (cur.unavailable ? "u" : "a") + (cur.hidden ? "h" : "")} item={cur} onHide={(h) => run(() => hide.mutateAsync({ id, itemId: cur.id, data: { hidden: h } }), h ? "Memory hidden" : "Memory restored")} />
            <div className="flex justify-between gap-3">
              <Button data-testid="button-prev-memory" variant="outline" size="lg" className="min-h-[56px] text-lg gap-1" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="rtl:-scale-x-100 w-5 h-5" aria-hidden="true" />Previous</Button>
              <Button data-testid="button-next-memory" variant="outline" size="lg" className="min-h-[56px] text-lg gap-1" disabled={idx >= items.length - 1} onClick={() => setIdx(idx + 1)}>Next<ChevronRight className="rtl:-scale-x-100 w-5 h-5" aria-hidden="true" /></Button>
            </div>
          </>
        )}
      </section>

      {owner && (
        <>
          <section className={card} aria-labelledby="arr-h">
            <h2 id="arr-h" className="font-display text-2xl font-semibold">Arrange memories</h2>
            {items.length === 0 && <p>No memories to arrange.</p>}
            <ol className="space-y-4">
              {items.map((it, i) => {
                const draft = !it.unavailable && !it.hidden ? drafts[it.id] : undefined;
                return (
                  <li key={it.id} className="rounded-2xl border border-border bg-background p-4 space-y-3" data-testid={`row-item-${it.id}`}>
                    <p className="font-semibold">{i + 1}. {it.unavailable ? "Unavailable memory" : it.hidden ? "Hidden memory" : it.title || (it.kind ? kindLabel[it.kind] : "Memory")}</p>
                    {!it.unavailable && !it.hidden && (
                      draft === undefined ? (
                        <div className="flex flex-wrap items-center gap-3"><span>{it.caption || "No caption"}</span><Button variant="outline" className={btn} onClick={() => setDrafts({ ...drafts, [it.id]: it.caption ?? "" })}>Edit caption</Button></div>
                      ) : (
                        <div className="space-y-2">
                          <label className="block font-semibold">Caption<Input className="mt-1 min-h-[48px] text-base font-normal" maxLength={500} value={draft} onChange={(e) => setDrafts({ ...drafts, [it.id]: e.target.value })} /></label>
                          <div className="flex gap-2">
                            <Button className={btn} onClick={async () => { if (await run(() => upItem.mutateAsync({ id, itemId: it.id, data: { caption: draft } }), "Caption saved")) { const { [it.id]: _x, ...rest } = drafts; setDrafts(rest); } }} disabled={upItem.isPending}>Save caption</Button>
                            <Button variant="ghost" className={btn} onClick={() => { const { [it.id]: _x, ...rest } = drafts; setDrafts(rest); }}>Cancel</Button>
                          </div>
                        </div>
                      )
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className={btn + " gap-1"} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} aria-label={`Move up memory ${i + 1}`}><ArrowUp className="w-4 h-4" aria-hidden="true" />Move up</Button>
                      <Button variant="outline" className={btn + " gap-1"} disabled={i === items.length - 1 || reorder.isPending} onClick={() => move(i, 1)} aria-label={`Move down memory ${i + 1}`}><ArrowDown className="w-4 h-4" aria-hidden="true" />Move down</Button>
                      <Button variant="outline" className={btn} onClick={() => run(() => rem.mutateAsync({ id, itemId: it.id }), "Removed from collection. The original is untouched.")}>Remove from collection</Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="text-sm">Removing only takes the reference out of this collection. The original story, photo, recording or link is never deleted.</p>
          </section>

          <section className={card} aria-labelledby="add-h">
            <h2 id="add-h" className="font-display text-2xl font-semibold">Add something you already have</h2>
            <p>You can only add existing published stories, photos, recordings and reviewed music links. This does not upload anything new.</p>
            {sources.isLoading && <div className="h-14 rounded-xl bg-muted animate-pulse" />}
            {sources.isError && <p role="alert">Sources could not be loaded. <button className="underline" onClick={() => sources.refetch()}>Try again</button></p>}
            {sources.data && avail.length === 0 && (
              <p>Nothing else to add. <Link href="/" className="underline font-semibold">Create a story on Home</Link> or <Link href="/resources" className="underline font-semibold">browse the music catalogue</Link>.</p>
            )}
            {avail.length > 0 && (
              <>
                <label className="block font-semibold">Choose a source
                  <select data-testid="select-source" className="mt-1 w-full min-h-[48px] rounded-xl border border-border bg-background px-3 text-lg font-normal" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Select</option>
                    {avail.map((s) => <option key={s.id + s.sourceId} value={`${s.kind}:${s.sourceId}`}>{s.kind ? kindLabel[s.kind] : ""}: {(s.title || s.caption || s.body || "Untitled").slice(0, 70)}</option>)}
                  </select>
                </label>
                <label className="block font-semibold">Caption (optional)<Input className="mt-1 min-h-[48px] text-base font-normal" maxLength={500} value={pickCaption} onChange={(e) => setPickCaption(e.target.value)} /></label>
                <Button data-testid="button-add-source" size="lg" className="min-h-[56px] text-lg" disabled={!chosen || add.isPending}
                  onClick={async () => { if (chosen?.kind && chosen.sourceId && await run(() => add.mutateAsync({ id, data: { kind: chosen.kind!, sourceId: chosen.sourceId!, sourcePostId: chosen.sourcePostId, caption: pickCaption || undefined } }), "Added to collection")) { setPick(""); setPickCaption(""); } }}>
                  {add.isPending && <Loader2 className="w-5 h-5 animate-spin me-2" />}Add to collection
                </Button>
              </>
            )}
          </section>

          <section className={card} aria-labelledby="set-h">
            <h2 id="set-h" className="font-display text-2xl font-semibold">Name and sharing</h2>
            <label className="block font-semibold">Name<Input data-testid="input-rename" className="mt-1 min-h-[48px] text-lg font-normal" maxLength={120} value={editName ?? col.name} onChange={(e) => setEditName(e.target.value)} /></label>
            <Button className={btn} disabled={editName === null || !editName.trim() || update.isPending} onClick={async () => { if (await run(() => update.mutateAsync({ id, data: { name: editName!.trim() } }), "Renamed")) setEditName(null); }}>Save name</Button>
            <hr className="border-border" />
            <AudiencePicker audience={curAud} circleId={circleId || col.circleId || ""} groupId={groupId || col.groupId || ""} onAudience={(a) => { setAud(a); setConsent(false); }} onCircle={(v) => { setCircleId(v); setConsent(false); }} onGroup={(v) => { setGroupId(v); setConsent(false); }} />
            {sharing && scopeChanged && (
              <label className="flex items-start gap-3 text-lg"><input data-testid="checkbox-share-consent" type="checkbox" className="mt-1 w-6 h-6" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I understand this collection will be shared with the audience I chose.</span></label>
            )}
            <Button data-testid="button-save-sharing" className={btn} disabled={!scopeChanged || update.isPending || !audienceReady(curAud, circleId || col.circleId || "", groupId || col.groupId || "") || (sharing && !consent)} onClick={saveSharing}>Save sharing</Button>
          </section>

          <section className={card}>
            <h2 className="font-display text-2xl font-semibold">More</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className={btn + " gap-2"} onClick={doExport}><Download className="w-4 h-4" aria-hidden="true" />Download as JSON</Button>
              {!confirmDelete ? <Button variant="outline" className={btn + " gap-2"} onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4" aria-hidden="true" />Delete collection</Button> : (
                <div role="alertdialog" aria-label="Confirm delete" className="w-full rounded-2xl border border-border p-4 space-y-3">
                  <p>Delete this collection? Your original stories, photos, recordings and links stay where they are.</p>
                  <div className="flex gap-3">
                    <Button data-testid="button-confirm-delete" className={btn} disabled={del.isPending} onClick={async () => { if (await run(() => del.mutateAsync({ id }), "Collection deleted")) { qc.invalidateQueries({ queryKey: getListMemoryCollectionsQueryKey() }); setLocation("/memories"); } }}>Yes, delete collection</Button>
                    <Button variant="ghost" className={btn} onClick={() => setConfirmDelete(false)}>Keep it</Button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
