# Encryption and message privacy

Phase 10 uses TLS in transit at the platform proxy. Database and object-storage
encryption at rest is provided where enabled by the platform; this project does
not independently verify or overclaim those provider controls.

There is **no application-layer message encryption and no end-to-end
encryption**. The server processes message plaintext for live authorization,
media checks, moderation, reporting, exports, and deletion semantics. Staff
cannot browse conversations: staff access is limited to an exact reported
evidence record, with a reason, fresh MFA, the `evidence.read` capability, and
an audit record.

Notification delivery payloads are deliberately generic. Push queue records do
not contain message bodies, sender/group names, media URLs, or unauthenticated
resource identifiers. Lock-screen preferences may further reduce previews.
External APNs, FCM, and Web Push credentials/services are not configured in
this deployment, so real device delivery has not been verified.