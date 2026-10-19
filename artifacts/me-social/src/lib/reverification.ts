import { ApiError } from "@workspace/api-client-react";

/** Clerk's wrapper recognises a resolved hint, not our transport's ApiError. */
export function recoverReverificationHint(error: unknown): {
  clerk_error: { type: "forbidden"; reason: "reverification-error"; metadata?: unknown };
} {
  if (error instanceof ApiError && error.status === 403 && error.data && typeof error.data === "object" && "clerk_error" in error.data) {
    const hint = error.data.clerk_error;
    if (hint && typeof hint === "object" && "type" in hint && "reason" in hint && hint.type === "forbidden" && hint.reason === "reverification-error") {
      return error.data as ReturnType<typeof recoverReverificationHint>;
    }
  }
  throw error;
}
