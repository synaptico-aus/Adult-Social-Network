/** Show actionable failures without logging post text or clearing the composer. */
export function postOperationError(error: unknown, fallback: string): string {
  const failure = error as { status?: number; data?: { error?: unknown } } | null;
  if (failure?.status === 401) return "Please sign in again before posting. Your text has not been cleared.";
  const reason = failure?.data?.error;
  if (typeof reason === "string" && reason.trim() &&
      ((failure?.status ?? 500) < 500 || failure?.status === 503)) {
    return `${reason.slice(0, 300)}. Your text has not been cleared.`;
  }
  return `${fallback} Your text has not been cleared. Please try again.`;
}
