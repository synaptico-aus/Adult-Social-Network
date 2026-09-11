import { Router, type IRouter, type Request, type Response } from "express";
import { requireStaffMfa } from "../middlewares/staff-auth";
import { db, verificationRequestsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();
router.get("/staff/tools", requireStaffMfa, (_req: Request, res: Response): void => {
  res.json({ enabled: true, message: "Staff tools are server-authorized." });
});
router.get("/staff/verification-requests", requireStaffMfa, async (_req: Request, res: Response): Promise<void> => {
  res.json(await db.select().from(verificationRequestsTable).orderBy(desc(verificationRequestsTable.createdAt)));
});
router.patch("/staff/verification-requests/:id", requireStaffMfa, async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ status: z.enum(["approved", "rejected"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const reviewerId = getAuth(req).userId;
  if (!reviewerId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [request] = await db.update(verificationRequestsTable).set({ status: parsed.data.status, reviewedAt: new Date(), reviewedBy: reviewerId }).where(eq(verificationRequestsTable.id, String(req.params.id))).returning();
  if (!request) { res.status(404).json({ error: "Verification request not found" }); return; }
  res.json(request);
});
export default router;