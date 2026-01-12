import logger from "../utils/logger.js";
import { getCourtHousesByCityName } from "../db/queries/courtHouse.js";
import { getRandomCategoryWithDescription } from "../db/queries/category.js";
import { getRandomWorkingDateTime } from "../utils/dateGenerator.js";
import { getRandomName } from "../utils/nameGenerator.js";
import { getRobotUsers } from "../db/queries/robotUser.js";
import { getLawyerProfileIdByEmail } from "../db/queries/robotUser.js";
import { getLastEventIdByCriteria } from "../db/queries/event.js";
import { stringify } from "querystring";

/**
 * Event payload oluşturucu
 * @param {string} cityName - İlanın açılacağı şehir adı (örn. "İstanbul")
 * @param {Object} cityConfig - Quota config'den gelen şehir ayarları
 * @param {string} cityConfig.type - "weekly" veya "daily"
 * @param {string[]} [cityConfig.excludedCourthouses] - Hariç tutulacak adliyeler
 */
export async function createEventPayload(cityName, cityConfig = {}) {
  // 1. İlan açacak robot kullanıcıyı al
  const robots = await getRobotUsers("robot1@avukatevkil.com");
  if (robots.length === 0) {
    logger.error("❌ Robot kullanıcı bulunamadı (robot1@avukatevkil.com)");
    return null;
  }

  // 2. Courthouse + City bilgisi al (cityConfig ile filtreleme)
  const courtHouses = await getCourtHousesByCityName(cityName, cityConfig);
  if (courtHouses.length === 0) {
    logger.warn(`⚠️ ${cityName}: Courthouse bulunamadı (type: ${cityConfig.type || 'daily'})`);
    return null;
  }

  const randomCH = courtHouses[Math.floor(Math.random() * courtHouses.length)];
  const cityId = randomCH.city_id;
  const courtHouseId = randomCH.court_house_id;

  // 3. Category + Description al
  const { category, description } = await getRandomCategoryWithDescription();
  if (!category || !description) {
    logger.error(`❌ ${cityName}: Category veya description bulunamadı`);
    return null;
  }
  logger.debug(`🏷 Kategori seçildi: ${category.name} (${category.type})`);
  logger.debug(`💰 Bütçe: ${category.budget_value} TL`);

  // 4. Tarih & Saat
  const { date, time } = getRandomWorkingDateTime();
  logger.debug(`📅 Rastgele tarih-saat seçildi: ${date} ${time}`);

  // 6. Robot isim
  let robotNameCreator, robotNameAssign;
  do {
    robotNameCreator = `Av. ${getRandomName()}`;
    robotNameAssign = `Av. ${getRandomName()}`;
  } while (robotNameCreator === robotNameAssign);
  logger.debug(`🤖 Creator Robot isim: ${robotNameCreator}`);
  logger.debug(`🤖 Assign Robot isim: ${robotNameAssign}`);

  // 7. Payload oluştur
  const payload = {
    //creatorUserProfileId: robot.lawyer_profile_id,
    description: description?.description || "Açıklama bulunamadı.",   // sadece metin lazım
    cityId,
    isOutside: false,
    //locationType: category.type,
    courtHouseId,                          // ✅ artık randomCH’den geliyor
    address: null,
    categoryId: category.id,
    selectedBudget: category.budget_value,
    date,
    time: time.toString(),
    isUrgent: false,
    isRobotGenerated: true,
    robotNameCreator: robotNameCreator,    // creator robot adı
    robotNameAssign: robotNameAssign       // assign robot adı
  };  
  return payload;

}


/**
 * Event başvurusu payload oluşturur
 * @param {Object} params
 * @param {string} params.email - Başvuracak robot kullanıcının email adresi
 * @param {string} params.date - Event tarihi (YYYY-MM-DD)
 * @param {string} params.cityId - Event şehir ID’si
 * @param {string} params.courtHouseId - Event adliye ID’si
 * @returns {Promise<Object>}
 */
export async function buildApplicationPayload({ email, cityId, courtHouseId }) {
  logger.debug(`📝 buildApplicationPayload gelen parametreler :  (email=${email}, cityId=${cityId}, courtHouseId=${courtHouseId})`)
  if (!email) throw new Error("Email parametresi zorunludur")

  // 1. Robot kullanıcı profilini al
  const lawyerProfileId = await getLawyerProfileIdByEmail(email)
  if (!lawyerProfileId) {
    throw new Error(`Robot user bulunamadı → ${email}`)
  }

 
  // 2. Son event id’yi al (ilgili kriterlerle)
  const eventId = await getLastEventIdByCriteria({
    cityId, courtHouseId
  })
  if (!eventId) {
    throw new Error(`Event bulunamadı (cityId=${cityId}, courtHouseId=${courtHouseId})`)
  }

  // 3. Başvuru payload oluştur
  const payload = {
    applicantUserProfileId: lawyerProfileId,
    eventId,
    note: null
  }

  logger.debug(`📝 Application payload hazırlandı: ${stringify(payload)}`)

  return payload
}





// /**
//  * Event başvurusu payload oluşturur
//  * @param {Object} params
//  * @param {string} params.email - Başvuracak robot kullanıcının email adresi
//  * @param {Object} params.event - Event payload veya event objesi
//  * @returns {Promise<Object>}
//  */
// export async function buildApplicationPayload({ email, event }) {
//   if (!email) {
//     throw new Error("Email parametresi zorunludur")
//   }
//   if (!event || !event.id) {
//     throw new Error("Geçerli bir event parametresi (id alanı ile) gönderilmelidir")
//   }

//   // 1. Robot kullanıcıyı al
//   const lawyerProfileId = await getLawyerProfileIdByEmail(email)
//   if (!lawyerProfileId) {
//     throw new Error(`Robot user bulunamadı → ${email}`)
//   }

//   // 2. Payload oluştur
//   const payload = {
//     applicantUserProfileId: lawyerProfileId,  // Robot profile id
//     eventId: event.id,                        // Event ID (createEvent sonucundan)
//     note: `Robot başvuru notu → ${email}`      // Dinamik not
//   }

//   return payload
// }