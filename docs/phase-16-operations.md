# Me operational procedures

## Status and accountability

This is an implemented operating framework, **not production approval**. No
staff roster, 24/7 coverage, independent legal opinion, provider erasure,
backup expiry or successful restore drill is asserted by this document.
Video operational malware screening and actual native-device/lifecycle
testing remain separate release gates.

Before public launch the accountable service owner must name a moderation
lead, privacy lead, security/incident lead and backup operator, record their
safe contact/escalation channels, and obtain the region-specific reviews
in [the launch register](phase-16-launch-register.md). No contacts are invented.

## Staff access and review

Use `/staff/operations` with an active explicit staff assignment, reviewed
capability ceiling and a verified second factor within five minutes. A
profile label never grants staff authority. The administrator can grant a
narrower capability set and group IDs for moderators/group managers. Resource,
education, privacy, operations and audit capabilities remain separate.
Group-scoped moderators cannot browse other groups' queues, appeals/evidence,
global users or unassigned private video.

Each new/replaced assignment has at most 30 days before independent review is
required. This initial grace period is **not** an independent approval.
A reviewer other than the assignee records the purpose, evidence reference and
an expiry within the next 30 days. A scope/role replacement invalidates old
reviews. Expired or adverse reviews fail closed. Offboarding: revoke assignment
immediately, revoke authentication sessions via Clerk security settings, revoke
device registrations, preserve a justified audit record and verify denied access.
Do not remove the last operational administrator without a tested recovery path.

Staff read attempts are audited before data is served; audit-write failure
pauses staff reads. Existing evidence access also requires its explicit reason.
Operational commands and their audit entry commit together. Operational notes
and case evidence are restricted records, **not analytics**. Never put passwords,
tokens, private health details or message bodies in audit reasons or incident
titles. Current audit storage is access-controlled PostgreSQL, not independently
immutable/WORM storage; an external tamper-evident sink remains a release review.

## Staffing, coverage and response

1. The lead records **actual** staffed days, local times, IANA time zone, holidays,
   handover and escalation arrangements using “Declare staffing hours”.
   The public service-policy page displays the declared title, not private notes.
2. Staff start/end duty sessions. Heartbeats sample open-page presence at
   60-second intervals; gaps over 90 seconds do not accrue time. Sessions are
   not attention, unique clock-hour coverage, response guarantees or 24/7 staffing.
3. Acknowledge a report only after a human has read it. The first authenticated
   acknowledgement/decision creates a first-human-response measurement. Do not
   treat an automated receipt, queue fetch, email send or heartbeat as a response.
4. Review unresolved urgent reports and pending welcomes at shift start, handover
   and end. Welcome acknowledgement time is not proof of a completed conversation.
5. Compare observed presence, response/resolution times and missed windows with
   the declared roster. Record gaps and corrective action. No denominator-based
   staffed-hours coverage percentage is claimed without a verified roster.

No staffing hours have been confirmed by this implementation. Me is not an
emergency service and does not monitor emergencies or dispatch help.

## Reports, urgent escalation, sanctions and appeals

Prioritise threats, exploitation and distress disclosures. Assess available
evidence, current audience and imminent risk without diagnosing a person.
Use the reviewed country directory for actual local emergency resources/hours;
do not promise a rescue or immediate response. Escalate urgent cases to the
named duty lead through the verified channel and log the handoff/acknowledgement.
If no lead is reachable, apply the approved minimal containment, record the
coverage failure and follow the incident procedure. In-app alerts alone are
not an on-call notification system.

Use the existing report queue/retained-evidence access, record reason and final
decision, and process appeals separately. Pending reports alone do not publish,
approve or remove an otherwise permitted revision. Allowed decisions do not
override original audiences or required media screening.

Warnings and content removal apply to their case. Temporary content-write
restrictions expire after 24 hours; suspension/permanent-removal sanctions
remain until a permitted reversal. They block content changes while preserving
read access, appeals and data rights. Group-scoped staff cannot impose account-wide
sanctions. Moderators cannot sanction staff accounts unless they are administrators.
The separate Users tool creates a reviewable restriction case; restoring it
does not reverse other cases. Deletion is not a sanction and cannot be undone
by “restore member”. Revoked notification registrations are not silently restored.
Use the moderation record ID returned with a restriction for the existing appeal
process. An upheld restriction remains active while its appeal is pending.

Education publication, translated health education and source reviews keep their
existing independent review/evidence requirements. A resource source-review label
does not verify every claim. Announcements require an unexpired draft, explicit
region, a different publisher and a recorded withdrawal path. No sponsored
placement is enabled; any future sponsorship requires a conspicuous disclosure,
rights/legal review and deliberate product approval.

