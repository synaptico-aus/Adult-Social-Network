import { randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, serviceMeasurementsTable, humanResponsesTable, notificationEventsTable, deviceRegistrationsTable, notificationDeliveryQueueTable, notificationsTable, notificationPreferencesTable, operationsRecordsTable } from "@workspace/db";
import { registerDeletionHook, listDeletionHooks } from "./deletion-hooks";
import "./core-data-deletion";

registerDeletionHook({
  name: "operations-feedback-and-notification-data",
  async run({ memberId }) {
    await db.delete(serviceMeasurementsTable).where(eq(serviceMeasurementsTable.memberId, memberId));
    await db.update(humanResponsesTable).set({ actorMemberId: null }).where(eq(humanResponsesTable.actorMemberId, memberId));
    await db.delete(notificationEventsTable).where(or(eq(notificationEventsTable.recipientMemberId, memberId), eq(notificationEventsTable.actorMemberId, memberId)));
    // Delivery rows include encrypted/provider payloads; delete before token rows.
    const devices = await db.select().from(deviceRegistrationsTable).where(eq(deviceRegistrationsTable.memberId, memberId));
    if (devices.length) await db.delete(notificationDeliveryQueueTable).where(inArray(notificationDeliveryQueueTable.registrationId, devices.map(x => x.id)));
    await db.delete(deviceRegistrationsTable).where(eq(deviceRegistrationsTable.memberId, memberId));
    await db.delete(notificationsTable).where(or(eq(notificationsTable.recipientMemberId, memberId), eq(notificationsTable.actorMemberId, memberId)));
    await db.delete(notificationPreferencesTable).where(eq(notificationPreferencesTable.memberId, memberId));
  },
});
export async function exportOperations(memberId: string) {
  const feedback = await db.select().from(serviceMeasurementsTable).where(eq(serviceMeasurementsTable.memberId, memberId));
  const notificationEvents = await db.select().from(notificationEventsTable).where(eq(notificationEventsTable.recipientMemberId, memberId));
  const devices = await db.select().from(deviceRegistrationsTable).where(eq(deviceRegistrationsTable.memberId, memberId));
  const deliveries = devices.length ? await db.select().from(notificationDeliveryQueueTable).where(inArray(notificationDeliveryQueueTable.registrationId, devices.map(x => x.id))) : [];
  const securityReports = await db.select().from(operationsRecordsTable).where(and(eq(operationsRecordsTable.kind, "security"), sql`${operationsRecordsTable.actorClerkUserId}=(select clerk_user_id from members where id=${memberId})`));
  return { feedback, notificationEvents, securityReports, deliveries: deliveries.map(({ id, status, createdAt }) => ({ id, status, createdAt })),
    modules: listDeletionHooks(), processors: ["Clerk identity", "App Storage", "database/backups", "operational logs"],
    limitations: "Provider secrets/tokens and other people's private content are excluded. Backup expiry and retained evidence are tracked separately; inactive access is immediate, not proof of provider erasure." };
}
export async function recordHumanResponse(kind: string, subjectId: string, actorClerkUserId: string) {
  await db.insert(humanResponsesTable).values({ id: randomUUID(), kind, subjectId, actorClerkUserId }).onConflictDoNothing();
}
