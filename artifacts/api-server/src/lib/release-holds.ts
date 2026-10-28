/** No operator toggle can override these unresolved release safety boundaries. */
export const releaseHolds: Readonly<Record<string, string>> = Object.freeze({
  onboarding: "New account setup is paused until current Terms, Privacy Policy and Community Guidelines are available to read and independently reviewed.",
  uploads: "Uploads paused pending independent validation of ingestion byte limits, shared byte quotas, provider failure cleanup and operational media screening.",
  video_processing: "Video processing paused pending operational screening and real-device/lifecycle validation.",
});

export function releaseHold(key: string): string | undefined {
  // Only synthetic integration tests may exercise incomplete pipelines.
  // Test storage injection is separately forbidden outside NODE_ENV=test.
  return process.env.NODE_ENV === "test" ? undefined : releaseHolds[key];
}
