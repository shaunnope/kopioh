import { Bot as BaseBot } from "https://deno.land/x/grammy@v1.42.0/mod.ts";
import { hydrate } from "https://deno.land/x/grammy_hydrate@v1.6.0/mod.ts";

import type { Context } from "./context.ts";
import i18n from "./i18n.ts";
import { welcomeFeature } from "./feature/welcome.ts";
import { connectionFeature } from "./feature/connect.ts";
import { config } from "../config.ts";
import { miscFeature } from "./feature/misc.ts";

export function getBot() {
  const bot = new BaseBot<Context>(config.BOT_TOKEN);

  // Base Middleware
  // if (config.isDev) {
  //   bot.use(updateLogger())
  // }

  bot.use(hydrate())
  bot.use(i18n)

  // Handlers
  bot.use(welcomeFeature)
  bot.use(connectionFeature)

  bot.use(miscFeature)

  // if (isMultipleLocales) {
  //   bot.use(languageFeature)
  // }

  // bot.use(unhandledHandler)

  // if (config.isDev) {
  //   bot.catch(errorHandler)
  // }

  return bot
}

export type Bot = ReturnType<typeof getBot>