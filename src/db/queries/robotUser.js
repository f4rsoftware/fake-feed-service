import { query } from "../pgClient.js";
import logger from "../../utils/logger.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const robotConfigPath = path.join(__dirname, "../../config/robotUser.json")
const robotUsers = JSON.parse(fs.readFileSync(robotConfigPath, "utf-8"))

/**
 * Robot kullanıcıları getirir.
 * @param {string|null} email - Belirli bir email için filtre. null ise tüm robot kullanıcılar döner.
 */
export async function getRobotUsers(email = null) {
  let sql = `
    SELECT u.id AS user_id, lp.id AS lawyer_profile_id, u.email
    FROM public."user" u
    JOIN public.lawyer_profile lp ON lp.user_id = u.id
    WHERE u.is_robot = true
  `
  const params = []

  if (email) {
    sql += ` AND u.email = $1`
    params.push(email)
  }

  try {
    const res = await query(sql, params)
    return res.rows
  } catch (err) {
    logger.error("❌ Robot kullanıcıları çekerken hata", err)
    throw err
  }
}


export async function createRobotUsers() {
  // Role ID (LAWYER)
  const roleRes = await query(
    `SELECT id FROM public.role WHERE type = 'LAWYER' LIMIT 1`
  )
  const roleId = roleRes.rows[0].id

  const results = []

  for (const config of robotUsers) {
    try {
      // Email var mı kontrol et
      const existsRes = await query(
        `SELECT id FROM public."user" WHERE email=$1 LIMIT 1`,
        [config.email]
      )
      if (existsRes.rows.length > 0) {
        logger.warn(`⚠️ Email zaten kayıtlı, atlanıyor → ${config.email}`)
        continue
      }

      // 1) User insert
      const userId = uuidv4()
      await query(
        `
        INSERT INTO public."user" (
          id, email, password_hash, first_name, last_name, phone_number,
          role_id, account_status, email_verification_status, phone_verification_status, is_robot
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, 'ACTIVE', 'VERIFIED', 'VERIFIED', true
        )
        `,
        [
          userId,
          config.email,
          config.passwordHash,
          config.firstName,
          config.lastName,
          config.phoneNumber,
          roleId
        ]
      )
      logger.info(`👤 Robot user eklendi → ${config.email}`)

      // 2) City + baro bilgisi
      const cityRes = await query(
        `SELECT id, 
          (bar_associations->0->>'id')::int AS baro_id,
          (bar_associations->0->>'name') AS baro_name
         FROM public.city
         WHERE plate_code=$1 LIMIT 1`,
        [config.cityPlateCode]
      )
      const cityId = cityRes.rows[0].id
      const baroId = cityRes.rows[0].baro_id
      const baroName = cityRes.rows[0].baro_name
      const profileId = uuidv4()

      // 3) Lawyer profile insert öncesi kontrol
      const existsProfileRes = await query(
        `SELECT id FROM public.lawyer_profile WHERE bar_number=$1 AND city_id=$2 LIMIT 1`,
        [config.barNumber, cityId]
      )
      if (existsProfileRes.rows.length > 0) {
        logger.warn(`⚠️ Aynı bar_number+city_id zaten var, atlanıyor → ${config.email}`)
        continue
      }

      const profileRes = await query(
        `
        INSERT INTO public.lawyer_profile (
          id, user_id, bar_number, is_available, identification_number, birth_date,
          city_id, bar_association_id, bar_association_name, referral_code, bar_number_verified
        )
        VALUES (
          $1, $2, $3, true, $4, $5,
          $6, $7, $8, $9, true
        )
        RETURNING id
        `,
        [
          profileId,
          userId,
          config.barNumber,
          config.identificationNumber,
          config.birthDate,
          cityId,
          baroId,
          baroName,
          config.referralCode
        ]
      )

      const lawyerProfileId = profileRes.rows[0].id
      logger.info(`📄 Lawyer profile eklendi → ${lawyerProfileId}`)

      // 4) Preferred court houses ekle
      const courtRes = await query(
        `SELECT id FROM public.court_house WHERE city_id=$1`,
        [cityId]
      )
      for (const ch of courtRes.rows) {
        await query(
          `INSERT INTO public.lawyer_profile_preferred_court_houses (lawyer_profile_id, court_house_id) VALUES ($1, $2)`,
          [lawyerProfileId, ch.id]
        )
      }
      logger.info(
        `🏛 ${courtRes.rowCount} adet court_house lawyer profile'a bağlandı`
      )

      // 5) Subscription ekle
      const planRes = await query(
        `SELECT id FROM public.subscription_plan WHERE tier=$1 LIMIT 1`,
        [config.subscriptionTier]
      )
      const planId = planRes.rows[0].id

      const subscriptionId = uuidv4()
      await query(
        `
        INSERT INTO public.user_subscription (
          id, user_profile_id, status, start_date, end_date, plan_id
        )
        VALUES ($1, $2, 'ACTIVE', now(), now() + interval '5 year', $3)
        `,
        [subscriptionId, lawyerProfileId, planId]
      )
      logger.info(`💳 Subscription eklendi (${config.subscriptionTier})`)

      results.push({ email: config.email, userId, lawyerProfileId })
    } catch (err) {
      logger.error(
        `❌ Robot user eklenirken hata → ${config.email}`,
        err
      )
    }
  }

  return results
}

