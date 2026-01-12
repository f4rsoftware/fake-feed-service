import { Worker } from "bullmq";
import Redis from "ioredis";
import { publishEventForCity } from "../services/eventPublisher.js";
import { quotaManager } from "../core/weeklyQuotaManager.js";
import { appConfig } from "../config/appConfig.js";
import { loadRules } from "../config/rules.js";
import logger from "../utils/logger.js";

const connection = new Redis({
  host: appConfig.redis.host,
  port: appConfig.redis.port,
  password: appConfig.redis.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Rules'dan geçmiş job toleransını oku
const rules = loadRules();
const maxJobDelayToleranceMinutes = rules.SchedulerRules?.maxJobDelayToleranceMinutes || 30;
const MAX_JOB_DELAY_TOLERANCE_MS = maxJobDelayToleranceMinutes * 60 * 1000;

export const eventWorker = new Worker(
  "robot-events",
  async (job) => {
    if (job.name === "publishEvent") {
      const { city, cityConfig, scheduledAt } = job.data;

      // Geçmiş job kontrolü: Sistem kapalıyken biriken jobları atlama
      if (scheduledAt) {
        const now = Date.now();
        const delayMs = now - scheduledAt;

        if (delayMs > MAX_JOB_DELAY_TOLERANCE_MS) {
          const delayMinutes = Math.round(delayMs / 60000);
          logger.warn(
            `⏭ Geçmiş job atlandı: ${city} | ` +
            `Planlanan: ${new Date(scheduledAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} | ` +
            `Gecikme: ${delayMinutes} dakika (tolerans: ${maxJobDelayToleranceMinutes} dk)`
          );
          return; // Job'u işleme, atla
        }
      }

      logger.info(`📢 Worker: ${city} için ilan başlatılıyor... (type: ${cityConfig?.type || 'daily'})`);

      // Event oluştur (cityConfig ile adliye filtrelemesi yapılır)
      const result = await publishEventForCity(city, cityConfig || {});

      // Başarılı olduysa haftalık kotayı güncelle
      if (result) {
        await quotaManager.incrementUsed(city, 1);
        logger.info(`✅ Event başarıyla yayınlandı: ${city}`);
      } else {
        // City/Courthouse bulunamadı veya başka sorun - atlandı
        // Kota artırılmaz, hata fırlatılmaz (retry yapılmaz)
        logger.warn(`⚠️ ${city}: Event oluşturulamadı, kota artırılmadı`);
      }
    }
  },
  { connection }
);
