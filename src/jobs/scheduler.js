import cron from "node-cron";
import { eventQueue } from "./event.queue.js";
import { generateDailyPlan } from "../core/schedulerPlan.js";
import { appConfig } from "../config/appConfig.js";
import { clearRobotEventsQueue } from "../utils/cleanQueue.js";
import { simulateEventForCity } from "../services/eventPublisher.js";
import logger from "../utils/logger.js";

async function scheduleDailyJobs() {
  const isDryRun = appConfig.scheduler.dryRun;
  const isSimulation = appConfig.scheduler.simulationMode;

  let modeLabel = "";
  if (isSimulation) modeLabel = " [SİMÜLASYON MODU]";
  else if (isDryRun) modeLabel = " [DRY-RUN MODU]";

  logger.info("🌅 Yeni gün planlaması başlıyor..." + modeLabel);

  try {
    // 1) Planı oluştur (artık async)
    const plan = await generateDailyPlan();

    // 2) Plan özetini göster
    logger.info("═".repeat(60));
    logger.info("📅 GÜNLÜK İLAN PLANI" + (isDryRun ? " [SADECE ÖNİZLEME - Redis'e yüklenmeyecek]" : ""));
    logger.info("═".repeat(60));

    // Şehir bazlı özet
    const citySummary = plan.reduce((acc, job) => {
      const key = `${job.city} (${job.cityConfig?.type || 'daily'})`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    logger.info("📊 Şehir Özeti:");
    for (const [city, count] of Object.entries(citySummary)) {
      logger.info(`   ${city}: ${count} ilan`);
    }
    logger.info(`   TOPLAM: ${plan.length} ilan`);
    logger.info("─".repeat(60));

    // Detaylı plan
    logger.info("📋 Detaylı Plan:");
    plan.forEach((job, i) => {
      const timeStr = job.scheduleAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
      const typeIcon = job.cityConfig?.type === 'weekly' ? '📍' : '🏛';
      logger.info(
        `   ${String(i + 1).padStart(3, "0")}. ${typeIcon} ${job.city.padEnd(15)} → ${timeStr}`
      );
    });
    logger.info("═".repeat(60));

    // DRY-RUN modunda burada dur
    if (isDryRun) {
      logger.warn("🔸 DRY-RUN modu aktif - Redis'e yükleme yapılmadı!");
      logger.warn("🔸 Gerçek çalıştırma için .env'de SCHEDULER_DRY_RUN=false yapın");
      return;
    }

    // SİMÜLASYON MODU: Tüm jobları anında çalıştır, DB/API'ye yazma
    if (isSimulation) {
      logger.warn("🧪 SİMÜLASYON MODU - Tüm seçimler yapılacak ama DB'ye yazılmayacak");
      logger.info("═".repeat(60));

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < plan.length; i++) {
        const job = plan[i];
        logger.info(`\n🔄 [${i + 1}/${plan.length}] ${job.city} simüle ediliyor...`);

        const result = await simulateEventForCity(job.city, job.cityConfig || {});

        if (result) {
          successCount++;
        } else {
          failCount++;
        }
      }

      logger.info("\n" + "═".repeat(60));
      logger.info(`🧪 SİMÜLASYON TAMAMLANDI: ${successCount} başarılı, ${failCount} başarısız`);
      logger.warn("🔸 Gerçek çalıştırma için .env'de SIMULATION_MODE=false yapın");
      return;
    }

    // 3) Kuyruğu temizle (sadece gerçek modda)
    await clearRobotEventsQueue();

    // 4) Kuyruğa ekle (geçmiş jobları atla)
    let addedCount = 0;
    let skippedCount = 0;

    for (const job of plan) {
      const delay = job.scheduleAt.getTime() - Date.now();

      if (delay > 0) {
        const addedJob = await eventQueue.add(
          "publishEvent",
          {
            city: job.city,
            cityConfig: job.cityConfig,
            scheduledAt: job.scheduleAt.getTime()
          },
          {
            delay,
            removeOnComplete: true,
            removeOnFail: true
          }
        );
        addedCount++;

        logger.debug(
          `📌 Job kuyruğa eklendi: ${job.city} (${job.cityConfig?.type || 'daily'}) | ` +
          `Çalışma: ${job.scheduleAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} | ` +
          `JobID: ${addedJob.id}`
        );
      } else {
        skippedCount++;
        logger.warn(
          `⏭ Geçmiş job atlandı → ${job.city} (${job.scheduleAt.toLocaleString("tr-TR", {
            timeZone: "Europe/Istanbul",
          })})`
        );
      }
    }

    logger.info(`✅ Günlük plan kuyruğa yazıldı: ${addedCount} eklendi, ${skippedCount} atlandı`);

  } catch (err) {
    logger.error("❌ Günlük plan oluşturulurken hata:", err);
  }
}

export function startScheduler() {
  // Her gün sabah 07:00’de İstanbul saatine göre çalıştır
  cron.schedule("0 7 * * *", scheduleDailyJobs, {
    timezone: "Europe/Istanbul",
  });

  // Dev ortamda opsiyonel: hemen başlat
  if (appConfig.scheduler.forcePlanOnStart) {
    logger.warn("⚡ FORCE_PLAN_ON_START aktif → günlük plan hemen üretilecek");
    scheduleDailyJobs();
  }
}
