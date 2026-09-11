import { useState } from "react";
import { useClerk, useReverification } from "@clerk/react";
import {
  initiateDeletion,
  useGetAccountSummary, useListAccountSessions, useRevokeAccountSession,
  useRevokeOtherAccountSessions, useGetDeletionStatus,
  useCancelDeletion,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/shared/page-header";

export default function AccountSecurity() {
  const { signOut, openUserProfile } = useClerk();
  const summary = useGetAccountSummary();
  const sessions = useListAccountSessions();
  const deletion = useGetDeletionStatus();
  const revoke = useRevokeAccountSession();
  const revokeOthers = useRevokeOtherAccountSessions();
  const cancel = useCancelDeletion();
  const [message, setMessage] = useState("");
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const requestDeletionWithReverification = useReverification(() => initiateDeletion({}));
  const busy = revoke.isPending || revokeOthers.isPending || isRequestingDeletion || cancel.isPending;

  const requestDeletion = async () => {
    setMessage("");
    setIsRequestingDeletion(true);
    try {
      await requestDeletionWithReverification();
      setMessage("Deletion request is pending manual processing.");
      await deletion.refetch();
    } catch {
      setMessage("Deletion was not requested. Reauthentication may have been cancelled.");
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
        <a className="ml-3 inline-flex rounded-xl border border-border px-4 py-3 font-semibold" href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`}>Open recovery sign-in</a>
      </section>
      <section className="rounded-3xl border border-destructive/30 bg-card p-8">
        <h2 className="font-display text-2xl font-semibold">Account deletion</h2>
        <p className="mt-2 text-muted-foreground">Deletion stays pending until every module’s hook and an approved worker complete. It is not represented as finished here.</p>
        <p className="mt-3">Status: <strong>{deletion.data?.status ?? "Loading…"}</strong></p>
        {deletion.data?.status === "pending" ? <button disabled={busy} onClick={() => cancel.mutate(undefined, { onSuccess: () => { setMessage("Deletion request cancelled."); deletion.refetch(); } })} className="mt-4 rounded-xl border border-border px-4 py-3">Cancel request</button> :
          <button disabled={busy} onClick={requestDeletion} className="mt-4 rounded-xl bg-destructive px-4 py-3 font-semibold text-destructive-foreground">Request deletion</button>}
      </section>
      <button onClick={() => signOut({ redirectUrl: "/" })} className="self-start rounded-xl border border-border px-4 py-3">Log out</button>
    </div>
  );
}