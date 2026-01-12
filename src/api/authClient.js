import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { appConfig } from "../config/appConfig.js";

// Multi-user token cache: { email: { token, expiry } }
const tokenCache = {};

/**
 * Belirli bir kullanıcı için login isteği yapar
 */
async function loginRequest(email, password) {
  const loginUrl = `${appConfig.api.baseUrl}${appConfig.api.loginPath}`;

  const response = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed for ${email} with status ${response.status}`);
  }

  const data = await response.json();
  return {
    token: data.token,
    expiresIn: data.expiresIn || 3600,
  };
}

/**
 * Retry mekanizması ile login
 */
async function loginWithRetry(email, password, maxRetries = 3, baseDelay = 5000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const { token, expiresIn } = await loginRequest(email, password);

      // Token'ı cache'e kaydet
      tokenCache[email] = {
        token,
        expiry: Date.now() + expiresIn * 1000
      };

      logger.info(`🔑 Login başarılı: ${email} (deneme ${attempt + 1})`);
      return token;
    } catch (err) {
      attempt++;
      logger.warn(
        `⚠️ Login başarısız ${email} (${attempt}/${maxRetries}): ${err.message}`
      );
      if (attempt < maxRetries) {
        const delay = baseDelay * attempt;
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw new Error(`Login tüm denemelerde başarısız: ${email}`);
      }
    }
  }
}

/**
 * Default robot için token al (robot1 - event oluşturma)
 */
export async function getToken() {
  const email = appConfig.robot.email;
  const cached = tokenCache[email];

  if (cached && cached.expiry && Date.now() < cached.expiry) {
    return cached.token;
  }
  return await loginWithRetry(email, appConfig.robot.password);
}

/**
 * Belirli bir robot için token al (robot2 - başvuru yapma)
 */
export async function getTokenForUser(email, password) {
  const cached = tokenCache[email];

  if (cached && cached.expiry && Date.now() < cached.expiry) {
    return cached.token;
  }
  return await loginWithRetry(email, password);
}
