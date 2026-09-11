import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { createClerkClient } from "@clerk/backend";
import { reverificationError } from "@clerk/backend/internal";
import { db, deletionRequestsTable, memberConsentsTable, membersTable } from "@workspace/db";
import {
  CompleteOnboardingBody,
  CompleteOnboardingResponse,
  GetAccountSummaryResponse,
  GetDeletionStatusResponse,
  InitiateDeletionBody,
  InitiateDeletionResponse,
} from "@workspace/api-zod";
import { requireAuth, sensitiveRateLimit } from "../middlewares/account-auth";
import { AGE_POLICY_VERSION, ALLOWED_AGE_METHODS, hasCurrentConsent, isAdultEligible, validOnboardingDocuments, freshFirstFactor } from "../lib/account-policy";

const router: IRouter = Router();
router.use("/account", requireAuth);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });

router.post("/account/onboarding", sensitiveRateLimit(), async (req, res): Promise<void> => {
  const parsed = CompleteOnboardingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const auth = getAuth(req);
  const userId = auth.userId!;
  const user = await clerk.users.getUser(userId);
  const primaryEmail = user.primaryEmailAddressId
    ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
    : undefined;
  if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
    res.status(403).json({ error: "A verified email is required" }); return;
  }
  if (!isAdultEligible(parsed.data.ageEligible)) {
    res.status(403).json({ error: "This service is for adults 18 and over" }); return;
  }
  if (!validOnboardingDocuments(parsed.data.acceptedDocuments) || !ALLOWED_AGE_METHODS.includes(parsed.data.ageEligibilityMethod as typeof ALLOWED_AGE_METHODS[number]) || parsed.data.agePolicyVersion !== AGE_POLICY_VERSION) {
    res.status(400).json({ error: "All current documents must be accepted" }); return;
  }
  const now = new Date();
  const [member] = await db.insert(membersTable).values({
    id: randomUUID(), clerkUserId: userId, emailVerified: true,
    ageEligible: true, ageEligibilityMethod: parsed.data.ageEligibilityMethod,
    agePolicyVersion: parsed.data.agePolicyVersion, ageCheckedAt: now,
  }).onConflictDoUpdate({ target: membersTable.clerkUserId, set: {
    emailVerified: true, ageEligible: true, ageEligibilityMethod: parsed.data.ageEligibilityMethod,
    agePolicyVersion: parsed.data.agePolicyVersion, ageCheckedAt: now, updatedAt: now,
  }}).returning();
  for (const document of parsed.data.acceptedDocuments) {
    await db.insert(memberConsentsTable).values({
      memberId: member.id, document: document.document, version: document.version, acceptedAt: now,
    }).onConflictDoUpdate({ target: [memberConsentsTable.memberId, memberConsentsTable.document], set: { version: document.version, acceptedAt: now } });
  }
  res.json(CompleteOnboardingResponse.parse({ memberId: member.id, emailVerified: true, ageEligible: true, acceptedDocuments: parsed.data.acceptedDocuments.map((d) => d.document) }));
});

router.get("/account", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const member = (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const consents = await db.select().from(memberConsentsTable).where(eq(memberConsentsTable.memberId, member.id));
  if (!member.emailVerified || !member.ageEligible || member.agePolicyVersion !== AGE_POLICY_VERSION ||
      !hasCurrentConsent(new Map(consents.map((consent) => [consent.document, consent.version])))) {
    res.status(404).json({ error: "Onboarding required" }); return;
  }
  res.json(GetAccountSummaryResponse.parse({ memberId: member.id, emailVerified: member.emailVerified, ageEligible: member.ageEligible, acceptedDocuments: consents.map((c) => c.document) }));
});

router.get("/account/sessions", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const sessions = await clerk.sessions.getSessionList({ userId: auth.userId! });
  res.json(sessions.data.map((session) => ({
    id: session.id, status: session.status, isCurrent: session.id === auth.sessionId,
    lastActiveAt: session.lastActiveAt ? new Date(session.lastActiveAt).toISOString() : null,
    deviceName: null,
  })));
});

router.delete("/account/sessions/others", sensitiveRateLimit(), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const sessions = await clerk.sessions.getSessionList({ userId: auth.userId!, status: "active" });
  await Promise.all(sessions.data.filter((session) => session.id !== auth.sessionId).map((session) => clerk.sessions.revokeSession(session.id)));
  res.sendStatus(204);
});
router.delete("/account/sessions/:sessionId", sensitiveRateLimit(), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const sessions = await clerk.sessions.getSessionList({ userId: auth.userId! });
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  if (!sessions.data.some((session) => session.id === sessionId)) { res.status(403).json({ error: "Session is not owned by this member" }); return; }
  await clerk.sessions.revokeSession(sessionId);
  res.sendStatus(204);
});

router.get("/account/deletion", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const member = (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
  const request = member && (await db.select().from(deletionRequestsTable).where(and(eq(deletionRequestsTable.memberId, member.id), eq(deletionRequestsTable.status, "pending"))).orderBy(desc(deletionRequestsTable.requestedAt)).limit(1))[0];
  res.json(GetDeletionStatusResponse.parse({ status: request?.status ?? "none", requestedAt: request?.requestedAt ?? null }));
});

router.post("/account/deletion", sensitiveRateLimit(5), async (req, res): Promise<void> => {
  const parsed = InitiateDeletionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const auth = getAuth(req);
  const factorAge = (auth.sessionClaims as Record<string, unknown> | undefined)?.fva;
  if (!freshFirstFactor(factorAge)) {
    res.status(403).json(reverificationError({
      level: "first_factor",
      afterMinutes: 5,
    }));
    return;
  }
  const userId = auth.userId!;
  const member = (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
  if (!member) { res.status(404).json({ error: "Onboarding required" }); return; }
  const [request] = await db.insert(deletionRequestsTable).values({ id: randomUUID(), memberId: member.id, status: "pending", reauthMethod: "clerk-session-fva", reauthenticatedAt: new Date() }).returning();
  res.status(202).json(InitiateDeletionResponse.parse({ status: request.status, requestedAt: request.requestedAt }));
});

router.delete("/account/deletion", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const member = (await db.select().from(membersTable).where(eq(membersTable.clerkUserId, userId)).limit(1))[0];
  if (member) await db.update(deletionRequestsTable).set({ status: "cancelled", cancelledAt: new Date() }).where(and(eq(deletionRequestsTable.memberId, member.id), eq(deletionRequestsTable.status, "pending")));
  res.sendStatus(204);
});

export default router;