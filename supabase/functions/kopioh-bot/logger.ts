import pino from "pino"
import { config, Config, LogLevel } from "./config.ts";

/**
 * Create a logger based on the given config
 * @param config 
 * @param level Overrides the log level provided in `config`
 */
export function createLogger(config: Config, level?: LogLevel) {
  const log_level = level === undefined ? config.LOG_LEVEL : level

  return pino({
    level: log_level,
    // ...config.env_isProd ? {} : {
    //   transport: {
    //     targets: [
    //       {
    //         target: "pino-pretty",
    //         level: log_level,
    //         options: {
    //           ignore: "pid,hostname",
    //           colorize: true,
    //           translateTime: true,
    //         },
    //       },
    //     ]
    //   }
    // },
  })
}

export type Logger = ReturnType<typeof createLogger>

/**
 * The base logger for the bot
 */
export const logger = createLogger(config)