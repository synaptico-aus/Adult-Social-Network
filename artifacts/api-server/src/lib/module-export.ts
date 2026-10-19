import { listDeletionHooks } from "./deletion-hooks";
const fields: Record<string, string[]> = {
  "profile-and-consent-data": ["profile", "cards", "consents", "verification"],
  "phase-4-safety-and-moderation": ["reports"],
  "phase-5-relationships-and-discovery": ["friendRequests", "friendships", "follows", "settings"],
  "phase-6-posts-and-interactions": ["posts", "comments", "reactions", "saves", "hides"],
  "group-authority-and-membership": ["groups", "groupMemberships", "groupRequests", "groupHosts", "hostTraining", "welcomeRequests"],
  "phase-7-media": ["mediaManifest"],
  "education-private-learning": ["educationSaves", "educationProgress"],
  "external-resource-reports": ["resourceReports"],
  "phase-14-memory-collections": ["memoryData"],
  "experience-localisation-and-drafts": ["experienceData"],
  "operations-feedback-and-notification-data": ["operationsData", "notificationPreferences", "deviceRegistrations"],
  "circles-and-private-messaging": ["circles", "circleMemberships", "circleInvitations", "historyAccess", "conversations", "conversationMemberships", "messages", "messageRequests", "messageContactSettings", "messageReports"],
};
/** Fail explicitly if a future data-owning module forgets its portability mapping. */
export function moduleExportManifest(payload: Record<string, unknown>) {
  return listDeletionHooks().map(name => {
    const keys = fields[name];
    if (!keys || keys.some(k => !(k in payload))) throw new Error(`Missing export contract for registered module: ${name}`);
    return { name, fields: keys, status: "included" };
  });
}
