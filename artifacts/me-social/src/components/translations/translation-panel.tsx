import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { Languages, ShieldCheck, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { errorText, useCatalogue, useProposeTranslation, useReportTranslation, useTranslations, type Translation } from "@/lib/experience-api";
import { formatDate } from "@/lib/locale-format";

export function statusLabel(t: Pick<Translation, "status" | "machineTranslated">) {
  const origin = t.machineTranslated ? "Machine translated" : "Human translated";
  const state = t.status === "published" ? "Approved" : t.status === "reviewed" ? "Reviewed, awaiting publication" : t.status === "pending" ? "Pending review" : "Removed";
  return `${origin} - ${state}`;
}

/** Original text is always shown by the parent. Translations here are supplied by people; Me never calls a translation provider. */
export function TranslationPanel({ sourceType, sourceId, testKey }: { sourceType: "post" | "lesson"; sourceId: string; testKey?: string }) {
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const list = useTranslations(sourceType, sourceId, open && !!isSignedIn);
  const cat = useCatalogue(open && !!isSignedIn);
  const propose = useProposeTranslation(sourceType, sourceId);
  const report = useReportTranslation();
  const [form, setForm] = useState<{ locale: string; text: string; machine: boolean; rights: boolean; correctionOf?: string; lockMachine?: boolean } | null>(null);
  const [reporting, setReporting] = useState<{ id: string; reason: string } | null>(null);
  const id = testKey ?? `${sourceType}-${sourceId}`;
  useEffect(() => {
    if (list.isError) { setForm(null); setReporting(null); }
  }, [list.isError]);
  if (!isSignedIn) return null;

  const items = (list.isError ? [] : list.data?.items ?? []).filter(t => t.status !== "removed");
  const submit = async () => {
    if (!form || !form.text.trim() || !form.locale || !form.rights) return;
    try {
      await propose.mutateAsync({ locale: form.locale, text: form.text.trim(), machineTranslated: form.machine, rightsConfirmed: true, correctionOf: form.correctionOf });
      toast({ title: "Translation sent for review", description: "It stays pending and is only visible to you and reviewers until approved." });
      setForm(null);
    } catch (e) { toast({ title: "Could not send translation", description: errorText(e), variant: "destructive" }); }
  };
  const sendReport = async () => {
    if (!reporting || !reporting.reason.trim()) return;
    try { await report.mutateAsync({ id: reporting.id, reason: reporting.reason.trim() }); toast({ title: "Report sent", description: "A reviewer will check this translation." }); setReporting(null); }
    catch (e) { toast({ title: "Could not send report", description: errorText(e), variant: "destructive" }); }
  };

  return (
    <div className="mt-3 border-t border-border/60 pt-3" data-testid={`translations-${id}`}>
      <Button type="button" variant="ghost" size="sm" className="rounded-xl gap-2" aria-expanded={open} onClick={() => setOpen(o => !o)} data-testid={`button-translations-${id}`}>
        <Languages className="h-4 w-4" aria-hidden="true" />Translations
      </Button>
      {open && (
        <div className="mt-2 space-y-3 rounded-2xl bg-muted/40 p-4 text-sm">
          <p className="text-muted-foreground">The original above is the source of truth. Translations are written by members and only shown once staff have approved them. Nothing here is sent to an automatic translation service.</p>
          {list.isLoading && <div className="h-12 animate-pulse rounded-xl bg-muted" aria-busy="true" />}
          {list.isError && <div role="alert">Translations could not be loaded. <button className="underline" onClick={() => list.refetch()}>Try again</button></div>}
          {!list.isError && list.data && items.length === 0 && <p data-testid={`empty-translations-${id}`}>No translations yet.</p>}
          {items.map(t => (
            <div key={t.id} className="rounded-xl border border-border bg-card p-3" data-testid={`translation-${t.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">{t.locale}</span>
                <span className={t.machineTranslated ? "font-semibold text-destructive" : "font-semibold"} data-testid={`status-translation-${t.id}`}>{statusLabel(t)}</span>
                {t.status === "published" && t.reviewedAt && <span className="inline-flex items-center gap-1 text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Reviewed {formatDate(t.reviewedAt)}{t.reviewedBy ? ` by ${t.reviewedBy}` : ""}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-base" lang={t.locale} dir="auto">{t.text}</p>
              <div className="mt-2 flex gap-3 text-xs">
                <button className="underline" onClick={() => setForm({ locale: t.locale, text: t.text, machine: t.machineTranslated, rights: false, correctionOf: t.id, lockMachine: t.machineTranslated })} data-testid={`button-correct-translation-${t.id}`}>Suggest a correction</button>
                <button className="inline-flex items-center gap-1 underline" onClick={() => setReporting({ id: t.id, reason: "" })} data-testid={`button-report-translation-${t.id}`}><Flag className="h-3 w-3" aria-hidden="true" />Report</button>
              </div>
              {reporting?.id === t.id && (
                <div className="mt-2 space-y-2">
                  <label className="text-xs font-semibold" htmlFor={`rr-${t.id}`}>What is wrong with this translation?</label>
                  <Textarea id={`rr-${t.id}`} value={reporting.reason} onChange={e => setReporting({ id: t.id, reason: e.target.value })} data-testid={`input-report-reason-${t.id}`} />
                  <div className="flex gap-2"><Button size="sm" className="rounded-xl" disabled={report.isPending || !reporting.reason.trim()} onClick={sendReport} data-testid={`button-send-report-${t.id}`}>Send report</Button><Button size="sm" variant="outline" className="rounded-xl" onClick={() => setReporting(null)}>Cancel</Button></div>
                </div>
              )}
            </div>
          ))}
          {!form ? (
            <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => setForm({ locale: "", text: "", machine: false, rights: false })} data-testid={`button-propose-translation-${id}`}>Offer a translation</Button>
          ) : (
            <div className="space-y-3 rounded-xl border border-border bg-card p-3">
              <p className="font-semibold">{form.correctionOf ? "Suggest a correction" : "Offer a translation"}</p>
              <Select value={form.locale} onValueChange={v => setForm({ ...form, locale: v })} disabled={!!form.correctionOf}>
                <SelectTrigger aria-label="Translation language" data-testid="select-translation-locale"><SelectValue placeholder="Language" /></SelectTrigger>
                <SelectContent>{(cat.data?.locales ?? []).filter(l => l.enabled).map(l => <SelectItem key={l.code} value={l.code}>{l.label} ({l.code})</SelectItem>)}</SelectContent>
              </Select>
              <label className="sr-only" htmlFor={`tt-${id}`}>Translated text</label>
              <Textarea id={`tt-${id}`} rows={5} value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} dir="auto" placeholder="Type or paste the translation yourself" data-testid="input-translation-text" />
              <label className="flex items-start gap-2"><Checkbox checked={form.machine} disabled={form.lockMachine} onCheckedChange={c => setForm({ ...form, machine: c === true })} data-testid="checkbox-machine-translated" /><span>{form.lockMachine ? "The text being corrected was machine translated, so this correction keeps that label until staff review it." : "This text came from a machine translation tool I used myself. It will be labelled as machine translated."}</span></label>
              <label className="flex items-start gap-2"><Checkbox checked={form.rights} onCheckedChange={c => setForm({ ...form, rights: c === true })} data-testid="checkbox-rights-confirmed" /><span>I have permission to submit this translation, and I understand it will be reviewed by people who are permitted to see the original.</span></label>
              <p className="text-xs text-muted-foreground">Only originals that are currently published and that you may see can be translated, and the translation applies to the text as it is now. If the original changes, it will need a new translation.</p>
              <div className="flex gap-2"><Button size="sm" className="rounded-xl" disabled={propose.isPending || !form.text.trim() || !form.locale || !form.rights} onClick={submit} data-testid="button-submit-translation">Send for review</Button><Button size="sm" variant="outline" className="rounded-xl" onClick={() => setForm(null)}>Cancel</Button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
