import { useState } from "react";
import { useCompleteOnboarding } from "@workspace/api-client-react";

const versions = { terms: "2026-01", privacy: "2026-01", community_guidelines: "2026-01" } as const;
// Release hold: do not collect acceptance of documents members cannot read.
const onboardingAvailable = false;

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [eligible, setEligible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const mutation = useCompleteOnboarding({ mutation: { onSuccess: onComplete } });
  return (
    <main className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-8">
      <h1 className="font-display text-3xl font-bold">Finish setting up your account</h1>
      <div role="status" className="mt-4 rounded-xl border border-border bg-background p-4 leading-relaxed">
        <h2 className="font-semibold">New account setup is paused</h2>
        <p>Our current Terms, Privacy Policy and Community Guidelines are not yet available for you to read and review. We will not ask you to accept unseen documents. Please return when these documents are ready.</p>
        <p className="mt-2">Your account setup has not been completed. Me is not an emergency service.</p>
      </div>
      <p className="mt-3 text-muted-foreground">Me is an adult community. We do not ask for a diagnosis or store your birth date.</p>
      <label className="mt-8 flex gap-3 text-lg"><input type="checkbox" disabled={!onboardingAvailable} checked={eligible} onChange={(e) => setEligible(e.target.checked)} /> I self-declare that I am 18 or older.</label>
      <p className="mt-2 text-sm text-muted-foreground">This checkbox is a self-declaration, not identity or age verification. Age-assurance vendor review is required before launch.</p>
      <label className="mt-6 flex gap-3 text-lg"><input type="checkbox" disabled={!onboardingAvailable} checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> Document acceptance is unavailable until the current Terms, Privacy Policy, and Community Guidelines can be reviewed.</label>
      {mutation.error && <p role="alert" className="mt-4 text-destructive">We could not complete setup. Please try again.</p>}
      <button disabled={!onboardingAvailable || !eligible || !accepted || mutation.isPending} onClick={() => mutation.mutate({ data: { ageEligible: eligible, ageEligibilityMethod: "self-declaration", agePolicyVersion: "2026-01", acceptedDocuments: Object.entries(versions).map(([document, version]) => ({ document: document as "terms" | "privacy" | "community_guidelines", version })) } })} className="mt-8 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
        {mutation.isPending ? "Saving…" : "Continue"}
      </button>
    </main>
  );
}