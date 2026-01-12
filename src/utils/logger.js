import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const NODE_ENV = process.env.NODE_ENV || "development";

// Türkiye saati için timestamp fonksiyonu
const turkishTimestamp = () =>
  new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });

// Formatlar
const devFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: turkishTimestamp }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `[${timestamp}] ${level}: ${stack || message}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp({ format: turkishTimestamp }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Transportlar
const transports = [];

// Console her zaman var
transports.push(
  new winston.transports.Console({
    format: NODE_ENV === "production" ? prodFormat : devFormat,
  })
);

// Production’da dosyaya da yaz
if (NODE_ENV === "production") {
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/app-error.log"),
      level: "error",
    })
  );
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/app-combined.log"),
    })
  );
}

// Logger
const logger = winston.createLogger({
  level: LOG_LEVEL, // sadece bu seviyeye göre loglar görünür
  transports,
});

export default logger;
