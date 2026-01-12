import { query } from "../pgClient.js";
import logger from "../../utils/logger.js";

/**
 * İlan açmak için kullanılacak aktif kategorileri getir
 * - sadece INSIDECOURTHOUSE ve INSIDEANDOUTSIDECOURTHOUSE tipleri
 * INSIDEANDOUTSIDECOURTHOUSE tipi şimdilik çıkartıldı.
 */
export async function getAvailableCategories() {
  const sql = `
      SELECT id, name, type, budget
      FROM public.category
      WHERE is_active = true
        AND type IN ('INSIDECOURTHOUSE')
        AND name NOT ILIKE '%Yargıtay%'
        AND name NOT ILIKE '%BAM%'
        AND name NOT ILIKE '%İdare/Vergi Duruşması Katılım%'
    `;

  const res = await query(sql);

  logger.debug(`📂 ${res.rows.length} aktif kategori bulundu`);
  return res.rows; // [{id, name, type, budget}, ...]
}

/**
 * Belirli kategoriye ait description’lardan rastgele 1 tanesini getir
 */
export async function getRandomCategoryDescription(categoryId) {
  const sql = `
    SELECT id, description
    FROM public.category_event_description
    WHERE category_id = $1
    ORDER BY random()
    LIMIT 1
  `;
  const params = [categoryId];

  const res = await query(sql, params);

  if (res.rows.length === 0) {
    logger.warn(`⚠️ Category ${categoryId} için description bulunamadı`);
    return null;
  }

  return res.rows[0]; // {id, description}
}


// **
//  * Rastgele aktif bir kategori + ona bağlı description döndürür
//  */
export async function getRandomCategoryWithDescription() {
  try {
      // Budget array'in ortasından seç (daha güvenli)
      const sql = `
          SELECT
            c.id,
            c.name,
            c.type,
            (c.budget)[GREATEST(2, array_length(c.budget, 1) / 2)]::int AS "budget_value"
          FROM category c
          WHERE c.is_active = true
            AND c.type IN ('INSIDECOURTHOUSE', 'INSIDEANDOUTSIDECOURTHOUSE')
            AND c.name NOT ILIKE '%Yargıtay%'
            AND c.name NOT ILIKE '%BAM%'
            AND c.name NOT ILIKE '%İdare/Vergi Duruşması Katılım%'
            AND array_length(c.budget, 1) >= 2
          ORDER BY RANDOM()
          LIMIT 1;
        `;

        const categoryRes = await query(sql);
        if (categoryRes.rows.length === 0) return null;

        const category = categoryRes.rows[0];

        const descRes = await query(
          `
          SELECT id, description   -- 🔹 burada text yerine doğru kolon adı
          FROM category_event_description
          WHERE category_id = $1
          ORDER BY RANDOM()
          LIMIT 1
          `,
          [category.id]
        );

        return {
          category,
          description: descRes.rows[0] || null,
        };
  } catch (err) {
    logger.error("❌ Kategori veya description alınamadı", err);
    throw err;
  }
}
