export function canCreateNewRevision(lessonStatus: string, currentRevisionStatus?: string) {
  if (['published', 'review_due', 'archived'].includes(lessonStatus)) return true;
  if (lessonStatus === 'draft' && currentRevisionStatus === 'rejected') return true;
  return false;
}

export function canSubmitReview(lessonStatus: string, currentRevisionStatus?: string) {
  return lessonStatus === 'draft' && currentRevisionStatus === 'draft';
}

export function canApproveOrReject(lessonStatus: string, currentRevisionStatus?: string) {
  return lessonStatus === 'review' && currentRevisionStatus === 'review';
}

export function canPublishAction(lessonStatus: string, currentRevisionStatus?: string) {
  // If approved, the backend might set revision status to 'published' while lesson remains 'review' until publish action
  return lessonStatus === 'review' && currentRevisionStatus === 'published';
}

export function canFlagReviewDue(lessonStatus: string) {
  return lessonStatus === 'published';
}

export function canWithdraw(lessonStatus: string) {
  return lessonStatus === 'published' || lessonStatus === 'review_due';
}

export function canArchive(lessonStatus: string) {
  return ['draft', 'published', 'review_due', 'withdrawn'].includes(lessonStatus);
}

export function isoToDateInput(isoString?: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split('T')[0];
  } catch (e) {
    return "";
  }
}

export function dateInputToIso(dateString?: string): string | null {
  if (!dateString || dateString.trim() === "") return null;
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (e) {
    return null;
  }
}
