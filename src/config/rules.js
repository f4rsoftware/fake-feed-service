import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let rules = null;

export function loadRules() {
  if (!rules) {
    try {
      const filePath = path.join(__dirname, "rules.json");
      const raw = fs.readFileSync(filePath, "utf-8");
      rules = JSON.parse(raw);
      logger.info("📖 Kurallar yüklendi");
    } catch (err) {
      logger.error("❌ rules.json okunamadı", err);
      throw err;
    }
  }
  return rules;
}
