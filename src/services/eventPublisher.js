import logger from "../utils/logger.js";
import { createEvent, applyToEvent } from "../api/eventClient.js";
import { createEventPayload, buildApplicationPayload } from "../builders/eventBuilder.js";
import { getCourtHousesByCityName } from "../db/queries/courtHouse.js";
import { getRandomCategoryWithDescription } from "../db/queries/category.js";
import { getRandomWorkingDateTime } from "../utils/dateGenerator.js";
import { getRandomName } from "../utils/nameGenerator.js";

/**
 * Belirli bir şehir için event oluşturur ve robot başvurusu yapar
 * @param {string} cityName - Şehir adı
 * @param {Object} cityConfig - Quota config'den gelen şehir ayarları
 * @param {string} cityConfig.type - "weekly" veya "daily"
 * @param {string[]} [cityConfig.excludedCourthouses] - Hariç tutulacak adliyeler
 * @param {string} [robotEmail="robot2@avukatevkil.com"] - Başvuru yapacak robot kullanıcı
 * @returns {Promise<{createdEvent, applicationResult}|null>} - Başarılıysa sonuç, başarısızsa null
 */
export async function publishEventForCity(cityName, cityConfig = {}, robotEmail = "robot2@avukatevkil.com") {
  try {
    // 1) Event payload hazırla (cityConfig ile adliye filtrelemesi yapılır)
    const eventPayload = await createEventPayload(cityName, cityConfig);

    // Payload oluşturulamadıysa (city/courthouse bulunamadı)
    if (!eventPayload) {
      logger.warn(`⏭ ${cityName}: Event payload oluşturulamadı, atlanıyor`);
      return null;
    }

    logger.debug("📝 Event payload hazırlandı: " + JSON.stringify(eventPayload, null, 2));

    // 2) Event'i API'ye gönder
    const createdEvent = await createEvent(eventPayload);
    logger.info(`📢 Event oluşturuldu (city=${cityName})`);

    // 2.5) DB'ye yazılması için bekleme (5 saniye)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3) Başvuru payload hazırla
    const applicationPayload = await buildApplicationPayload({
      email: robotEmail,
      cityId: eventPayload.cityId,
      courtHouseId: eventPayload.courtHouseId,
    });

    logger.info("📝 Application payload hazırlandı: " + JSON.stringify(applicationPayload, null, 2));

    // 4) Başvuruyu API'ye gönder
    const applicationResult = await applyToEvent(applicationPayload.eventId, applicationPayload);
    logger.info(`✅ Event başvurusu yapıldı (eventId=${applicationPayload.eventId})`);

    return { createdEvent, applicationResult };
  } catch (err) {
    // City/Courthouse bulunamadı hatası → atla, sistemi kırma
    if (err.message?.includes("bulunamadı") || err.message?.includes("not found")) {
      logger.warn(`⏭ ${cityName}: ${err.message} - atlanıyor`);
      return null;
    }

    // Diğer hatalar → logla ve sistemi kırma (ama retry yapmasın)
    logger.error(`❌ ${cityName}: Event yayınlama hatası - ${err.message}`);
    return null;
  }
}

/**
 * Simülasyon modu: Tüm seçimleri yapar ve loglar, DB/API'ye yazmaz
 * @param {string} cityName - Şehir adı
 * @param {Object} cityConfig - Quota config'den gelen şehir ayarları
 * @returns {Promise<Object|null>} - Simülasyon sonucu veya null
 */
export async function simulateEventForCity(cityName, cityConfig = {}) {
  try {
    const quotaType = cityConfig.type || "daily";

    // 1) Adliye seçimi
    const courtHouses = await getCourtHousesByCityName(cityName, cityConfig);
    if (courtHouses.length === 0) {
      logger.warn(`   ❌ Courthouse bulunamadı`);
      return null;
    }

    const selectedCH = courtHouses[Math.floor(Math.random() * courtHouses.length)];
    logger.info(`   🏛 Adliye: ${selectedCH.court_house_name} (${courtHouses.length} seçenekten)`);

    // 2) Kategori seçimi
    const { category, description } = await getRandomCategoryWithDescription();
    if (!category) {
      logger.warn(`   ❌ Kategori bulunamadı`);
      return null;
    }
    logger.info(`   📂 Kategori: ${category.name} (${category.type})`);

    // 3) Bütçe (DB'den seçilen değer)
    const selectedBudget = category.budget_value;
    logger.info(`   💰 Bütçe: ${selectedBudget} TL`);

    // 4) Tarih/Saat
    const { date, time } = getRandomWorkingDateTime();
    logger.info(`   📅 Tarih: ${date} ${time}`);

    // 5) Robot isimleri
    const creatorName = `Av. ${getRandomName()}`;
    const assignName = `Av. ${getRandomName()}`;
    logger.info(`   👤 Oluşturan: ${creatorName}`);
    logger.info(`   👤 Atanan: ${assignName}`);

    // 6) Özet
    logger.info(`   ✅ ${cityName} (${quotaType}) simülasyonu başarılı`);

    return {
      city: cityName,
      cityConfig,
      courthouse: selectedCH.court_house_name,
      category: category.name,
      budget: selectedBudget,
      date,
      time,
      creatorName,
      assignName
    };

  } catch (err) {
    logger.error(`   ❌ Simülasyon hatası: ${err.message}`);
    return null;
  }
}
