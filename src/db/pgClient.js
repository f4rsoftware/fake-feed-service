import pkg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

const { Pool } = pkg;

const NODE_ENV = process.env.NODE_ENV || "development";

// Ortam bazlı config seç
const dbConfig =
  NODE_ENV === "production"
    ? {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }
    : {
        host: process.env.DEV_DB_HOST,
        port: process.env.DEV_DB_PORT,
        user: process.env.DEV_DB_USER,
        password: process.env.DEV_DB_PASSWORD,
        database: process.env.DEV_DB_NAME,
      };

// Pool oluştur
const pool = new Pool(dbConfig);

// Test bağlantısı
pool
  .connect()
  .then((client) => {
    logger.info(
      `📦 PostgreSQL bağlantısı başarılı → ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`
    );
    client.release();
  })
  .catch((err) => {
    logger.error("❌ PostgreSQL bağlantısı başarısız", err);
  });

// Query helper
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug(`📝 SQL: ${text} | ⏱ ${duration}ms`);
    return res;
  } catch (err) {
    logger.error(`❌ SQL Hatası: ${text}`, err);
    throw err;
  }
}

export default pool;
