import logger from "../utils/logger.js";

/**
 * Haftalık kotayı 5 güne (Pazartesi-Cuma) dağıtır
 * Cumartesi ve Pazar tatil, ilan oluşturulmaz
 * @param {number} weeklyQuota - Haftalık toplam kota
 * @param {string} strategy - Dağıtım stratejisi: "uniform", "weighted", "random"
 * @param {Object} weights - Weighted stratejisi için gün ağırlıkları (opsiyonel)
 * @returns {Object} Günlük dağılım {monday: 10, tuesday: 12, ..., saturday: 0, sunday: 0}
 */
export function distributeWeeklyQuota(weeklyQuota, strategy = "uniform", weights = null) {
  // Sadece hafta içi günler (Cumartesi-Pazar hariç)
  const workDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const allDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  let distribution = {};

  // Hafta sonu günlerini 0 yap
  distribution.saturday = 0;
  distribution.sunday = 0;

  if (strategy === "weighted" && weights) {
    // Ağırlıklı dağıtım (sadece hafta içi ağırlıkları kullan)
    const workDayWeights = {};
    workDays.forEach(day => {
      workDayWeights[day] = weights[day] || 0;
    });

    const totalWeight = Object.values(workDayWeights).reduce((sum, w) => sum + w, 0);

    if (totalWeight === 0) {
      // Eğer hafta içi ağırlık yoksa uniform'a düş
      logger.warn("⚠️  Weighted stratejide hafta içi ağırlık bulunamadı, uniform'a geçiliyor");
      const baseQuota = Math.floor(weeklyQuota / 5);
      const remainder = weeklyQuota % 5;

      workDays.forEach((day, index) => {
        distribution[day] = baseQuota + (index < remainder ? 1 : 0);
      });
    } else {
      let allocated = 0;

      workDays.forEach((day) => {
        const weight = workDayWeights[day];
        const quota = Math.floor((weeklyQuota * weight) / totalWeight);
        distribution[day] = quota;
        allocated += quota;
      });

      // Kalan kotayı dağıt (round-robin, sadece hafta içi)
      let remainder = weeklyQuota - allocated;
      let dayIndex = 0;
      while (remainder > 0) {
        distribution[workDays[dayIndex]]++;
        remainder--;
        dayIndex = (dayIndex + 1) % 5;
      }
    }

  } else if (strategy === "random") {
    // Rastgele dağıtım (sadece hafta içi 5 gün)
    let remaining = weeklyQuota;

    workDays.forEach((day, index) => {
      if (index === 4) {
        // Cuma (son iş günü) kalanı alır
        distribution[day] = remaining;
      } else {
        const daysLeft = 5 - index;
        const avgPerDay = Math.floor(remaining / daysLeft);
        const variance = Math.floor(avgPerDay * 0.3); // %30 varyans

        const minForDay = Math.max(0, avgPerDay - variance);
        const maxForDay = avgPerDay + variance;

        const quota = Math.floor(Math.random() * (maxForDay - minForDay + 1)) + minForDay;
        distribution[day] = quota;
        remaining -= quota;
      }
    });

    // Negatif değer kontrolü
    if (remaining < 0) {
      distribution.friday = Math.max(0, distribution.friday + remaining);
    }

  } else {
    // Uniform dağıtım (sadece hafta içi 5 gün)
    const baseQuota = Math.floor(weeklyQuota / 5);
    const remainder = weeklyQuota % 5;

    workDays.forEach((day, index) => {
      distribution[day] = baseQuota + (index < remainder ? 1 : 0);
    });
  }

  logger.debug(`📊 Haftalık dağılım (${strategy}, sadece hafta içi): ${JSON.stringify(distribution)}`);
  return distribution;
}

/**
 * Bugünün kotasını haftalık dağılımdan getirir
 * @param {Object} weeklyDistribution - Haftalık dağılım objesi
 * @param {Date} date - Tarih (varsayılan: bugün)
 * @returns {number} Bugünün kotası
 */
export function getTodayQuota(weeklyDistribution, date = new Date()) {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = days[date.getDay()];
  return weeklyDistribution[dayName] || 0;
}

/**
 * Gün adını Date objesinden çıkarır
 * @param {Date} date - Tarih
 * @returns {string} Gün adı (lowercase)
 */
export function getDayName(date = new Date()) {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return days[date.getDay()];
}
