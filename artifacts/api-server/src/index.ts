import type { Server } from 'node:http';
import "./lib/loadEnv";
import app from "./app";
import { bootstrapInterviewVoice, createHttpServer } from "./lib/interviewPractice/wsServer";
import { startGmailAutoSync } from "./lib/gmail/autoSync";
import { startJobResearchAutoScheduler } from "./lib/jobResearch/autoResearch";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server: Server = createHttpServer(app);

void bootstrapInterviewVoice().then(() => {
  server.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startGmailAutoSync();
    startJobResearchAutoScheduler();
  });
});
