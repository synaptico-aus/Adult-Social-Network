import { urgentReviewTargetMinutes } from "./safety-operations-policy";

export const moderationTransitions: Record<string, readonly string[]> = {
  pending: ["allowed", "held", "removed"],
  held: ["allowed", "removed"],
  removed: [],
  allowed: [],
  appealed: [],
};

export const MODERATION_SANCTIONS = [
  "warning",
  "content_removal",
  "temporary_restriction",
  "suspension",
  "permanent_removal",
] as const;

export function canTransitionModeration(from: string, to: string): boolean {
  return moderationTransitions[from]?.includes(to) === true;
}
export function urgentCategory(category: string): boolean {
  return urgentReviewTargetMinutes(category) !== null;
}