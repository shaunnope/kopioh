// local start script for development
import { getBot } from "./bot/index.ts";
import { config } from "./config.ts";
import { logger } from "./logger.ts";

const bot = getBot();

if (!config.env_isProd) await bot.start({
    allowed_updates: config.BOT_ALLOWED_UPDATES,
    onStart: ({ username }) =>
      logger.debug({
        msg: "bot running...",
        username,
      }),
  }).catch(e => console.error(e));
else {
  logger.warn("Cannot start bot via long-polling in production")
}

