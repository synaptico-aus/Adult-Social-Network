import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useGetOperationsDashboard, getGetOperationsDashboardQueryKey,
  useGetOperationsRecords, getGetOperationsRecordsQueryKey,
  useExecuteOperationsCommand,
  type OperationsCommandInput,
} from "@workspace/api-client-react";

type Section = "users" | "groups" | "access" | "coverage" | "incidents" | "security" | "launch" | "processors" | "budgets" | "deletions" | "announcements" | "audit" | "alerts";
type Field = "targetId" | "title" | "body" | "role" | "capabilities" | "groupIds" | "numericValue" | "enabled" | "region" | "validUntil" | "reference" | "status" | "requestId";
interface Def { label: string; help: string; fields: Field[]; target?: string; options?: string[]; danger?: string; required?: Field[]; titleLabel?: string }

const LAUNCH = ["privacy_legal", "age_assurance", "sustainability", "backup_restore", "rollback", "staffing"];
const DEFS: Record<string, Def> = {
  assign_role: { label: "Assign staff role", help: "Role ceiling applies on the server. Capabilities must be a subset of the role. Group scopes apply to moderator and group_manager only.", fields: ["targetId", "role", "capabilities", "groupIds"], target: "Clerk user ID", required: ["targetId", "role"] },
  review_access: { label: "Independent access review", help: "The reviewer must be a different person from the assignee (the person receiving access). Choose an expiry in the future, no more than 30 days away.", fields: ["targetId", "status", "reference", "validUntil"], target: "Access assignment ID", required: ["targetId", "validUntil"] },
  revoke_access: { label: "Revoke access", help: "Removes staff access.", fields: ["targetId"], target: "Access assignment ID", danger: "This revokes staff access immediately.", required: ["targetId"] },
  suspend_user: { label: "Suspend member", help: "Pauses posting, uploads and messages. Reading, appeals and account export stay available. This is not total account removal.", fields: ["targetId"], target: "Member ID", danger: "The member cannot post, upload or message until restored. They can still read, appeal and export.", required: ["targetId"] },
  restore_user: { label: "Restore member", help: "", fields: ["targetId"], target: "Member ID", required: ["targetId"] },
  suspend_group: { label: "Suspend group", help: "", fields: ["targetId"], target: "Group ID", danger: "Members will lose access to this group until restored.", required: ["targetId"] },
  restore_group: { label: "Restore group", help: "", fields: ["targetId"], target: "Group ID", required: ["targetId"] },
  start_shift: { label: "Start duty session", help: "Records a duty session. Heartbeats show a page is open; they do not prove moderation is happening.", fields: [] },
  heartbeat: { label: "Duty heartbeat", help: "Sent automatically every 60 seconds while a session you started here is active.", fields: ["targetId"], target: "Duty session ID", required: ["targetId"] },
  end_shift: { label: "End duty session", help: "", fields: ["targetId"], target: "Duty session ID", required: ["targetId"] },
  record_incident: { label: "Log incident", help: "Do not include private member text.", fields: ["title", "body"], required: ["title"] },
  resolve_incident: { label: "Resolve incident", help: "", fields: ["targetId"], target: "Incident ID", required: ["targetId"] },
  record_security_report: { label: "Log security report", help: "Do not include private member text.", fields: ["title", "body"], required: ["title"] },
  resolve_security_report: { label: "Resolve security report", help: "", fields: ["targetId"], target: "Security report ID", required: ["targetId"] },
  record_launch_review: { label: "Record launch review evidence", help: "This is an evidence record, not an automatic certification. Reviewed status needs region, reference and valid-until date.", fields: ["targetId", "status", "region", "reference", "validUntil"], target: "Review area", options: LAUNCH, required: ["targetId", "status"] },
  record_processor_evidence: { label: "Record processor evidence", help: "Pending means evidence is awaited. Verified additionally needs the real deletion request ID, a reference, and an evidence review expiry. This records what staff attest; the system does not independently check the provider.", fields: ["targetId", "status", "requestId", "reference", "validUntil"], target: "Processor", options: ["clerk", "storage", "database_backups", "logs"], required: ["targetId", "reference", "validUntil"] },
  set_budget: { label: "Set operating budget", help: "Budgets trigger alerts and may close gates.", fields: ["targetId", "numericValue"], target: "Budget", options: ["backlog", "urgent_age_minutes", "upload_daily_bytes", "storage_bytes", "failures_hour", "abuse_percent", "cost_usd_monthly"], required: ["targetId", "numericValue"] },
  record_cost: { label: "Record monthly cost", help: "Operator-attested month-to-date USD from a provider statement. This is not live billing and is not independently verified. It replaces the current month value for that category. Missing categories stay unknown; the actual total appears only once all three are recorded. Never enter credentials.", fields: ["targetId", "numericValue", "reference"], target: "Cost category", options: ["upload_processing", "storage", "hosting"], required: ["targetId", "numericValue", "reference"] },
  set_control: { label: "Feature control", help: "Changes real service gates for all members.", fields: ["targetId", "enabled"], target: "Feature", options: ["uploads", "video_processing", "posting", "messaging", "announcements", "analytics"], required: ["targetId", "enabled"] },
  create_announcement: { label: "Draft announcement", help: "Service notices only. No medical claims or private text. A different person must publish.", fields: ["title", "body", "region", "validUntil"], required: ["title", "body", "region", "validUntil"] },
  publish_announcement: { label: "Publish announcement", help: "Publisher must differ from the drafter.", fields: ["targetId"], target: "Announcement ID", required: ["targetId"] },
  withdraw_announcement: { label: "Withdraw announcement", help: "", fields: ["targetId"], target: "Announcement ID", danger: "The notice disappears from the public page.", required: ["targetId"] },
  retry_deletion: { label: "Retry deletion", help: "", fields: ["targetId"], target: "Deletion job ID", required: ["targetId"] },
  acknowledge_report: { label: "Acknowledge report", help: "", fields: ["targetId"], target: "Report ID", required: ["targetId"] },
  acknowledge_alert: { label: "Acknowledge alert", help: "", fields: ["targetId"], target: "Alert ID", required: ["targetId"] },
  set_staffing_hours: { label: "Set staffing hours text", help: "Describe real hours. Never claim 24/7 cover.", fields: ["title", "body", "region", "reference"], required: ["title", "region", "reference"] },
};
const SECTIONS: Section[] = ["users", "groups", "access", "coverage", "incidents", "security", "launch", "processors", "budgets", "deletions", "announcements", "audit", "alerts"];
const ROLES = ["administrator", "moderator", "education_editor", "resource_editor", "group_manager", "operations_manager", "privacy_officer"];
const pretty = (s: string) => s.replaceAll("_", " ");
const errText = (e: unknown) => (e as { data?: { error?: string }; message?: string })?.data?.error ?? (e as Error)?.message ?? "Request failed";
const csv = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
const lab = "block text-sm font-semibold mb-1";
const inp = "w-full rounded-lg border border-border bg-card px-3 py-2 min-h-11";

