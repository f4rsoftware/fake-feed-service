import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { getToken, getTokenForUser } from "./authClient.js";
import { appConfig } from "../config/appConfig.js";

/**
 * Yeni event (ilan) oluşturur
 * @param {Object} eventData - Event payload
 */
export async function createEvent(eventData) {
  const url = `${appConfig.api.baseUrl}/api/v1/events`;

  try {
    const token = await getToken();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(eventData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Event oluşturulamadı. Status: ${response.status}, Response: ${errorText}`
      );
    }

    const data = await response.json();
    logger.info(`📢 Event başarılı bir şekilde oluşturuldu`);
    logger.debug(`📝 API Response: ${JSON.stringify(data, null, 2)}`);
    return data;
  } catch (err) {
    logger.error("❌ Event oluşturma hatası:", err);
    throw err;
  }
}


/**
 * Bir evente başvuru yapar
 * @param {string} eventId - Başvuru yapılacak event ID
 * @param {Object} applicationData - Başvuru payload
 */
export async function applyToEvent(eventId, applicationData) {
  const url = `${appConfig.api.baseUrl}/api/v1/events/${eventId}/applications`

  try {
    // Robot2 ile giriş yap (başvuru yapan robot)
    const token = await getTokenForUser(
      appConfig.robot2.email,
      appConfig.robot2.password
    )

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(applicationData)
    })


    console.log('applyToEvent url:', url)
    console.log('applyToEvent applicationData:', JSON.stringify(applicationData, null, 2))

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Event başvurusu başarısız. Status: ${response.status}, Response: ${errorText}`
      )
    }

    const data = await response.json()
    logger.info(`✅ Event başvurusu yapıldı (eventId=${eventId}, applicant=${applicationData.applicantUserProfileId})`)
    return data
  } catch (err) {
    logger.error("❌ Event başvurusu hatası:", err)
    throw err
  }
}
