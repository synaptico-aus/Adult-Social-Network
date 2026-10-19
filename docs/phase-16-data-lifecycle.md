# Export, deletion and retained records

## Export

Authenticated member export rechecks live original permissions before including
group, circle, conversation, Memory Collection and translated source content.
Ownership of a collection or former membership does not create new source access.
The export includes private learning/localisation/drafts, structured optional
feedback and notification metadata. Push/provider tokens and authentication
secrets are excluded. Each registered deletion module must have an explicit
export-field contract; a missing contract fails the export instead of silently
claiming all modules were included.

Owned media has a manifest and authenticated download path only for ready assets.
Each download still checks original current permissions and can become unavailable
after revocation. Quarantined/malicious/uncertain files remain held, not made
downloadable by export. Export includes permitted variants, not a promise of
original copyrighted or unsafe bytes. Music links remain links; third-party
articles/music are not downloaded or rehosted. A JSON export does not grant
rights to other people's contributions.

## Deletion

Freshly reverified deletion is irreversible once accepted. It deactivates live
account access immediately, revokes notification registrations, starts module
cleanup, clears this device's drafts/query cache and signs out. There is no
“cancel” after content has been erased. A staff restore cannot revive a deleted
account. Previously saved/exported content or another person's offline copy
cannot be remotely recalled.

The server journals each module, bounded retries and separate Clerk, storage,
backup, logs and retained-evidence steps. Background and explicit retries share
a cross-process database lock. A failed module remains failed/pending; it does
not silently complete the request. Later modules can still clean up independent
data. Workers require a running API service; no fixed completion deadline is
promised without measured operations.

Failed modules and identity-provider calls get at most five automatic attempts.
Completed provider erasure is not called again while other steps await review.
Privacy staff must fix the cause and explicitly retry to reset exhausted attempts;
the request remains pending, never automatically abandoned or falsely completed.

Coverage includes profile/card/photo/consent/verification details, relationships,
posts/comments/reactions/saves/hides, group/host/welcome authority, circles and
history grants, private messages/requests/contact settings, media and variants,
private education progress, resource reports, Memory Collections/reminders,
localisation/drafts/translations, optional feedback, notification queues/tokens
and caches on the current device.

Own message bodies and attachments are tombstoned; other participants' authored
messages are not erased as though they belonged to the requesting person.
Owned circles/groups and conversations are closed; original membership grants
are revoked. Reported snapshots/evidence remain governed by justified retention,
not ordinary conversation visibility. Public licensed/staff publications and
compliance records require purpose-specific review, not blind destruction.

Object cleanup records survive database content removal and retry through the
signed-upload URL window; profile-photo cleanup is also registered. Storage is
not marked finished while owned objects/tombstones remain. A provider attestation
cannot override physical pending objects or existing retained evidence.

## Retention exceptions and processors

Requests remain pending while storage, provider erasure, verified backup expiry,
logs or evidence review is unresolved. Privacy staff record **request-specific**
provider evidence and its review expiry; a checked box is not provider API proof.
Clerk identity deletion is attempted by the worker; failures remain pending.
No backup deletion or processor erasure is fabricated when an integration or
retention schedule is unknown.

Audit/case records and a minimal inactive member/identity deny-list tombstone can
remain to prevent stale identities regaining access and to meet a reviewed,
proportionate compliance/safety obligation. This is retained personal data,
**not total erasure**. The privacy lead must record the exact lawful purpose,
scope, authorised viewers, retention deadline/review, legal-hold status and
eventual purge evidence. Existing reported-content snapshots, reported-message
context and audit/report participation are flagged for retention review;
generic “reported content” alone is not an approved indefinite-retention basis.
Legal-hold enforcement and expiry must be reviewed before any retained evidence
purge. No new automatic evidence destruction is introduced here.

Actual provider backup retention/expiry and log expiry are not yet verified.
Backups may contain erased live data until the verified expiry; access must be
restricted and restores must replay deletion/revocation records before serving
users. Do not claim instant erasure from all backups, “all processors done”, or
a production-approved lifecycle while these checks remain outstanding.
