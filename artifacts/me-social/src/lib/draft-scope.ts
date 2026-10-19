type Scope = { circleId?: string | null; groupId?: string | null };
/** A draft must not silently move from its original circle/group into another. */
export function canRestoreDraftHere(context: Scope, draft: Scope): boolean {
  return (context.circleId ?? null) === (draft.circleId ?? null) &&
    (context.groupId ?? null) === (draft.groupId ?? null);
}
