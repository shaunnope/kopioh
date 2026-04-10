import pino from "pino"
import { config, Config, LogLevel } from "./config.ts";
import { format } from "npm:date-fns"

const COLOR = {
  GREEN: `\x1b[32m`,
  RED: `\x1b[31m`,
  WHITE: `\x1b[37m`,
  YELLOW: `\x1b[33m`,
  CYAN: `\x1b[36m`,
}

const LEVEL_COLORS = {
  FATAL: COLOR.RED,
  ERROR: COLOR.RED,
  WARN: COLOR.YELLOW,
  INFO: COLOR.GREEN,
  DEBUG: COLOR.GREEN,
  TRACE: COLOR.GREEN,
}

/**
 * Create a logger based on the given config
 * @param config 
 * @param level Overrides the log level provided in `config`
 */
export function createLogger(config: Config, level?: LogLevel) {
  const log_level = level === undefined ? config.LOG_LEVEL : level

  return pino({
    level: log_level,
    ...config.env_isProd && config.PLATFORM == "supabase" ? { 
      // use console logging in supabase functions
      browser: {
        write: (logObj) => {
          const { level, msg, group, time } = logObj as Record<string, string>

          const levelUppercased = level.toUpperCase()

          const timeFormatted = format(new Date(time), `HH:mm:ss.sss`)

          const LEVEL_COLOR =
            LEVEL_COLORS[levelUppercased as keyof typeof LEVEL_COLORS]

          console.log(
            `[${timeFormatted}] ${LEVEL_COLOR}${levelUppercased} ${COLOR.CYAN}[${group}] ${msg} ${COLOR.WHITE}`
          )
        },
        formatters: {
          level: (label) => {
            return {
              level: label,
            }
          },
        },
      },
    } : {}
  })
}

export type Logger = ReturnType<typeof createLogger>

/**
 * The base logger for the bot
 */
export const logger = createLogger(config)