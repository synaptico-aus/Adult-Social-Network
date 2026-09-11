import { useState } from "react";
import { useCompleteOnboarding } from "@workspace/api-client-react";

const versions = { terms: "2026-01", privacy: "2026-01", community_guidelines: "2026-01" } as const;

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [eligible, setEligible] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const mutation = useCompleteOnboarding({ mutation: { onSuccess: onComplete } });
  return (
    <main className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-8">
      <h1 className="font-display text-3xl font-bold">Finish setting up your account</h1>
      <p className="mt-3 text-muted-foreground">Me is an adult community. We do not ask for a diagnosis or store your birth date.</p>
      <label className="mt-8 flex gap-3 text-lg"><input type="checkbox" checked={eligible} onChange={(e) => setEligible(e.target.checked)} /> I self-declare that I am 18 or older.</label>
      <p className="mt-2 text-sm text-muted-foreground">This checkbox is a self-declaration, not identity or age verification. Age-assurance vendor review is required before launch.</p>
      <label className="mt-6 flex gap-3 text-lg"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> I accept the current Terms, Privacy Policy, and Community Guidelines.</label>
      {mutation.error && <p role="alert" className="mt-4 text-destructive">We could not complete setup. Please try again.</p>}
      <button disabled={!eligible || !accepted || mutation.isPending} onClick={() => mutation.mutate({ data: { ageEligible: eligible, ageEligibilityMethod: "self-declaration", agePolicyVersion: "2026-01", acceptedDocuments: Object.entries(versions).map(([document, version]) => ({ document: document as "terms" | "privacy" | "community_guidelines", version })) } })} className="mt-8 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
        {mutation.isPending ? "Saving…" : "Continue"}
      </button>
    </main>
  );
}