/**
 * Email adresine göre robot kullanıcının lawyer_profile_id'sini döner
 * @param {string} email
 * @returns {Promise<string|null>} lawyer_profile_id veya null
 */
export async function getLawyerProfileIdByEmail(email) {
  try {
    // Önce robot user getir
    const users = await getRobotUsers(email)
    if (users.length === 0) {
      logger.warn(`⚠️ Robot user bulunamadı → ${email}`)
      return null
    }

    const userId = users[0].user_id

    // user_id üzerinden profile id getir
    const sql = `SELECT id FROM public.lawyer_profile WHERE user_id = $1 LIMIT 1`
    const res = await query(sql, [userId])

    if (res.rows.length === 0) {
      logger.warn(`⚠️ Lawyer profile bulunamadı → ${email}`)
      return null
    }

    return res.rows[0].id
  } catch (err) {
    logger.error(`❌ Lawyer profile alınırken hata (email=${email})`, err)
    throw err
  }
}


// export async function createRobotUser() {
//    // 1) Role id (LAWYER)
//     const roleRes = await query(
//       `SELECT id FROM public.role WHERE type = 'LAWYER' LIMIT 1`
//     );
//     const roleId = roleRes.rows[0].id;

// try {
//     // 2) User insert
//     const userId = uuidv4(); // 🆕 ID biz üretiyoruz
//     const userRes = await query(
//       `
//       INSERT INTO public."user" (
//         id, email, password_hash, first_name, last_name, phone_number,
//         role_id, account_status, email_verification_status, phone_verification_status, is_robot
//       )
//       VALUES (
//         $1, 'robot@avukatevkil.com',
//         '$2a$10$qrre/YA4hFoOOTJ0x3/QfOZ/aSgpe7JMPMfKItK5awrqQ4Dla50Ni',
//         'BURAK', 'MAT', '5065855286',
//         $2, 'ACTIVE', 'VERIFIED', 'VERIFIED', true
//       )
//       RETURNING id
//       `,
//       [userId, roleId]
//     );
//     logger.info(`👤 Robot user eklendi → ${userId}`);

//     // 3) City + baro bilgisi (plate_code=34)
//     const cityRes = await query(
//         `SELECT id, 
//           (bar_associations->0->>'id')::int AS baro_id,
//           (bar_associations->0->>'name') AS baro_name
//           FROM public.city
//           WHERE plate_code='34' LIMIT 1`
//     );
//     const cityId = cityRes.rows[0].id;
//     const baroId = cityRes.rows[0].baro_id;
//     const baroName = cityRes.rows[0].baro_name;

//     const profileId = uuidv4(); // 🆕 ID biz üretiyoruz

//     // 4) Lawyer profile insert
//     const profileRes = await query(
//       `
//       INSERT INTO public.lawyer_profile (
//         id,user_id, bar_number, is_available, identification_number, birth_date,
//         city_id, bar_association_id, bar_association_name, referral_code, bar_number_verified
//       )
//       VALUES (
//         $1, $2,'525253', true, '12521478521', '1984-02-07',
//         $3, $4, $5, 'RoBoT', true
//       )
//       RETURNING id
//       `,
//       [profileId, userId, cityId, baroId, baroName]
//     );
//     const lawyerProfileId = profileRes.rows[0].id;
//     logger.info(`📄 Lawyer profile eklendi → ${lawyerProfileId}`);

//     // 5) Preferred court houses ekle
//     const courtRes = await query(
//       `SELECT id FROM public.court_house WHERE city_id=$1`,
//       [cityId]
//     );
//     for (const ch of courtRes.rows) {
//       await query(
//         `INSERT INTO public.lawyer_profile_preferred_court_houses (lawyer_profile_id, court_house_id) VALUES ($1, $2)`,
//         [lawyerProfileId, ch.id]
//       );
//     }
//     logger.info(
//       `🏛 ${courtRes.rowCount} adet court_house lawyer profile'a bağlandı`
//     );

//     // 6) Subscription ekle (PREMIUM)
//     const planRes = await query(
//       `SELECT id FROM public.subscription_plan WHERE tier='PREMIUM' LIMIT 1`
//     );
//     const planId = planRes.rows[0].id;

//     const subscriptionId = uuidv4(); // 🆕 ID biz üretiyoruz
//     await query(
//       `
//       INSERT INTO public.user_subscription (
//         id, user_profile_id, status, start_date, end_date, plan_id
//       )
//       VALUES ($1, $2, 'ACTIVE', now(), now() + interval '5 year', $3)
//       `,
//       [subscriptionId, lawyerProfileId, planId]
//     );
//     logger.info(`💳 Subscription eklendi (PREMIUM)`);

//     return { userId, lawyerProfileId };
//   } catch (err) {
//     logger.error("❌ Robot user oluşturulurken hata", err);
//     throw err;
//   }
// }
