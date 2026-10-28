import { Router, type IRouter } from "express";
import healthRouter from "./health";
import experienceRouter from "./experience";
import accountRouter from "./account";
import staffRouter from "./staff";
import profileRouter from "./profile";
import safetyRouter from "./safety";
import relationshipsRouter from "./relationships";
import postsRouter from "./posts";
import mediaRouter from "./media";
import circlesRouter from "./circles";
import groupsRouter from "./groups";
import messagesRouter from "./messages";
import notificationsRouter from "./notifications";
import educationRouter from "./education";
import resourcesRouter from "./resources";
import videoRouter from "./video";
import memoriesRouter from "./memories";
import operationsRouter from "./operations";
import uploadIngestionRouter from "./upload-ingestion";
import { UploadAdmissionError } from "../lib/upload-admission";
import type { ErrorRequestHandler } from "express";

const router: IRouter = Router();

router.use(healthRouter);
router.use(operationsRouter);
router.use(experienceRouter);
router.use(accountRouter);
router.use(staffRouter);
router.use(profileRouter);
router.use(safetyRouter);
router.use(relationshipsRouter);
router.use(postsRouter);
router.use(mediaRouter);
router.use(uploadIngestionRouter);
router.use(circlesRouter);
router.use(groupsRouter);
router.use(notificationsRouter);
router.use(messagesRouter);
router.use(educationRouter);
router.use(resourcesRouter);
router.use(videoRouter);
router.use(memoriesRouter);
const admissionErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof UploadAdmissionError)) { next(error); return; }
  if (error.status === 429) res.setHeader("Retry-After", "60");
  res.status(error.status).json({ error: error.message });
};
router.use(admissionErrors);

export default router;
