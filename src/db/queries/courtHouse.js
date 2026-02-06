import { query } from "../pgClient.js";
import logger from "../../utils/logger.js";

/**
 * Türkçe karakterleri normalize eder
 * istanbul → istanbul, İSTANBUL → istanbul, ISTANBUL → istanbul
 */
function normalizeTurkish(str) {
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .replace(/Ğ/g, "ğ")
    .replace(/Ü/g, "ü")
    .replace(/Ş/g, "ş")
    .replace(/Ö/g, "ö")
    .replace(/Ç/g, "ç")
    .toLowerCase()
    .trim();
}

/**
 * Merkez adliye pattern'ı oluşturur
 * Örn: "ordu" → "%Ordu Adliyesi%" (ILIKE için)
 *
 * Türkçe'de bazı şehirler özel karakter içerir:
 * - İstanbul, İzmir, İzmit → İ ile başlar
 * - Şanlıurfa, Şırnak → Ş ile başlar
 */
function getMainCourthousePattern(cityName) {
  const normalized = cityName.trim().toLowerCase();

  // Türkçe büyük harf dönüşümü
  const turkishUpperMap = {
    'i': 'İ', 'ı': 'I', 'ğ': 'Ğ', 'ü': 'Ü',
    'ş': 'Ş', 'ö': 'Ö', 'ç': 'Ç'
  };

  const firstChar = normalized.charAt(0);
  const capitalizedFirst = turkishUpperMap[firstChar] || firstChar.toUpperCase();
  const rest = normalized.slice(1);

  return `${capitalizedFirst}${rest} Adliyesi`;
}

/**
 * City adına göre court_houseları getir
 *
 * Yeni mantık:
 * - type: "weekly" → Sadece merkez adliye (şehir adıyla eşleşen)
 * - type: "daily"  → Tüm adliyeler
 * - excludedCourthouses → Her iki modda da hariç tutulan adliyeler
 *
 * @param {string} cityName - Şehir adı
 * @param {Object} cityConfig - Quota config'den gelen şehir ayarları
 * @param {string} cityConfig.type - "weekly" veya "daily"
 * @param {string[]} [cityConfig.excludedCourthouses] - Hariç tutulacak adliyeler
 */
export async function getCourtHousesByCityName(cityName, cityConfig = {}) {
  const quotaType = cityConfig.type || "daily";
  const excludedCourthouses = cityConfig.excludedCourthouses || [];

  let sql = `
    SELECT
      ch.id   AS court_house_id,
      ch.name AS court_house_name,
      c.id    AS city_id,
      c.name  AS city_name
    FROM public.city c
    JOIN public.court_house ch ON ch.city_id = c.id
    WHERE c.name ILIKE $1
      AND ch.name NOT ILIKE '%Yargıtay%'
      AND ch.name NOT ILIKE '%BAM %'
  `;

  const params = [cityName];
  let paramIndex = 2;

  // WEEKLY MODE: Sadece merkez adliye
  if (quotaType === "weekly") {
    const mainPattern = getMainCourthousePattern(cityName);
    sql += ` AND ch.name ILIKE $${paramIndex}`;
    params.push(mainPattern);
    paramIndex++;

    logger.debug(`🏛 ${cityName} (weekly): Sadece merkez adliye aranıyor → "${mainPattern}"`);
  }

  // Exclusion listesi varsa (her iki modda da çalışır)
  if (excludedCourthouses.length > 0) {
    const placeholders = excludedCourthouses.map((_, i) => `$${paramIndex + i}`).join(", ");
    sql += ` AND ch.name NOT IN (${placeholders})`;
    params.push(...excludedCourthouses);

    logger.debug(`🚫 ${cityName}: Hariç tutulan adliyeler → ${excludedCourthouses.join(", ")}`);
  }

  const res = await query(sql, params);

  // Loglama
  const modeText = quotaType === "weekly" ? "(merkez)" : "(tüm ilçeler)";
  logger.debug(`🏛 ${cityName} ${modeText}: ${res.rows.length} courthouse bulundu`);

  // Güvenlik kontrolü
  if (res.rows.length === 0) {
    logger.warn(
      `⚠️  ${cityName} için hiç courthouse bulunamadı! ` +
      `Mode: ${quotaType}, Pattern: ${quotaType === "weekly" ? getMainCourthousePattern(cityName) : "tümü"}`
    );
  }

  return res.rows; // [{court_house_id, court_house_name, city_id, city_name}, ...]
}
