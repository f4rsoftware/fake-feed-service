import redis from "../redis/redisClient.js";
import logger from "../utils/logger.js";
import { loadRules } from "../config/rules.js";

const CACHE_KEY = "cache:recent_activities";
const MAX_LENGTH = 10;

function chance(prob) {
  return Math.random() < prob;
}

export async function runPendingActivityWorker() {
  const rules = loadRules();
  const { ActivityFlowRules } = rules;

  const now = new Date();
  const pendingList = await redis.lrange("pending_activity", 0, -1);

  for (const item of pendingList) {
    const activity = JSON.parse(item);
    const executeAt = new Date(activity.executeAt);

    if (executeAt <= now) {
      if (chance(ActivityFlowRules.activityCompletionProbability.REGISTRATION_CONFIRMED)) {
        const confirmedActivity = {
          user: activity.user,
          activity: "REGISTRATION_CONFIRMED",
          createdAt: new Date(),
        };

        await redis.rpush(CACHE_KEY, JSON.stringify(confirmedActivity));
        await redis.ltrim(CACHE_KEY, -MAX_LENGTH, -1);
        logger.info(`🟢 CONFIRMED: ${activity.user}`);
      } else {
        logger.warn(`⚠️ ${activity.user} kaydı onaylanmadı (olasılık gereği)`);
      }

      await redis.lrem("pending_activity", 1, item);
    }
  }
}
