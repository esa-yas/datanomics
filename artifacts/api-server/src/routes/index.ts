import { Router, type IRouter } from "express";
import aiRouter from "./ai";
import healthRouter from "./health";
import gmailRouter from "./gmail";
import jobResearchRouter from "./jobResearch";
import recruiterReplyRouter from "./recruiterReply";

import interviewPracticeRouter from "./interviewPractice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(recruiterReplyRouter);
router.use(gmailRouter);
router.use(jobResearchRouter);
router.use(interviewPracticeRouter);

export default router;
