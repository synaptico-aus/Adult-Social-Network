import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { countOperational, operationalFeatureGate, auditOperation } from "./lib/operations-policy";
import { getAuth } from "@clerk/express";
import { staffScopeGate } from "./middlewares/staff-scope";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

export function createApp(options: { authMiddleware?: RequestHandler } = {}): Express {
const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  options.authMiddleware ?? clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", async (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 500) void countOperational(`http5xx:${new Date().toISOString().slice(0, 13)}`).catch(() => logger.error("Failure counter could not be persisted"));
  });
  if (req.path.startsWith("/staff/")) {
    res.set("Cache-Control", "private, no-store");
    if (req.method === "GET") {
      const actor = getAuth(req).userId;
      if (actor) try { await auditOperation(actor, "staff.read_attempt", null, { outcome: "before_authorization" }); }
      catch { res.status(503).json({ error: "Staff audit logging is unavailable; access is paused" }); return; }
    }
  }
  next();
}, operationalFeatureGate, staffScopeGate, router);

return app;
}

const app = createApp();
export default app;
