import { useQueryClient } from "@tanstack/react-query";
import { endAccountSession } from "@/lib/draft-store";
import { customFetch } from "@workspace/api-client-react";
import { useState } from "react";
import { useAuth, useClerk, useReverification } from "@clerk/react";
import {
  initiateDeletion,
  useGetAccountSummary, useListAccountSessions, useRevokeAccountSession,
  useRevokeOtherAccountSessions, useGetDeletionStatus,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/shared/page-header";
import { recoverReverificationHint } from "@/lib/reverification";

export default function AccountSecurity() {
  const { signOut, openUserProfile } = useClerk();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [manifest, setManifest] = useState<{ id: string; kind: string; status: string; downloadPath: string | null }[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dlBusy, setDlBusy] = useState<string | null>(null);
  const exportData = async () => {
    setExporting(true); setMessage("");
    try {
      const data = await customFetch<Record<string, unknown>>("/api/profile/export", { method: "GET", responseType: "json" });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "me-data-export.json"; a.click(); URL.revokeObjectURL(url);
      setManifest(Array.isArray((data as { mediaManifest?: unknown }).mediaManifest) ? (data as { mediaManifest: NonNullable<typeof manifest> }).mediaManifest : []);
      setMessage("Your data file was downloaded.");
    } catch { setMessage("Your data could not be exported. Please try again."); }
    finally { setExporting(false); }
  };
  const downloadMedia = async (m: { id: string; downloadPath: string | null }) => {
    if (!m.downloadPath) return;
    setDlBusy(m.id);
    try {
      const blob = await customFetch<Blob>(m.downloadPath, { method: "GET", responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `me-media-${m.id}`; a.click(); URL.revokeObjectURL(url);
    } catch { setMessage("That file is not available to download. Permission may have been withdrawn."); }
    finally { setDlBusy(null); }
  };
  const summary = useGetAccountSummary();
  const sessions = useListAccountSessions();
  const deletion = useGetDeletionStatus();
  const revoke = useRevokeAccountSession();
  const revokeOthers = useRevokeOtherAccountSessions();
  const [message, setMessage] = useState("");
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const requestDeletionWithReverification = useReverification(async () => {
    try { return await initiateDeletion({}); }
    catch (error) { return recoverReverificationHint(error); }
  });
  const busy = revoke.isPending || revokeOthers.isPending || isRequestingDeletion;

  const requestDeletion = async () => {
    setMessage("");
    setIsRequestingDeletion(true);
    try {
      const result = await requestDeletionWithReverification();
      // A second unsuccessful challenge must not be mistaken for acceptance.
      if (!result || !("status" in result) || result.status !== "pending") throw new Error("Deletion was not accepted");
      // Request accepted: clear local drafts and caches, then sign out (existing strategy).
      endAccountSession(userId ?? null);
      qc.clear();
      await signOut({ redirectUrl: "/" });
    } catch {
      setMessage("Deletion was not confirmed. Complete secure verification or sign in again, and check your account status before retrying.");
    } finally {
      setIsRequestingDeletion(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Account security" description="Review your account, devices, and lifecycle controls." />
      {message && <p role="status" className="rounded-xl bg-secondary p-4">{message}</p>}
      <section className="rounded-3xl border border-border bg-card p-8">
        <h2 className="font-display text-2xl font-semibold">Account summary</h2>
        {summary.isLoading ? <p>Loading…</p> : summary.isError ? <p role="alert">Unable to load account summary.</p> :
          <dl className="mt-4 grid gap-2"><div><dt className="font-semibold">Email</dt><dd>{summary.data?.emailVerified ? "Verified" : "Not verified"}</dd></div><div><dt className="font-semibold">Age eligibility</dt><dd>{summary.data?.ageEligible ? "Eligible" : "Not eligible"}</dd></div><div><dt className="font-semibold">Accepted documents</dt><dd>{summary.data?.acceptedDocuments.join(", ")}</dd></div></dl>}
      </section>
      <section className="rounded-3xl border border-border bg-card p-8">
        <h2 className="font-display text-2xl font-semibold">Devices and sessions</h2>
        {sessions.isLoading ? <p>Loading sessions…</p> : sessions.isError ? <p role="alert">Unable to load sessions.</p> :
          <ul className="mt-4 space-y-3">{sessions.data?.map((session) => <li key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"><span>{session.deviceName ?? "This device"} · {session.status}{session.isCurrent ? " (current)" : ""}</span><button disabled={busy || session.isCurrent} onClick={() => revoke.mutate({ sessionId: session.id }, { onSuccess: () => { setMessage("Session revoked."); sessions.refetch(); } })} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50">Revoke</button></li>)}</ul>}
        <button disabled={busy} onClick={() => revokeOthers.mutate(undefined, { onSuccess: () => { setMessage("Other sessions revoked."); sessions.refetch(); } })} className="mt-4 rounded-xl border border-border px-4 py-3 disabled:opacity-50">Revoke all other sessions</button>
      </section>
      <section className="rounded-3xl border border-border bg-card p-8">
        <h2 className="font-display text-2xl font-semibold">MFA and recovery</h2>
        <p className="mt-2 text-muted-foreground">Clerk issues recovery credentials and protects MFA. Me never stores recovery tokens.</p>
        <button onClick={() => openUserProfile()} className="mt-4 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">Open Clerk security settings</button>
        <a className="ms-3 inline-flex rounded-xl border border-border px-4 py-3 font-semibold" href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`}>Open recovery sign-in</a>
      </section>
      <section className="rounded-3xl border border-border bg-card p-8" aria-labelledby="h-export">
        <h2 id="h-export" className="font-display text-2xl font-semibold">Download my data</h2>
        <p className="mt-2 text-muted-foreground">Downloads a JSON file. Files are not loaded until you choose to download them.</p>
        <button disabled={exporting} onClick={exportData} className="mt-4 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground" data-testid="button-export-data">{exporting ? "Preparing..." : "Download my data"}</button>
        {manifest && (manifest.length === 0 ? <p className="mt-4">No media files are listed in this export.</p> :
          <ul className="mt-4 space-y-3" aria-label="Your media files">{manifest.map(m => <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
            <span>{m.kind} · {m.status}{m.downloadPath ? "" : " · held, details only"}</span>
            {m.downloadPath && <button disabled={dlBusy === m.id} onClick={() => downloadMedia(m)} className="rounded-lg border border-border px-3 py-2" data-testid={`button-download-media-${m.id}`}>{dlBusy === m.id ? "Downloading..." : "Download file"}</button>}</li>)}</ul>)}
      </section>
      <section className="rounded-3xl border border-destructive/30 bg-card p-8">
        <h2 className="font-display text-2xl font-semibold">Account deletion</h2>
        <p className="mt-2 text-muted-foreground">Requesting deletion starts immediately and cannot be cancelled. You will be signed out and local drafts on this device are cleared.</p>
        <p className="mt-2 text-muted-foreground">Deletion is not finished at the moment you ask. Provider records, stored files, backups and evidence handling stay pending until each step is completed and recorded. Actual backup expiry has not yet been verified; privacy staff must record it.</p>
        <p className="mt-3">Status: <strong>{deletion.data?.status ?? "Loading…"}</strong></p>
        {deletion.data?.status === "pending" ? <p className="mt-4" role="status">A deletion request is already in progress.</p> : confirmDelete ? (
          <div role="alertdialog" aria-label="Confirm account deletion" className="mt-4 rounded-xl border border-border p-4 space-y-3">
            <p className="font-semibold">Start irreversible deletion now?</p>
            <button disabled={busy} onClick={requestDeletion} className="rounded-xl bg-destructive px-4 py-3 font-semibold text-destructive-foreground" data-testid="button-confirm-deletion">Yes, delete my account</button>
            <button onClick={() => setConfirmDelete(false)} className="ms-3 rounded-xl border border-border px-4 py-3">Go back</button>
          </div>
        ) : <button disabled={busy} onClick={() => setConfirmDelete(true)} className="mt-4 rounded-xl bg-destructive px-4 py-3 font-semibold text-destructive-foreground">Request deletion</button>}
      </section>
      <button onClick={() => signOut({ redirectUrl: "/" })} className="self-start rounded-xl border border-border px-4 py-3">Log out</button>
    </div>
  );
}