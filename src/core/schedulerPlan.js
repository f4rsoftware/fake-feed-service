import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { loadRules } from "../config/rules.js"
import logger from "../utils/logger.js"
import { distributeWeeklyQuota, getDayName } from "./weeklyDistributor.js"
import { quotaManager } from "./weeklyQuotaManager.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const quotaPath = path.join(__dirname, "../config/quota.json")

/**
 * Quota konfigürasyonunu yükler
 * Eski format (basit key-value) ve yeni format (cities objesi) desteği
 */
function loadQuotaConfig() {
  const raw = fs.readFileSync(quotaPath, "utf-8")
  const config = JSON.parse(raw)

  // Eski format kontrolü (backward compatibility)
  if (!config.cities && !config.mode) {
    logger.warn("⚠️  Eski quota formatı algılandı. Daily mode olarak yorumlanıyor...")
    return {
      mode: "daily",
      cities: Object.entries(config).reduce((acc, [city, quota]) => {
        acc[city] = { quota, type: "daily" }
        return acc
      }, {})
    }
  }

  return config
}

/**
 * Günlük plan oluşturur (hem daily hem weekly mode destekler)
 */
export async function generateDailyPlan() {
  const rules = loadRules()
  const schedulerRules = rules.SchedulerRules
  const quotaConfig = loadQuotaConfig()

  const activeStart = schedulerRules.activeHours.start
  const activeEnd = schedulerRules.activeHours.end
  const gapMin = schedulerRules.minGapRange?.min || 20
  const gapMax = schedulerRules.minGapRange?.max || 30

  const today = new Date()
  const dayName = getDayName(today)
  let plan = []

  logger.info(`📅 Plan oluşturuluyor: ${today.toISOString().split('T')[0]} (${dayName})`)

  // Her şehir için işlem yap
  for (const [cityName, cityConfig] of Object.entries(quotaConfig.cities || {})) {
    let todayQuota = 0

    // Quota türünü belirle (şehir bazlı veya global)
    const quotaType = cityConfig.type || quotaConfig.mode || "daily"

    try {
      if (quotaType === "weekly") {
        // WEEKLY MODE

        // Haftalık state'i kontrol et
        let weeklyState = await quotaManager.getWeeklyState(cityName, today)

        if (!weeklyState) {
          // İlk kez başlatılıyor
          await quotaManager.initializeWeek(cityName, cityConfig.quota, today)
          weeklyState = await quotaManager.getWeeklyState(cityName, today)
        }

        // Pazartesi sabahı yeni hafta kontrolü
        if (today.getDay() === 1) {
          const isNewWeek = await quotaManager.isNewWeek(cityName, today)
          if (isNewWeek) {
            logger.info(`🔄 Yeni hafta başlangıcı: ${cityName}, haftalık kota sıfırlanıyor...`)
            await quotaManager.initializeWeek(cityName, cityConfig.quota, today)
            weeklyState = await quotaManager.getWeeklyState(cityName, today)
          }
        }

        // Haftalık kotayı günlere dağıt
        const strategy = cityConfig.distribution?.strategy || "uniform"
        const weights = cityConfig.distribution?.weights
        const weeklyDistribution = distributeWeeklyQuota(cityConfig.quota, strategy, weights)

        todayQuota = weeklyDistribution[dayName] || 0

        // Kalan kota kontrolü
        const remaining = weeklyState.remaining
        if (todayQuota > remaining) {
          logger.warn(
            `⚠️  ${cityName}: Planlanan kota (${todayQuota}) kalan kotayı aşıyor (${remaining}). Ayarlanıyor...`
          )
          todayQuota = Math.max(0, remaining)
        }

        logger.info(
          `📊 ${cityName} (weekly): Bugün=${todayQuota}, Kalan=${remaining}/${cityConfig.quota}`
        )

      } else {
        // DAILY MODE (eski davranış)
        todayQuota = cityConfig.quota || 0
        logger.info(`📅 ${cityName} (daily): ${todayQuota}`)
      }

    } catch (err) {
      // Redis hatası durumunda fallback
      logger.error(`❌ ${cityName} için quota hesaplanamadı, daily fallback kullanılıyor:`, err)
      todayQuota = Math.ceil((cityConfig.quota || 0) / 5) // Haftalık kotanın 1/5'i (sadece hafta içi)
      logger.warn(`⚠️  ${cityName}: Fallback quota = ${todayQuota}`)
    }

    if (todayQuota <= 0) {
      logger.debug(`⏭ ${cityName}: Bugün için kota yok, atlanıyor.`)
      continue
    }

    // Günlük time slotları oluştur
    const slots = distributeSlots(activeStart, activeEnd, todayQuota)

    for (const minute of slots) {
      const scheduleAt = buildDate(today, minute)
      plan.push({
        city: cityName,
        scheduleAt,
        cityConfig: {
          type: quotaType,
          excludedCourthouses: cityConfig.excludedCourthouses || []
        }
      })
    }
  }

  // Zaman sırasına göre sırala
  plan.sort((a, b) => a.scheduleAt - b.scheduleAt)

  // Aynı şehir için ardışık ilanlarda minGap kuralını uygula
  for (let i = 1; i < plan.length; i++) {
    const prev = plan[i - 1]
    const curr = plan[i]

    if (prev.city === curr.city) {
      let diff = curr.scheduleAt - prev.scheduleAt
      let dynamicGap = randomGapMinutes(gapMin, gapMax) * 60 * 1000

      while (diff < dynamicGap) {
        const newDate = new Date(prev.scheduleAt.getTime() + dynamicGap)
        const activeEndDate = buildDate(today, activeEnd * 60)
        plan[i].scheduleAt = newDate > activeEndDate ? activeEndDate : newDate

        diff = plan[i].scheduleAt - prev.scheduleAt
        dynamicGap = randomGapMinutes(gapMin, gapMax) * 60 * 1000
      }
    }
  }

  // Plan özeti
  if (plan.length === 0) {
    logger.error("⚠️⚠️⚠️  DİKKAT: Bugün için hiç ilan planlanmadı! Quota config'i kontrol edin.")
  } else {
    const summary = plan.reduce((acc, job) => {
      acc[job.city] = (acc[job.city] || 0) + 1
      return acc
    }, {})

    logger.info("📊 Günlük Plan Özeti:")
    for (const [city, count] of Object.entries(summary)) {
      logger.info(`  ${city}: ${count} ilan`)
    }
  }

  return plan
}

function distributeSlots(startHour, endHour, count) {
  const start = startHour * 60
  const end = endHour * 60
  const totalMinutes = end - start
  const interval = totalMinutes / count
  const slots = []

  for (let i = 0; i < count; i++) {
    const base = start + i * interval
    const randomOffset = Math.floor(Math.random() * interval)
    slots.push(Math.floor(base + randomOffset))
  }
  return slots
}

function buildDate(baseDate, minutes) {
  // TR offset +3 saat
  return new Date(Date.UTC(
    baseDate.getUTCFullYear(),
    baseDate.getUTCMonth(),
    baseDate.getUTCDate(),
    0, minutes - (3 * 60), 0, 0
  ));
}




function randomGapMinutes(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
