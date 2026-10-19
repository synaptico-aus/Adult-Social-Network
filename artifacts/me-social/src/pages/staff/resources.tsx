import { useState } from "react"
import { Link } from "wouter"
import { useQueryClient } from "@tanstack/react-query"
import {
  useGetStaffCapabilities, useListStaffResources, getListStaffResourcesQueryKey,
  useCreateResource, useUpdateResource, usePreviewResource, useReviewResource, useRemoveResource, useCheckResource,
  useListResourceReports, getListResourceReportsQueryKey, useResolveResourceReport,
  getGetResourceQueryKey, type Resource, type ResourceInput, type ResourcePreview,
} from "@workspace/api-client-react"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { CATEGORIES, fmtDate, linkStateText } from "@/components/resources/resource-ui"

const empty: ResourceInput = { url: "", title: "", category: "article", region: "", sourceDate: null, preview: "", previewPermission: "", embedAuthorized: false }
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? "Please try again."

export default function StaffResourcesPage() {
  const caps = useGetStaffCapabilities()
  if (caps.isLoading) return <div className="h-48 rounded-3xl bg-muted animate-pulse" aria-busy="true" />
  const list = caps.data?.capabilities.filter(c => c.startsWith("education.")) ?? []
  if (caps.isError || !caps.data || list.length === 0) return (
    <div role="alert" className="rounded-3xl border border-border bg-card p-10 text-center max-w-xl mx-auto">
      <h1 className="font-display text-2xl font-semibold">Staff access required</h1>
      <p className="mt-2 text-muted-foreground">Your account does not have access to resource sources.</p>
      {caps.isError && <Button className="mt-4 h-12 rounded-xl" onClick={() => caps.refetch()}>Try again</Button>}
    </div>
  )
  return <Dashboard caps={list} />
}

