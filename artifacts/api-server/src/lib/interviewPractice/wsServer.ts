import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import { initInterviewAgent } from './elevenLabsAgent';

export function createHttpServer(app: Express): Server {
  return createServer(app);
}

export async function bootstrapInterviewVoice(): Promise<void> {
  await initInterviewAgent();
}