function CommandForm({ action, preset, onDone, onShift }: { action: string; preset: string; onDone: () => void; onShift: (id: string | null) => void }) {
  const def = DEFS[action];
  const qc = useQueryClient();
  const { toast } = useToast();
  const run = useExecuteOperationsCommand();
  const [v, setV] = useState<Record<string, string>>({ targetId: preset, status: "reviewed", enabled: "false" });
  const [confirm, setConfirm] = useState(false);
  const set = (k: string, val: string) => setV(p => ({ ...p, [k]: val }));
  const need = (def.required ?? []).filter(k => !v[k]);
  const verifiedNeeds = action === "record_processor_evidence" && v.status === "verified" && !v.requestId;
  const ok = v.reason?.trim().length >= 10 && need.length === 0 && !verifiedNeeds;

  const submit = () => {
    const d: OperationsCommandInput = { action: action as OperationsCommandInput["action"], reason: v.reason.trim() };
    if (def.fields.includes("targetId") && v.targetId) d.targetId = v.targetId.trim();
    if (def.fields.includes("title") && v.title) d.title = v.title;
    if (def.fields.includes("body") && v.body) d.body = v.body;
    if (def.fields.includes("role") && v.role) d.role = v.role as OperationsCommandInput["role"];
    if (def.fields.includes("capabilities") && v.capabilities) d.capabilities = csv(v.capabilities);
    if (def.fields.includes("groupIds") && v.groupIds) d.groupIds = csv(v.groupIds);
    if (def.fields.includes("numericValue") && v.numericValue) d.numericValue = Number(v.numericValue);
    if (def.fields.includes("enabled")) d.enabled = v.enabled === "true";
    if (def.fields.includes("region") && v.region) d.region = v.region as OperationsCommandInput["region"];
    if (def.fields.includes("validUntil") && v.validUntil) d.validUntil = new Date(v.validUntil).toISOString();
    if (def.fields.includes("reference") && v.reference) d.reference = v.reference;
    if (def.fields.includes("requestId") && v.requestId) d.requestId = v.requestId.trim();
    if (def.fields.includes("status") && v.status) d.status = v.status as OperationsCommandInput["status"];
    run.mutate({ data: d }, {
      onSuccess: (r) => {
        if (action === "start_shift") onShift(r.id);
        if (action === "end_shift") onShift(null);
        toast({ title: `${def.label}: ${r.status}` });
        qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/staff/ops") });
        onDone();
      },
      onError: (e) => toast({ title: "Not completed", description: errText(e), variant: "destructive" }),
    });
  };
  const shutting = action === "set_control" && v.enabled === "false";
  const needsConfirm = !!def.danger || shutting;
  const id = (k: string) => `ops-${action}-${k}`;

  return (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!ok) return; needsConfirm ? setConfirm(true) : submit(); }} aria-label={def.label} data-testid={`form-${action}`}>
      <h3 className="font-display text-xl font-bold">{def.label}</h3>
      {def.help && <p className="text-sm">{def.help}</p>}
      {def.fields.includes("targetId") && (<div><label className={lab} htmlFor={id("t")}>{def.target} (required)</label>
        {def.options ? <select id={id("t")} className={inp} value={v.targetId} onChange={e => set("targetId", e.target.value)}><option value="">Choose</option>{def.options.map(o => <option key={o} value={o}>{pretty(o)}</option>)}</select>
          : <input id={id("t")} className={inp} value={v.targetId} onChange={e => set("targetId", e.target.value)} />}</div>)}
      {def.fields.includes("title") && <div><label className={lab} htmlFor={id("title")}>Title</label><Input id={id("title")} maxLength={180} value={v.title ?? ""} onChange={e => set("title", e.target.value)} /></div>}
      {def.fields.includes("body") && <div><label className={lab} htmlFor={id("body")}>Details (no private member text)</label><Textarea id={id("body")} maxLength={5000} value={v.body ?? ""} onChange={e => set("body", e.target.value)} /></div>}
      {def.fields.includes("role") && <div><label className={lab} htmlFor={id("role")}>Role</label><select id={id("role")} className={inp} value={v.role ?? ""} onChange={e => set("role", e.target.value)}><option value="">Choose</option>{ROLES.map(o => <option key={o} value={o}>{pretty(o)}</option>)}</select></div>}
      {def.fields.includes("capabilities") && <div><label className={lab} htmlFor={id("cap")}>Capabilities, comma separated (optional subset)</label><Input id={id("cap")} value={v.capabilities ?? ""} onChange={e => set("capabilities", e.target.value)} /></div>}
      {def.fields.includes("groupIds") && <div><label className={lab} htmlFor={id("g")}>Group IDs scope, comma separated (moderator and group manager only)</label><Input id={id("g")} value={v.groupIds ?? ""} onChange={e => set("groupIds", e.target.value)} /></div>}
      {def.fields.includes("numericValue") && <div><label className={lab} htmlFor={id("n")}>Value (0 or more)</label><Input id={id("n")} type="number" min={0} value={v.numericValue ?? ""} onChange={e => set("numericValue", e.target.value)} /></div>}
      {def.fields.includes("enabled") && <fieldset><legend className={lab}>State</legend><div className="flex gap-6">{["true", "false"].map(x => <label key={x} className="flex items-center gap-2 min-h-11"><input type="radio" name={id("en")} checked={v.enabled === x} onChange={() => set("enabled", x)} />{x === "true" ? "On" : "Off (shut down)"}</label>)}</div></fieldset>}
      {def.fields.includes("status") && <div><label className={lab} htmlFor={id("s")}>Status</label><select id={id("s")} className={inp} value={v.status} onChange={e => set("status", e.target.value)}>{["pending", "reviewed", "blocked", "verified"].map(o => <option key={o} value={o}>{o}</option>)}</select></div>}
      {def.fields.includes("region") && <div><label className={lab} htmlFor={id("r")}>Region</label><select id={id("r")} className={inp} value={v.region ?? ""} onChange={e => set("region", e.target.value)}><option value="">Choose</option>{["AU", "GB", "US"].map(o => <option key={o}>{o}</option>)}</select></div>}
      {def.fields.includes("requestId") && <div><label className={lab} htmlFor={id("rq")}>Deletion request ID {v.status === "verified" ? "(required for verified)" : "(needed only for verified)"}</label><Input id={id("rq")} value={v.requestId ?? ""} onChange={e => set("requestId", e.target.value)} /></div>}
      {def.fields.includes("reference") && <div><label className={lab} htmlFor={id("ref")}>Evidence reference</label><Input id={id("ref")} maxLength={400} value={v.reference ?? ""} onChange={e => set("reference", e.target.value)} /></div>}
      {def.fields.includes("validUntil") && <div><label className={lab} htmlFor={id("vu")}>Valid until</label><input id={id("vu")} type="datetime-local" className={inp} value={v.validUntil ?? ""} onChange={e => set("validUntil", e.target.value)} /></div>}
      <div><label className={lab} htmlFor={id("reason")}>Reason for the audit log (at least 10 characters)</label><Textarea id={id("reason")} minLength={10} maxLength={2000} value={v.reason ?? ""} onChange={e => set("reason", e.target.value)} /></div>
      <Button type="submit" disabled={!ok || run.isPending} className="min-h-11" data-testid={`button-submit-${action}`}>{run.isPending ? "Working..." : def.label}</Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm: {def.label}</AlertDialogTitle>
          <AlertDialogDescription>{def.danger ?? "This turns the feature off for all members straight away."} Target: {v.targetId || "none"}.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Go back</AlertDialogCancel><AlertDialogAction onClick={submit}>Yes, continue</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function Records({ section, onPick }: { section: Section; onPick: (a: string, id: string) => void }) {
  const q = useGetOperationsRecords(section, { query: { queryKey: getGetOperationsRecordsQueryKey(section) } });
  const forbidden = (q.error as { status?: number } | null)?.status === 403;
  if (q.isLoading) return <div role="status" className="p-6">Loading {section} records...</div>;
  if (forbidden) return <p role="alert" className="p-6">You are not authorised for this section.</p>;
  if (q.isError || !q.data) return <div role="alert" className="p-6">Could not load records. <Button variant="outline" onClick={() => q.refetch()}>Try again</Button></div>;
  const d = q.data;
  return (
    <div className="space-y-4">
      {d.allowedActions.filter(a => DEFS[a]).length > 0 && <div className="flex flex-wrap gap-2" role="group" aria-label="Actions you may take in this section">
        {d.allowedActions.filter(a => DEFS[a]).map(a => <Button key={a} variant="outline" onClick={() => onPick(a, "")} data-testid={`button-action-${a}`}>{DEFS[a].label}</Button>)}</div>}
      {d.items.length === 0 ? <p className="rounded-xl border border-border bg-card p-6">No records in this section yet.</p> :
        <ul className="space-y-3">{d.items.map(r => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-4" data-testid={`row-record-${r.id}`}>
            <div className="flex flex-wrap justify-between gap-2"><strong>{r.title}</strong><span className="text-xs uppercase font-semibold">{r.status}</span></div>
            <p className="text-sm mt-1">{r.summary}</p>
            <p className="text-xs mt-1">ID {r.id} · <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time></p>
            <div className="mt-2 flex flex-wrap gap-2">{r.actions.filter(a => DEFS[a]).map(a => <Button key={a} size="sm" variant="secondary" onClick={() => onPick(a, r.id)}>{DEFS[a].label}</Button>)}</div>
          </li>))}</ul>}
    </div>
  );
}