function Dashboard({ caps }: { caps: string[] }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const canAuthor = caps.includes("education.author")
  const canReview = caps.includes("education.review")
  const canPublish = caps.includes("education.publish")
  const resources = useListStaffResources({ query: { queryKey: getListStaffResourcesQueryKey(), refetchInterval: 30000 } })
  const reports = useListResourceReports({ query: { queryKey: getListResourceReportsQueryKey(), refetchInterval: 30000 } })
  const create = useCreateResource()
  const update = useUpdateResource()
  const preview = usePreviewResource()
  const review = useReviewResource()
  const remove = useRemoveResource()
  const check = useCheckResource()
  const resolve = useResolveResourceReport()

  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState<ResourceInput>(empty)
  const [suggest, setSuggest] = useState<ResourcePreview | null>(null)
  const [reviewing, setReviewing] = useState<Resource | null>(null)
  const [rv, setRv] = useState({ name: "", note: "", rights: false })
  const [removing, setRemoving] = useState<Resource | null>(null)
  const [reason, setReason] = useState("")
  const [resolving, setResolving] = useState<string | null>(null)
  const [resText, setResText] = useState("")

  const refresh = (id?: string) => {
    qc.invalidateQueries({ queryKey: getListStaffResourcesQueryKey() })
    qc.invalidateQueries({ queryKey: getListResourceReportsQueryKey() })
    qc.invalidateQueries({ predicate: q => q.queryKey[0] === "/api/resources" })
    qc.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/resources/") })
    if (id) qc.invalidateQueries({ queryKey: getGetResourceQueryKey(id) })
  }
  const fail = (title: string) => (e: unknown) => toast({ title, description: errMsg(e), variant: "destructive" })

  const openEdit = (r: Resource | null) => {
    setSuggest(null)
    setForm(r ? { url: r.url, title: r.title, category: r.category as ResourceInput["category"], region: r.region, sourceDate: r.sourceDate, preview: r.preview, previewPermission: r.previewPermission, embedAuthorized: r.embedAuthorized } : empty)
    setEditing({ id: r?.id ?? null })
  }
  const save = () => {
    const data: ResourceInput = { ...form, url: form.url.trim(), title: form.title.trim(), region: form.region.trim() }
    if (data.preview.trim() && !data.previewPermission.trim()) { toast({ title: "Permission or provenance is required for a preview", variant: "destructive" }); return }
    const done = (r: Resource) => { toast({ title: "Saved as draft. Review is cleared." }); setEditing(null); refresh(r.id) }
    if (editing?.id) update.mutate({ id: editing.id, data }, { onSuccess: done, onError: fail("Could not save") })
    else create.mutate({ data }, { onSuccess: done, onError: fail("Could not create") })
  }
  const items = resources.data?.items ?? []
  const set = <K extends keyof ResourceInput>(k: K, v: ResourceInput[K]) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <PageHeader title="Resource sources" description="Add, check, review and remove external links. Public visitors only see reviewed sources." />
      <div className="flex flex-wrap gap-3 items-center">
        {canAuthor && <Button className="h-12 rounded-xl" onClick={() => openEdit(null)} data-testid="button-new-resource">Add a source</Button>}
        <Link href="/resources" className="text-primary underline">Public library</Link>
        <Link href="/staff/education" className="text-primary underline">Curriculum</Link>
        <Link href="/staff/translations" className="text-primary underline" data-testid="link-staff-translations">Translations</Link>
      </div>

      <section aria-labelledby="src-h" className="space-y-4">
        <h2 id="src-h" className="font-display text-2xl font-semibold">Sources</h2>
        {resources.isLoading ? <div className="h-40 rounded-3xl bg-muted animate-pulse" aria-busy="true" />
          : resources.isError ? <div role="alert" className="rounded-2xl border border-destructive/30 p-6">Could not load sources. <Button variant="outline" onClick={() => resources.refetch()}>Retry</Button></div>
          : items.length === 0 ? <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground" data-testid="empty-staff-resources">No sources yet.</p>
          : items.map(r => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-5 space-y-2" data-testid={`row-resource-${r.id}`}>
              <div className="flex flex-wrap gap-2 items-center text-sm font-semibold uppercase">
                <span className="px-2 py-1 rounded bg-secondary">{r.status}</span><span>{r.category}</span><span>{r.region}</span>
                {r.stale && <span className="text-destructive">Out of date</span>}
              </div>
              <h3 className="font-display text-xl font-semibold">{r.title}</h3>
              <p className="text-muted-foreground break-all">{r.domain} · {r.url}</p>
              <p className="text-sm">{linkStateText(r)}</p>
              {r.status === "reviewed" && <p className="text-sm">Reviewed by {r.reviewedBy ?? "unknown"} {fmtDate(r.reviewedAt) ? `on ${fmtDate(r.reviewedAt)}` : ""}</p>}
              {r.status === "removed" && r.removalReason && <p className="text-sm text-destructive">Removed: {r.removalReason}</p>}
              <p className="text-sm text-muted-foreground">Embed {r.embedAuthorized ? "authorised by staff" : "not authorised"}{r.embedAuthorized && !r.embedUrl ? " (no recognised provider URL)" : ""}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {canAuthor && r.status !== "removed" && <Button variant="outline" onClick={() => openEdit(r)} data-testid={`button-edit-${r.id}`}>Edit</Button>}
                <Button variant="outline" disabled={check.isPending} data-testid={`button-check-${r.id}`} onClick={() => check.mutate({ id: r.id }, { onSuccess: () => { toast({ title: "Link checked" }); refresh(r.id) }, onError: fail("Check failed") })}>Check link</Button>
                {canReview && r.status === "draft" && <Button onClick={() => { setRv({ name: "", note: "", rights: false }); setReviewing(r) }} data-testid={`button-review-${r.id}`}>Review source</Button>}
                {canPublish && r.status !== "removed" && <Button variant="destructive" onClick={() => { setReason(""); setRemoving(r) }} data-testid={`button-remove-${r.id}`}>Remove</Button>}
              </div>
            </div>
          ))}
      </section>

      <section aria-labelledby="rep-h" className="space-y-4">
        <h2 id="rep-h" className="font-display text-2xl font-semibold">Member reports</h2>
        {reports.isLoading ? <div className="h-24 rounded-2xl bg-muted animate-pulse" />
          : reports.isError ? <div role="alert">Could not load reports. <Button variant="outline" onClick={() => reports.refetch()}>Retry</Button></div>
          : (reports.data?.items ?? []).length === 0 ? <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground" data-testid="empty-reports">No reports.</p>
          : reports.data!.items.map(p => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-5 space-y-2" data-testid={`row-report-${p.id}`}>
              <p className="text-sm uppercase font-semibold">{p.status} · {fmtDate(p.createdAt)} · {items.find(i => i.id === p.resourceId)?.title ?? p.resourceId}</p>
              <p>{p.reason}</p>
              {p.resolution && <p className="text-muted-foreground">Resolution: {p.resolution}</p>}
              {canPublish && p.status === "open" && <Button variant="outline" onClick={() => { setResText(""); setResolving(p.id) }} data-testid={`button-resolve-${p.id}`}>Resolve</Button>}
            </div>
          ))}
      </section>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit source" : "Add a source"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Saving returns the source to draft and clears any review.</p>
          <div className="space-y-4">
            <div><label htmlFor="f-url" className="font-medium">URL</label>
              <div className="flex gap-2"><Input id="f-url" data-testid="input-url" maxLength={2048} value={form.url} onChange={e => set("url", e.target.value)} />
                <Button type="button" variant="outline" disabled={!form.url.trim() || preview.isPending} data-testid="button-fetch-preview" onClick={() => preview.mutate({ data: { url: form.url.trim() } }, { onSuccess: setSuggest, onError: fail("No suggestion available") })}>Fetch suggestion</Button></div></div>
            {suggest && (
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm space-y-2" data-testid="preview-suggestion">
                <p><strong>Suggested title:</strong> {suggest.title || "none"}</p>
                {suggest.title && <Button type="button" size="sm" variant="outline" onClick={() => set("title", suggest.title.slice(0, 200))}>Use title</Button>}
                <p className="text-muted-foreground">The site's own description is not copied into the preview. Write your own summary, or enter a preview only if you have permission and record where it comes from.</p>
                {suggest.sourceDate && <Button type="button" size="sm" variant="outline" onClick={() => set("sourceDate", suggest.sourceDate)}>Use date {fmtDate(suggest.sourceDate)}</Button>}
              </div>
            )}
            <div><label htmlFor="f-title" className="font-medium">Title</label><Input id="f-title" data-testid="input-title" maxLength={200} value={form.title} onChange={e => set("title", e.target.value)} /></div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label htmlFor="f-cat" className="font-medium">Category</label>
                <select id="f-cat" data-testid="select-category" className="h-10 w-full rounded-md border border-border bg-background px-2 capitalize" value={form.category} onChange={e => set("category", e.target.value as ResourceInput["category"])}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label htmlFor="f-region" className="font-medium">Region</label><Input id="f-region" data-testid="input-region" maxLength={100} value={form.region} onChange={e => set("region", e.target.value)} /></div>
              <div><label htmlFor="f-date" className="font-medium">Source date</label><Input id="f-date" type="date" data-testid="input-date" value={form.sourceDate ? form.sourceDate.slice(0, 10) : ""} onChange={e => set("sourceDate", e.target.value ? new Date(e.target.value + "T00:00:00Z").toISOString() : null)} /></div>
            </div>
            <div><label htmlFor="f-prev" className="font-medium">Preview (your own summary or permitted text, max 300)</label><Textarea id="f-prev" data-testid="input-preview" maxLength={300} value={form.preview} onChange={e => set("preview", e.target.value)} /></div>
            <div><label htmlFor="f-perm" className="font-medium">Permission or provenance for preview {form.preview.trim() && "(required)"}</label><Textarea id="f-perm" data-testid="input-permission" maxLength={500} value={form.previewPermission} onChange={e => set("previewPermission", e.target.value)} placeholder="For example: written by our team, or permission granted by the publisher on a date" /></div>
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 w-5 h-5" data-testid="checkbox-embed" checked={form.embedAuthorized} onChange={e => set("embedAuthorized", e.target.checked)} />
              <span>The provider authorises embedding. Only recognised YouTube and Spotify links can be embedded; other links open on their own site. Members still choose whether to load a player.</span></label>
            <Button className="w-full h-12 rounded-xl" disabled={!form.url.trim() || !form.title.trim() || !form.region.trim() || create.isPending || update.isPending} onClick={save} data-testid="button-save-resource">Save draft</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewing} onOpenChange={o => !o && setReviewing(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Review source</DialogTitle></DialogHeader>
          {reviewing && <div className="space-y-4">
            <p className="font-medium">{reviewing.title}</p>
            <p className="text-sm text-muted-foreground">{linkStateText(reviewing)} Review needs a recent reachable link check and a reviewer other than the last editor.</p>
            <div><label htmlFor="rv-name" className="font-medium">Reviewer name shown publicly</label><Input id="rv-name" data-testid="input-reviewer-name" maxLength={100} value={rv.name} onChange={e => setRv({ ...rv, name: e.target.value })} /></div>
            <div><label htmlFor="rv-note" className="font-medium">Review note</label><Textarea id="rv-note" data-testid="input-review-note" maxLength={1000} value={rv.note} onChange={e => setRv({ ...rv, note: e.target.value })} /></div>
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 w-5 h-5" data-testid="checkbox-rights" checked={rv.rights} onChange={e => setRv({ ...rv, rights: e.target.checked })} /><span>I confirm the preview and embed permissions are in order.</span></label>
            <Button className="w-full h-12 rounded-xl" disabled={!rv.name.trim() || !rv.note.trim() || !rv.rights || review.isPending} data-testid="button-confirm-review"
              onClick={() => review.mutate({ id: reviewing.id, data: { reviewerName: rv.name.trim(), note: rv.note.trim(), rightsConfirmed: true } }, { onSuccess: r => { toast({ title: "Source reviewed" }); setReviewing(null); refresh(r.id) }, onError: fail("Review failed") })}>Mark reviewed</Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={o => !o && setRemoving(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Remove source</DialogTitle></DialogHeader>
          {removing && <div className="space-y-4">
            <p>{removing.title}</p>
            <label htmlFor="rm-r" className="font-medium">Reason</label>
            <Textarea id="rm-r" data-testid="input-remove-reason" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
            <Button variant="destructive" className="w-full h-12 rounded-xl" disabled={!reason.trim() || remove.isPending} data-testid="button-confirm-remove"
              onClick={() => remove.mutate({ id: removing.id, data: { reason: reason.trim() } }, { onSuccess: r => { toast({ title: "Source removed" }); setRemoving(null); refresh(r.id) }, onError: fail("Remove failed") })}>Remove from library</Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolving} onOpenChange={o => !o && setResolving(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>Resolve report</DialogTitle></DialogHeader>
          <label htmlFor="rs-r" className="font-medium">What was done</label>
          <Textarea id="rs-r" data-testid="input-resolve-reason" maxLength={1000} value={resText} onChange={e => setResText(e.target.value)} />
          <Button className="w-full h-12 rounded-xl" disabled={!resText.trim() || resolve.isPending} data-testid="button-confirm-resolve"
            onClick={() => resolving && resolve.mutate({ id: resolving, data: { reason: resText.trim() } }, { onSuccess: () => { toast({ title: "Report resolved" }); setResolving(null); refresh() }, onError: fail("Resolve failed") })}>Resolve</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
