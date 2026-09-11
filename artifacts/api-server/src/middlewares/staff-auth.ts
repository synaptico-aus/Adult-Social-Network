import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { requireAuth } from "./account-auth";
import { createClerkClient } from "@clerk/backend";
import { isStaff } from "../lib/account-policy";
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });

/** Staff is an explicit server-controlled claim, never a profile label. */
export const requireStaffMfa: RequestHandler[] = [
  requireAuth,
  async (req, res, next) => {
    const auth = getAuth(req);
    const claims = auth.sessionClaims as Record<string, unknown> | undefined;
    const fva = claims?.fva;
    const user = await clerk.users.getUser(auth.userId!);
    if (!isStaff(user.privateMetadata, fva)) {
      res.status(403).json({ error: "Staff permission and fresh MFA are required" });
      return;
    }
    next();
  },
];