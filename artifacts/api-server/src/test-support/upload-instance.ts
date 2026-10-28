// Separate OS process used only by upload admission integration tests.
import { createApp } from "../app";
import { configureTestMediaStorage } from "../lib/media-storage";
import { pool } from "@workspace/db";

if (process.env.NODE_ENV !== "test" || !process.send) throw new Error("Test instance cannot run in production");
const objects = new Map<string, { bytes: Buffer; contentType?: string; deleted?: boolean }>();
configureTestMediaStorage(objects);
const app = createApp({ authMiddleware: (req: any, _res, next) => {
  const userId = req.header("x-test-user") ?? null;
  req.auth = Object.assign(() => ({ userId, tokenType: "session_token", sessionClaims: { fva: [0, 0] } }), { [Symbol.for("@clerk/express.auth")]: true });
  next();
} });
const server = app.listen(0, "127.0.0.1", () => process.send!({ port: (server.address() as { port: number }).port }));
process.on("message", async (message: string) => {
  if (message === "objects") process.send!({ objects: [...objects].filter(([, v]) => !v.deleted).map(([path, v]) => ({ path, bytes: v.bytes.length })) });
  if (message === "stop") { server.closeAllConnections(); server.close(); await pool.end(); process.exit(0); }
});
