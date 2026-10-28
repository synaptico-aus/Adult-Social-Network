export const SAFETY_OPERATIONS_POLICY = {
  version: "2026-09-11",
  owners: {
    accountable: "Safety Operations Lead",
    urgentReview: "On-call Moderator",
    appeals: "Head of Support",
    retention: "Privacy Lead",
  },
  urgentReviewTargetsMinutes: {
    threats: 15,
    exploitation: 30,
    distress_disclosure: 15,
  },
  appeals: {
    acknowledgementBusinessDays: 2,
    decisionBusinessDays: 10,
    guidance:
      "A reviewer who did not make the original decision must consider the appeal, the original reason, and only the evidence needed for that case. Record a specific reason and notify the appellant of the outcome.",
  },
  sanctions: {
    warning: "A formal notice that conduct breached the guidelines; account access is unchanged.",
    content_removal: "The reported content is made unavailable; other account access is unchanged unless a separate sanction is recorded.",
    temporary_restriction: "Specified account capabilities are disabled for a stated, time-limited period.",
    suspension: "Account access is disabled for a stated, time-limited period.",
    permanent_removal: "Account access is permanently disabled after the highest-severity review.",
  },
  retention: {
    resolvedEvidenceDays: 365,
    screeningResultDays: 90,
    evidenceAccessAuditDays: 730,
    sensitiveActionAuditDays: 730,
    staffAccessReviewDays: 90,
    jobFrequencyHours: 24,
    guidance:
      "Open, held, and appealed cases are retained until resolution. Resolved report evidence is deleted after 365 days. Account deletion immediately removes relationship controls and pseudonymises member links and free text.",
  },
} as const;

export type UrgentSafetyCategory = keyof typeof SAFETY_OPERATIONS_POLICY.urgentReviewTargetsMinutes;

export function urgentReviewTargetMinutes(category: string): number | null {
  return category in SAFETY_OPERATIONS_POLICY.urgentReviewTargetsMinutes
    ? SAFETY_OPERATIONS_POLICY.urgentReviewTargetsMinutes[category as UrgentSafetyCategory]
    : null;
}