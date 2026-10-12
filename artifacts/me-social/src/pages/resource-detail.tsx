import { useState } from "react"
import { Link, useParams } from "wouter"
import { useAuth } from "@clerk/react"
import { useGetResource, getGetResourceQueryKey, useReportResource } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { ConsentEmbed, Provenance, fmtDate } from "@/components/resources/resource-ui"

export default function ResourceDetail() {
  const { id = "" } = useParams<{ id: string }>()
  const { isSignedIn } = useAuth()
  const { toast } = useToast()
  const { data: r, isLoading, isError, refetch } = useGetResource(id, { query: { queryKey: getGetResourceQueryKey(id), refetchInterval: 30000, retry: false } })
  const report = useReportResource()
  const [reason, setReason] = useState("")
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const base = import.meta.env.BASE_URL.replace(/\/$/, "")

  if (isLoading) return <div className="h-72 rounded-3xl bg-muted animate-pulse" aria-busy="true" />
  if (isError || !r || r.status !== "reviewed") return (
    <div role="alert" className="rounded-3xl border border-border bg-card p-10 text-center max-w-xl mx-auto">
      <h1 className="font-display text-2xl font-semibold">This resource is not available</h1>
      <p className="mt-2 text-muted-foreground">It may have been removed or is awaiting review.</p>
      <div className="mt-4 flex gap-3 justify-center"><Button variant="outline" className="h-12 rounded-xl" onClick={() => refetch()}>Try again</Button><Link href="/resources" className="inline-flex h-12 items-center px-4 text-primary underline">Back to resources</Link></div>
    </div>
  )
  const submit = () => report.mutate({ id, data: { reason: reason.trim() } }, {
    onSuccess: () => { setSent(true); setOpen(false); setReason(""); toast({ title: "Thank you. Staff will look at this." }) },
    onError: () => toast({ title: "Report not sent", description: "Please try again.", variant: "destructive" }),
  })
  return (
    <article className="flex flex-col gap-6 max-w-3xl animate-in fade-in duration-500">
      <Link href="/resources" className="text-primary underline">All resources</Link>
      <div className="flex flex-wrap gap-2 text-sm font-semibold uppercase tracking-wide">
        <span className="px-3 py-1 rounded-lg bg-secondary text-secondary-foreground">{r.category}</span>
        <span className="px-3 py-1 rounded-lg border border-border">{r.region}</span>
      </div>
      <h1 className="font-display text-4xl font-bold" data-testid="text-resource-title">{r.title}</h1>
      <p className="text-lg text-muted-foreground">From {r.domain} · {fmtDate(r.sourceDate) ?? "Date not supplied"}</p>
      {r.preview && <p className="text-xl leading-relaxed">{r.preview}</p>}
      <Provenance r={r} />
      <ConsentEmbed r={r} />
      <section className="border-t border-border pt-6">
        <h2 className="font-display text-xl font-semibold mb-2">Something wrong with this resource?</h2>
        {!isSignedIn ? (
          <p>To report a problem, <a className="text-primary underline" href={`${base}/sign-in`} data-testid="link-signin-report">sign in</a>.</p>
        ) : sent ? <p role="status">Your report was sent.</p> : open ? (
          <div className="space-y-3">
            <label htmlFor="rep" className="block font-medium">What is the problem?</label>
            <Textarea id="rep" value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} data-testid="input-report-reason" />
            <div className="flex gap-3">
              <Button className="h-12 rounded-xl" disabled={!reason.trim() || report.isPending} onClick={submit} data-testid="button-submit-report">Send report</Button>
              <Button variant="ghost" className="h-12 rounded-xl" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        ) : <Button variant="outline" className="h-12 rounded-xl" onClick={() => setOpen(true)} data-testid="button-report">Report a problem</Button>}
      </section>
    </article>
  )
}
