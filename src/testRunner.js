import { eventQueue } from "./jobs/event.queue.js";
import logger from "./utils/logger.js";

// Manuel test için fonksiyon
async function runTest() {
  const city = process.argv[2] || "Rize"; // komut satırında parametre verilmezse default Rize
  const delaySec = parseInt(process.argv[3] || "5", 10); // default 5 saniye gecikme

  logger.info(`🧪 Test başlıyor → ${city}, ${delaySec} saniye sonra çalışacak`);

  await eventQueue.add("publishEvent", { city }, { delay: delaySec * 1000 });

  logger.info("✅ Job kuyruklandı");
}

runTest().then(() => {
  logger.info("🎯 TestRunner tamamlandı. Worker job'u zamanı gelince alacak.");
  process.exit(0);
});
