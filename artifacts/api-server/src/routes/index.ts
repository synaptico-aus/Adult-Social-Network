import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountRouter from "./account";
import staffRouter from "./staff";
import profileRouter from "./profile";
import safetyRouter from "./safety";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(staffRouter);
router.use(profileRouter);
router.use(safetyRouter);

export default router;
