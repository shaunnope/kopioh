import { Bot as BaseBot } from "https://deno.land/x/grammy@v1.38.4/mod.ts";
import { hydrate } from "https://deno.land/x/grammy_hydrate@v1.6.0/mod.ts";
import { conversations } from "https://deno.land/x/grammy_conversations@v2.1.0/mod.ts";

import type { Context } from "./context.ts";
import i18n from "./i18n.ts";
import { welcomeFeature } from "./feature/welcome.ts";
import { config } from "../config.ts";
import { miscFeature } from "./feature/misc.ts";

export function getBot() {
  const bot = new BaseBot<Context>(config.BOT_TOKEN);

  // Base Middleware
  // if (config.isDev) {
  //   bot.use(updateLogger())
  // }

  // bot.use(metrics())
  // bot.use(autoChatAction())
  bot.use(hydrate())
  // bot.use(session(sessionStorage))
  // bot.use(setScope())
  bot.use(i18n)
  bot.use(conversations())

  // Handlers

  // bot.use(gameFeature)

  // bot.use(botAdminFeature)
  bot.use(welcomeFeature)

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