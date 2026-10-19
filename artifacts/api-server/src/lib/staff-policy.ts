export const STAFF_ROLE_CAPABILITIES: Record<string, readonly string[]> = {
  administrator: ["moderation.queue", "moderation.urgent", "moderation.decide", "appeals.review", "evidence.read", "verification.review", "staff.roles", "education.author", "education.review", "education.publish", "resources.manage", "groups.manage", "users.manage", "operations.read", "operations.manage", "privacy.manage", "audit.read", "announcements.manage"],
  moderator: ["moderation.queue", "moderation.urgent", "moderation.decide", "appeals.review", "evidence.read", "verification.review"],
  education_editor: ["verification.review", "education.author", "education.review", "education.publish"],
  resource_editor: ["resources.manage"],
  group_manager: ["groups.manage"],
  operations_manager: ["operations.read", "operations.manage", "announcements.manage"],
  privacy_officer: ["privacy.manage", "audit.read"],
};
export function roleHasCapability(role: string, capability: string, assignedCapabilities?: readonly string[]): boolean {
  const ceiling = STAFF_ROLE_CAPABILITIES[role] ?? [];
  const explicit = assignedCapabilities && assignedCapabilities.length ? assignedCapabilities : ceiling;
  return ceiling.includes(capability) && explicit.includes(capability);
}