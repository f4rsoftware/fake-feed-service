import { query } from "../pgClient.js"
import logger from "../../utils/logger.js"
import { log } from "console"

/**
 * Belirli kriterlere göre event tablosundan en son kaydın ID'sini getirir
 * @param {Object} params
 * @param {string} params.cityId - City UUID
 * @param {string} params.courtHouseId - Courthouse UUID
 */
export async function getLastEventIdByCriteria({ cityId, courtHouseId }) {
  const sql = `
    SELECT id
    FROM public.event
    WHERE 
      city_id = $1
      AND court_house_id = $2
    ORDER BY created_at DESC
    LIMIT 1
  `

  try {
    const res = await query(sql, [cityId, courtHouseId])
    logger.debug('cityId:', cityId, 'courtHouseId:', courtHouseId)
    logger.debug('SQL:', sql)


    if (res.rows.length === 0) {
      logger.warn(`⚠️ Kriterlere uygun event bulunamadı (city=${cityId}, courtHouse=${courtHouseId})`)
      return null
    }
    const lastId = res.rows[0].id
    logger.debug(`📂 Son event id: ${lastId}`)
    return lastId
  } catch (err) {
    logger.error("❌ Event ID alınırken hata", err)
    throw err
  }
}
