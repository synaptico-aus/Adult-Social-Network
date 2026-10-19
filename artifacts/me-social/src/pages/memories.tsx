import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Album, BellOff, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AudiencePicker, audienceLabels, audienceReady, type Aud } from "@/components/shared/audience-picker";
import {
  getGetMemoryReminderPreferencesQueryKey, getGetMemoryRemindersQueryKey, getListMemoryCollectionsQueryKey,
  useCreateMemoryCollection, useGetMemoryReminderPreferences, useGetMemoryReminders, useListMemoryCollections,
  useSetMemoryReminderPreferences,
} from "@workspace/api-client-react";

export default function Memories() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListMemoryCollections({ query: { queryKey: getListMemoryCollectionsQueryKey(), refetchInterval: 5000, refetchOnWindowFocus: true, staleTime: 0 } });
  const prefs = useGetMemoryReminderPreferences({ query: { queryKey: getGetMemoryReminderPreferencesQueryKey(), refetchInterval: 5000, refetchOnWindowFocus: true, staleTime: 0 } });
  const setPrefs = useSetMemoryReminderPreferences();
  const enabled = prefs.data?.enabled === true && !prefs.isError && !(setPrefs.isPending && setPrefs.variables?.data.enabled === false);
  const reminders = useGetMemoryReminders({ query: { queryKey: getGetMemoryRemindersQueryKey(), enabled, refetchInterval: 5000, refetchOnWindowFocus: true, staleTime: 0 } });
  const create = useCreateMemoryCollection();
  const [name, setName] = useState("");
  const [aud, setAud] = useState<Aud>("only_me");
  const [circleId, setCircleId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [consent, setConsent] = useState(false);
  const [remConsent, setRemConsent] = useState(false);

  useEffect(() => {
    if (!enabled) {
      void qc.cancelQueries({ queryKey: getGetMemoryRemindersQueryKey() });
      qc.setQueryData(getGetMemoryRemindersQueryKey(), []);
    }
  }, [enabled, qc]);

  const shared = aud !== "only_me";
  const canCreate = name.trim() && audienceReady(aud, circleId, groupId) && (!shared || consent);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync({ data: { name: name.trim(), audience: aud, circleId: aud === "my_circle" ? circleId : null, groupId: aud === "this_group" ? groupId : null, shareConsent: shared ? consent : false } });
      setName(""); setAud("only_me"); setConsent(false);
      await qc.invalidateQueries({ queryKey: getListMemoryCollectionsQueryKey() });
      toast({ title: "Collection created" });
    } catch { toast({ title: "Could not create collection", description: "Please try again.", variant: "destructive" }); }
  };

  const setReminders = async (on: boolean) => {
    if (!on) {
      qc.setQueryData(getGetMemoryRemindersQueryKey(), []);
      void qc.cancelQueries({ queryKey: getGetMemoryRemindersQueryKey() });
    }
    try {
      await setPrefs.mutateAsync({ data: on ? { enabled: true, consent: true } : { enabled: false } });
      await qc.invalidateQueries({ queryKey: getGetMemoryReminderPreferencesQueryKey() });
      toast({ title: on ? "Reminders are on" : "All reminders are off" });
    } catch {
      await qc.invalidateQueries({ queryKey: getGetMemoryReminderPreferencesQueryKey() });
      toast({ title: "Could not change reminders", variant: "destructive" });
    }
  };

  const card = "rounded-3xl border border-border bg-card p-5 md:p-6 space-y-4";
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl md:text-4xl font-bold flex items-center gap-3"><Album className="w-9 h-9" aria-hidden="true" />Memories</h1>
        <p className="mt-2 text-lg">Gather stories, photos, recordings and music links you already have into named collections. Collections are private unless you choose to share them.</p>
        <ul className="mt-3 list-disc ps-6 space-y-1 text-base">
          <li>A collection cannot widen who can see an item. Anyone who is not allowed to see the original sees a plain placeholder.</li>
          <li>A source can become unavailable at any time, for example if it is deleted or its sharing changes.</li>
          <li>Collections are not a treatment, and contain no tests, scores or made-up events.</li>
        </ul>
      </header>

      <section className={card} aria-labelledby="rem-h">
        <h2 id="rem-h" className="font-display text-2xl font-semibold">Memory reminders</h2>
        {prefs.isLoading ? <div className="h-12 rounded-xl bg-muted animate-pulse" /> : prefs.isError ? (
          <div role="alert"><p>We could not load your reminder choice.</p><Button className="mt-2 min-h-[48px]" variant="outline" onClick={() => prefs.refetch()}>Try again</Button></div>
        ) : enabled ? (
          <>
            {reminders.isError && <p role="alert">Memory reminders could not be loaded. No saved reminders are shown. <button className="underline" onClick={() => reminders.refetch()}>Try again</button></p>}
            <p>Reminders are on. A memory from your collections may appear here, on this page only. Nothing is sent to your phone or email.</p>
            <Button data-testid="button-disable-reminders" size="lg" className="min-h-[56px] text-lg gap-2" onClick={() => setReminders(false)} disabled={setPrefs.isPending}>
              {setPrefs.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <BellOff className="w-5 h-5" aria-hidden="true" />}Disable all reminders
            </Button>
            <div aria-live="polite" className="space-y-3">
              {reminders.isLoading && !reminders.isError && <div className="h-20 rounded-xl bg-muted animate-pulse" />}
              {reminders.isError && <p role="alert">Reminders could not be loaded right now.</p>}
              {!reminders.isError && reminders.data && reminders.data.length === 0 && <p>No reminders right now.</p>}
              {!reminders.isError && !prefs.isError && reminders.data?.map((r) => (
                <Link key={r.collectionId + r.item.id} href={`/memories/${r.collectionId}`} className="block rounded-2xl border border-border bg-background p-4 hover:bg-secondary/50">
                  <p className="text-sm">From {r.collectionName}</p>
                  <p className="text-lg font-semibold">{r.item.unavailable || r.item.hidden ? "A memory" : r.item.caption || r.item.title || r.item.body?.slice(0, 120) || "A memory"}</p>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>Reminders are off. If you choose to turn them on, a memory from your collections may be shown in this page. You can turn them off at any time.</p>
            <label className="flex items-start gap-3 text-lg">
              <input data-testid="checkbox-reminder-consent" type="checkbox" className="mt-1 w-6 h-6" checked={remConsent} onChange={(e) => setRemConsent(e.target.checked)} />
              <span>Yes, I agree to see in-page reminders of my memories.</span>
            </label>
            <Button data-testid="button-enable-reminders" size="lg" className="min-h-[56px] text-lg" disabled={!remConsent || setPrefs.isPending} onClick={() => setReminders(true)}>Turn on reminders</Button>
          </>
        )}
      </section>

      <section className={card} aria-labelledby="new-h">
        <h2 id="new-h" className="font-display text-2xl font-semibold">Start a collection</h2>
        <form onSubmit={submit} className="space-y-4">
          <label className="block font-semibold">Name
            <Input data-testid="input-collection-name" className="mt-1 min-h-[48px] text-lg font-normal" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Summers at the coast" />
          </label>
          <AudiencePicker audience={aud} circleId={circleId} groupId={groupId} onAudience={(a) => { setAud(a); setConsent(false); }} onCircle={setCircleId} onGroup={setGroupId} />
          {shared && (
            <label className="flex items-start gap-3 text-lg">
              <input data-testid="checkbox-share-consent" type="checkbox" className="mt-1 w-6 h-6" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I understand this collection will be shared with the audience I chose.</span>
            </label>
          )}
          <Button data-testid="button-create-collection" type="submit" size="lg" className="min-h-[56px] text-lg gap-2" disabled={!canCreate || create.isPending}>
            {create.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" aria-hidden="true" />}Create collection
          </Button>
        </form>
      </section>

      <section aria-labelledby="mine-h" className="space-y-3">
        <h2 id="mine-h" className="font-display text-2xl font-semibold">Your collections</h2>
        {list.isLoading && [0, 1].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
        {list.isError && <div role="alert" className={card}><p>We could not load your collections.</p><Button className="min-h-[48px]" variant="outline" onClick={() => list.refetch()}>Try again</Button></div>}
        {!list.isError && list.data?.length === 0 && (
          <div className={card}><p className="text-lg">No collections yet. Start one above, then add stories, photos or recordings you have already shared.</p>
            <Link href="/" className="underline font-semibold">Create a story on Home</Link></div>
        )}
        {!list.isError && list.data?.map((c) => (
          <Link key={c.id} href={`/memories/${c.id}`} data-testid={`link-collection-${c.id}`} className="block rounded-2xl border border-border bg-card p-5 hover:bg-secondary/50 min-h-[64px]">
            <p className="font-display text-xl font-semibold">{c.name}</p>
            <p className="text-base">{c.isOwner ? "Yours" : "Shared with you"} - {audienceLabels[c.audience]}{c.sharingHeld ? " - sharing paused by a safety check" : ""}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
