import { randomUUID } from "node:crypto";
import { db, moderationRecordsTable, screeningResultsTable } from "@workspace/db";
import { deterministicTextScreening, type MediaScreening } from "./screening";

type ModerationExecutor = { insert: (...args: any[]) => any };
export async function intakeForModeration(input: {
  contentId: string;
  subjectMemberId?: string;
  text?: string;
  media?: { objectPath: string; contentType: string };
  requiredMediaScreening?: MediaScreening;
  executor?: ModerationExecutor;
}) {
  const textResult = input.text === undefined ? null : deterministicTextScreening(input.text);
  let mediaResult = null;
  if (input.media) {
    if (!input.requiredMediaScreening) mediaResult = { decision: "held" as const, reasons: ["media_screening_unavailable"] };
    else {
      try { mediaResult = await input.requiredMediaScreening(input.media); }
      catch { mediaResult = { decision: "held" as const, reasons: ["media_screening_error"] }; }
    }
  }
  const held = textResult?.decision === "held" || mediaResult?.decision === "held";
  const write = async (tx: ModerationExecutor) => {
    if (textResult) await tx.insert(screeningResultsTable).values({ id: randomUUID(), contentId: input.contentId, kind: "text", result: textResult.decision, details: { reasons: textResult.reasons } });
    if (mediaResult) await tx.insert(screeningResultsTable).values({ id: randomUUID(), contentId: input.contentId, kind: "media", result: mediaResult.decision, details: { reasons: mediaResult.reasons } });
    const [record] = await tx.insert(moderationRecordsTable).values({ id: randomUUID(), contentId: input.contentId, subjectMemberId: input.subjectMemberId, state: held ? "held" : "allowed", reason: held ? (textResult?.reasons ?? mediaResult?.reasons ?? []).join(",") : "automated screening allowed" }).returning();
    return record;
  };
  if (input.executor) return write(input.executor);
  return db.transaction(write);
}