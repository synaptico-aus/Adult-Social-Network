import { and, eq, inArray, sql } from "drizzle-orm";
import { db, groupHostAssignmentsTable, groupMembersTable, groupMembershipRequestsTable, groupWelcomeRequestsTable } from "@workspace/db";
import { registerDeletionHook } from "./deletion-hooks";

registerDeletionHook({
  name: "group-authority-and-membership",
  async run({ memberId }) {
    await db.update(groupMembersTable).set({ status: "removed", removedAt: new Date() }).where(and(eq(groupMembersTable.memberId, memberId), eq(groupMembersTable.status, "active")));
    await db.update(groupHostAssignmentsTable).set({ active: false, revokedAt: sql`now()` }).where(and(eq(groupHostAssignmentsTable.hostMemberId, memberId), eq(groupHostAssignmentsTable.active, true)));
    await db.update(groupMembershipRequestsTable).set({ status: "cancelled", cancelledAt: new Date() }).where(and(eq(groupMembershipRequestsTable.memberId, memberId), eq(groupMembershipRequestsTable.status, "pending")));
    await db.update(groupWelcomeRequestsTable).set({ status: "closed", closedAt: new Date() }).where(and(eq(groupWelcomeRequestsTable.memberId, memberId), inArray(groupWelcomeRequestsTable.status, ["open", "acknowledged"])));
  },
});