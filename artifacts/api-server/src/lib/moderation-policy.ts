export const moderationTransitions: Record<string, readonly string[]> = {
  pending: ["allowed", "held", "removed"],
  held: ["allowed", "removed"],
  removed: [],
  allowed: [],
  appealed: [],
};
export function canTransitionModeration(from: string, to: string): boolean {
  return moderationTransitions[from]?.includes(to) === true;
}
export function urgentCategory(category: string): boolean {
  return ["threats", "exploitation", "distress_disclosure"].includes(category);
}