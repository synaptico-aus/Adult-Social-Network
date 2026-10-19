import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useListPublicAnnouncements } from "@workspace/api-client-react";

type Region = "AU" | "GB" | "US";
const NAMES: Record<Region, string> = { AU: "Australia", GB: "United Kingdom", US: "United States" };

function List({ region }: { region: Region }) {
  const q = useListPublicAnnouncements({ region });
  if (q.isLoading) return <p role="status">Loading notices...</p>;
  if (q.isError) return <div role="alert">Notices could not be loaded. <Button variant="outline" onClick={() => q.refetch()}>Try again</Button></div>;
  if (!q.data || q.data.length === 0) return <p className="rounded-xl border border-border bg-card p-6">There are no service notices for {NAMES[region]} right now.</p>;
  return <ul className="space-y-4">{q.data.map(a => (
    <li key={a.id}><article className="rounded-2xl border border-border bg-card p-6" data-testid={`card-announcement-${a.id}`}>
      <h2 className="font-display text-2xl font-bold">{a.title}</h2>
      <p className="text-sm mt-1">Region {a.region} · Published by the Me team on <time dateTime={a.publishedAt}>{new Date(a.publishedAt).toLocaleString()}</time></p>
      <p className="mt-3 whitespace-pre-wrap text-lg">{a.body}</p>
      <p className="mt-3 text-sm">{a.sponsorshipDisclosure ? `Sponsor disclosure: ${a.sponsorshipDisclosure}` : "No sponsor is involved in this notice."}</p>
    </article></li>))}</ul>;
}

export default function AnnouncementsPage() {
  const [region, setRegion] = useState<Region | "">("");
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <PageHeader title="Service notices" description="Plain updates about how Me is running. These are not medical advice." />
      <div><label htmlFor="ann-region" className="block font-semibold mb-1">Choose your region</label>
        <select id="ann-region" className="rounded-lg border border-border bg-card px-3 min-h-11" value={region} onChange={e => setRegion(e.target.value as Region | "")} data-testid="select-region">
          <option value="">Select a region</option>{(Object.keys(NAMES) as Region[]).map(r => <option key={r} value={r}>{NAMES[r]}</option>)}</select></div>
      {region ? <List region={region} /> : <p>Select a region to see its notices.</p>}
    </div>
  );
}
