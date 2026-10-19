import { useEffect, useState } from "react"
import { Link } from "wouter"
import { ExternalLink, ShieldCheck, AlertTriangle } from "lucide-react"
import type { Resource } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@clerk/react"
import { formatDate } from "@/lib/locale-format"

export const CATEGORIES = ["article", "news", "podcast", "music", "video", "event", "helpline", "research", "organisation"] as const

export function fmtDate(iso?: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : formatDate(d, { year: "numeric", month: "long", day: "numeric" })
}

export function linkStateText(r: Resource) {
  const when = fmtDate(r.lastCheckedAt)
  if (r.linkState === "unchecked" || !when) return "Link not checked yet. It may no longer work."
  if (r.linkState === "unavailable") return `Link was unavailable when last checked on ${when}.`
  if (r.linkState === "redirected") return `Link redirected when last checked on ${when}. The destination may differ.`
  return `Link was reachable when last checked on ${when}.`
}

export function Provenance({ r }: { r: Resource }) {
  const reviewed = r.status === "reviewed"
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 text-base space-y-2" data-testid={`provenance-${r.id}`}>
      <p className="flex items-start gap-2 font-medium">
        <ShieldCheck className="w-5 h-5 mt-0.5 text-primary shrink-0" aria-hidden="true" />
        {reviewed && r.reviewedBy
          ? `Source reviewed by ${r.reviewedBy}${fmtDate(r.reviewedAt) ? " on " + fmtDate(r.reviewedAt) : ""}.`
          : "This source has not been reviewed."}
      </p>
      <p className="text-muted-foreground">A source review does not verify every claim made on the other site. It is not clinical endorsement.</p>
      <p className={r.linkState === "reachable" && !r.stale ? "text-muted-foreground" : "text-destructive flex items-start gap-2"}>
        {(r.linkState !== "reachable" || r.stale) && <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />}
        <span>{linkStateText(r)}{r.stale ? " This review or check is out of date." : ""}</span>
      </p>
    </div>
  )
}

export function ResourceCard({ r }: { r: Resource }) {
  return (
    <article className="h-full rounded-3xl border border-border bg-card p-6 shadow-sm flex flex-col gap-3" data-testid={`card-resource-${r.id}`}>
      <div className="flex flex-wrap gap-2 text-sm font-semibold uppercase tracking-wide">
        <span className="px-3 py-1 rounded-lg bg-secondary text-secondary-foreground">{r.category}</span>
        <span className="px-3 py-1 rounded-lg border border-border">{r.region}</span>
        {r.stale && <span className="px-3 py-1 rounded-lg bg-destructive/10 text-destructive">Out of date</span>}
      </div>
      <h3 className="font-display text-2xl font-semibold"><Link href={`/resources/${r.id}`} className="hover:text-primary">{r.title}</Link></h3>
      <p className="text-muted-foreground">From {r.domain} · {fmtDate(r.sourceDate) ?? "Date not supplied"}</p>
      {r.preview && <p className="text-lg leading-relaxed">{r.preview}</p>}
      <p className="text-sm text-muted-foreground mt-auto">
        {r.reviewedBy ? `Source reviewed by ${r.reviewedBy}${fmtDate(r.reviewedAt) ? ", " + fmtDate(r.reviewedAt) : ""}. ` : ""}
        {r.linkState === "unchecked" ? "Link not checked." : r.linkState === "unavailable" ? "Link unavailable at last check." : ""}
      </p>
      <Link href={`/resources/${r.id}`} className="font-medium text-primary underline">View details</Link>
    </article>
  )
}

/** Consent is memory-only; resets when resource, URL or review changes, and on unmount. */
export function ConsentEmbed({ r }: { r: Resource }) {
  const { userId } = useAuth()
  const consentKey = JSON.stringify([r.id, r.url, r.embedUrl, r.reviewedAt, r.status, userId])
  const [consent, setConsent] = useState<string | null>(null)
  const loaded = consent === consentKey
  useEffect(() => { setConsent(null) }, [consentKey])
  const ok = r.status === "reviewed" && !!r.embedUrl
  const ext = (
    <a href={r.url} target="_blank" rel="noopener noreferrer" data-testid="link-external-source" className="inline-flex items-center gap-2 font-medium text-primary underline">
      Open on {r.domain} <ExternalLink className="w-4 h-4" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
    </a>
  )
  if (!ok) return <div>{ext}</div>
  return (
    <section aria-labelledby="embed-h" className="rounded-2xl border border-border p-5 space-y-4">
      <h2 id="embed-h" className="font-display text-xl font-semibold">Play here (optional)</h2>
      {!loaded ? (
        <>
          <p>Playing this here loads a player from another company. That company may use cookies and record that you visited. Nothing is loaded until you choose.</p>
          <Button onClick={() => setConsent(consentKey)} data-testid="button-load-embed" className="h-12 rounded-xl text-base">Load third-party player</Button>
        </>
      ) : (
        <>
          <iframe
            title={`Third-party player: ${r.title}`}
            src={r.embedUrl as string}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            className="w-full aspect-video rounded-xl border border-border"
            data-testid="iframe-embed"
          />
          <Button variant="outline" onClick={() => setConsent(null)} data-testid="button-unload-embed" className="h-12 rounded-xl text-base">Unload player and revoke consent</Button>
        </>
      )}
      <div>{ext}</div>
    </section>
  )
}