export default function StaffOperationsPage() {
  const dash = useGetOperationsDashboard({ query: { queryKey: getGetOperationsDashboardQueryKey(), retry: false } });
  const hb = useExecuteOperationsCommand();
  const hbRef = useRef(hb.mutate);
  hbRef.current = hb.mutate;
  const [section, setSection] = useState<Section | null>(null);
  const [form, setForm] = useState<{ action: string; id: string } | null>(null);
  const [session, setSession] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const t = window.setInterval(() => hbRef.current({ data: { action: "heartbeat", targetId: session, reason: "Scheduled duty session heartbeat" } }), 60000);
    return () => window.clearInterval(t);
  }, [session]);

  const allowedSections = SECTIONS.filter(x => dash.data?.modules.some(m => m.key === x) || (x === "coverage" && dash.data?.role === "moderator"));
  const wanted = new URLSearchParams(window.location.search).get("section") as Section | null;
  const active: Section | null = section && allowedSections.includes(section) ? section : wanted && allowedSections.includes(wanted) ? wanted : allowedSections[0] ?? null;
  const status = (dash.error as { status?: number } | null)?.status;
  if (dash.isLoading) return <div className="max-w-5xl mx-auto"><PageHeader title="Operations" /><div role="status" className="p-10 text-center"><Loader2 className="mx-auto animate-spin" /></div></div>;
  if (dash.isError || !dash.data) return (
    <div className="max-w-3xl mx-auto"><PageHeader title="Operations" />
      <div role="alert" className="rounded-2xl border border-border bg-card p-8 text-center">
        <ShieldCheck className="mx-auto mb-3" />
        <p>{status === 403 ? "Staff permission and fresh multi-factor sign-in are required." : "Operations could not be loaded."}</p>
        {status !== 403 && <Button className="mt-4" onClick={() => dash.refetch()}>Try again</Button>}
      </div></div>);
  const d = dash.data;
  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <PageHeader title="Operations" description="Service status, controls and evidence records. The server decides what you may do." />
      <div role="note" className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
        <p><strong>Not approved for production.</strong> No 24/7 staffing is confirmed. Legal, age, backup and other reviews here are evidence records, not automatic certifications. Metrics shown as unknown have no data yet.</p>
        <p>{d.staffingNotice}</p>
        <p>Role: <strong>{pretty(d.role)}</strong> · Updated <time dateTime={d.updatedAt}>{new Date(d.updatedAt).toLocaleString()}</time></p>
      </div>
      {session && <div role="status" className="rounded-xl border border-border bg-card p-4 text-sm">Duty session {session} is open; a heartbeat is sent every 60 seconds while this page stays open. This does not prove active moderation.</div>}

      <nav aria-label="Staff tools"><ul className="flex flex-wrap gap-2">
        {d.modules.filter(m => m.path.startsWith("/")).map(m => <li key={m.key}><Link href={m.path} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 font-semibold" data-testid={`link-module-${m.key}`}>{m.label}</Link></li>)}
      </ul></nav>

      <section aria-labelledby="h-metrics"><h2 id="h-metrics" className="font-display text-2xl font-bold mb-3">Metrics</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{d.metrics.map(m => (
          <div key={m.key} className="rounded-xl border border-border bg-card p-4"><dt className="text-sm font-semibold">{m.label}</dt>
            <dd className="text-2xl font-display font-bold">{m.value === null ? "Unknown" : `${m.value} ${m.unit}`}</dd><dd className="text-xs">{m.note}</dd></div>))}</dl></section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="h-feat"><h2 id="h-feat" className="font-display text-2xl font-bold mb-3">Feature gates</h2>
          <ul className="space-y-2">{d.features.map(f => <li key={f.key} className="rounded-xl border border-border bg-card p-3 text-sm"><strong>{pretty(f.key)}</strong>: {f.enabled ? "On" : "Off"} <span className="block">{f.reason}</span></li>)}</ul></section>
        <section aria-labelledby="h-chk"><h2 id="h-chk" className="font-display text-2xl font-bold mb-3">Checks</h2>
          <ul className="space-y-2">{d.checks.map(c => <li key={c.key} className="rounded-xl border border-border bg-card p-3 text-sm"><strong>{pretty(c.key)}</strong>: {c.status}<span className="block">{c.note}</span></li>)}</ul></section>
      </div>

      <section aria-labelledby="h-rec"><h2 id="h-rec" className="font-display text-2xl font-bold mb-3">Records and actions</h2>
        <div role="group" aria-label="Record sections" className="flex flex-wrap gap-2 mb-4">
          {SECTIONS.map(s => <Button key={s} variant={s === section ? "default" : "outline"} aria-pressed={s === active} onClick={() => { setSection(s); setForm(null); }} data-testid={`button-section-${s}`}>{s}</Button>)}</div>
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          {active ? <Records key={active} section={active} onPick={(a, id) => setForm({ action: a, id })} /> : <p className="rounded-xl border border-border bg-card p-6">No record sections are available for your role.</p>}
          {form && DEFS[form.action] && <aside className="rounded-2xl border border-border bg-card p-5 h-fit" aria-label="Action form">
            <CommandForm key={form.action + form.id} action={form.action} preset={form.id} onDone={() => setForm(null)} onShift={setSession} />
            <Button variant="ghost" className="mt-3" onClick={() => setForm(null)}>Cancel</Button></aside>}
        </div>
      </section>
    </div>
  );
}
