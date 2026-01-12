import { getRobotUsers } from "./db/queries/robotUser.js";
import logger from "./utils/logger.js";

async function bootstrap() {
  try {
    const robotUsers = await getRobotUsers();
    logger.info("Robot kullanıcı listesi:", robotUsers);
  } catch (err) {
    logger.error("Bootstrap sırasında hata oluştu", err);
  }
}

bootstrap();
