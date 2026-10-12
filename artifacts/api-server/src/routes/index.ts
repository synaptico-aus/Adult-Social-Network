import { Router, type IRouter } from "express";
import healthRouter from "./health";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(staffRouter);
router.use(profileRouter);
router.use(safetyRouter);
router.use(relationshipsRouter);
router.use(postsRouter);
router.use(mediaRouter);
router.use(circlesRouter);
router.use(groupsRouter);
router.use(notificationsRouter);
router.use(messagesRouter);
router.use(educationRouter);
router.use(resourcesRouter);
router.use(videoRouter);

export default router;
