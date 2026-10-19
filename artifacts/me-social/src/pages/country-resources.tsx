import { useState } from "react";
import { Link } from "wouter";
import { ExternalLink, Phone, Siren, HeartHandshake, LifeBuoy, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCatalogue, useCountryResources, type CountryResource } from "@/lib/experience-api";
import { formatDate } from "@/lib/locale-format";

const KINDS: { kind: CountryResource["kind"]; title: string; icon: typeof Siren }[] = [
  { kind: "emergency", title: "Emergency", icon: Siren },
  { kind: "crisis", title: "Crisis support", icon: LifeBuoy },
  { kind: "dementia", title: "Dementia support", icon: HeartHandshake },
];

export default function CountryResourcesPage() {
  const cat = useCatalogue();
  const [country, setCountry] = useState("");
  const q = useCountryResources(country);
  const items = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <PageHeader title="Support by country" description="Phone lines and services we have checked for Australia, the United Kingdom and the United States. We never guess where you are: you choose the country." />
      <p role="note" className="rounded-2xl border border-border bg-secondary/40 p-4">Me is not an emergency service. We do not monitor emergencies or dispatch help. Choose the country you are physically in; your language and display time zone do not tell us where you are.</p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[14rem]">
          <label htmlFor="cr-country" className="mb-1 block text-sm font-semibold">Country</label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger id="cr-country" className="h-12 rounded-xl bg-card text-lg" data-testid="select-country"><SelectValue placeholder="Choose a country" /></SelectTrigger>
            <SelectContent>{(cat.data?.countries ?? [{ code: "AU", name: "Australia" }, { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" }]).map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Link href="/resources" className="pb-3 text-primary underline" data-testid="link-resource-library">Reviewed resource library</Link>
        <Link href="/settings/experience" className="pb-3 text-primary underline">Change my default country</Link>
      </div>

      {q.isLoading && <div className="space-y-4" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-32 animate-pulse rounded-3xl bg-muted" />)}</div>}
      {q.isError && (
        <div role="alert" className="rounded-3xl border border-destructive/30 bg-card p-8 text-center">
          <h2 className="font-display text-2xl font-semibold">We could not load this directory</h2>
          <p className="mt-2 text-muted-foreground">If you are in danger, call your local emergency number now.</p>
          <Button className="mt-4 rounded-xl" onClick={() => q.refetch()} data-testid="button-retry-country">Try again</Button>
        </div>
      )}
      {q.data && (
        <>
          <p className="rounded-2xl border border-border bg-secondary/40 p-4 text-base" data-testid="text-country-disclaimer">{q.data.disclaimer}</p>
          {items.length === 0 && <div className="rounded-3xl border border-border bg-card p-10 text-center" data-testid="empty-country"><h2 className="font-display text-2xl font-semibold">No checked entries for this country yet</h2><p className="mt-2 text-muted-foreground">We only list services staff have checked.</p></div>}
          {KINDS.map(({ kind, title, icon: Icon }) => {
            const group = items.filter(i => i.kind === kind);
            if (!group.length) return null;
            return (
              <section key={kind} aria-labelledby={`h-${kind}`} className="space-y-4">
                <h2 id={`h-${kind}`} className="flex items-center gap-3 font-display text-2xl font-semibold"><Icon className="h-6 w-6 text-primary" aria-hidden="true" />{title}</h2>
                {group.map(r => (
                  <article key={r.id} className={`rounded-3xl border bg-card p-6 shadow-sm ${kind === "emergency" ? "border-destructive/40" : "border-border"}`} data-testid={`card-country-resource-${r.id}`}>
                    <h3 className="text-xl font-semibold">{r.name}</h3>
                    {r.phone && <a href={`tel:${r.phone.replace(/[^+\d]/g, "")}`} dir="ltr" className="mt-3 inline-flex items-center gap-2 text-2xl font-bold text-primary" data-testid={`link-phone-${r.id}`}><Phone className="h-6 w-6" aria-hidden="true" />{r.phone}</a>}
                    {r.hours && <p className="mt-2 flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" aria-hidden="true" />{r.hours}{r.hoursTimeZone ? ` (${r.hoursTimeZone} time)` : ""}</p>}
                    {r.notes && <p className="mt-2">{r.notes}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline" data-testid={`link-site-${r.id}`}>Website<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
                      {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">Source<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
                      {r.checkedAt && <span className="text-muted-foreground" title={r.checkedAt}>Checked {formatDate(r.checkedAt)}</span>}
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
