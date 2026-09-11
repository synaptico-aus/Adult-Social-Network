import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { requireAuth } from "./account-auth";
import { db, staffRoleAssignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { STAFF_ROLE_CAPABILITIES, roleHasCapability } from "../lib/staff-policy";

/** Staff is an explicit assignment, never a profile label or legacy metadata claim. */
export const requireStaffMfa: RequestHandler[] = [
  requireAuth,
  async (req, res, next) => {
    const auth = getAuth(req);
    const claims = auth.sessionClaims as Record<string, unknown> | undefined;
    const fva = claims?.fva;
    const assignment = (await db.select().from(staffRoleAssignmentsTable).where(and(eq(staffRoleAssignmentsTable.clerkUserId, auth.userId!), eq(staffRoleAssignmentsTable.active, true))).limit(1))[0];
    if (!assignment || !freshStaffPermission(fva, assignment.role)) {
      res.status(403).json({ error: "Staff permission and fresh MFA are required" });
      return;
    }
    next();
  },
];

function freshStaffPermission(fva: unknown, assignedRole: string): boolean {
  return Boolean(STAFF_ROLE_CAPABILITIES[assignedRole]) && Array.isArray(fva) && typeof fva[1] === "number" && fva[1] >= 0 && fva[1] <= 5;
}

/** Capability gate for staff routes; profile roles are never consulted. */
export function requireStaffCapability(capability: string): RequestHandler[] {
  return [...requireStaffMfa, async (req, res, next) => {
    const auth = getAuth(req);
    const assignment = (await db.select().from(staffRoleAssignmentsTable).where(and(eq(staffRoleAssignmentsTable.clerkUserId, auth.userId!), eq(staffRoleAssignmentsTable.active, true))).limit(1))[0];
    if (!assignment) { res.status(403).json({ error: "Staff capability is required" }); return; }
    // Assignment capabilities are an explicit narrowing/addition set, never a wildcard.
    if (!roleHasCapability(assignment.role, capability, assignment.capabilities)) { res.status(403).json({ error: "Staff capability is required" }); return; }
    next();
  }];
}