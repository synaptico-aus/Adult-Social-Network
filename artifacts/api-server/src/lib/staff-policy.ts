export const STAFF_ROLE_CAPABILITIES: Record<string, readonly string[]> = {
  administrator: ["moderation.queue", "moderation.urgent", "moderation.decide", "appeals.review", "evidence.read", "verification.review", "staff.roles", "education.author", "education.review", "education.publish"],
  moderator: ["moderation.queue", "moderation.urgent", "moderation.decide", "appeals.review", "evidence.read", "verification.review"],
  education_editor: ["verification.review", "education.author", "education.review", "education.publish"],
};
export function roleHasCapability(role: string, capability: string, assignedCapabilities?: readonly string[]): boolean {
  const explicit = assignedCapabilities && assignedCapabilities.length ? assignedCapabilities : STAFF_ROLE_CAPABILITIES[role] ?? [];
  return explicit.includes(capability);
}