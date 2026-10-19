import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Globe2, Clock, Image as ImageIcon, FileText, HardDrive, LifeBuoy, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useExperience } from "@/lib/experience";
import { errorText, useCatalogue, type Direction, type ExperiencePrefs } from "@/lib/experience-api";
import { wipeDrafts } from "@/lib/draft-store";
import { formatDateTime, formatDate } from "@/lib/locale-format";
import { useGetNotificationPreferences, useUpdateNotificationPreferences, getGetNotificationPreferencesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function Section({ icon, title, children, id }: { icon: ReactNode; title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <h2 id={id} className="mb-4 flex items-center gap-3 font-display text-xl font-semibold"><span className="text-primary" aria-hidden="true">{icon}</span>{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({ id, label, help, checked, onChange, disabled }: { id: string; label: string; help: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-4">
      <div><label htmlFor={id} className="font-semibold">{label}</label><p className="mt-1 text-sm text-muted-foreground">{help}</p></div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} data-testid={`switch-${id}`} />
    </div>
  );
}

function timeZones(): string[] {
  try { const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf; if (f) return f("timeZone"); } catch { /* fall through */ }
  return ["Australia/Sydney", "Australia/Melbourne", "Australia/Perth", "Europe/London", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC"];
}

export default function SettingsExperiencePage() {
  const { prefs, update, saving, loaded, userId, loadError, retryPreferences } = useExperience();
  const cat = useCatalogue();
  const { toast } = useToast();
  const qc = useQueryClient();
  const notif = useGetNotificationPreferences({ query: { queryKey: getGetNotificationPreferencesQueryKey() } });
  const updateNotif = useUpdateNotificationPreferences();
  const [tz, setTz] = useState(prefs.timeZone);
  useEffect(() => setTz(prefs.timeZone), [prefs.timeZone]);
  const zones = useMemo(timeZones, []);
  const deviceTz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } }, []);

  const save = async (patch: Partial<ExperiencePrefs>, ok = "Saved") => {
    try { await update(patch); toast({ title: ok }); }
    catch (e) { toast({ title: "Could not save", description: errorText(e), variant: "destructive" }); }
  };
  const tzValid = (() => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } })();

  const syncQuiet = async () => {
    try {
      await updateNotif.mutateAsync({ data: { quietHoursTimezone: prefs.timeZone } });
      qc.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
      toast({ title: "Quiet hours now use this time zone" });
    } catch { toast({ title: "Could not update quiet hours", variant: "destructive" }); }
  };

  const locales = cat.data?.locales ?? [];
  const enabled = locales.filter(l => l.enabled);
  const unavailable = locales.filter(l => !l.enabled);
  const quietTz = (notif.data as { quietHoursTimezone?: string | null } | undefined)?.quietHoursTimezone;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <PageHeader title="Language, region and data" description="Choose how Me looks, reads and loads. These settings belong to your account." />
      {loadError ? <div role="alert" className="rounded-3xl border border-border p-5"><p>Your saved settings could not be loaded. Media stays text-first until this is resolved.</p><Button className="mt-3" variant="outline" onClick={retryPreferences}>Try again</Button></div> : !loaded && <div className="h-40 animate-pulse rounded-3xl bg-muted" aria-busy="true" />}
      <Section id="s-lang" icon={<Globe2 className="h-6 w-6" />} title="Language and region">
        <div>
          <label htmlFor="sel-locale" className="mb-1 block font-semibold">Date and number style</label>
          <Select value={prefs.locale} onValueChange={v => save({ locale: v })} disabled={cat.isLoading}>
            <SelectTrigger id="sel-locale" className="h-12 rounded-xl" data-testid="select-locale"><SelectValue /></SelectTrigger>
            <SelectContent>{(enabled.length ? enabled : [{ code: "en-AU", label: "English (Australia)" }, { code: "en-GB", label: "English (United Kingdom)" }, { code: "en-US", label: "English (United States)" }]).map(l => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
          </Select>
          <p className="mt-2 text-sm text-muted-foreground">All three options use the same English wording and the same English safety review. Dates and times change style only. Today looks like: <span data-testid="text-date-sample">{formatDate(new Date(), { dateStyle: "full" })}</span></p>
        </div>
        {cat.isError && <p role="alert" className="text-sm">The language list could not be loaded. <button className="underline" onClick={() => cat.refetch()}>Try again</button></p>}
        {unavailable.length > 0 && (
          <div data-testid="list-unavailable-locales">
            <h3 className="font-semibold">Not available yet</h3>
            <p className="text-sm text-muted-foreground">A language is switched on only after independent review of the wording and of our safety checks for it. Until then it is listed here but cannot be chosen.</p>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {unavailable.map(l => (
                <li key={l.code} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-testid={`locale-unavailable-${l.code}`}>
                  <span className="font-semibold">{l.label} <span className="font-normal text-muted-foreground" dir="ltr">({l.code})</span></span>
                  <span className="text-muted-foreground">Unavailable{l.reviewNote ? `: ${l.reviewNote}` : ": awaiting independent review"}{l.moderationCoverage ? ` Safety coverage: ${l.moderationCoverage}.` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <label htmlFor="sel-country" className="mb-1 block font-semibold">Country for support directory</label>
          <Select value={prefs.country} onValueChange={v => save({ country: v })}>
            <SelectTrigger id="sel-country" className="h-12 rounded-xl" data-testid="select-pref-country"><SelectValue /></SelectTrigger>
            <SelectContent>{(cat.data?.countries ?? [{ code: "AU", name: "Australia" }]).map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="mt-2 text-sm text-muted-foreground">We never work out your location. <Link href="/country-resources" className="underline">Open the support directory</Link>.</p>
        </div>
      </Section>

      <Section id="s-tz" icon={<Clock className="h-6 w-6" />} title="Time zone">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="in-tz" className="mb-1 block font-semibold">Time zone</label>
            <Input id="in-tz" list="tz-list" value={tz} onChange={e => setTz(e.target.value)} dir="ltr" className="h-12 rounded-xl" aria-invalid={!tzValid} data-testid="input-timezone" />
            <datalist id="tz-list">{zones.map(z => <option key={z} value={z} />)}</datalist>
            {!tzValid && <p role="alert" className="mt-1 text-sm text-destructive">That is not a recognised time zone, for example Australia/Sydney.</p>}
          </div>
          <Button className="h-12 rounded-xl" disabled={!tzValid || tz === prefs.timeZone || saving} onClick={() => save({ timeZone: tz })} data-testid="button-save-timezone">Save</Button>
          {deviceTz && deviceTz !== prefs.timeZone && <Button variant="outline" className="h-12 rounded-xl" onClick={() => setTz(deviceTz)} data-testid="button-use-device-tz">Use this device ({deviceTz})</Button>}
        </div>
        <p className="text-sm text-muted-foreground">Now in {prefs.timeZone}: <span data-testid="text-time-sample">{formatDateTime(new Date())}</span></p>
        <div className="rounded-xl border border-border bg-background p-4 text-sm">
          <p className="font-semibold">Quiet hours time zone: {quietTz || "not set"}</p>
          <p className="mt-1 text-muted-foreground">This is kept separate on purpose, so travelling does not silently move your quiet hours.</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-xl" disabled={updateNotif.isPending || quietTz === prefs.timeZone || notif.isLoading} onClick={syncQuiet} data-testid="button-sync-quiet-tz">Use {prefs.timeZone} for quiet hours</Button>
          <Link href="/notifications/settings" className="ms-4 underline">Quiet hours settings</Link>
        </div>
      </Section>

      <Section id="s-dir" icon={<ArrowLeftRight className="h-6 w-6" />} title="Reading direction">
        <RadioGroup value={prefs.direction} onValueChange={v => save({ direction: v as Direction })} className="space-y-3" aria-label="Reading direction">
          {([["auto", "Automatic", "Follows your language. Today every available language reads left to right."], ["ltr", "Left to right", "Always lay the app out left to right."], ["rtl", "Right to left preview", "Mirror the layout to preview right-to-left reading. This does not turn on any language; wording stays English."]] as const).map(([v, t, d]) => (
            <div key={v} className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
              <RadioGroupItem value={v} id={`dir-${v}`} className="mt-1" data-testid={`radio-dir-${v}`} />
              <div><label htmlFor={`dir-${v}`} className="font-semibold">{t}</label><p className="text-sm text-muted-foreground">{d}</p></div>
            </div>
          ))}
        </RadioGroup>
      </Section>

      <Section id="s-data" icon={<ImageIcon className="h-6 w-6" />} title="Data and media">
        <ToggleRow id="low-data" label="Low-data mode" help="Photos, audio, video, profile pictures and thumbnails are not requested until you press Load. Saves mobile data." checked={prefs.lowData} onChange={v => save({ lowData: v })} />
        <ToggleRow id="text-first" label="Text first" help="Show words before pictures and sound, and never start media by itself. You can still press Play media." checked={prefs.textFirst} onChange={v => save({ textFirst: v })} />
        <p className="text-sm text-muted-foreground">Media loads only when both are off, or when you choose Load or Play on an item.</p>
      </Section>

      <Section id="s-drafts" icon={<HardDrive className="h-6 w-6" />} title="Offline drafts">
        <ToggleRow id="offline-drafts" label="Keep an encrypted draft on this device" help="Off by default. Your text stays in the open tab if the network drops either way." checked={prefs.offlineDrafts} onChange={v => save({ offlineDrafts: v }, v ? "Offline drafts on" : "Offline drafts off and erased")} />
        <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground" data-testid="text-offline-explainer">
          <li>Only post text and audience are kept, encrypted with a key that exists only in this browser tab. Closing the tab ends access, so an unsent draft can be lost.</li>
          <li>Photos, feeds, messages and other content are never saved for offline use, and there is no background service.</li>
          <li>Signing out, switching account, deleting your account or turning this off erases the draft here and in other open tabs.</li>
          <li>If you lose access to this device or revoke its session, a copy may stay encrypted until the browser data is cleared. We cannot remove it remotely.</li>
        </ul>
        <Button variant="outline" className="rounded-xl" onClick={() => { wipeDrafts(userId); toast({ title: "Drafts on this device erased" }); }} data-testid="button-erase-drafts">Erase drafts on this device now</Button>
      </Section>

      <Section id="s-more" icon={<FileText className="h-6 w-6" />} title="Related">
        <div className="flex flex-wrap gap-4">
          <Link href="/country-resources" className="inline-flex items-center gap-2 text-primary underline"><LifeBuoy className="h-4 w-4" aria-hidden="true" />Support by country</Link>
          <Link href="/notifications/settings" className="text-primary underline">Notification settings</Link>
        </div>
      </Section>
    </div>
  );
}
