import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env dosyası proje kökünde (src/../..)
dotenv.config({ path: path.join(__dirname, "../../.env") });

export const appConfig = {
  api: {
    baseUrl: process.env.API_BASE_URL,
    loginPath: process.env.API_LOGIN_PATH,
  },
  robot: {
    email: process.env.ROBOT_EMAIL,
    password: process.env.ROBOT_PASSWORD,
  },
  robot2: {
    email: process.env.ROBOT2_EMAIL,
    password: process.env.ROBOT2_PASSWORD,
  },
  redis: {
	  host: process.env.NODE_ENV === "production"
		? process.env.PROD_REDIS_HOST
		: process.env.REDIS_HOST,
	  port: parseInt(
		process.env.NODE_ENV === "production"
		  ? process.env.PROD_REDIS_PORT
		  : process.env.REDIS_PORT || "6379",
		10
	  ),
	  password: process.env.NODE_ENV === "production"
		? process.env.PROD_REDIS_PASSWORD
		: process.env.REDIS_PASSWORD,
	  url: process.env.NODE_ENV === "production"
		? process.env.PROD_REDIS_URL
		: process.env.REDIS_URL,
	},
  scheduler: {
    // Dev modda sistem başladığında planı hemen oluştur
    forcePlanOnStart: process.env.FORCE_PLAN_ON_START === "true",
    // Dry-run modu: Planı console'da göster ama Redis'e yükleme
    dryRun: process.env.SCHEDULER_DRY_RUN === "true",
    // Simulation modu: Tüm seçimleri yap, logla ama DB/API'ye yazma
    simulationMode: process.env.SIMULATION_MODE === "true",
  },
};
