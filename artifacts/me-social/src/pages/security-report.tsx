import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitSecurityReport } from "@workspace/api-client-react";

export default function SecurityReport() {
  const send = useSubmitSecurityReport();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [touched, setTouched] = useState({ title: false, summary: false });
  const ok = title.trim().length >= 5 && summary.trim().length >= 20;
  const err = (send.error as { data?: { error?: string } } | null)?.data?.error;
  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <PageHeader title="Report a security problem" description="Tell us about a weakness in Me, such as a way to see someone else's information." />
      <div role="note" className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
        <p><strong>Do not include</strong> passwords, codes, access tokens, or private health details. Do not attach files.</p>
        <p>This form is not for emergencies or for reporting a person. If someone is in danger, contact local emergency services.</p>
      </div>
      {send.isSuccess ? (
        <div role="status" className="rounded-2xl border border-border bg-card p-6 space-y-2" data-testid="status-security-receipt">
          <h2 className="font-display text-xl font-bold">Report received</h2>
          <p>Reference: {send.data.id}. This is an automatic receipt only. It does not mean a person has read it, and no reply time is promised.</p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (ok) send.mutate({ data: { title: title.trim(), summary: summary.trim() } }); }}>
          <div>
            <label htmlFor="sec-title" className="block font-semibold mb-1">Short title (at least 5 characters)</label>
            <Input id="sec-title" required minLength={5} maxLength={180} value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => setTouched(s => ({ ...s, title: true }))} aria-describedby="sec-title-help" aria-invalid={touched.title && title.trim().length < 5} />
            <p id="sec-title-help" className="text-sm mt-1" aria-live="polite">{touched.title && title.trim().length < 5 ? "Please enter at least 5 characters for the title." : "Use a short title without personal or health details."}</p>
          </div>
          <div>
            <label htmlFor="sec-sum" className="block font-semibold mb-1">Safe steps to reproduce (at least 20 characters)</label>
            <Textarea id="sec-sum" required minLength={20} className="min-h-40" value={summary} onChange={e => setSummary(e.target.value)}
              onBlur={() => setTouched(s => ({ ...s, summary: true }))} aria-describedby="sec-summary-help" aria-invalid={touched.summary && summary.trim().length < 20} />
            <p id="sec-summary-help" className="text-sm mt-1" aria-live="polite">{touched.summary && summary.trim().length < 20 ? "Please enter at least 20 characters describing safe steps to reproduce." : "Do not include credentials, private messages or another person's details."}</p>
          </div>
          {send.isError && <p role="alert">Not sent. {err ?? "Please try again."}</p>}
          <Button type="submit" disabled={!ok || send.isPending} className="min-h-11" data-testid="button-send-security-report">{send.isPending ? "Sending..." : "Send report"}</Button>
        </form>
      )}
    </div>
  );
}
