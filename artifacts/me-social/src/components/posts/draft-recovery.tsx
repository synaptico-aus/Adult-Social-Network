import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, RotateCcw, Trash2, CloudUpload } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useExperience } from "@/lib/experience";
import { deleteServerDraft, getServerDraft, putServerDraft, type DraftAudience, type ServerDraft } from "@/lib/experience-api";
import { getGeneration, getMemoryDraft, hasEncryptedDraft, hasKey, isCurrent, loadEncrypted, saveEncrypted, setMemoryDraft, subscribeDraftWipe, wipeEncryptedOnly, type LocalDraft } from "@/lib/draft-store";
import { formatRelative } from "@/lib/locale-format";
import { useToast } from "@/hooks/use-toast";

export interface DraftValues { body: string; audience: string; circleId?: string | null; groupId?: string | null }

interface Props {
  values: DraftValues;
  onRestore: (d: DraftValues) => boolean | void;
  /** Increment after a successful publish/save to erase every stored copy. */
  clearTick: number;
}

type Found = { source: "tab" | "device" | "account"; draft: LocalDraft; updatedAt?: string };

/** Recoverable text drafts for the composer. Saving never publishes; restoring is always a deliberate click. */
export function DraftRecovery({ values, onRestore, clearTick }: Props) {
  const { userId, prefs, loaded } = useExperience();
  const { toast } = useToast();
  const [found, setFound] = useState<Found | null>(null);
  const [lockedDevice, setLockedDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasServer, setHasServer] = useState(false);
  const checkedFor = useRef<string | null>(null);
  const userRef = useRef(userId);
  userRef.current = userId;
  const latest = useRef(values);
  latest.current = values;
  const offlineRef = useRef(prefs.offlineDrafts);
  offlineRef.current = prefs.offlineDrafts;
  const suppress = useRef(false); // set after a clear; stops flush-on-unmount from resurrecting the draft
  const pendingRecovery = useRef(false);

  // Drop every in-React preview whenever drafts are wiped (this tab, other tabs, sign-out, account end).
  useEffect(() => subscribeDraftWipe(() => { suppress.current = true; setFound(null); setLockedDevice(false); setHasServer(false); }), []);

  // Discover drafts once per account. Every async step re-checks the captured identity and generation.
  useEffect(() => {
    if (!userId || !loaded || checkedFor.current === userId) return;
    checkedFor.current = userId;
    const uid = userId;
    const gen = getGeneration();
    const ok = () => userRef.current === uid && isCurrent(uid, gen);
    let cancelled = false;
    (async () => {
      const mem = getMemoryDraft(uid);
      if (mem && ok() && !cancelled) { pendingRecovery.current = true; setFound({ source: "tab", draft: mem }); }
      if (offlineRef.current && hasEncryptedDraft(uid)) {
        if (hasKey(uid)) {
          const d = await loadEncrypted(uid);
          if (!cancelled && ok() && d && !mem) { pendingRecovery.current = true; setFound({ source: "device", draft: d }); }
        } else if (!cancelled && ok()) setLockedDevice(true);
      }
      try {
        const r = await getServerDraft();
        if (cancelled || !ok()) return;
        if (r.draft) {
          setHasServer(true);
          pendingRecovery.current = true;
          setFound(f => f ?? { source: "account", draft: r.draft as ServerDraft, updatedAt: r.draft?.updatedAt });
        }
      } catch { /* optional feature; ignore */ }
    })();
    return () => { cancelled = true; checkedFor.current = null; };
  }, [userId, loaded]);
  useEffect(() => { if (!userId) { checkedFor.current = null; setFound(null); setLockedDevice(false); setHasServer(false); } }, [userId]);

  // In-tab copy is written synchronously on every change; only the encrypted copy is debounced.
  useEffect(() => {
    if (!userId) return;
    const uid = userId;
    if (values.body.trim()) suppress.current = false;
    const d: LocalDraft = { body: values.body, audience: values.audience, circleId: values.circleId ?? null, groupId: values.groupId ?? null };
    // Never let an empty fresh form erase a recovery the member has not yet answered.
    if (!(pendingRecovery.current && !values.body.trim())) setMemoryDraft(uid, d);
    if (!offlineRef.current || !d.body.trim()) return;
    const gen = getGeneration();
    const t = setTimeout(() => { if (userRef.current === uid && isCurrent(uid, gen)) void saveEncrypted(uid, d); }, 700);
    return () => clearTimeout(t);
  }, [userId, values.body, values.audience, values.circleId, values.groupId, prefs.offlineDrafts]);

  // Flush on unmount (route change/remount): memory already current; push the encrypted copy now, unless cleared.
  useEffect(() => () => {
    const uid = userRef.current;
    const d = latest.current;
    if (uid && !suppress.current && offlineRef.current && d.body.trim() && isCurrent(uid, getGeneration())) {
      void saveEncrypted(uid, { body: d.body, audience: d.audience, circleId: d.circleId ?? null, groupId: d.groupId ?? null });
    }
  }, []);

  const eraseAll = useCallback(async (serverToo: boolean) => {
    const uid = userRef.current;
    if (!uid) return;
    suppress.current = true;
    pendingRecovery.current = false;
    setMemoryDraft(uid, null);
    wipeEncryptedOnly(uid);
    setFound(null); setLockedDevice(false);
    if (serverToo) {
      try { await deleteServerDraft(); if (userRef.current === uid) setHasServer(false); } catch { /* retry on next discard */ }
    }
  }, []);

  const firstTick = useRef(clearTick);
  useEffect(() => {
    if (clearTick === firstTick.current) return;
    firstTick.current = clearTick;
    void eraseAll(true);
  }, [clearTick, eraseAll]);

  const saveToAccount = async () => {
    const uid = userRef.current;
    if (!uid) return;
    const gen = getGeneration();
    setBusy(true);
    try {
      await putServerDraft({ body: values.body, audience: values.audience as DraftAudience, circleId: values.circleId ?? null, groupId: values.groupId ?? null });
      if (userRef.current !== uid || !isCurrent(uid, gen)) {
        // Account changed or drafts were cleared mid-request: do not touch state or issue more requests under the new identity.
        return;
      }
      setHasServer(true);
      toast({ title: "Draft kept on your account", description: "It is not published. Only you can restore it." });
    } catch { if (userRef.current === uid) toast({ title: "Could not save the draft", variant: "destructive" }); }
    finally { if (userRef.current === uid) setBusy(false); }
  };

  if (!userId) return null;
  return (
    <div className="space-y-3" data-testid="draft-recovery">
      {found && (
        <div role="status" className="rounded-2xl border border-primary/30 bg-secondary/50 p-4" data-testid="banner-draft-found">
          <p className="font-semibold">You have an unsent draft</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Found {found.source === "tab" ? "in this tab" : found.source === "device" ? "encrypted on this device" : "saved to your account"}{found.updatedAt ? `, ${formatRelative(found.updatedAt)}` : ""}. It has not been published.
          </p>
          <p className="mt-2 line-clamp-2 text-sm italic text-foreground/80" dir="auto">{found.draft.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="rounded-xl" data-testid="button-restore-draft"
              onClick={() => { if (onRestore({ body: found.draft.body, audience: found.draft.audience, circleId: found.draft.circleId, groupId: found.draft.groupId }) === false) return; pendingRecovery.current = false; setFound(null); }}>
              <RotateCcw className="me-2 h-4 w-4" aria-hidden="true" />Restore draft
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-xl" data-testid="button-discard-draft" onClick={() => eraseAll(true)}>
              <Trash2 className="me-2 h-4 w-4" aria-hidden="true" />Discard draft
            </Button>
          </div>
        </div>
      )}
      {lockedDevice && (
        <div role="status" className="rounded-2xl border border-border bg-muted/50 p-4 text-sm" data-testid="banner-draft-locked">
          <p className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" aria-hidden="true" />An encrypted draft on this device cannot be opened</p>
          <p className="mt-1 text-muted-foreground">Its key lived only in the tab where you wrote it, so it is gone once that tab closes. You can erase the leftover data.</p>
          <Button type="button" size="sm" variant="outline" className="mt-2 rounded-xl" data-testid="button-erase-locked-draft" onClick={() => eraseAll(false)}>Erase it</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span data-testid="text-draft-mode">
          {prefs.offlineDrafts ? "Offline drafts are on: an encrypted copy stays on this device while this tab session lasts." : "Your text is kept in this tab if the network drops. Closing the tab clears it."}
        </span>
        <Link href="/settings/experience" className="underline">Draft settings</Link>
        <button type="button" onClick={saveToAccount} disabled={busy || !values.body.trim()} className="inline-flex items-center gap-1 underline disabled:opacity-50" data-testid="button-save-account-draft">
          <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />Keep text on my account
        </button>
      </div>
    </div>
  );
}
