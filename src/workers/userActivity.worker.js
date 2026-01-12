import redis from "../redis/redisClient.js";
import logger from "../utils/logger.js";
import { loadRules } from "../config/rules.js";
import { getRandomName } from "../utils/nameGenerator.js";

const CACHE_KEY = "cache:recent_activities";
const MAX_LENGTH = 10;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(prob) {
  return Math.random() < prob;
}

export async function runUserActivityWorker() {
  const rules = loadRules();
  const {
    ActivityTimingRules,
    RandomizationRules
  } = rules;

  logger.info("👤 UserActivityWorker çalıştı");

  if (chance(RandomizationRules.newUserRegistrationProbability)) {
    const fakeUserName = "Av." + getRandomName() + " *****";

    // REGISTERED aktivitesi
    const registeredActivity = {
      user: fakeUserName,
      activity: "REGISTERED",
      createdAt: new Date(), // UI ile uyumlu
    };

    await redis.rpush(CACHE_KEY, JSON.stringify(registeredActivity));
    await redis.ltrim(CACHE_KEY, -MAX_LENGTH, -1);
    logger.info(`🟢 REGISTERED: ${fakeUserName}`);

    // CONFIRMED için pending'e ekle
    const minDelay = ActivityTimingRules.REGISTERED_TO_CONFIRMED.minDelayMinutes;
    const maxDelay = ActivityTimingRules.REGISTERED_TO_CONFIRMED.maxDelayMinutes;
    const delayMinutes = randInt(minDelay, maxDelay);

    const executeAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    const pendingActivity = {
      user: fakeUserName,
      activity: "REGISTRATION_CONFIRMED",
      executeAt: executeAt.toISOString()
    };

    await redis.rpush("pending_activity", JSON.stringify(pendingActivity));
    logger.debug(`📌 Pending CONFIRMED eklendi → ${fakeUserName}, çalışacak: ${executeAt}`);
  } else {
    logger.debug("❌ Bu turda yeni kullanıcı üretilmedi");
  }
}
