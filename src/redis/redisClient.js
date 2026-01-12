import Redis from "ioredis";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

let redis;
let redisUrl, host, port, password;

if (process.env.NODE_ENV === "production") {
  redisUrl = process.env.PROD_REDIS_URL;
  host = process.env.PROD_REDIS_HOST;
  port = process.env.PROD_REDIS_PORT;
  password = process.env.PROD_REDIS_PASSWORD;
} else {
  redisUrl = process.env.REDIS_URL;
  host = process.env.REDIS_HOST;
  port = process.env.REDIS_PORT;
  password = process.env.REDIS_PASSWORD;
}

if (redisUrl) {
  redis = new Redis(redisUrl);
  logger.info(`🔌 Redis'e bağlanılıyor → ${redisUrl}`);
} else {
  redis = new Redis({
    host: host || "127.0.0.1",
    port: port || 6379,
    password: password || undefined,
  });
  logger.info(`🔌 Redis'e bağlanılıyor → ${host}:${port}`);
}

redis.on("connect", () => {
  logger.info("✅ Redis bağlantısı başarılı");
});

redis.on("error", (err) => {
  logger.error("❌ Redis bağlantı hatası", err);
});

export default redis;