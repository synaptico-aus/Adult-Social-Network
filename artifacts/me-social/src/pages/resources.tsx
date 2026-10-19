import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Link } from "wouter"
import { useListResources, getListResourcesQueryKey } from "@workspace/api-client-react"
import { PageHeader } from "@/components/shared/page-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CATEGORIES, ResourceCard } from "@/components/resources/resource-ui"

export default function ResourcesPage() {
  const [q, setQ] = useState("")
  const [dq, setDq] = useState("")
  const [category, setCategory] = useState("")
  const [region, setRegion] = useState("")
  const [dr, setDr] = useState("")
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setDr(region.trim()) }, 300); return () => clearTimeout(t) }, [q, region])
  const params = { q: dq || undefined, category: category || undefined, region: dr || undefined }
  const { data, isLoading, isError, refetch } = useListResources(params, { query: { queryKey: getListResourcesQueryKey(params), refetchInterval: 30000 } })
  const items = data?.items ?? []
  const filtered = !!(dq || category || dr)
  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <PageHeader title="Resources from elsewhere" description="Links to other organisations, chosen and checked by our staff. We show who reviewed each source and when. Reviewing a source does not mean we have verified everything on it, and none of it is medical advice." />
      <Link href="/country-resources" className="inline-flex w-fit items-center rounded-xl border border-border bg-card px-4 py-3 font-semibold text-primary underline" data-testid="link-country-resources">Emergency and dementia support by country</Link>
      <div className="grid gap-4 md:grid-cols-[1fr_14rem_12rem]">
        <div className="relative">
          <label htmlFor="res-q" className="sr-only">Search resources</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <Input id="res-q" type="search" data-testid="input-resource-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by title or topic" className="ps-10 h-12 text-lg rounded-2xl bg-card" />
        </div>
        <div>
          <label htmlFor="res-cat" className="sr-only">Category</label>
          <select id="res-cat" data-testid="select-resource-category" value={category} onChange={e => setCategory(e.target.value)} className="h-12 w-full rounded-2xl border border-border bg-card px-3 text-lg capitalize">
            <option value="">All types</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="res-region" className="sr-only">Region</label>
          <Input id="res-region" data-testid="input-resource-region" value={region} onChange={e => setRegion(e.target.value)} placeholder="Region" className="h-12 text-lg rounded-2xl bg-card" />
        </div>
      </div>
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2" aria-busy="true" aria-label="Loading resources">{[0, 1, 2, 3].map(i => <div key={i} className="h-56 rounded-3xl bg-muted animate-pulse" />)}</div>
      ) : isError ? (
        <div role="alert" className="rounded-3xl border border-destructive/30 bg-card p-10 text-center">
          <h2 className="font-display text-2xl font-semibold">We could not load resources</h2>
          <Button className="mt-4 h-12 rounded-xl" onClick={() => refetch()} data-testid="button-retry-resources">Try again</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center max-w-2xl mx-auto" data-testid="empty-resources">
          <h2 className="font-display text-2xl font-semibold mb-2">{filtered ? "Nothing matches your search" : "No reviewed resources yet"}</h2>
          <p className="text-lg text-muted-foreground">{filtered ? "Try fewer words or another type." : "Staff add a link only after reviewing the source. Please check back later."}</p>
          {filtered && <Button variant="secondary" className="mt-4 h-12 rounded-xl" onClick={() => { setQ(""); setRegion(""); setCategory("") }}>Clear filters</Button>}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2" data-testid="list-resources">{items.map(r => <ResourceCard key={r.id} r={r} />)}</div>
      )}
    </div>
  )
}
