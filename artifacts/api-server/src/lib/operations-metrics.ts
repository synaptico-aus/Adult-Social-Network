import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { OperationsMetric } from "@workspace/api-zod";

export async function operationalMetrics(): Promise<OperationsMetric[]> {
  const result = await db.execute(sql`
    select
      (select count(*) from reports where status in ('pending','held','appealed'))::float as backlog,
      (select coalesce(max(extract(epoch from now()-created_at)/60),0) from reports where status='pending' and category in ('threats','exploitation','distress_disclosure'))::float as urgent_age_minutes,
      (select avg(extract(epoch from h.created_at-r.created_at)) from human_responses h join reports r on r.id=h.subject_id where h.kind='report' and h.created_at>now()-interval '30 days')::float as first_human_seconds,
      (select avg(extract(epoch from acknowledged_at-requested_at)) from group_welcome_requests where acknowledged_at is not null and requested_at>now()-interval '30 days')::float as welcome_seconds,
      (select avg(value)*100 from service_measurements where kind='supported' and occurred_at>now()-interval '30 days')::float as supported_percent,
      (select avg(value)*100 from service_measurements where kind='task_completed' and occurred_at>now()-interval '30 days')::float as task_completed_percent,
      (select avg(value)*100 from service_measurements where kind='assistive_task_completed' and occurred_at>now()-interval '30 days')::float as assistive_task_completed_percent,
      (select avg(extract(epoch from a.occurred_at-r.created_at)) from reports r join lateral (select occurred_at from sensitive_action_audit where action='moderation.decision' and metadata->>'newState' in ('allowed','removed') and subject_id in (select id from moderation_records where report_id=r.id) order by occurred_at desc limit 1) a on true where r.status in ('allowed','removed') and r.created_at>now()-interval '30 days')::float as report_resolution_seconds,
      (select coalesce(sum(byte_size),0) from media_assets where created_at>now()-interval '1 day')::float as upload_daily_bytes,
      ((select coalesce(sum(byte_size),0) from media_assets)+(select coalesce(sum(byte_size),0) from media_variants))::float as storage_bytes,
      (select count(*) from video_processing_jobs where state='pending')::float as processing_backlog,
      (select coalesce(sum(observed_seconds),0) from staff_duty_sessions where started_at>now()-interval '1 day')::float as observed_staff_seconds,
      (select count(*) from staff_duty_sessions where ended_at is null and heartbeat_at>now()-interval '90 seconds')::float as current_staff_presence,
      (select coalesce(sum(count),0) from operational_counters where key like 'http5xx:%' and updated_at>now()-interval '1 hour')::float as failures_hour,
      (select count(*) from reports where created_at>now()-interval '1 day')::float as reports_day,
      (select count(*) from posts where created_at>now()-interval '1 day')::float as posts_day`);
  const row = result.rows[0] as Record<string, number | null>;
  const definitions: Record<string, [string, string, string]> = {
    backlog: ["Open reports", "reports", "Pending, held and appealed reports; not a staffing promise."],
    urgent_age_minutes: ["Oldest pending urgent report", "minutes", "Urgent categories are not an emergency monitoring service."],
    first_human_seconds: ["First recorded human report response", "seconds", "30-day mean from authenticated acknowledgement/decision, not automated receipt."],
    welcome_seconds: ["First welcome acknowledgement", "seconds", "30-day mean; acknowledgement is not proof of a completed conversation."],
    supported_percent: ["Optional feeling-supported responses", "%", "Consenting respondents only; not a clinical outcome or population estimate."],
    task_completed_percent: ["Optional task completion", "%", "Self-reported task studies; not proof of accessibility conformance."],
    assistive_task_completed_percent: ["Assistive-technology task completion", "%", "Optional self-reports, no health condition or device fingerprint collected."],
    report_resolution_seconds: ["Report resolution time", "seconds", "30-day mean for reports with a recorded final human decision."],
    upload_daily_bytes: ["Upload source bytes, last 24 hours", "bytes", "Database-observed objects; does not include all provider traffic or invoice usage."],
    storage_bytes: ["Known source and variant storage", "bytes", "Logical object sizes; provider inventory/invoices must be reconciled."],
    processing_backlog: ["Pending video jobs", "jobs", "Content remains held until required screening completes."],
    observed_staff_seconds: ["Observed duty-session time", "staff-seconds", "Summed sampled session presence, not unique clock coverage, active attention or 24/7 staffing."],
    current_staff_presence: ["Recently checked-in staff", "sessions", "A heartbeat within 90 seconds is presence, not a guaranteed human response."],
    failures_hour: ["API server failures, last hour", "responses", "HTTP 5xx counts; no request text is collected."],
  };
  const metrics = Object.entries(definitions).map(([key, [label, unit, note]]) => ({ key, label, value: row[key] == null ? null : Number(row[key]), unit, note }));
  metrics.push({ key: "abuse_percent", label: "Reports per new post", value: row.posts_day ? Number(row.reports_day) / Number(row.posts_day) * 100 : null, unit: "%", note: "A rough reporting indicator, not verified abuse prevalence; reports can concern other content." });
  const costs = await db.execute(sql`select count(*)::int as sources, sum(numeric_value)::float as total from operations_records where kind='costs' and id like ${`cost:${new Date().toISOString().slice(0, 7)}:%`}`);
  const cost = costs.rows[0] as { sources: number; total: number | null };
  metrics.push({ key: "actual_cost_usd", label: "Operator-attested monthly provider costs", value: cost.sources === 3 ? cost.total : null, unit: "USD", note: "Requires hosting, storage and upload/processing statement references. Not independent verification or live billing." });
  metrics.push({ key: "cost_usd_monthly", label: "Known monthly costs (may be incomplete)", value: cost.total, unit: "USD", note: `${cost.sources}/3 categories recorded. Missing costs are unknown, never zero. Alerts use this lower bound; no payment connection is enabled.` });
  return metrics;
}
