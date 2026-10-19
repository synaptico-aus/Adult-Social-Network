import { useState } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { errorText, errorStatus, useReviewTranslation, useStaffTranslations, type Translation } from "@/lib/experience-api";
import { statusLabel } from "@/components/translations/translation-panel";
import { formatDateTime } from "@/lib/locale-format";

const errMsg = (e: unknown) => (e as { message?: string })?.message ?? "Please try again.";

export default function StaffTranslationsPage() {
  const q = useStaffTranslations();
  const review = useReviewTranslation();
  const { toast } = useToast();
  const [active, setActive] = useState<{ id: string; action: "review" | "publish" | "remove" } | null>(null);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");

  const status = errorStatus(q.error);
  if (q.isLoading) return <div className="h-48 animate-pulse rounded-3xl bg-muted" aria-busy="true" />;
  if (q.isError) {
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-10 text-center" data-testid="staff-translations-denied">
        <h1 className="font-display text-2xl font-semibold">{status === 403 || status === 401 ? "Staff access required" : "Translations unavailable"}</h1>
        <p className="mt-2 text-muted-foreground">{status === 403 ? "Your account needs translation review access and a recent multi-factor sign-in." : "We could not load the review queue."}</p>
        <div className="mt-4 flex justify-center gap-3"><Button className="rounded-xl" onClick={() => q.refetch()} data-testid="button-retry-staff-translations">Try again</Button><Link href="/account/security" className="inline-flex h-10 items-center rounded-xl border border-border px-4">Account security</Link></div>
      </div>
    );
  }

  const all = q.data?.items ?? [];
  const items = filter === "open" ? all.filter(t => t.status === "pending" || t.status === "reviewed" || t.reports?.length) : all;

  const run = async () => {
    if (!active) return;
    try {
      await review.mutateAsync({ ...active, note: note.trim() });
      toast({ title: active.action === "review" ? "Marked reviewed" : active.action === "publish" ? "Published" : "Removed" });
      setActive(null); setNote("");
    } catch (e) { toast({ title: "Action not completed", description: errorText(e), variant: "destructive" }); }
  };

  const renderRow = (t: Translation) => (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm" data-testid={`row-translation-${t.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">{t.locale}</span>
        <span className="font-semibold" data-testid={`status-staff-translation-${t.id}`}>{statusLabel(t)}</span>
        <span className="text-muted-foreground">for {t.sourceType} {t.sourceType === "post" ? <Link href={`/posts/${t.sourceId}`} className="underline">{t.sourceId}</Link> : t.sourceId}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-base" lang={t.locale} dir="auto">{t.text}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
        <div>Submitted {formatDateTime(t.createdAt)}</div>
        {t.authorMemberId && <div>Author member: <span dir="ltr">{t.authorMemberId}</span></div>}
        {t.reviewedAt && <div>Reviewed {formatDateTime(t.reviewedAt)}{t.reviewedBy ? ` by ${t.reviewedBy}` : ""}</div>}
        {t.reviewNote && <div>Note: {t.reviewNote}</div>}
      </dl>
      {!!t.reports?.length && <section className="mt-3 rounded-xl border border-border p-3"><h3 className="font-semibold">Member reports</h3>{t.reports.map((r, i) => <p key={i} className="mt-2 whitespace-pre-wrap text-sm" dir="auto">{r.reason} <span className="text-muted-foreground">— {formatDateTime(r.createdAt)}</span></p>)}</section>}
      {t.status !== "removed" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {t.status === "pending" && <Button size="sm" className="rounded-xl" onClick={() => { setActive({ id: t.id, action: "review" }); setNote(""); }} data-testid={`button-review-${t.id}`}>Mark reviewed</Button>}
          {(t.status === "reviewed" || t.status === "pending") && <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => { setActive({ id: t.id, action: "publish" }); setNote(""); }} data-testid={`button-publish-${t.id}`}>Publish</Button>}
          <Button size="sm" variant="outline" className="rounded-xl text-destructive" onClick={() => { setActive({ id: t.id, action: "remove" }); setNote(""); }} data-testid={`button-remove-${t.id}`}>Remove</Button>
        </div>
      )}
      {active?.id === t.id && (
        <div className="mt-4 space-y-2 rounded-2xl bg-muted/50 p-4">
          <label htmlFor={`note-${t.id}`} className="text-sm font-semibold">Note for the record ({active.action}), at least 10 characters</label>
          <Textarea id={`note-${t.id}`} value={note} onChange={e => setNote(e.target.value)} minLength={10} maxLength={2000} data-testid="input-review-note" />
          <p className="text-xs text-muted-foreground">{note.trim().length}/10 minimum. The author, reviewer and publisher of a health translation must be three different people; the server will refuse a repeat.</p>
          <div className="flex gap-2"><Button size="sm" className="rounded-xl" disabled={review.isPending || note.trim().length < 10} onClick={run} data-testid="button-confirm-review">Confirm {active.action}</Button><Button size="sm" variant="outline" className="rounded-xl" onClick={() => setActive(null)}>Cancel</Button></div>
        </div>
      )}
    </article>
  );

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <PageHeader title="Translation review" description="Review and publish member-submitted translations. Health content needs a different author, reviewer and publisher, and a recent multi-factor sign-in. No text is sent to any translation service." />
      <div className="flex flex-wrap gap-3">
        <Button variant={filter === "open" ? "default" : "outline"} className="rounded-xl" onClick={() => setFilter("open")} data-testid="filter-open">Needs action</Button>
        <Button variant={filter === "all" ? "default" : "outline"} className="rounded-xl" onClick={() => setFilter("all")} data-testid="filter-all">All</Button>
        <Link href="/staff/moderation" className="self-center text-primary underline">Moderation</Link>
      </div>
      {items.length === 0 ? <div className="rounded-3xl border border-border bg-card p-10 text-center" data-testid="empty-staff-translations"><h2 className="font-display text-2xl font-semibold">Nothing waiting</h2><p className="mt-2 text-muted-foreground">Submitted translations will appear here.</p></div>
        : <div className="space-y-4" data-testid="list-staff-translations">{items.map(t => <div key={t.id}>{renderRow(t)}</div>)}</div>}
    </div>
  );
}