## Security reports and incident response

`/security-report` accepts a short safe reproduction summary without an account
or file upload. It returns an automatic receipt, not a human response. Researchers
must not send secrets, health records, destructive payloads or private account
content. Reports are rate-limited, displayed as inert text and available only
through scoped staff security tools. An owner-provided secure follow-up channel
and response schedule must be verified before launch.

For incidents: log the timeline and severity; name an incident commander; contain
using the appropriate feature switches; preserve only necessary evidence with a
recorded lawful purpose; revoke compromised credentials through provider tools;
assess affected accounts/regions and notification duties with the privacy lead;
remediate in development, verify authority boundaries, obtain release approval,
and document recovery and lessons. Do not copy private content into ordinary logs.
Resolve an incident only after containment/recovery evidence and owner sign-off.

## Monitoring, budgets and shutdown

The server observes HTTP 5xx counts, open/urgent reports, processing backlog,
logical upload/storage bytes, first human/welcome response, resolution time and
optional structured feedback. “Reports per new post” is a rough reporting
indicator, **not verified abuse prevalence**. Missing data is unknown, not zero.
Optional measurement is off by default, requires per-submission consent, accepts
no free text and is excluded from advertising. Task completion/assistive-technology
self-reports do not certify accessibility or measure clinical outcomes.

Initial thresholds: 50 open reports; 15 minutes oldest pending urgent report;
1 GiB source uploads/day; 10 GiB known storage; 20 HTTP 5xx/hour; 10 reports per
100 new posts; USD 25/month known provider costs. These are **technical defaults,
not approved operating budgets or staffed response promises**. Review and replace
them with justified service-owner budgets before launch.

The monitor checks every minute while the API process runs. In-app alerts reopen
while a threshold remains exceeded. Byte/cost breaches pause new uploads; video
processing, posting, messaging, announcements and optional analytics also have
independent audited switches. Shutdown checks fail closed for governed mutations.
Already-issued bounded upload URLs and in-flight jobs cannot be recalled; quotas
can overshoot between checks and are **not hard financial/provider spend caps**.
Restore features manually only after the cause, backlog and threshold are reviewed.
Do not disable account export/deletion, reporting or emergency resource access.

Record actual month-to-date USD statement totals for hosting, storage and
upload/processing with a provider reference; include conversion evidence for
non-USD bills. Re-entering a category replaces that month's total, not an added
charge. Missing categories are unknown. No live billing connector is configured;
amounts are operator-attested, not independently verified. Reconcile provider
inventory, traffic, orphaned objects and invoices: database logical bytes are not
a complete invoice or a guarantee of provider-level costs.

**External on-call alert delivery is not configured.** Staff must actively inspect
the dashboard; API logs are not paging. Verify independent uptime/dead-man
monitoring and escalation acknowledgements before relying on this operational
framework. No 24/7 or unattended monitoring claim is permitted.

## Backup restore and rollback

Official Replit references:
- https://docs.replit.com/features/data-and-storage/data-recovery
- https://docs.replit.com/features/version-control/checkpoints-and-rollbacks
- https://docs.replit.com/features/data-and-storage/development-and-production

Development checkpoints are not proof that production data or App Storage has
been backed up. Available restore windows depend on the actual deployment,
plan/provider and configuration; **this workspace's effective retention/expiry
has not been verified**. Do not promise a fixed deletion/backup expiry.

Before launch, inventory database, App Storage, Clerk, logs and processors; obtain
actual retention, regions, access controls, encryption and restoration guarantees.
The backup operator and privacy lead approve RPO/RTO and the expiry schedule.
Record evidence, reviewer, date and next-review expiry in the regional register.

Restore drill: declare maintenance and pause writes/uploads/jobs; snapshot current
state; restore into an isolated restricted destination, never over live data
without an approved plan; verify schema, media inventory, authentication/audience
boundaries and evidence holds; replay deletion tombstones, consent revocations,
membership removals, blocks and device revocations **before** restoring access.
Do not resume outbound notifications until authority checks pass. Record actual
recovery time, recovery point and mismatches; require an independent sign-off.
Only then use the reviewed release/deployment process to resume service.

For code rollback, prefer a known checkpoint/release and review schema compatibility.
Do not blindly restore an older database: that can resurrect deleted content,
old consent or revoked permissions. Keep writes paused if reconciliation fails.
No production rollback or restore was performed by implementing this phase.

See [data lifecycle](phase-16-data-lifecycle.md) for deletion and justified-retention
exceptions. There is no payment integration, private-health-data monetisation or
unrequested paid feature in this phase.
