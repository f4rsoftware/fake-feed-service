import { Queue } from "bullmq";
import Redis from "ioredis";
import { appConfig } from "../config/appConfig.js";

const connection = new Redis({
  host: appConfig.redis.host,
  port: appConfig.redis.port,
  password: appConfig.redis.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const eventQueue = new Queue("robot-events", { connection });
