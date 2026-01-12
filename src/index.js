import logger from "./utils/logger.js";
import cron from "node-cron";
import { runUserActivityWorker } from "./workers/userActivity.worker.js";
import { runPendingActivityWorker } from "./workers/pendingActivity.worker.js";
import { createRobotUsers } from "./db/queries/robotUser.js";
import { loadRules } from "./config/rules.js";

// ✅ Burada "./src/..." değil, direkt "./jobs/..." yazmalısın
import { startScheduler } from "./jobs/scheduler.js";   // cron job başlatır
import "./jobs/event.worker.js";                        // worker kuyruğu dinler

function randomMinutes(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(prob) {
  return Math.random() < prob;
}

/**
 * Şu anki saat dilimine göre aktivite aralığını döndürür
 */
function getActivityInterval() {
  const rules = loadRules();
  const { activityIntervals, timeSlots, burstProbability, quietPeriodProbability, weekendReduction } = rules.RandomizationRules;

  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0=Pazar, 6=Cumartesi
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Hafta sonu kontrolü
  if (isWeekend) {
    // Hafta sonu bazen tamamen sessiz geç
    if (chance(1 - weekendReduction)) {
      logger.debug("📅 Hafta sonu - bu tur atlanıyor");
      return { min: activityIntervals.weekend.min, max: activityIntervals.weekend.max, skipActivity: true };
    }
    return { ...activityIntervals.weekend, skipActivity: false };
  }

  // Burst modu: Bazen çok kısa aralıkla tekrar çalış
  if (chance(burstProbability)) {
    logger.debug("💥 Burst modu - kısa aralıklı aktivite");
    return { min: 3, max: 8, skipActivity: false };
  }

  // Sessizlik dönemi: Bazen uzun süre bekle
  if (chance(quietPeriodProbability)) {
    logger.debug("🤫 Sessizlik dönemi - uzun bekleme");
    return { min: 120, max: 180, skipActivity: false };
  }

  // Saat dilimine göre interval seç
  if (hour >= timeSlots.peakMorning.start && hour < timeSlots.peakMorning.end) {
    return { ...activityIntervals.peakHours, skipActivity: false };
  }
  if (hour >= timeSlots.lunchBreak.start && hour < timeSlots.lunchBreak.end) {
    return { ...activityIntervals.lunchBreak, skipActivity: false };
  }
  if (hour >= timeSlots.peakAfternoon.start && hour < timeSlots.peakAfternoon.end) {
    return { ...activityIntervals.peakHours, skipActivity: false };
  }
  if (hour >= timeSlots.evening.start && hour < timeSlots.evening.end) {
    return { ...activityIntervals.evening, skipActivity: false };
  }

  // Gece saatleri (21:00 - 09:00)
  return { ...activityIntervals.night, skipActivity: false };
}

async function scheduleUserActivity() {
  const interval = getActivityInterval();

  // Aktiviteyi çalıştır (skipActivity değilse)
  if (!interval.skipActivity) {
    await runUserActivityWorker();
    await runPendingActivityWorker();
  }

  // Bir sonraki çalıştırma süresini hesapla
  const nextMinutes = randomMinutes(interval.min, interval.max);
  const nextDelay = nextMinutes * 60 * 1000;

  const nextTime = new Date(Date.now() + nextDelay);
  const timeStr = nextTime.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });

  logger.info(`⏱ Sonraki aktivite: ${nextMinutes} dk sonra (${timeStr})`);

  // setTimeout ile tekrar planla
  setTimeout(scheduleUserActivity, nextDelay);
}

// Sistem ayağa kalkınca başlat
(async () => {
  logger.info("🚀 Sistem başlatıldı");

  // Robot kullanıcıları oluştur
  //await createRobotUsers();

  // 1) Günlük ilan scheduler’ı başlat
  startScheduler();

  // 2) Activity worker döngüsünü başlat
  scheduleUserActivity();
})();
