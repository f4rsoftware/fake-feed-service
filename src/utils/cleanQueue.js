import { eventQueue } from "../jobs/event.queue.js";

export async function clearRobotEventsQueue() {
  try {
    // ⚠️ Tüm işler (delayed, waiting, active, completed, failed) silinir!
    await eventQueue.obliterate({ force: true });
    console.log("🚮 robot-events kuyruğu tamamen temizlendi");
  } catch (err) {
    console.error("❌ Kuyruk temizleme hatası:", err);
  }
}
