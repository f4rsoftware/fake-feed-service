import redis from "../redis/redisClient.js";
import logger from "../utils/logger.js";

/**
 * ISO hafta numarasını hesaplar (1-53)
 * ISO 8601 standardı: Pazartesi haftanın ilk günüdür
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Pazar = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

/**
 * Haftanın Pazartesi ve Pazar tarihlerini hesaplar
 */
function getWeekBoundaries(date) {
  const dayOfWeek = date.getDay() || 7; // Pazar = 7
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

/**
 * Haftalık kota yönetimi için Redis tabanlı servis
 */
export class WeeklyQuotaManager {

  /**
   * Şehir için haftalık kota durumunu getirir
   * @param {string} city - Şehir adı
   * @param {Date} date - Tarih (varsayılan: bugün)
   * @returns {Promise<Object|null>} Kota durumu veya null
   */
  async getWeeklyState(city, date = new Date()) {
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    const key = `weekly:quota:${city.toLowerCase()}:${year}:${week}`;

    try {
      const state = await redis.hgetall(key);

      if (!state || !state.total) {
        return null;
      }

      return {
        total: parseInt(state.total),
        used: parseInt(state.used || 0),
        remaining: parseInt(state.remaining || state.total),
        startDate: state.startDate,
        endDate: state.endDate,
        week,
        year
      };
    } catch (err) {
      logger.error(`❌ Redis error in getWeeklyState for ${city}:`, err);
      return null;
    }
  }

  /**
   * Haftalık kota başlatır
   * @param {string} city - Şehir adı
   * @param {number} totalQuota - Toplam haftalık kota
   * @param {Date} date - Tarih (varsayılan: bugün)
   */
  async initializeWeek(city, totalQuota, date = new Date()) {
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    const key = `weekly:quota:${city.toLowerCase()}:${year}:${week}`;

    const { monday, sunday } = getWeekBoundaries(date);

    try {
      await redis.hset(key, {
        total: totalQuota,
        used: 0,
        remaining: totalQuota,
        startDate: monday.toISOString().split('T')[0],
        endDate: sunday.toISOString().split('T')[0]
      });

      // 2 haftalık expiry (güvenlik için)
      await redis.expire(key, 14 * 24 * 60 * 60);

      logger.info(`📊 Haftalık kota başlatıldı: ${city} = ${totalQuota} (hafta ${week}, ${year})`);
    } catch (err) {
      logger.error(`❌ Redis error in initializeWeek for ${city}:`, err);
      throw err;
    }
  }

  /**
   * Kullanılan kotayı artırır
   * @param {string} city - Şehir adı
   * @param {number} count - Artırılacak miktar
   * @param {Date} date - Tarih (varsayılan: bugün)
   */
  async incrementUsed(city, count = 1, date = new Date()) {
    const year = date.getFullYear();
    const week = getWeekNumber(date);
    const key = `weekly:quota:${city.toLowerCase()}:${year}:${week}`;

    try {
      await redis.hincrby(key, "used", count);
      await redis.hincrby(key, "remaining", -count);

      logger.debug(`📈 Kota güncellendi: ${city} +${count} kullanıldı`);
    } catch (err) {
      logger.error(`❌ Redis error in incrementUsed for ${city}:`, err);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Kalan kotayı getirir
   * @param {string} city - Şehir adı
   * @param {Date} date - Tarih (varsayılan: bugün)
   * @returns {Promise<number>} Kalan kota miktarı
   */
  async getRemainingQuota(city, date = new Date()) {
    const state = await this.getWeeklyState(city, date);
    return state ? state.remaining : 0;
  }

  /**
   * Kota kullanılabilir mi kontrol eder
   * @param {string} city - Şehir adı
   * @param {number} count - İstenen miktar
   * @param {Date} date - Tarih (varsayılan: bugün)
   * @returns {Promise<boolean>} Kota yeterli mi?
   */
  async hasQuotaAvailable(city, count = 1, date = new Date()) {
    const remaining = await this.getRemainingQuota(city, date);
    return remaining >= count;
  }

  /**
   * Yeni hafta başlangıcı kontrolü yapar
   * @param {string} city - Şehir adı
   * @param {Date} date - Tarih (varsayılan: bugün)
   * @returns {Promise<boolean>} Yeni hafta mı?
   */
  async isNewWeek(city, date = new Date()) {
    const state = await this.getWeeklyState(city, date);

    if (!state) {
      return true; // İlk kez başlatılıyor
    }

    const stateDate = new Date(state.startDate);
    const weekAgo = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000);

    return stateDate < weekAgo;
  }
}

// Singleton instance
export const quotaManager = new WeeklyQuotaManager();
