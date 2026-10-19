import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useGetServicePolicy, useSubmitServiceFeedback, useMeasureServiceTask, type ServiceTaskInput } from "@workspace/api-client-react";

const TASKS: [ServiceTaskInput["task"], string][] = [["find_support", "Find support"], ["change_language", "Change language"], ["save_draft", "Save a draft"], ["export_account", "Export my account"], ["report_content", "Report content"]];
const errText = (e: unknown) => (e as { data?: { error?: string } })?.data?.error ?? "Could not send. Please try again.";
const box = "rounded-2xl border border-border bg-card p-6 space-y-4";

export default function ServiceExperience() {
  const { toast } = useToast();
  const fb = useSubmitServiceFeedback();
  const tk = useMeasureServiceTask();
  const policy = useGetServicePolicy();
  const off = policy.data?.measurementEnabled === false;
  const hours = policy.data?.declaredHours ?? [];
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [task, setTask] = useState<ServiceTaskInput["task"]>("find_support");
  const [done, setDone] = useState(true);
  const [at, setAt] = useState(false);
  const [secs, setSecs] = useState("60");
  const secsN = Number(secs);
  const secsOk = secs !== "" && secsN >= 0 && secsN <= 86400;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <PageHeader title="Service experience" description="Entirely optional. Skipping this changes nothing about your account." />
      <p className="text-sm">This is not a health assessment. We never ask for free text, and answers are not shared with other members.</p>

      {policy.isLoading && <p role="status">Loading service information...</p>}
      {policy.isError && <p role="alert">Service information could not be loaded. <button className="underline" onClick={() => policy.refetch()}>Try again</button></p>}
      {policy.data && <section className={box} aria-label="Service information">
        <p>{policy.data.staffingNotice}</p>
        <p><strong>Declared staff hours:</strong> {hours.length ? hours.join("; ") : "none declared. Do not assume anyone is available."}</p>
        <p>{policy.data.privacyNotice}</p>
        <p>{policy.data.backupNotice || "Backup retention: unknown."}</p>
      </section>}
      {off && <p role="status" className="rounded-xl border border-border bg-card p-4">Optional feedback and task reports are switched off right now. Nothing is lost by skipping them.</p>}
      <p><Link href="/security-report" className="underline font-semibold">Report a security problem</Link></p>
      <form className={box} onSubmit={e => { e.preventDefault(); if (supported === null) return; fb.mutate({ data: { consent: true, supported } }, { onSuccess: () => toast({ title: "Thank you. Your answer was saved." }), onError: e2 => toast({ title: "Not sent", description: errText(e2), variant: "destructive" }) }); }}>
        <fieldset className="space-y-2"><legend className="font-display text-xl font-bold">Do you feel supported using Me?</legend>
          {[true, false].map(x => <label key={String(x)} className="flex items-center gap-3 min-h-11"><input type="radio" name="supported" checked={supported === x} onChange={() => setSupported(x)} />{x ? "Yes" : "No"}</label>)}</fieldset>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={c1} onChange={e => setC1(e.target.checked)} />I agree to send this one answer to the Me team to help improve the service.</label>
        <Button type="submit" disabled={off || !c1 || supported === null || fb.isPending} className="min-h-11" data-testid="button-send-feedback">{fb.isPending ? "Sending..." : "Send answer"}</Button>
        {fb.isSuccess && <p role="status">Sent.</p>}
      </form>

      <form className={box} onSubmit={e => { e.preventDefault(); if (!secsOk) return; tk.mutate({ data: { consent: true, task, completed: done, usedAssistiveTechnology: at, durationSeconds: Math.round(secsN) } }, { onSuccess: () => toast({ title: "Thank you. Your task report was saved." }), onError: e2 => toast({ title: "Not sent", description: errText(e2), variant: "destructive" }) }); }}>
        <h2 className="font-display text-xl font-bold">Accessibility task report</h2>
        <div><label className="block font-semibold mb-1" htmlFor="svc-task">Which task did you try?</label>
          <select id="svc-task" className="w-full rounded-lg border border-border bg-card px-3 min-h-11" value={task} onChange={e => setTask(e.target.value as ServiceTaskInput["task"])}>{TASKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} />I finished the task</label>
        <label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={at} onChange={e => setAt(e.target.checked)} />I used assistive technology (for example a screen reader)</label>
        <div><label className="block font-semibold mb-1" htmlFor="svc-secs">About how many seconds did it take?</label>
          <input id="svc-secs" type="number" min={0} max={86400} className="w-40 rounded-lg border border-border bg-card px-3 min-h-11" value={secs} onChange={e => setSecs(e.target.value)} aria-invalid={!secsOk} /></div>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={c2} onChange={e => setC2(e.target.checked)} />I agree to send these task details to the Me team to help improve accessibility.</label>
        <Button type="submit" disabled={off || !c2 || !secsOk || tk.isPending} className="min-h-11" data-testid="button-send-task">{tk.isPending ? "Sending..." : "Send task report"}</Button>
        {tk.isSuccess && <p role="status">Sent.</p>}
      </form>
    </div>
  );
}
