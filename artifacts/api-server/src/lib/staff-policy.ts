export const STAFF_ROLE_CAPABILITIES: Record<string, readonly string[]> = {
  administrator: ["moderation.queue", "moderation.urgent", "moderation.decide", "appeals.review", "evidence.read", "verification.review", "staff.roles"],
  moderator: ["moderation.queue", "moderation.urgent", "moderation.decide", "appeals.review", "evidence.read", "verification.review"],
  education_editor: ["verification.review"],
};
export function roleHasCapability(role: string, capability: string, assignedCapabilities?: readonly string[]): boolean {
  const explicit = assignedCapabilities && assignedCapabilities.length ? assignedCapabilities : STAFF_ROLE_CAPABILITIES[role] ?? [];
  return explicit.includes(capability);
}